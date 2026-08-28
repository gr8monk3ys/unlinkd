import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STRONG = 'correct-horse-staple-9';

async function createVault(page: Page, passphrase = STRONG): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await page.getByLabel('Confirm passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Create Vault' }).click();
  // A fresh vault opens the onboarding wizard; skip it to reach the app.
  await page.getByRole('button', { name: 'Skip setup' }).click();
  await expect(page.getByText('Persona: Default')).toBeVisible();
}

async function switchToTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
}

async function expectAuditEntries(page: Page, count: number): Promise<void> {
  await switchToTab(page, 'Dashboard');
  await expect(page.getByText(`Entries: ${count}`)).toBeVisible();
}

test('create-vault button is gated on passphrase strength and confirmation', async ({ page }) => {
  await page.goto('/');
  const create = page.getByRole('button', { name: 'Create Vault' });
  await expect(create).toBeDisabled();

  await page.getByLabel('Passphrase', { exact: true }).fill('weak');
  await expect(create).toBeDisabled();

  await page.getByLabel('Passphrase', { exact: true }).fill(STRONG);
  await page.getByLabel('Confirm passphrase').fill('different');
  await expect(create).toBeDisabled();
  await expect(page.getByText('Passphrases do not match.')).toBeVisible();

  await page.getByLabel('Confirm passphrase').fill(STRONG);
  await expect(create).toBeEnabled();
});

test('runs a local scan and marks a finding mitigated', async ({ page }) => {
  await createVault(page);

  await switchToTab(page, 'Identifiers');
  await page.getByLabel('Type').selectOption('email');
  await page.getByLabel('Value').fill('user@example.com');
  await page.getByRole('button', { name: 'Add Identifier' }).click();
  await expect(page.getByText('email: user@example.com')).toBeVisible();

  // Wait for the identifier_added audit write before the scan (busy guard).
  await expectAuditEntries(page, 1);
  await page.getByRole('button', { name: 'Run Local Scan' }).click();
  // Wait for the scan_ran audit write before mutating the finding.
  await expectAuditEntries(page, 2);

  await switchToTab(page, 'Findings');
  await expect(page.getByText(/consider using an alias/)).toBeVisible();
  await expect(page.getByText(/status: Open/)).toBeVisible();
  await page.getByRole('button', { name: 'Mitigated' }).click();
  await expect(page.getByText(/status: Mitigated/)).toBeVisible();

  // The dashboard open-findings stat should drop to zero.
  await switchToTab(page, 'Dashboard');
  await expect(page.getByTestId('stat-findings')).toHaveText('0');
});

test('saves the HIBP API key in Settings', async ({ page }) => {
  await createVault(page);

  await switchToTab(page, 'Settings');
  // Exact match: the section is also labelled "...API key" via its heading.
  await page.getByLabel('API key', { exact: true }).fill('my-hibp-key');
  await page.getByRole('button', { name: 'Save API Key' }).click();
  await expect(page.getByText('API key saved to vault.')).toBeVisible();
});

test('exports and re-imports an encrypted backup', async ({ page }) => {
  await createVault(page);

  // Add an identifier so the backup has content to round-trip.
  await switchToTab(page, 'Identifiers');
  await page.getByLabel('Type').selectOption('username');
  await page.getByLabel('Value').fill('roundtrip');
  await page.getByRole('button', { name: 'Add Identifier' }).click();
  await expect(page.getByText('username: roundtrip')).toBeVisible();

  await switchToTab(page, 'Backup');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Backup (Encrypted)' }).click()
  ]);
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();

  // Wait for the vault_exported audit write to release the busy guard
  // (identifier_added = 1, vault_exported = 2) before importing.
  await expectAuditEntries(page, 2);

  // Re-import the just-exported backup; the app re-unlocks with the same passphrase.
  await switchToTab(page, 'Backup');
  await page.getByLabel('Import Backup').setInputFiles(backupPath!);
  await expect(page.getByText('Persona: Default')).toBeVisible();

  // The previously-added identifier should still be present after restore.
  await switchToTab(page, 'Identifiers');
  await expect(page.getByText('username: roundtrip')).toBeVisible();

  // Sanity: the backup file is a v1 envelope with ciphertext only.
  const backup = JSON.parse(await fs.readFile(backupPath!, 'utf8')) as Record<string, unknown>;
  expect(backup.version).toBe(1);
  expect(typeof backup.vaultCiphertext).toBe('string');
});

