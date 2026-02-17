import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLocalScan, addFindingFingerprint } from './scans';
import { createEmptyVault } from './vault';
import type { Account, Identifier, Persona } from './types';
import type { VaultStateV1 } from './vault';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Helper to build an identifier with sensible defaults.
 * Only `type`, `value`, and overrides need to be supplied.
 */
function makeIdentifier(
  overrides: Partial<Identifier> & Pick<Identifier, 'type' | 'value'>
): Identifier {
  return {
    id: crypto.randomUUID(),
    sensitivity: 2,
    consent: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Produce a vault with the given identifiers added. */
function vaultWith(identifiers: Identifier[]): VaultStateV1 {
  const vault = createEmptyVault();
  vault.identifiers = identifiers;
  return vault;
}

function makeAccount(
  overrides: Partial<Account> & Pick<Account, 'service' | 'username' | 'personaId'>,
): Account {
  return {
    id: crypto.randomUUID(),
    url: undefined,
    lastSeenAt: undefined,
    mfaEnabled: undefined,
    status: 'active',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePersona(overrides: Partial<Persona> & Pick<Persona, 'id' | 'name'>): Persona {
  return {
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock fetch for HIBP tests
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

// ===========================================================================
// Existing tests
// ===========================================================================

describe('runLocalScan', () => {
  it('returns no findings for an empty vault', async () => {
    const vault = createEmptyVault();
    const findings = await runLocalScan(vault);
    expect(findings).toEqual([]);
  });

  it('returns a moderate finding when a phone number is present', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'phone', value: '+15551234567' }),
    ]);

    const findings = await runLocalScan(vault);
    const phoneFinding = findings.find((f) => f.title.toLowerCase().includes('phone'));

    expect(phoneFinding).toBeDefined();
    expect(phoneFinding!.tier).toBe('moderate');
    expect(phoneFinding!.source).toBe('local');
    expect(phoneFinding!.status).toBe('open');
  });

  it('returns a high finding when an address is present', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'address', value: '123 Main St' }),
    ]);

    const findings = await runLocalScan(vault);
    const addressFinding = findings.find((f) => f.title.toLowerCase().includes('address'));

    expect(addressFinding).toBeDefined();
    expect(addressFinding!.tier).toBe('high');
  });

  it('returns a high name-linkage finding when legal name and address are present', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'legal_name', value: 'Jane Doe' }),
      makeIdentifier({ type: 'address', value: '456 Oak Ave' }),
    ]);

    const findings = await runLocalScan(vault);
    const linkageFinding = findings.find((f) => f.title.toLowerCase().includes('linkab'));

    expect(linkageFinding).toBeDefined();
    expect(linkageFinding!.tier).toBe('high');
  });

  it('returns a high name-linkage finding when legal name and phone are present', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'legal_name', value: 'John Smith' }),
      makeIdentifier({ type: 'phone', value: '+15559876543' }),
    ]);

    const findings = await runLocalScan(vault);
    const linkageFinding = findings.find((f) => f.title.toLowerCase().includes('linkab'));

    expect(linkageFinding).toBeDefined();
    expect(linkageFinding!.tier).toBe('high');
  });

  it('detects cross-persona reuse when the same email appears under different personaIds', async () => {
    const vault = createEmptyVault();
    const personaA = 'persona-a';
    const personaB = 'persona-b';

    vault.identifiers = [
      makeIdentifier({ type: 'email', value: 'shared@example.com', personaId: personaA }),
      makeIdentifier({ type: 'email', value: 'shared@example.com', personaId: personaB }),
    ];

    const findings = await runLocalScan(vault);
    const reuseFinding = findings.find((f) => f.title.toLowerCase().includes('cross-persona'));

    expect(reuseFinding).toBeDefined();
    expect(reuseFinding!.tier).toBe('high');
  });

  it('does not produce a cross-persona finding when the same email is under one persona', async () => {
    const vault = createEmptyVault();
    const samePersona = 'persona-only';

    vault.identifiers = [
      makeIdentifier({ type: 'email', value: 'dup@example.com', personaId: samePersona }),
      makeIdentifier({ type: 'email', value: 'dup@example.com', personaId: samePersona }),
    ];

    const findings = await runLocalScan(vault);
    const reuseFinding = findings.find((f) => f.title.toLowerCase().includes('cross-persona'));

    expect(reuseFinding).toBeUndefined();
  });

  it('ignores identifiers that do not have consent', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'phone', value: '+15550000000', consent: false }),
      makeIdentifier({ type: 'address', value: '789 Elm St', consent: false }),
      makeIdentifier({ type: 'legal_name', value: 'No Consent', consent: false }),
    ]);

    const findings = await runLocalScan(vault);
    expect(findings).toEqual([]);
  });

  it('only scans consented identifiers when the vault has a mix', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'phone', value: '+15550001111', consent: true }),
      makeIdentifier({ type: 'address', value: '999 Hidden Rd', consent: false }),
    ]);

    const findings = await runLocalScan(vault);

    // Phone is consented so should trigger a finding.
    expect(findings.some((f) => f.title.toLowerCase().includes('phone'))).toBe(true);
    // Address is not consented so should not trigger its own finding.
    expect(findings.some((f) => f.title.toLowerCase().includes('address exposure'))).toBe(false);
  });

  it('deduplicates findings by id', async () => {
    // Running the same scan twice on the same vault should produce identical IDs.
    const vault = vaultWith([
      makeIdentifier({ type: 'phone', value: '+15551111111' }),
      makeIdentifier({ type: 'address', value: '321 Pine St' }),
      makeIdentifier({ type: 'legal_name', value: 'Dedup Test' }),
    ]);

    const findings = await runLocalScan(vault);

    const ids = findings.map((f) => f.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('produces stable finding IDs across repeated scans', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'phone', value: '+15552222222' }),
    ]);

    const first = await runLocalScan(vault);
    const second = await runLocalScan(vault);

    expect(first.map((f) => f.id)).toEqual(second.map((f) => f.id));
  });
});

