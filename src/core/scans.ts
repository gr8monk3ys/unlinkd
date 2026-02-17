import { sha256Hex } from './crypto';
import { checkBreaches } from './hibp';
import type { HibpConfig } from './hibp';
import type { Identifier, RiskFinding } from './types';
import type { VaultStateV1 } from './vault';

function sha256HexSyncFallback(value: string): string {
  // Stable-enough fallback used only for non-cryptographic UI fingerprints.
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function identifierKey(identifier: Identifier, fallbackPersonaId: string): string {
  const personaId = identifier.personaId ?? fallbackPersonaId;
  return `${personaId}:${identifier.type}:${identifier.value}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// Scan options
// ---------------------------------------------------------------------------

export interface ScanOptions {
  hibpConfig?: HibpConfig;
}

// ---------------------------------------------------------------------------
// High-value services that should have MFA
// ---------------------------------------------------------------------------

const HIGH_VALUE_SERVICES = new Set([
  'google',
  'apple',
  'microsoft',
  'amazon',
  'paypal',
  'bank',
  'banking',
  'chase',
  'wells fargo',
  'citibank',
  'coinbase',
  'binance',
  'github',
  'icloud',
]);

// ---------------------------------------------------------------------------
// Main scan entry point
// ---------------------------------------------------------------------------

export async function runLocalScan(
  vault: VaultStateV1,
  options?: ScanOptions,
): Promise<RiskFinding[]> {
  const findings: RiskFinding[] = [];
  const now = new Date().toISOString();

  const consented = vault.identifiers.filter((id) => id.consent);

  // -----------------------------------------------------------------------
  // 1. Cross-persona reuse (existing)
  // -----------------------------------------------------------------------
  const byTypeValue = new Map<string, Set<string>>();
  consented.forEach((identifier) => {
    const personaId = identifier.personaId ?? vault.activePersonaId;
    const key = `${identifier.type}:${identifier.value}`.toLowerCase();
    const set = byTypeValue.get(key) ?? new Set<string>();
    set.add(personaId);
    byTypeValue.set(key, set);
  });

  for (const [key, personas] of byTypeValue.entries()) {
    if (personas.size > 1) {
      const id = await sha256Hex(`cross-persona:${key}`);
      findings.push({
        id: `f-${id.slice(0, 12)}`,
        title: `Cross-persona reuse detected for ${key.split(':')[0]}`,
        harm: 9,
        exploitability: 8,
        tier: 'high',
        source: 'local',
        status: 'open',
        createdAt: now,
      });
    }
  }

  // -----------------------------------------------------------------------
  // 2. Existing heuristics by identifier type
  // -----------------------------------------------------------------------
  const hasPhone = consented.some((id) => id.type === 'phone');
  const hasAddress = consented.some((id) => id.type === 'address');
  const hasLegalName = consented.some((id) => id.type === 'legal_name');

  if (hasPhone) {
    const id = await sha256Hex('phone-recovery');
    findings.push({
      id: `f-${id.slice(0, 12)}`,
      title: 'Phone number increases account-recovery abuse risk',
      harm: 7,
      exploitability: 7,
      tier: 'moderate',
      source: 'local',
      status: 'open',
      createdAt: now,
    });
  }

  if (hasAddress) {
    const id = await sha256Hex('address-exposure');
    findings.push({
      id: `f-${id.slice(0, 12)}`,
      title: 'Address exposure increases physical and financial risk',
      harm: 9,
      exploitability: 7,
      tier: 'high',
      source: 'local',
      status: 'open',
      createdAt: now,
    });
  }

  if (hasLegalName && (hasAddress || hasPhone)) {
    const id = await sha256Hex('name-linkage');
    findings.push({
      id: `f-${id.slice(0, 12)}`,
      title: 'Legal name combined with other identifiers increases linkability',
      harm: 8,
      exploitability: 7,
      tier: 'high',
      source: 'local',
      status: 'open',
      createdAt: now,
    });
  }

  // -----------------------------------------------------------------------
  // 3. Account-identifier mismatch
  // -----------------------------------------------------------------------
  await checkAccountIdentifierMismatch(vault, consented, findings, now);

  // -----------------------------------------------------------------------
  // 4. Stale accounts
  // -----------------------------------------------------------------------
  await checkStaleAccounts(vault, findings, now);

  // -----------------------------------------------------------------------
  // 5. Missing MFA connectors
  // -----------------------------------------------------------------------
  await checkMissingMfa(vault, findings, now);

  // -----------------------------------------------------------------------
  // 6. Weak persona separation
  // -----------------------------------------------------------------------
  await checkWeakPersonaSeparation(vault, consented, findings, now);

  // -----------------------------------------------------------------------
  // 7. Data broker exposure
  // -----------------------------------------------------------------------
  await checkDataBrokerExposure(vault, hasLegalName, hasAddress, findings, now);

  // -----------------------------------------------------------------------
  // 8. Email without aliasing
  // -----------------------------------------------------------------------
  await checkEmailAliasing(consented, findings, now);

  // -----------------------------------------------------------------------
  // 9. HIBP breach results
  // -----------------------------------------------------------------------
  if (options?.hibpConfig?.apiKey) {
    await checkHibpBreaches(consented, options.hibpConfig, findings, now);
  }

  // Deduplicate by id (stable IDs).
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.id)) {
      return false;
    }

    seen.add(finding.id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Heuristic: Account-identifier mismatch
// ---------------------------------------------------------------------------

async function checkAccountIdentifierMismatch(
  vault: VaultStateV1,
  consented: Identifier[],
  findings: RiskFinding[],
  now: string,
): Promise<void> {
  // Build a map of persona -> identifier values for quick lookup.
  const identifiersByPersona = new Map<string, Set<string>>();
  for (const identifier of consented) {
    const pid = identifier.personaId ?? vault.activePersonaId;
    const set = identifiersByPersona.get(pid) ?? new Set<string>();
    set.add(identifier.value.toLowerCase());
    identifiersByPersona.set(pid, set);
  }

  for (const account of vault.accounts) {
    const personaIdentifiers = identifiersByPersona.get(account.personaId);
    if (!personaIdentifiers) continue;

    const accountUsername = account.username.toLowerCase();

    // Check if the account username matches an identifier from a DIFFERENT persona.
    for (const [otherPersonaId, otherValues] of identifiersByPersona.entries()) {
      if (otherPersonaId === account.personaId) continue;
      if (otherValues.has(accountUsername)) {
        const id = await sha256Hex(
          `account-mismatch:${account.id}:${otherPersonaId}`,
        );
        findings.push({
          id: `f-${id.slice(0, 12)}`,
          title: `Account "${account.service}" uses an identifier from a different persona`,
          harm: 7,
          exploitability: 6,
          tier: 'moderate',
          personaId: account.personaId,
          source: 'local',
          status: 'open',
          createdAt: now,
        });
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Heuristic: Stale accounts
// ---------------------------------------------------------------------------

async function checkStaleAccounts(
  vault: VaultStateV1,
  findings: RiskFinding[],
  now: string,
): Promise<void> {
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  for (const account of vault.accounts) {
    if (account.status !== 'unknown' && account.status !== 'unused') continue;

    const createdMs = new Date(account.createdAt).getTime();
    if (!Number.isFinite(createdMs)) continue;

    if (nowMs - createdMs >= thirtyDaysMs) {
      const id = await sha256Hex(`stale-account:${account.id}`);
      findings.push({
        id: `f-${id.slice(0, 12)}`,
        title: `Stale account "${account.service}" has been ${account.status} for 30+ days`,
        harm: 5,
        exploitability: 4,
        tier: 'low',
        personaId: account.personaId,
        source: 'local',
        status: 'open',
        createdAt: now,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Heuristic: Missing MFA connectors
// ---------------------------------------------------------------------------

async function checkMissingMfa(
  vault: VaultStateV1,
  findings: RiskFinding[],
  now: string,
): Promise<void> {
  const highValueAccounts = vault.accounts.filter((a) =>
    HIGH_VALUE_SERVICES.has(a.service.toLowerCase()),
  );

  if (highValueAccounts.length === 0) return;

  // Check if any connector instance references MFA (by connector ID pattern).
  const hasMfaConnector = vault.connectorInstances.some(
    (ci) =>
      ci.connectorId.toLowerCase().includes('mfa') ||
      ci.connectorId.toLowerCase().includes('2fa') ||
      ci.connectorId.toLowerCase().includes('totp'),
  );

  if (!hasMfaConnector) {
    const id = await sha256Hex('missing-mfa-connectors');
    findings.push({
      id: `f-${id.slice(0, 12)}`,
      title: `${highValueAccounts.length} high-value account(s) found but no MFA connector configured`,
      harm: 8,
      exploitability: 7,
      tier: 'high',
      source: 'local',
      status: 'open',
      createdAt: now,
    });
  }
}

// ---------------------------------------------------------------------------
// Heuristic: Weak persona separation
// ---------------------------------------------------------------------------

async function checkWeakPersonaSeparation(
  vault: VaultStateV1,
  consented: Identifier[],
  findings: RiskFinding[],
  now: string,
): Promise<void> {
  // Count consented identifiers per persona.
  const countByPersona = new Map<string, number>();
  for (const identifier of consented) {
    const pid = identifier.personaId ?? vault.activePersonaId;
    countByPersona.set(pid, (countByPersona.get(pid) ?? 0) + 1);
  }

  // Only flag if there are multiple personas (separation is the goal).
  if (vault.personas.length < 2) return;

  for (const persona of vault.personas) {
    const count = countByPersona.get(persona.id) ?? 0;
    if (count < 2) {
      const id = await sha256Hex(`weak-persona:${persona.id}`);
      findings.push({
        id: `f-${id.slice(0, 12)}`,
        title: `Persona "${persona.name}" has fewer than 2 identifiers — weak separation`,
        harm: 4,
        exploitability: 3,
        tier: 'low',
        personaId: persona.id,
        source: 'local',
        status: 'open',
        createdAt: now,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Heuristic: Data broker exposure
// ---------------------------------------------------------------------------

async function checkDataBrokerExposure(
  vault: VaultStateV1,
  hasLegalName: boolean,
  hasAddress: boolean,
  findings: RiskFinding[],
  now: string,
): Promise<void> {
  if (!hasLegalName || !hasAddress) return;

  // Check if the user already has broker-category connectors.
  const hasBrokerConnector = vault.connectorInstances.some(
    (ci) =>
      ci.connectorId.toLowerCase().includes('broker') ||
      ci.connectorId.toLowerCase().includes('spokeo') ||
      ci.connectorId.toLowerCase().includes('whitepages') ||
      ci.connectorId.toLowerCase().includes('beenverified'),
  );

  if (!hasBrokerConnector) {
    const id = await sha256Hex('data-broker-exposure');
    findings.push({
      id: `f-${id.slice(0, 12)}`,
      title: 'Legal name + address detected — high likelihood of data broker presence',
      harm: 8,
      exploitability: 8,
      tier: 'high',
      source: 'local',
      status: 'open',
      createdAt: now,
    });
  }
}

// ---------------------------------------------------------------------------
// Heuristic: Email without aliasing
// ---------------------------------------------------------------------------

async function checkEmailAliasing(
  consented: Identifier[],
  findings: RiskFinding[],
  now: string,
): Promise<void> {
  const emailIdentifiers = consented.filter((id) => id.type === 'email');

  for (const emailId of emailIdentifiers) {
    const email = emailId.value;
    if (looksLikeAlias(email)) continue;

    const id = await sha256Hex(`email-no-alias:${email.toLowerCase()}`);
    findings.push({
      id: `f-${id.slice(0, 12)}`,
      title: `Email "${maskEmailForTitle(email)}" appears to be a real address — consider using an alias`,
      harm: 5,
      exploitability: 5,
      tier: 'moderate',
      source: 'local',
      status: 'open',
      createdAt: now,
    });
  }
}

/**
 * Heuristic check for whether an email looks like an alias.
 * Aliases typically contain `+` tags, or come from known relay/alias
 * services (e.g., simplelogin, anonaddy, relay.firefox).
 */
function looksLikeAlias(email: string): boolean {
  const lower = email.toLowerCase();

  // Gmail-style `+` tag
  if (lower.includes('+')) return true;

  // Known alias/relay domains
  const aliasDomains = [
    'simplelogin.com',
    'simplelogin.co',
    'anonaddy.me',
    'anonaddy.com',
    'relay.firefox.com',
    'mozmail.com',
    'duck.com',
    'icloud.com', // Hide My Email
    'privaterelay.appleid.com',
  ];

  const domain = lower.split('@')[1];
  if (domain && aliasDomains.includes(domain)) return true;

  return false;
}

/** Mask email for safe use in finding titles. */
function maskEmailForTitle(email: string): string {
  const at = email.indexOf('@');
  if (at <= 1) return '***@***';
  const domain = email.slice(at + 1);
  return email[0] + '***@' + domain;
}

// ---------------------------------------------------------------------------
// HIBP breach check integration
// ---------------------------------------------------------------------------

async function checkHibpBreaches(
  consented: Identifier[],
  hibpConfig: HibpConfig,
  findings: RiskFinding[],
  now: string,
): Promise<void> {
  const emails = consented.filter((id) => id.type === 'email');

  for (const emailId of emails) {
    try {
      const result = await checkBreaches(emailId.value, hibpConfig);
      if (!result || result.breaches.length === 0) continue;

      for (const breach of result.breaches) {
        const id = await sha256Hex(
          `hibp-breach:${emailId.value.toLowerCase()}:${breach.name}`,
        );

        const dataClassSummary =
          breach.dataClasses.length > 0
            ? ` (exposed: ${breach.dataClasses.slice(0, 3).join(', ')}${breach.dataClasses.length > 3 ? '...' : ''})`
            : '';

        findings.push({
          id: `f-${id.slice(0, 12)}`,
          title: `Email found in "${breach.name}" breach${dataClassSummary}`,
          harm: breach.isVerified ? 8 : 6,
          exploitability: breach.isVerified ? 7 : 5,
          tier: breach.isVerified ? 'high' : 'moderate',
          personaId: emailId.personaId,
          source: 'local',
          status: 'open',
          createdAt: now,
        });
      }
    } catch {
      // Silently skip failed checks — don't crash the scan for API errors.
    }
  }
}

// ---------------------------------------------------------------------------
// Finding fingerprint (existing)
// ---------------------------------------------------------------------------

export function addFindingFingerprint(finding: RiskFinding, vault: VaultStateV1): string {
  // Human-friendly stable key for UI (not used for cryptographic integrity).
  const seed = `${finding.title}:${finding.tier}:${finding.harm}:${finding.exploitability}`;
  const ids = vault.identifiers.map((id) => identifierKey(id, vault.activePersonaId)).join('|');
  return sha256HexSyncFallback(`${seed}:${ids}`).slice(0, 12);
}
