import { describe, it, expect } from 'vitest';
import {
  createEmptyVault,
  saveVault,
  unlockVault,
  loadVault,
  clearVaultCiphertext,
  getRawVaultCiphertext,
  vaultExists
} from './vault';

const TEST_PASSPHRASE = 'test-passphrase-123';

describe('vault', () => {
  describe('settings', () => {
    it('initializes empty settings', () => {
      expect(createEmptyVault().settings).toEqual({});
    });

    it('round-trips an encrypted HIBP api key through settings', async () => {
      clearVaultCiphertext();
      const vault = createEmptyVault();
      vault.settings = { hibpApiKey: 'secret-key' };
      await saveVault(vault, TEST_PASSPHRASE);

      const loaded = await loadVault(TEST_PASSPHRASE);
      expect(loaded?.settings.hibpApiKey).toBe('secret-key');

      // The raw stored value must not leak the key in plaintext.
      expect(getRawVaultCiphertext()).not.toContain('secret-key');
    });

    it('reports vault existence', () => {
      clearVaultCiphertext();
      expect(vaultExists()).toBe(false);
    });
  });
  describe('createEmptyVault', () => {
    it('returns a valid VaultStateV1 with version 1', () => {
      const vault = createEmptyVault();
      expect(vault.version).toBe(1);
    });

    it('has a savedAt timestamp', () => {
      const vault = createEmptyVault();
      expect(typeof vault.savedAt).toBe('string');
      expect(vault.savedAt).toBeTruthy();
      expect(vault.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('contains exactly one default persona', () => {
      const vault = createEmptyVault();
      expect(vault.personas).toHaveLength(1);
      expect(vault.personas[0]!.name).toBe('Default');
      expect(typeof vault.personas[0]!.id).toBe('string');
      expect(vault.personas[0]!.id).toBeTruthy();
      expect(typeof vault.personas[0]!.createdAt).toBe('string');
    });

    it('sets activePersonaId to the default persona id', () => {
      const vault = createEmptyVault();
      expect(vault.activePersonaId).toBe(vault.personas[0]!.id);
    });

    it('initializes all collections as empty arrays', () => {
      const vault = createEmptyVault();
      expect(vault.identifiers).toEqual([]);
      expect(vault.accounts).toEqual([]);
      expect(vault.connectorInstances).toEqual([]);
      expect(vault.findings).toEqual([]);
    });

    it('generates a unique persona id on each call', () => {
      const vault1 = createEmptyVault();
      const vault2 = createEmptyVault();
      expect(vault1.personas[0]!.id).not.toBe(vault2.personas[0]!.id);
    });
  });

  describe('saveVault and unlockVault round-trip', () => {
    it('preserves vault data through save and unlock', async () => {
      const original = createEmptyVault();
      await saveVault(original, TEST_PASSPHRASE);

      const loaded = await unlockVault(TEST_PASSPHRASE);

      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe(original.version);
      expect(loaded!.activePersonaId).toBe(original.activePersonaId);
      expect(loaded!.personas).toHaveLength(1);
      expect(loaded!.personas[0]!.id).toBe(original.personas[0]!.id);
      expect(loaded!.personas[0]!.name).toBe('Default');
      expect(loaded!.identifiers).toEqual([]);
      expect(loaded!.accounts).toEqual([]);
      expect(loaded!.connectorInstances).toEqual([]);
      expect(loaded!.findings).toEqual([]);
    });

    it('preserves vault with identifiers', async () => {
      const vault = createEmptyVault();
      vault.identifiers.push({
        id: 'id-1',
        personaId: vault.activePersonaId,
        type: 'email',
        value: 'test@example.com',
        sensitivity: 2,
        consent: true,
        createdAt: new Date().toISOString()
      });

      await saveVault(vault, TEST_PASSPHRASE);
      const loaded = await unlockVault(TEST_PASSPHRASE);

      expect(loaded).not.toBeNull();
      expect(loaded!.identifiers).toHaveLength(1);
      expect(loaded!.identifiers[0]!.value).toBe('test@example.com');
      expect(loaded!.identifiers[0]!.type).toBe('email');
    });

    it('preserves vault with accounts', async () => {
      const vault = createEmptyVault();
      vault.accounts.push({
        id: 'acc-1',
        personaId: vault.activePersonaId,
        service: 'GitHub',
        username: 'testuser',
        status: 'active',
        createdAt: new Date().toISOString()
      });

      await saveVault(vault, TEST_PASSPHRASE);
      const loaded = await unlockVault(TEST_PASSPHRASE);

      expect(loaded).not.toBeNull();
      expect(loaded!.accounts).toHaveLength(1);
      expect(loaded!.accounts[0]!.service).toBe('GitHub');
      expect(loaded!.accounts[0]!.username).toBe('testuser');
    });

    it('preserves vault with findings', async () => {
      const vault = createEmptyVault();
      vault.findings.push({
        id: 'finding-1',
        title: 'Email reuse detected',
        harm: 3,
        exploitability: 2,
        tier: 'moderate',
        personaId: vault.activePersonaId,
        status: 'open',
        source: 'local',
        createdAt: new Date().toISOString()
      });

      await saveVault(vault, TEST_PASSPHRASE);
      const loaded = await unlockVault(TEST_PASSPHRASE);

      expect(loaded).not.toBeNull();
      expect(loaded!.findings).toHaveLength(1);
      expect(loaded!.findings[0]!.title).toBe('Email reuse detected');
      expect(loaded!.findings[0]!.tier).toBe('moderate');
    });
  });

  describe('unlockVault with wrong passphrase', () => {
    it('returns null when using wrong passphrase on existing vault', async () => {
      const vault = createEmptyVault();
      await saveVault(vault, TEST_PASSPHRASE);

      const result = await unlockVault('wrong-passphrase');
      expect(result).toBeNull();
    });

    it('returns null from loadVault with wrong passphrase', async () => {
      const vault = createEmptyVault();
      await saveVault(vault, TEST_PASSPHRASE);

      const result = await loadVault('completely-wrong');
      expect(result).toBeNull();
    });
  });

  describe('unlockVault when no vault exists', () => {
    it('creates a new vault when storage is empty', async () => {
      // localStorage is cleared in beforeEach by the test setup
      expect(getRawVaultCiphertext()).toBeNull();

      const vault = await unlockVault(TEST_PASSPHRASE);

      expect(vault).not.toBeNull();
      expect(vault!.version).toBe(1);
      expect(vault!.personas).toHaveLength(1);
      expect(vault!.personas[0]!.name).toBe('Default');
    });

    it('persists the newly created vault to storage', async () => {
      expect(getRawVaultCiphertext()).toBeNull();

      await unlockVault(TEST_PASSPHRASE);

      // After unlockVault, there should be ciphertext in storage
      expect(getRawVaultCiphertext()).not.toBeNull();
    });

    it('subsequent unlock with same passphrase returns the vault', async () => {
      const first = await unlockVault(TEST_PASSPHRASE);
      const second = await unlockVault(TEST_PASSPHRASE);

      expect(second).not.toBeNull();
      expect(second!.activePersonaId).toBe(first!.activePersonaId);
    });
  });

  describe('clearVaultCiphertext', () => {
    it('removes the vault from storage', async () => {
      await saveVault(createEmptyVault(), TEST_PASSPHRASE);
      expect(getRawVaultCiphertext()).not.toBeNull();

      clearVaultCiphertext();
      expect(getRawVaultCiphertext()).toBeNull();
    });
  });
});