// ===========================================================================
// New heuristic tests
// ===========================================================================

describe('runLocalScan — account-identifier mismatch', () => {
  it('flags an account whose username matches an identifier from a different persona', async () => {
    const vault = createEmptyVault();
    const personaA = 'persona-a';
    const personaB = 'persona-b';

    vault.personas = [
      makePersona({ id: personaA, name: 'Work' }),
      makePersona({ id: personaB, name: 'Personal' }),
    ];
    vault.activePersonaId = personaA;

    vault.identifiers = [
      makeIdentifier({ type: 'email', value: 'work@corp.com', personaId: personaA }),
      makeIdentifier({ type: 'email', value: 'personal@gmail.com', personaId: personaB }),
    ];

    // Account in personaA but using personaB's identifier as username.
    vault.accounts = [
      makeAccount({
        service: 'SomeService',
        username: 'personal@gmail.com',
        personaId: personaA,
      }),
    ];

    const findings = await runLocalScan(vault);
    const mismatch = findings.find((f) =>
      f.title.toLowerCase().includes('different persona'),
    );

    expect(mismatch).toBeDefined();
    expect(mismatch!.tier).toBe('moderate');
    expect(mismatch!.personaId).toBe(personaA);
  });

  it('does not flag when account username matches own persona identifier', async () => {
    const vault = createEmptyVault();
    const pid = vault.activePersonaId;

    vault.identifiers = [
      makeIdentifier({ type: 'email', value: 'me@example.com', personaId: pid }),
    ];
    vault.accounts = [
      makeAccount({ service: 'MyService', username: 'me@example.com', personaId: pid }),
    ];

    const findings = await runLocalScan(vault);
    const mismatch = findings.find((f) =>
      f.title.toLowerCase().includes('different persona'),
    );

    expect(mismatch).toBeUndefined();
  });
});

describe('runLocalScan — stale accounts', () => {
  it('flags accounts with status unknown or unused older than 30 days', async () => {
    const vault = createEmptyVault();
    const pid = vault.activePersonaId;

    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

    vault.accounts = [
      makeAccount({
        service: 'OldService',
        username: 'old',
        personaId: pid,
        status: 'unknown',
        createdAt: oldDate,
      }),
    ];

    const findings = await runLocalScan(vault);
    const stale = findings.find((f) => f.title.toLowerCase().includes('stale'));

    expect(stale).toBeDefined();
    expect(stale!.tier).toBe('low');
    expect(stale!.title).toContain('OldService');
  });

  it('does not flag active accounts regardless of age', async () => {
    const vault = createEmptyVault();
    const pid = vault.activePersonaId;

    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    vault.accounts = [
      makeAccount({
        service: 'ActiveService',
        username: 'active',
        personaId: pid,
        status: 'active',
        createdAt: oldDate,
      }),
    ];

    const findings = await runLocalScan(vault);
    const stale = findings.find((f) => f.title.toLowerCase().includes('stale'));
    expect(stale).toBeUndefined();
  });

  it('does not flag unknown accounts less than 30 days old', async () => {
    const vault = createEmptyVault();
    const pid = vault.activePersonaId;

    const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    vault.accounts = [
      makeAccount({
        service: 'NewUnknown',
        username: 'newbie',
        personaId: pid,
        status: 'unknown',
        createdAt: recentDate,
      }),
    ];

    const findings = await runLocalScan(vault);
    const stale = findings.find((f) => f.title.toLowerCase().includes('stale'));
    expect(stale).toBeUndefined();
  });
});

