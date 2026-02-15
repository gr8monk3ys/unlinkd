import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function unlock(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Passphrase').fill('test-passphrase');
  await page.getByRole('button', { name: 'Unlock Storage' }).click();
  await expect(page.getByText('Persona: Default')).toBeVisible();
}

async function expectAuditEntries(page: Page, count: number): Promise<void> {
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByText(`Entries: ${count}`)).toBeVisible();
}

test('updates connector catalog, adds an agent connector, exports agent job', async ({ page }) => {
  await unlock(page);

  await page.getByRole('button', { name: 'Connectors' }).click();
  await expect(page.getByRole('heading', { name: 'Connectors', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Update Catalog' }).click();
  await expect(page.getByText('Signature verified: yes')).toBeVisible({ timeout: 15_000 });
  await expectAuditEntries(page, 1);

  await page.getByRole('button', { name: 'Connectors' }).click();

  const agentCatalogRow = page
    .getByRole('listitem')
    .filter({ hasText: 'Agent: Capture URL Screenshot' })
    .first();
  await agentCatalogRow.getByRole('button', { name: 'Add To Persona' }).click();
  await expectAuditEntries(page, 2);

  await page.getByRole('button', { name: 'Connectors' }).click();

  await expect(page.getByRole('heading', { name: 'My Connectors' })).toBeVisible();
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

  await page.getByRole('button', { name: 'Backup' }).click();

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
