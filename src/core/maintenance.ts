import { decryptBytes, encryptBytes, needsKdfUpgrade } from './crypto';
import { listEvidencePayloads, putEvidencePayload } from './evidence';

/**
 * Evidence payloads are written once and never rewritten, so files stored
 * before the scrypt migration keep their weaker (PBKDF2, or legacy unsalted
 * SHA-256) envelope forever — even though the vault itself gets upgraded on the
 * next unlock. This is the explicit path to bring them forward.
 */

export interface EvidenceUpgradeResult {
  /** Payloads re-encrypted under the current memory-hard KDF. */
  upgraded: number;
  /** Payloads that could not be decrypted with the supplied passphrase. */
  failed: number;
}

/** How many stored evidence payloads still use a pre-scrypt envelope. */
export async function countLegacyEvidence(): Promise<number> {
  try {
    const rows = await listEvidencePayloads();
    return rows.filter((row) => needsKdfUpgrade(row.payload)).length;
  } catch {
    return 0;
  }
}

/**
 * Re-encrypt every legacy evidence payload under the current KDF. Each payload
 * is only replaced after its re-encryption succeeds, so a failure part-way
 * leaves the remaining payloads readable in their original form.
 */
export async function upgradeLegacyEvidence(passphrase: string): Promise<EvidenceUpgradeResult> {
  const rows = await listEvidencePayloads();
  let upgraded = 0;
  let failed = 0;

  for (const row of rows) {
    if (!needsKdfUpgrade(row.payload)) {
      continue;
    }

    const plaintext = await decryptBytes(row.payload, passphrase);
    if (!plaintext) {
      failed += 1;
      continue;
    }

    const reencrypted = await encryptBytes(plaintext, passphrase);
    await putEvidencePayload(row.id, reencrypted);
    upgraded += 1;
  }

  return { upgraded, failed };
}