test('locks the vault and requires the passphrase again', async ({ page }) => {
  await createVault(page);

  await page.getByRole('button', { name: 'Lock' }).click();

  // Back to the unlock screen, with the passphrase cleared from the field.
  await expect(page.getByRole('heading', { name: 'Unlock' })).toBeVisible();
  await expect(page.getByText(/Vault locked/)).toBeVisible();
  await expect(page.getByLabel('Passphrase', { exact: true })).toHaveValue('');
  await expect(page.getByText('Persona: Default')).toBeHidden();

  // The vault still opens with the correct passphrase.
  await page.getByLabel('Passphrase', { exact: true }).fill(STRONG);
  await page.getByRole('button', { name: 'Unlock Storage' }).click();
  await expect(page.getByText('Persona: Default')).toBeVisible();
});

test('warns that no backup exists, then clears the warning after exporting', async ({ page }) => {
  await createVault(page);

  // A brand-new vault has never been exported, so the dashboard should say so.
  await switchToTab(page, 'Dashboard');
  await expect(page.getByRole('heading', { name: /No backup yet/ })).toBeVisible();

  await page.getByRole('button', { name: 'Go to Backup' }).click();
  await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Backup (Encrypted)' }).click()
  ]);
  await expect(page.getByText('Last backup: today.')).toBeVisible();

  // The dashboard warning is gone now that a backup is on record.
  await switchToTab(page, 'Dashboard');
  await expect(page.getByRole('heading', { name: /No backup yet/ })).toBeHidden();
});

test('attaches note evidence to a connector and lists it', async ({ page }) => {
  await createVault(page);

  await switchToTab(page, 'Connectors');
  const catalogRow = page
    .getByRole('listitem')
    .filter({ hasText: 'Whitepages' })
    .first();
  await catalogRow.getByRole('button', { name: 'Add To Persona' }).click();
  await expectAuditEntries(page, 1);

  await switchToTab(page, 'Connectors');
  await page.getByRole('button', { name: /Whitepages/ }).first().click();

  // Switch the evidence form to a note and attach one.
  await page.getByLabel('Kind').selectOption('note');
  await page.getByLabel('Label').fill('opt-out receipt');
  await page.getByLabel('Note').fill('Submitted the removal request on this date.');
  await page.getByRole('button', { name: 'Add Note Evidence' }).click();

  await expect(page.getByRole('button', { name: /Download: opt-out_receipt/ })).toBeVisible();
  await expect(page.getByText('(opt-out receipt)')).toBeVisible();
  await expectAuditEntries(page, 2);
});

test('records a removal request and surfaces it on the dashboard once overdue', async ({ page }) => {
  await createVault(page);

  await switchToTab(page, 'Connectors');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Whitepages' })
    .first()
    .getByRole('button', { name: 'Add To Persona' })
    .click();

  await page.getByRole('button', { name: /Whitepages/ }).first().click();

  // A GDPR erasure request sent well over a month ago is unambiguously late.
  await page.getByLabel('Regime').selectOption('gdpr');
  await page.getByLabel('Legal basis').selectOption('gdpr.art17');
  await page.getByLabel('Sent via').selectOption('email');
  await page.getByLabel('Date sent').fill('2020-01-15');
  await page.getByLabel('Sent to (optional)').fill('privacy@example.com');
  await page.getByRole('button', { name: 'Record request' }).click();

  await expect(page.getByText(/Past deadline/)).toBeVisible();

  await switchToTab(page, 'Dashboard');
  await expect(
    page.getByRole('heading', { name: /request is past the legal deadline/i })
  ).toBeVisible();
  // The citation and the arithmetic both travel with the deadline.
  await expect(page.getByText(/GDPR Art\. 17/).first()).toBeVisible();
  await expect(page.getByText(/not legal advice/i)).toBeVisible();
});

test('a recorded reply stops the deadline clock', async ({ page }) => {
  await createVault(page);

  await switchToTab(page, 'Connectors');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Whitepages' })
    .first()
    .getByRole('button', { name: 'Add To Persona' })
    .click();
  await page.getByRole('button', { name: /Whitepages/ }).first().click();

  await page.getByLabel('Date sent').fill('2020-01-15');
  await page.getByRole('button', { name: 'Record request' }).click();
  await expect(page.getByText(/Past deadline/)).toBeVisible();

  await page.getByLabel('Record reply').selectOption('completed');

  await expect(page.getByText(/Closed/)).toBeVisible();
  await switchToTab(page, 'Dashboard');
  await expect(page.getByRole('heading', { name: /past the legal deadline/i })).toBeHidden();
});