describe('runLocalScan — missing MFA connectors', () => {
  it('flags when high-value accounts exist but no MFA connector is configured', async () => {
    const vault = createEmptyVault();
    const pid = vault.activePersonaId;

    vault.accounts = [
      makeAccount({ service: 'Google', username: 'user@gmail.com', personaId: pid }),
    ];
    vault.connectorInstances = [];

    const findings = await runLocalScan(vault);
    const mfa = findings.find((f) => f.title.toLowerCase().includes('mfa'));

    expect(mfa).toBeDefined();
    expect(mfa!.tier).toBe('high');
  });

  it('does not flag when an MFA connector exists', async () => {
    const vault = createEmptyVault();
    const pid = vault.activePersonaId;

    vault.accounts = [
      makeAccount({ service: 'Google', username: 'user@gmail.com', personaId: pid }),
    ];
    vault.connectorInstances = [
      {
        id: crypto.randomUUID(),
        connectorId: 'enable-mfa-google',
        personaId: pid,
        state: 'executed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        evidence: [],
      },
    ];

    const findings = await runLocalScan(vault);
    const mfa = findings.find((f) => f.title.toLowerCase().includes('mfa'));
    expect(mfa).toBeUndefined();
  });

  it('does not flag when there are no high-value accounts', async () => {
    const vault = createEmptyVault();
    const pid = vault.activePersonaId;

    vault.accounts = [
      makeAccount({ service: 'SomeObscureApp', username: 'user', personaId: pid }),
    ];

    const findings = await runLocalScan(vault);
    const mfa = findings.find((f) => f.title.toLowerCase().includes('mfa'));
    expect(mfa).toBeUndefined();
  });
});

describe('runLocalScan — weak persona separation', () => {
  it('flags personas with fewer than 2 identifiers when multiple personas exist', async () => {
    const vault = createEmptyVault();
    const personaA = 'persona-a';
    const personaB = 'persona-b';

    vault.personas = [
      makePersona({ id: personaA, name: 'Work' }),
      makePersona({ id: personaB, name: 'Personal' }),
    ];
    vault.activePersonaId = personaA;

    // PersonaA has 2 identifiers (good), PersonaB has 1 (weak).
    vault.identifiers = [
      makeIdentifier({ type: 'email', value: 'work@corp.com', personaId: personaA }),
      makeIdentifier({ type: 'phone', value: '+15551111111', personaId: personaA }),
      makeIdentifier({ type: 'email', value: 'personal@gmail.com', personaId: personaB }),
    ];

    const findings = await runLocalScan(vault);
    const weak = findings.filter((f) =>
      f.title.toLowerCase().includes('weak separation'),
    );

    // Only personaB should be flagged.
    expect(weak).toHaveLength(1);
    expect(weak[0]!.personaId).toBe(personaB);
    expect(weak[0]!.tier).toBe('low');
  });

  it('does not flag when there is only one persona', async () => {
    const vault = createEmptyVault();
    // Single persona with 1 identifier — no separation needed.
    vault.identifiers = [
      makeIdentifier({ type: 'email', value: 'solo@example.com' }),
    ];

    const findings = await runLocalScan(vault);
    const weak = findings.find((f) =>
      f.title.toLowerCase().includes('weak separation'),
    );
    expect(weak).toBeUndefined();
  });
});

