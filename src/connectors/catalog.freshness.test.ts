import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtinConnectorCatalog } from './catalog';

/**
 * Connector content (broker opt-out flows, account hardening steps) goes stale
 * as providers change their forms and URLs. These tests enforce the freshness
 * policy described in docs/connector-governance.md:
 *  - every published connector must declare an ISO `lastReviewed` date, and
 *  - no connector may exceed the hard staleness ceiling.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
// Quarterly review cadence; hard-fail ceiling is generous to avoid surprising CI.
export const REVIEW_CADENCE_DAYS = 90;
export const MAX_AGE_DAYS = 365;

interface SourceConnector {
  id: string;
  lastReviewed?: string;
}

function loadSourceConnectors(): SourceConnector[] {
  // vitest runs with the repo root as the working directory.
  const path = resolve(process.cwd(), 'connectors/catalog.source.json');
  return JSON.parse(readFileSync(path, 'utf8')) as SourceConnector[];
}

function ageInDays(isoDate: string, now: number): number {
  const ts = Date.parse(isoDate);
  return (now - ts) / (24 * 60 * 60 * 1000);
}

describe('connector catalog freshness', () => {
  const source = loadSourceConnectors();

  it('has at least one source connector', () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it('declares a valid ISO lastReviewed date for every source connector', () => {
    const missing = source.filter((c) => !c.lastReviewed || !ISO_DATE.test(c.lastReviewed));
    expect(missing.map((c) => c.id)).toEqual([]);
  });

  it('has no source connector older than the staleness ceiling', () => {
    const now = Date.now();
    const stale = source.filter(
      (c) => c.lastReviewed && ageInDays(c.lastReviewed, now) > MAX_AGE_DAYS
    );
    expect(stale.map((c) => c.id)).toEqual([]);
  });

  it('declares lastReviewed on builtin fallback connectors', () => {
    const missing = builtinConnectorCatalog.filter(
      (c) => !c.lastReviewed || !ISO_DATE.test(c.lastReviewed)
    );
    expect(missing.map((c) => c.id)).toEqual([]);
  });
});
