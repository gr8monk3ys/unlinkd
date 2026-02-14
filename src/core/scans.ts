import type { Identifier, RiskFinding } from './types';
import type { VaultStateV1 } from './vault';

function sha256HexSyncFallback(value: string): string {
  // Stable-enough fallback if crypto.subtle isn't available.
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

async function sha256Hex(value: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
      .map((item) => item.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return sha256HexSyncFallback(value);
  }
}

function identifierKey(identifier: Identifier, fallbackPersonaId: string): string {
  const personaId = identifier.personaId ?? fallbackPersonaId;
  return `${personaId}:${identifier.type}:${identifier.value}`.toLowerCase();
}

export async function runLocalScan(vault: VaultStateV1): Promise<RiskFinding[]> {
  const findings: RiskFinding[] = [];
  const now = new Date().toISOString();

  const consented = vault.identifiers.filter((id) => id.consent);

  // Flag cross-persona reuse: same type+value across different personas.
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
        createdAt: now
      });
    }
  }

  // Heuristics by identifier type.
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
      createdAt: now
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
      createdAt: now
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
      createdAt: now
    });
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

export function addFindingFingerprint(finding: RiskFinding, vault: VaultStateV1): string {
  // Human-friendly stable key for UI (not used for cryptographic integrity).
  const seed = `${finding.title}:${finding.tier}:${finding.harm}:${finding.exploitability}`;
  const ids = vault.identifiers.map((id) => identifierKey(id, vault.activePersonaId)).join('|');
  return sha256HexSyncFallback(`${seed}:${ids}`).slice(0, 12);
}