describe('runLocalScan — data broker exposure', () => {
  it('flags when legal name and address are present and no broker connector exists', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'legal_name', value: 'Jane Doe' }),
      makeIdentifier({ type: 'address', value: '123 Main St' }),
    ]);

    const findings = await runLocalScan(vault);
    const broker = findings.find((f) =>
      f.title.toLowerCase().includes('data broker'),
    );

    expect(broker).toBeDefined();
    expect(broker!.tier).toBe('high');
  });

  it('does not flag when a broker connector instance is present', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'legal_name', value: 'Jane Doe' }),
      makeIdentifier({ type: 'address', value: '123 Main St' }),
    ]);

    vault.connectorInstances = [
      {
        id: crypto.randomUUID(),
        connectorId: 'spokeo-opt-out',
        personaId: vault.activePersonaId,
        state: 'executed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        evidence: [],
      },
    ];

    const findings = await runLocalScan(vault);
    const broker = findings.find((f) =>
      f.title.toLowerCase().includes('data broker'),
    );
    expect(broker).toBeUndefined();
  });

  it('does not flag when only legal name is present (no address)', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'legal_name', value: 'Jane Doe' }),
    ]);

    const findings = await runLocalScan(vault);
    const broker = findings.find((f) =>
      f.title.toLowerCase().includes('data broker'),
    );
    expect(broker).toBeUndefined();
  });
});

describe('runLocalScan — email without aliasing', () => {
  it('flags a regular email address as not aliased', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'email', value: 'user@gmail.com' }),
    ]);

    const findings = await runLocalScan(vault);
    const aliasing = findings.find((f) =>
      f.title.toLowerCase().includes('alias'),
    );

    expect(aliasing).toBeDefined();
    expect(aliasing!.tier).toBe('moderate');
  });

  it('does not flag an email with a + tag as needing aliasing', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'email', value: 'user+tag@gmail.com' }),
    ]);

    const findings = await runLocalScan(vault);
    const aliasing = findings.find((f) =>
      f.title.toLowerCase().includes('alias'),
    );
    expect(aliasing).toBeUndefined();
  });

  it('does not flag emails from known alias domains', async () => {
    const aliasDomains = [
      'simplelogin.com',
      'anonaddy.me',
      'duck.com',
      'mozmail.com',
      'privaterelay.appleid.com',
    ];

    for (const domain of aliasDomains) {
      const vault = vaultWith([
        makeIdentifier({ type: 'email', value: `random@${domain}` }),
      ]);

      const findings = await runLocalScan(vault);
      const aliasing = findings.find((f) =>
        f.title.toLowerCase().includes('alias'),
      );
      expect(aliasing).toBeUndefined();
    }
  });

  it('masks the email in the finding title', async () => {
    const vault = vaultWith([
      makeIdentifier({ type: 'email', value: 'secretuser@example.com' }),
    ]);

    const findings = await runLocalScan(vault);
    const aliasing = findings.find((f) =>
      f.title.toLowerCase().includes('alias'),
    );

    expect(aliasing).toBeDefined();
    // Should not contain the full email.
    expect(aliasing!.title).not.toContain('secretuser@example.com');
    expect(aliasing!.title).toContain('s***@example.com');
  });
});

