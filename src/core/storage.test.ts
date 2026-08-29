import { describe, expect, it } from 'vitest';
import { BACKUP_STALE_DAYS, backupFreshness, formatBytes } from './storage';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-01T12:00:00.000Z');

describe('backupFreshness', () => {
  it('treats a vault that has never been backed up as overdue', () => {
    const result = backupFreshness(undefined, NOW);

    expect(result.never).toBe(true);
    expect(result.overdue).toBe(true);
    expect(result.ageDays).toBeNull();
  });

  it('treats an unparseable timestamp as never backed up', () => {
    const result = backupFreshness('not-a-date', NOW);

    expect(result.never).toBe(true);
    expect(result.overdue).toBe(true);
  });

  it('reports a same-day backup as current', () => {
    const result = backupFreshness(new Date(NOW - 60_000).toISOString(), NOW);

    expect(result.never).toBe(false);
    expect(result.ageDays).toBe(0);
    expect(result.overdue).toBe(false);
  });

  it('is not overdue the day before the threshold', () => {
    const result = backupFreshness(new Date(NOW - (BACKUP_STALE_DAYS - 1) * DAY_MS).toISOString(), NOW);

    expect(result.ageDays).toBe(BACKUP_STALE_DAYS - 1);
    expect(result.overdue).toBe(false);
  });

  it('becomes overdue exactly at the threshold', () => {
    const result = backupFreshness(new Date(NOW - BACKUP_STALE_DAYS * DAY_MS).toISOString(), NOW);

    expect(result.ageDays).toBe(BACKUP_STALE_DAYS);
    expect(result.overdue).toBe(true);
  });

  it('clamps a future timestamp to zero days rather than reporting negatives', () => {
    const result = backupFreshness(new Date(NOW + 5 * DAY_MS).toISOString(), NOW);

    expect(result.ageDays).toBe(0);
    expect(result.overdue).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats byte-scale values without a unit jump', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('scales through KB, MB, and GB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});
