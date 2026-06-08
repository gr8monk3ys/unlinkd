import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function unlock(page: Page): Promise<void> {
  await page.goto('/');
  // A fresh browser context has no vault, so we create one first. The passphrase
  // must clear the create-vault strength gate (and must not contain the weak
  // substring "passphrase").
  const passphrase = 'correct-horse-staple-9';
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await page.getByLabel('Confirm passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Create Vault' }).click();
  await expect(page.getByText('Persona: Default')).toBeVisible();
}

async function switchToTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
}

async function expectAuditEntries(page: Page, count: number): Promise<void> {
  await switchToTab(page, 'Dashboard');
  await expect(page.getByText(`Entries: ${count}`)).toBeVisible();
}

test('updates connector catalog, adds an agent connector, exports agent job', async ({ page }) => {
  await unlock(page);

  await switchToTab(page, 'Connectors');
  await expect(page.getByRole('heading', { name: 'Connectors', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Update Catalog' }).click();
  await expect(page.getByText('Signature verified: yes')).toBeVisible({ timeout: 15_000 });
  await expectAuditEntries(page, 1);

  await switchToTab(page, 'Connectors');

  const agentCatalogRow = page
    .getByRole('listitem')
    .filter({ hasText: 'Agent: Capture URL Screenshot' })
    .first();
  await agentCatalogRow.getByRole('button', { name: 'Add To Persona' }).click();
  await expectAuditEntries(page, 2);

  await switchToTab(page, 'Connectors');

  await expect(page.getByRole('heading', { name: 'My Connectors' })).toBeVisible();

  // Instance cards are collapsed by default; expand it to reveal its actions.
  await page.getByRole('button', { name: /Agent: Capture URL Screenshot/ }).click();
  await expect(page.getByRole('button', { name: 'Export Agent Job' })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Agent Job' }).click()
  ]);

  expect(download.suggestedFilename()).toMatch(/^unlinkd-agent-job-agent-url-screenshot-.*\.json$/u);

  const path = await download.path();
  expect(path).not.toBeNull();

  const job = JSON.parse(await fs.readFile(path!, 'utf8')) as Record<string, unknown>;
  expect(job.version).toBe(1);
  expect(job.connectorId).toBe('agent-url-screenshot');
  expect(Array.isArray(job.steps)).toBe(true);
});

test('exports an encrypted backup', async ({ page }) => {
  await unlock(page);

  await switchToTab(page, 'Backup');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Backup (Encrypted)' }).click()
  ]);

  const today = new Date().toISOString().slice(0, 10);
  expect(download.suggestedFilename()).toBe(`unlinkd-backup-${today}.json`);

  const path = await download.path();
  expect(path).not.toBeNull();

  const backup = JSON.parse(await fs.readFile(path!, 'utf8')) as Record<string, unknown>;
  expect(backup.version).toBe(1);
  expect(typeof backup.exportedAt).toBe('string');
  expect(typeof backup.vaultCiphertext).toBe('string');
  expect(Array.isArray(backup.evidence)).toBe(true);
});
