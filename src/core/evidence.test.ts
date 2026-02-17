import { describe, expect, it, beforeEach } from 'vitest';
import {
  putEvidencePayload,
  getEvidencePayload,
  deleteEvidencePayload,
  listEvidencePayloads,
  clearEvidenceStore
} from './evidence';
import type { EncryptedPayload } from './crypto';

const samplePayload: EncryptedPayload = {
  version: 1,
  kdf: 'pbkdf2-sha256',
  iterations: 310000,
  salt: 'dGVzdHNhbHQ=',
  iv: 'dGVzdGl2',
  ciphertext: 'dGVzdGNpcGhlcnRleHQ='
};

describe('evidence', () => {
  beforeEach(async () => {
    try {
      await clearEvidenceStore();
    } catch {
      // IndexedDB may not be available
    }
  });

  it('puts and gets evidence payload', async () => {
    await putEvidencePayload('ev-1', samplePayload);
    const result = await getEvidencePayload('ev-1');
    expect(result).toEqual(samplePayload);
  });

  it('returns null for missing evidence', async () => {
    const result = await getEvidencePayload('nonexistent');
    expect(result).toBeNull();
  });

  it('deletes evidence payload', async () => {
    await putEvidencePayload('ev-1', samplePayload);
    await deleteEvidencePayload('ev-1');
    const result = await getEvidencePayload('ev-1');
    expect(result).toBeNull();
  });

  it('lists all evidence payloads', async () => {
    await putEvidencePayload('ev-1', samplePayload);
    await putEvidencePayload('ev-2', samplePayload);
    const list = await listEvidencePayloads();
    expect(list).toHaveLength(2);
  });

  it('clears all evidence', async () => {
    await putEvidencePayload('ev-1', samplePayload);
    await clearEvidenceStore();
    const list = await listEvidencePayloads();
    expect(list).toHaveLength(0);
  });
});
