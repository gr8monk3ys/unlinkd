import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock evidence module since it uses IndexedDB which is not available in jsdom
vi.mock('./evidence', () => ({
  listEvidencePayloads: vi.fn().mockResolvedValue([]),
  putEvidencePayload: vi.fn().mockResolvedValue(undefined),
  clearEvidenceStore: vi.fn().mockResolvedValue(undefined)
}));

import { exportBackup, importBackup, wipeAllData } from './backup';
import { encryptJson } from './crypto';
import { getRawVaultCiphertext, setRawVaultCiphertext } from './vault';
import { getRawAuditCiphertext, setRawAuditCiphertext } from './audit';
import { listEvidencePayloads, putEvidencePayload, clearEvidenceStore } from './evidence';

describe('backup', () => {
  beforeEach(() => {
    vi.mocked(listEvidencePayloads).mockReset().mockResolvedValue([]);
    vi.mocked(putEvidencePayload).mockReset().mockResolvedValue(undefined);
    vi.mocked(clearEvidenceStore).mockReset().mockResolvedValue(undefined);
  });

  describe('exportBackup', () => {
    it('returns a valid BackupFileV1 structure', async () => {
      const backup = await exportBackup();

      expect(backup.version).toBe(1);
      expect(typeof backup.exportedAt).toBe('string');
      expect(backup.exportedAt).toBeTruthy();
      expect(backup).toHaveProperty('vaultCiphertext');
      expect(backup).toHaveProperty('auditCiphertext');
      expect(Array.isArray(backup.evidence)).toBe(true);
    });

    it('includes vault ciphertext when vault exists', async () => {
      const vaultData = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'abc', iv: 'def', ciphertext: 'ghi' });
      setRawVaultCiphertext(vaultData);

      const backup = await exportBackup();
      expect(backup.vaultCiphertext).toBe(vaultData);
    });

    it('includes null vault ciphertext when no vault exists', async () => {
      const backup = await exportBackup();
      expect(backup.vaultCiphertext).toBeNull();
    });

    it('includes audit ciphertext when audit log exists', async () => {
      const auditData = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'abc', iv: 'def', ciphertext: 'ghi' });
      setRawAuditCiphertext(auditData);

      const backup = await exportBackup();
      expect(backup.auditCiphertext).toBe(auditData);
    });

    it('includes evidence payloads from IndexedDB', async () => {
      const mockEvidence = [
        { id: 'ev-1', payload: { encrypted: 'data1' } },
        { id: 'ev-2', payload: { encrypted: 'data2' } }
      ];
      vi.mocked(listEvidencePayloads).mockResolvedValue(mockEvidence as never);

      const backup = await exportBackup();
      expect(backup.evidence).toHaveLength(2);
      expect(backup.evidence[0]).toEqual({ id: 'ev-1', payload: { encrypted: 'data1' } });
      expect(backup.evidence[1]).toEqual({ id: 'ev-2', payload: { encrypted: 'data2' } });
    });

    it('exports with ISO timestamp format', async () => {
      const backup = await exportBackup();
      // ISO string ends with Z and contains T separator
      expect(backup.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('importBackup', () => {
    it('throws when input is not an object', async () => {
      await expect(importBackup(null)).rejects.toThrow('not an object');
      await expect(importBackup('string')).rejects.toThrow('not an object');
      await expect(importBackup(42)).rejects.toThrow('not an object');
    });

    it('throws when version is not 1', async () => {
      const badBackup = {
        version: 2,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: null,
        auditCiphertext: null,
        evidence: []
      };

      await expect(importBackup(badBackup)).rejects.toThrow('Unsupported backup format.');
    });

    it('throws when vaultCiphertext is invalid type', async () => {
      await expect(importBackup({
        version: 1, exportedAt: 'x', vaultCiphertext: 123, auditCiphertext: null, evidence: []
      })).rejects.toThrow('vaultCiphertext must be a string or null');
    });

    it('throws when evidence is not an array', async () => {
      await expect(importBackup({
        version: 1, exportedAt: 'x', vaultCiphertext: null, auditCiphertext: null
      })).rejects.toThrow('evidence must be an array');
    });

    it('throws when evidence entry has non-string id', async () => {
      await expect(importBackup({
        version: 1, exportedAt: 'x', vaultCiphertext: null, auditCiphertext: null,
        evidence: [{ id: 123, payload: {} }]
      })).rejects.toThrow('each evidence entry must have a string id');
    });

    it('succeeds with a valid minimal backup', async () => {
      const validBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: null,
        auditCiphertext: null,
        evidence: []
      };

      await expect(importBackup(validBackup)).resolves.toBeUndefined();
      expect(clearEvidenceStore).toHaveBeenCalled();
    });

    it('restores vault ciphertext when present', async () => {
      const vaultPayload = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'x', iv: 'y', ciphertext: 'z' });
      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: vaultPayload,
        auditCiphertext: null,
        evidence: []
      };

      await importBackup(backup);
      expect(getRawVaultCiphertext()).toBe(vaultPayload);
    });

    it('restores audit ciphertext when present', async () => {
      const auditPayload = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'a', iv: 'b', ciphertext: 'c' });
      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: null,
        auditCiphertext: auditPayload,
        evidence: []
      };

      await importBackup(backup);
      expect(getRawAuditCiphertext()).toBe(auditPayload);
    });

    it('restores evidence payloads', async () => {
      const payload1 = { version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'a', iv: 'b', ciphertext: 'c' };
      const payload2 = { salt: 'd', iv: 'e', ciphertext: 'f' };
      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: null,
        auditCiphertext: null,
        evidence: [
          { id: 'ev-1', payload: payload1 },
          { id: 'ev-2', payload: payload2 }
        ]
      };

      await importBackup(backup);
      expect(putEvidencePayload).toHaveBeenCalledTimes(2);
      expect(putEvidencePayload).toHaveBeenCalledWith('ev-1', payload1);
      expect(putEvidencePayload).toHaveBeenCalledWith('ev-2', payload2);
    });

    it('rejects a backup whose vault ciphertext decrypts but is not a valid vault', async () => {
      const live = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'x', iv: 'y', ciphertext: 'z' });
      setRawVaultCiphertext(live);

      // Decryptable under the passphrase, but the plaintext is not a vault.
      const notAVault = await encryptJson({ definitely: 'not a vault' }, 'test-pass');
      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: JSON.stringify(notAVault),
        auditCiphertext: null,
        evidence: []
      };

      await expect(importBackup(backup, 'test-pass')).rejects.toThrow(/not a valid vault/);
      expect(getRawVaultCiphertext()).toBe(live);
    });

    it('restores the previous evidence when a mid-import write fails', async () => {
      const oldPayload = { version: 2, kdf: 'scrypt', n: 256, r: 8, p: 1, salt: 'a', iv: 'b', ciphertext: 'c' };
      vi.mocked(listEvidencePayloads).mockResolvedValue([{ id: 'old-1', payload: oldPayload as never }]);

      const newPayload = { version: 2, kdf: 'scrypt', n: 256, r: 8, p: 1, salt: 'd', iv: 'e', ciphertext: 'f' };
      // First put (the imported item) fails; the rollback put succeeds.
      vi.mocked(putEvidencePayload)
        .mockRejectedValueOnce(new Error('quota exceeded'))
        .mockResolvedValue(undefined);

      const liveVault = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'x', iv: 'y', ciphertext: 'z' });
      setRawVaultCiphertext(liveVault);

      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'q', iv: 'w', ciphertext: 'e' }),
        auditCiphertext: null,
        evidence: [{ id: 'new-1', payload: newPayload }]
      };

      await expect(importBackup(backup)).rejects.toThrow('quota exceeded');

      // Vault rolled back and the original evidence payload re-written.
      expect(getRawVaultCiphertext()).toBe(liveVault);
      expect(putEvidencePayload).toHaveBeenLastCalledWith('old-1', oldPayload);
    });

    it('refuses a vault-less backup while a live vault exists (no silent wipe)', async () => {
      // Pre-populate vault and audit
      const vaultPayload = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'x', iv: 'y', ciphertext: 'z' });
      setRawVaultCiphertext(vaultPayload);
      const auditPayload = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'a', iv: 'b', ciphertext: 'c' });
      setRawAuditCiphertext(auditPayload);

      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: null,
        auditCiphertext: null,
        evidence: []
      };

      await expect(importBackup(backup)).rejects.toThrow(/contains no vault/);

      // The live vault and audit log must be untouched.
      expect(getRawVaultCiphertext()).toBe(vaultPayload);
      expect(getRawAuditCiphertext()).toBe(auditPayload);
    });

    it('rejects a non-envelope vault ciphertext WITHOUT wiping existing data', async () => {
      const liveVault = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'x', iv: 'y', ciphertext: 'z' });
      setRawVaultCiphertext(liveVault);

      const hostileBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: JSON.stringify({ not: 'an envelope' }),
        auditCiphertext: null,
        evidence: []
      };

      await expect(importBackup(hostileBackup)).rejects.toThrow('not an encrypted envelope');
      // Critical safety property: the live vault must survive a bad import.
      expect(getRawVaultCiphertext()).toBe(liveVault);
      expect(clearEvidenceStore).not.toHaveBeenCalled();
    });

    it('rejects an evidence payload that is not an encrypted envelope', async () => {
      const liveVault = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'x', iv: 'y', ciphertext: 'z' });
      setRawVaultCiphertext(liveVault);

      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: null,
        auditCiphertext: null,
        evidence: [{ id: 'ev-1', payload: { plaintext: 'oops' } }]
      };

      await expect(importBackup(backup)).rejects.toThrow('encrypted envelope');
      expect(getRawVaultCiphertext()).toBe(liveVault);
    });

    it('aborts when the backup cannot be unlocked with the current passphrase', async () => {
      const { encryptJson } = await import('./crypto');
      const liveVault = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'x', iv: 'y', ciphertext: 'z' });
      setRawVaultCiphertext(liveVault);

      const foreignVault = JSON.stringify(await encryptJson({ version: 1 }, 'a-different-passphrase'));
      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        vaultCiphertext: foreignVault,
        auditCiphertext: null,
        evidence: []
      };

      await expect(importBackup(backup, 'my-passphrase')).rejects.toThrow('cannot be unlocked');
      expect(getRawVaultCiphertext()).toBe(liveVault);
    });
  });

  describe('wipeAllData', () => {
    it('clears all storage', async () => {
      // Pre-populate vault and audit
      const vaultPayload = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'x', iv: 'y', ciphertext: 'z' });
      setRawVaultCiphertext(vaultPayload);
      const auditPayload = JSON.stringify({ version: 1, kdf: 'pbkdf2-sha256', iterations: 310000, salt: 'a', iv: 'b', ciphertext: 'c' });
      setRawAuditCiphertext(auditPayload);

      await wipeAllData();

      expect(clearEvidenceStore).toHaveBeenCalled();
      expect(getRawVaultCiphertext()).toBeNull();
      expect(getRawAuditCiphertext()).toBeNull();
    });

    it('succeeds even when storage is already empty', async () => {
      await expect(wipeAllData()).resolves.toBeUndefined();
      expect(clearEvidenceStore).toHaveBeenCalled();
    });
  });
});