describe('runLocalScan — HIBP breach integration', () => {
  it('creates findings for each breach when API key is provided', async () => {
    const breachResponse = [
      {
        Name: 'Adobe',
        Domain: 'adobe.com',
        BreachDate: '2013-10-04',
        DataClasses: ['Email addresses', 'Passwords'],
        Description: 'Adobe breach',
        IsVerified: true,
        PwnCount: 152445165,
      },
      {
        Name: 'LinkedIn',
        Domain: 'linkedin.com',
        BreachDate: '2012-05-05',
        DataClasses: ['Email addresses'],
        Description: 'LinkedIn breach',
        IsVerified: false,
        PwnCount: 164611595,
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(breachResponse),
    });

    const vault = vaultWith([
      makeIdentifier({ type: 'email', value: 'breached@example.com' }),
    ]);

    const findings = await runLocalScan(vault, {
      hibpConfig: { apiKey: 'test-key' },
    });

    const adobeFinding = findings.find((f) => f.title.includes('Adobe'));
    const linkedInFinding = findings.find((f) => f.title.includes('LinkedIn'));

    expect(adobeFinding).toBeDefined();
    expect(adobeFinding!.tier).toBe('high'); // verified
    expect(adobeFinding!.harm).toBe(8);

    expect(linkedInFinding).toBeDefined();
    expect(linkedInFinding!.tier).toBe('moderate'); // unverified
    expect(linkedInFinding!.harm).toBe(6);
  });

  it('does not call HIBP when no API key is provided', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const vault = vaultWith([
      makeIdentifier({ type: 'email', value: 'test@example.com' }),
    ]);

    await runLocalScan(vault); // No options / no API key.

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not crash the scan when HIBP returns an error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const vault = vaultWith([
      makeIdentifier({ type: 'email', value: 'test@example.com' }),
    ]);

    // Should not throw — errors are silently caught.
    const findings = await runLocalScan(vault, {
      hibpConfig: { apiKey: 'test-key' },
    });

    // Should still produce the email aliasing finding at minimum.
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('includes data classes in breach finding titles', async () => {
    const breachResponse = [
      {
        Name: 'TestBreach',
        Domain: 'test.com',
        BreachDate: '2023-01-01',
        DataClasses: ['Passwords', 'Email addresses', 'IP addresses', 'Names'],
        Description: 'Test',
        IsVerified: true,
        PwnCount: 1000,
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(breachResponse),
    });

    const vault = vaultWith([
      makeIdentifier({ type: 'email', value: 'user@test.com' }),
    ]);

    const findings = await runLocalScan(vault, {
      hibpConfig: { apiKey: 'key' },
    });

    const breachFinding = findings.find((f) => f.title.includes('TestBreach'));
    expect(breachFinding).toBeDefined();
    expect(breachFinding!.title).toContain('exposed:');
    expect(breachFinding!.title).toContain('Passwords');
  });
});

// ===========================================================================
// addFindingFingerprint (unchanged)
// ===========================================================================

describe('addFindingFingerprint', () => {
  it('returns a string', () => {
    const vault = createEmptyVault();
    vault.identifiers = [
      makeIdentifier({ type: 'email', value: 'fp@example.com' }),
    ];

    const finding = {
      id: 'f-test123',
      title: 'Test finding',
      harm: 5,
      exploitability: 5,
      tier: 'moderate' as const,
      source: 'local' as const,
      status: 'open' as const,
      createdAt: new Date().toISOString(),
    };

    const fingerprint = addFindingFingerprint(finding, vault);
    expect(typeof fingerprint).toBe('string');
    expect(fingerprint.length).toBeGreaterThan(0);
    expect(fingerprint.length).toBeLessThanOrEqual(12);
  });

  it('returns a stable value for the same inputs', () => {
    const vault = createEmptyVault();
    vault.identifiers = [
      makeIdentifier({ type: 'username', value: 'stableuser', id: 'fixed-id-1' }),
    ];

    const finding = {
      id: 'f-stable',
      title: 'Stable finding',
      harm: 7,
      exploitability: 6,
      tier: 'high' as const,
      source: 'local' as const,
      status: 'open' as const,
      createdAt: '2025-01-01T00:00:00Z',
    };

    const first = addFindingFingerprint(finding, vault);
    const second = addFindingFingerprint(finding, vault);
    expect(first).toBe(second);
  });

  it('produces different fingerprints for different findings', () => {
    const vault = createEmptyVault();
    vault.identifiers = [
      makeIdentifier({ type: 'email', value: 'diff@example.com' }),
    ];

    const findingA = {
      id: 'f-a',
      title: 'Finding A',
      harm: 5,
      exploitability: 5,
      tier: 'moderate' as const,
    };

    const findingB = {
      id: 'f-b',
      title: 'Finding B',
      harm: 9,
      exploitability: 8,
      tier: 'high' as const,
    };

    const fpA = addFindingFingerprint(findingA, vault);
    const fpB = addFindingFingerprint(findingB, vault);
    expect(fpA).not.toBe(fpB);
  });

  it('changes when the vault identifiers change', () => {
    const vault1 = createEmptyVault();
    vault1.identifiers = [
      makeIdentifier({ type: 'email', value: 'one@example.com', id: 'id-1' }),
    ];

    const vault2 = createEmptyVault();
    vault2.identifiers = [
      makeIdentifier({ type: 'email', value: 'two@example.com', id: 'id-2' }),
    ];

    const finding = {
      id: 'f-shared',
      title: 'Same finding',
      harm: 5,
      exploitability: 5,
      tier: 'moderate' as const,
    };

    const fp1 = addFindingFingerprint(finding, vault1);
    const fp2 = addFindingFingerprint(finding, vault2);
    expect(fp1).not.toBe(fp2);
  });
});
