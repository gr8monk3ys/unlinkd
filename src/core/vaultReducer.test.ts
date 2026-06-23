import { describe, expect, it } from 'vitest';
import { createEmptyVault, type VaultStateV1 } from './vault';
import type { Account, ConnectorInstance, Identifier, Persona, RiskFinding } from './types';
import {
  addAccount,
  addConnectorInstance,
  addIdentifier,
  addPersona,
  applyConnectorTransition,
  mergeScanFindings,
  replaceConnectorInstance,
  setActivePersona,
  setFindingStatusInVault,
  setHibpApiKey
} from './vaultReducer';

function baseVault(): VaultStateV1 {
  return createEmptyVault();
}

function makeInstance(overrides?: Partial<ConnectorInstance>): ConnectorInstance {
  return {
    id: overrides?.id ?? 'inst-1',
    connectorId: overrides?.connectorId ?? 'broker-x',
    personaId: overrides?.personaId ?? 'p1',
    state: overrides?.state ?? 'discovered',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    evidence: overrides?.evidence ?? [],
    ...(overrides?.nextCheckAt ? { nextCheckAt: overrides.nextCheckAt } : {})
  };
}

function makeFinding(id: string, overrides?: Partial<RiskFinding>): RiskFinding {
  return {
    id,
    title: overrides?.title ?? `finding ${id}`,
    harm: overrides?.harm ?? 5,
    exploitability: overrides?.exploitability ?? 5,
    tier: overrides?.tier ?? 'moderate',
    status: overrides?.status,
    source: overrides?.source ?? 'local'
  };
}

describe('vaultReducer', () => {
  it('addPersona appends and makes the new persona active', () => {
    const vault = baseVault();
    const persona: Persona = { id: 'p2', name: 'Work', createdAt: '2026-01-01T00:00:00.000Z' };
    const next = addPersona(vault, persona);

    expect(next.personas).toHaveLength(vault.personas.length + 1);
    expect(next.activePersonaId).toBe('p2');
    // input not mutated
    expect(vault.personas).toHaveLength(1);
  });

  it('setActivePersona changes only the active id', () => {
    const vault = addPersona(baseVault(), { id: 'p2', name: 'Work', createdAt: 'x' });
    const next = setActivePersona(vault, vault.personas[0]!.id);
    expect(next.activePersonaId).toBe(vault.personas[0]!.id);
    expect(next.personas).toEqual(vault.personas);
  });

  it('addIdentifier / addAccount append immutably', () => {
    const vault = baseVault();
    const identifier: Identifier = {
      id: 'i1',
      personaId: vault.activePersonaId,
      type: 'email',
      value: 'a@b.com',
      sensitivity: 2,
      consent: true
    };
    const account: Account = {
      id: 'a1',
      personaId: vault.activePersonaId,
      service: 'X',
      username: 'u',
      status: 'active',
      createdAt: 'x'
    };

    expect(addIdentifier(vault, identifier).identifiers).toEqual([identifier]);
    expect(addAccount(vault, account).accounts).toEqual([account]);
    expect(vault.identifiers).toHaveLength(0); // unchanged
  });

  it('applyConnectorTransition updates the matched instance and is a no-op otherwise', () => {
    const vault = addConnectorInstance(baseVault(), makeInstance());
    const next = applyConnectorTransition(vault, 'inst-1', {
      to: 'recheck_scheduled',
      nextCheckAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z'
    });

    expect(next.connectorInstances[0]!.state).toBe('recheck_scheduled');
    expect(next.connectorInstances[0]!.nextCheckAt).toBe('2026-03-01T00:00:00.000Z');
    expect(next.connectorInstances[0]!.updatedAt).toBe('2026-02-01T00:00:00.000Z');

    const noop = applyConnectorTransition(vault, 'missing', {
      to: 'verified',
      nextCheckAt: undefined,
      updatedAt: 'x'
    });
    expect(noop.connectorInstances).toEqual(vault.connectorInstances);
  });

  it('replaceConnectorInstance swaps by id', () => {
    const vault = addConnectorInstance(baseVault(), makeInstance());
    const updated = makeInstance({ state: 'executed' });
    const next = replaceConnectorInstance(vault, updated);
    expect(next.connectorInstances[0]!.state).toBe('executed');
  });

  it('mergeScanFindings preserves user-set status on re-discovered findings', () => {
    let vault = baseVault();
    // Existing finding the user already mitigated.
    vault = { ...vault, findings: [makeFinding('f1', { status: 'mitigated', title: 'old title' })] };

    // Rescan returns the same id (default status open) plus a new finding.
    const scanned = [makeFinding('f1', { status: 'open', title: 'new title' }), makeFinding('f2', { status: 'open' })];
    const next = mergeScanFindings(vault, scanned);

    const f1 = next.findings.find((f) => f.id === 'f1')!;
    expect(f1.status).toBe('mitigated'); // preserved
    expect(f1.title).toBe('new title'); // fresh fields adopted
    expect(next.findings.find((f) => f.id === 'f2')!.status).toBe('open');
    expect(next.findings).toHaveLength(2);
  });

  it('setFindingStatusInVault updates a single finding status', () => {
    const vault = { ...baseVault(), findings: [makeFinding('f1', { status: 'open' })] };
    const next = setFindingStatusInVault(vault, 'f1', 'in_progress');
    expect(next.findings[0]!.status).toBe('in_progress');
  });

  it('setHibpApiKey stores a trimmed key and clears on blank', () => {
    const vault = baseVault();
    expect(setHibpApiKey(vault, '  secret  ').settings.hibpApiKey).toBe('secret');
    expect(setHibpApiKey(vault, '   ').settings.hibpApiKey).toBeUndefined();
  });
});
