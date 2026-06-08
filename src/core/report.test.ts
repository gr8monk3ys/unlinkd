import { describe, expect, it } from 'vitest';
import type { ConnectorDefinition } from './types';
import type { VaultStateV1 } from './vault';
import { buildMarkdownReport, type ReportOptions } from './report';

function emptyVault(overrides?: Partial<VaultStateV1>): VaultStateV1 {
  return {
    version: 1,
    savedAt: '2026-01-01T00:00:00.000Z',
    activePersonaId: 'p1',
    personas: [],
    identifiers: [],
    accounts: [],
    connectorInstances: [],
    findings: [],
    settings: {},
    ...overrides
  };
}

const testCatalog: ConnectorDefinition[] = [
  {
    id: 'broker-test',
    name: 'Test Broker',
    category: 'broker',
    description: 'A test connector',
    defaultRecheckDays: 30,
    steps: []
  }
];

function defaultOptions(overrides?: Partial<ReportOptions>): ReportOptions {
  return {
    redacted: false,
    connectorCatalog: testCatalog,
    ...overrides
  };
}

describe('buildMarkdownReport', () => {
  it('generates a report with all-zero summary for an empty vault', () => {
    const report = buildMarkdownReport(emptyVault(), defaultOptions());

    expect(report).toContain('# unlinkd Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('- Personas: 0');
    expect(report).toContain('- Identifiers: 0');
    expect(report).toContain('- Accounts: 0');
    expect(report).toContain('- Connector instances: 0');
    expect(report).toContain('- Findings: 0');
    expect(report).toContain('- Due rechecks: 0');
  });

  it('includes correct persona, identifier, and account counts', () => {
    const vault = emptyVault({
      personas: [
        { id: 'p1', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'p2', name: 'Work', createdAt: '2026-01-01T00:00:00.000Z' }
      ],
      identifiers: [
        { id: 'i1', type: 'email', value: 'a@b.com', sensitivity: 1, consent: true },
        { id: 'i2', type: 'phone', value: '555-0100', sensitivity: 2, consent: true },
        { id: 'i3', type: 'username', value: 'user1', sensitivity: 1, consent: true }
      ],
      accounts: [
        { id: 'a1', personaId: 'p1', service: 'GitHub', username: 'user1', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }
      ]
    });

    const report = buildMarkdownReport(vault, defaultOptions());

    expect(report).toContain('- Personas: 2');
    expect(report).toContain('- Identifiers: 3');
    expect(report).toContain('- Accounts: 1');
  });

  it('includes findings section with scored entries', () => {
    const vault = emptyVault({
      findings: [
        { id: 'f1', title: 'Password reuse', harm: 7, exploitability: 6, tier: 'high' },
        { id: 'f2', title: 'Public email', harm: 3, exploitability: 2, tier: 'low' }
      ]
    });

    const report = buildMarkdownReport(vault, defaultOptions());

    expect(report).toContain('## Top Findings');
    expect(report).toContain('- Findings: 2');
    expect(report).toContain('Password reuse');
    expect(report).toContain('Public email');
    expect(report).toContain('[high]');
    expect(report).toContain('[low]');
  });

  it('omits identifiers section when redacted is true', () => {
    const vault = emptyVault({
      identifiers: [
        { id: 'i1', type: 'email', value: 'secret@example.com', sensitivity: 3, consent: true }
      ]
    });

    const report = buildMarkdownReport(vault, defaultOptions({ redacted: true }));

    expect(report).not.toContain('## Identifiers (Sensitive)');
    expect(report).not.toContain('secret@example.com');
  });

  it('includes identifiers section when redacted is false', () => {
    const vault = emptyVault({
      personas: [
        { id: 'p1', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z' }
      ],
      identifiers: [
        { id: 'i1', personaId: 'p1', type: 'email', value: 'user@example.com', sensitivity: 2, consent: true }
      ]
    });

    const report = buildMarkdownReport(vault, defaultOptions({ redacted: false }));

    expect(report).toContain('## Identifiers (Sensitive)');
    expect(report).toContain('user@example.com');
    expect(report).toContain('Main');
    expect(report).toContain('email');
  });

  it('includes due rechecks when instances have nextCheckAt in the past', () => {
    const pastDate = '2025-01-01T00:00:00.000Z';
    const vault = emptyVault({
      personas: [
        { id: 'p1', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z' }
      ],
      connectorInstances: [
        {
          id: 'ci1',
          connectorId: 'broker-test',
          personaId: 'p1',
          state: 'recheck_scheduled',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          nextCheckAt: pastDate,
          evidence: []
        }
      ]
    });

    const report = buildMarkdownReport(vault, defaultOptions());

    expect(report).toContain('- Due rechecks: 1');
    expect(report).toContain('## Due Rechecks');
    expect(report).toContain('Test Broker');
    expect(report).toContain('Main');
    // The Due Rechecks section should list an entry, not "(none)"
    const dueSection = report.split('## Due Rechecks')[1]?.split('##')[0] ?? '';
    expect(dueSection).toContain('Test Broker');
    expect(dueSection).not.toContain('(none)');
  });
});
