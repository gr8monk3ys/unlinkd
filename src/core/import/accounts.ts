import type { AccountStatus } from '../types';
import { parseCsvLine, splitNonEmptyLines } from './csv';

export interface ImportedAccountRow {
  service: string;
  username: string;
  url?: string;
  status: AccountStatus;
  lastSeenAt?: string;
  source?: string;
}

export interface ParseAccountsResult {
  format: 'generic' | 'bitwarden' | '1password' | 'lastpass' | 'chrome';
  rows: ImportedAccountRow[];
  errors: string[];
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function findColumn(headers: string[], variants: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const variant of variants) {
    const index = normalized.findIndex((header) => header === variant || header.includes(variant));
    if (index !== -1) {
      return index;
    }
  }
  return -1;
}

function normalizeAccountStatus(value: string): AccountStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'active' || normalized === 'unused' || normalized === 'removed' || normalized === 'unknown') {
    return normalized;
  }
  if (normalized === 'deleted' || normalized === 'deactivated' || normalized === 'closed') {
    return 'removed';
  }
  return 'unknown';
}

function detectFormat(headers: string[]): ParseAccountsResult['format'] {
  const normalized = headers.map(normalizeHeader);

  // Bitwarden: login_uri/login_username/login_password fields
  if (normalized.some((h) => h.includes('login_uri')) && normalized.some((h) => h.includes('login_username'))) {
    return 'bitwarden';
  }

  // 1Password: title, username, url are common
  if (normalized.includes('title') && normalized.includes('username') && normalized.includes('url')) {
    return '1password';
  }

  // LastPass: url, username, name
  if (normalized.includes('url') && normalized.includes('username') && normalized.includes('name')) {
    return 'lastpass';
  }

  // Chrome/Chromium exports commonly include url/origin + username + password
  if ((normalized.includes('origin') || normalized.includes('url')) && normalized.includes('username')) {
    return 'chrome';
  }

  return 'generic';
}

function dedupe(rows: ImportedAccountRow[]): ImportedAccountRow[] {
  const merged = new Map<string, ImportedAccountRow>();
  rows.forEach((row) => {
    const key = `${row.service.toLowerCase()}:${row.username.toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, row);
      return;
    }

    // Prefer a row with a URL and a more certain status if we have one.
    const url = existing.url ?? row.url;
    const status = existing.status !== 'unknown' ? existing.status : row.status;
    const lastSeenAt = existing.lastSeenAt ?? row.lastSeenAt;
    merged.set(key, { ...existing, url, status, lastSeenAt, source: existing.source ?? row.source });
  });

  return [...merged.values()].sort((a, b) => a.service.localeCompare(b.service) || a.username.localeCompare(b.username));
}

export function parseAccountsCsv(text: string): ParseAccountsResult {
  const lines = splitNonEmptyLines(text);
  if (lines.length === 0) {
    return { format: 'generic', rows: [], errors: ['CSV is empty.'] };
  }

  const header = parseCsvLine(lines[0]!);
  const format = detectFormat(header);

  const rows: ImportedAccountRow[] = [];
  const errors: string[] = [];

  if (format === 'bitwarden') {
    const typeIndex = findColumn(header, ['type']);
    const nameIndex = findColumn(header, ['name']);
    const uriIndex = findColumn(header, ['login_uri', 'login_uri_1', 'login uri']);
    const usernameIndex = findColumn(header, ['login_username', 'login username', 'username']);

    if (nameIndex === -1 || usernameIndex === -1) {
      return { format, rows: [], errors: ['Bitwarden CSV must include name and login_username columns.'] };
    }

    for (let index = 1; index < lines.length; index += 1) {
      const fields = parseCsvLine(lines[index]!);
      const type = typeIndex !== -1 ? (fields[typeIndex] ?? '').trim().toLowerCase() : 'login';
      if (type && type !== 'login') {
        continue;
      }

      const service = (fields[nameIndex] ?? '').trim();
      const username = (fields[usernameIndex] ?? '').trim();
      const url = uriIndex !== -1 ? (fields[uriIndex] ?? '').trim() : '';
      if (!service || !username) {
        continue;
      }

      rows.push({
        service,
        username,
        url: url ? url : undefined,
        status: 'unknown',
        source: 'csv:bitwarden'
      });
    }

    return { format, rows: dedupe(rows), errors };
  }

  if (format === '1password') {
    const titleIndex = findColumn(header, ['title']);
    const usernameIndex = findColumn(header, ['username']);
    const urlIndex = findColumn(header, ['url']);
    if (titleIndex === -1 || usernameIndex === -1) {
      return { format, rows: [], errors: ['1Password CSV must include title and username columns.'] };
    }

    for (let index = 1; index < lines.length; index += 1) {
      const fields = parseCsvLine(lines[index]!);
      const service = (fields[titleIndex] ?? '').trim();
      const username = (fields[usernameIndex] ?? '').trim();
      const url = urlIndex !== -1 ? (fields[urlIndex] ?? '').trim() : '';
      if (!service || !username) {
        continue;
      }

      rows.push({
        service,
        username,
        url: url ? url : undefined,
        status: 'unknown',
        source: 'csv:1password'
      });
    }

    return { format, rows: dedupe(rows), errors };
  }

  if (format === 'lastpass') {
    const nameIndex = findColumn(header, ['name']);
    const usernameIndex = findColumn(header, ['username']);
    const urlIndex = findColumn(header, ['url']);
    if (usernameIndex === -1 || urlIndex === -1) {
      return { format, rows: [], errors: ['LastPass CSV must include url and username columns.'] };
    }

    for (let index = 1; index < lines.length; index += 1) {
      const fields = parseCsvLine(lines[index]!);
      const username = (fields[usernameIndex] ?? '').trim();
      const url = (fields[urlIndex] ?? '').trim();
      const service = nameIndex !== -1 ? (fields[nameIndex] ?? '').trim() : '';
      if (!username || (!service && !url)) {
        continue;
      }

      rows.push({
        service: service || url,
        username,
        url: url ? url : undefined,
        status: 'unknown',
        source: 'csv:lastpass'
      });
    }

    return { format, rows: dedupe(rows), errors };
  }

  if (format === 'chrome') {
    const nameIndex = findColumn(header, ['name']);
    const originIndex = findColumn(header, ['origin', 'url']);
    const usernameIndex = findColumn(header, ['username']);

    if (originIndex === -1 || usernameIndex === -1) {
      return { format, rows: [], errors: ['Chrome CSV must include origin/url and username columns.'] };
    }

    for (let index = 1; index < lines.length; index += 1) {
      const fields = parseCsvLine(lines[index]!);
      const username = (fields[usernameIndex] ?? '').trim();
      const url = (fields[originIndex] ?? '').trim();
      const service = nameIndex !== -1 ? (fields[nameIndex] ?? '').trim() : '';
      if (!username || (!service && !url)) {
        continue;
      }

      rows.push({
        service: service || url,
        username,
        url: url ? url : undefined,
        status: 'unknown',
        source: 'csv:chrome'
      });
    }

    return { format, rows: dedupe(rows), errors };
  }

  // Generic CSV (service + username required).
  const serviceIndex = findColumn(header, ['service', 'site', 'provider', 'app', 'name']);
  const usernameIndex = findColumn(header, ['username', 'user', 'login', 'account']);
  const urlIndex = findColumn(header, ['url', 'website', 'link', 'login_url']);
  const statusIndex = findColumn(header, ['status', 'state']);
  const lastSeenAtIndex = findColumn(header, ['lastseenat', 'last_seen_at', 'last seen at', 'last_seen']);

  if (serviceIndex === -1 || usernameIndex === -1) {
    return { format, rows: [], errors: ['CSV must include columns for service and username.'] };
  }

  for (let index = 1; index < lines.length; index += 1) {
    const fields = parseCsvLine(lines[index]!);
    const service = (fields[serviceIndex] ?? '').trim();
    const username = (fields[usernameIndex] ?? '').trim();
    if (!service || !username) {
      continue;
    }

    const url = urlIndex !== -1 ? (fields[urlIndex] ?? '').trim() : '';
    const statusRaw = statusIndex !== -1 ? (fields[statusIndex] ?? '').trim() : '';
    const lastSeenAtRaw = lastSeenAtIndex !== -1 ? (fields[lastSeenAtIndex] ?? '').trim() : '';

    rows.push({
      service,
      username,
      url: url ? url : undefined,
      status: statusRaw ? normalizeAccountStatus(statusRaw) : 'unknown',
      lastSeenAt: safeIsoDate(lastSeenAtRaw),
      source: 'csv:generic'
    });
  }

  return { format, rows: dedupe(rows), errors };
}

function extractEmails(value: string): string[] {
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu);
  return matches ? matches.map((match) => match.toLowerCase()) : [];
}

function parseHeaderSection(message: string): Record<string, string> {
  const lines = message.split(/\r?\n/u);
  const out: Record<string, string> = {};
  let currentKey: string | null = null;
  for (const line of lines) {
    if (line.trim() === '') {
      break;
    }

    if ((line.startsWith(' ') || line.startsWith('\t')) && currentKey) {
      out[currentKey] = `${out[currentKey]} ${line.trim()}`;
      continue;
    }

    const idx = line.indexOf(':');
    if (idx <= 0) {
      continue;
    }

    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    out[key] = out[key] ? `${out[key]}, ${value}` : value;
    currentKey = key;
  }
  return out;
}

const knownSecondLevelTlds = new Set([
  'co.uk',
  'com.au',
  'co.jp',
  'co.in',
  'com.br',
  'com.mx',
  'com.tr'
]);

function rootDomain(domain: string): string {
  const parts = domain.split('.').filter(Boolean);
  if (parts.length <= 2) {
    return domain;
  }

  const last2 = parts.slice(-2).join('.');
  const last3 = parts.slice(-3).join('.');
  if (knownSecondLevelTlds.has(last2) && parts.length >= 3) {
    return last3;
  }

  return last2;
}

function serviceFromEmail(fromEmail: string): string {
  const domain = fromEmail.split('@')[1] ?? '';
  const cleaned = domain.trim().toLowerCase();
  if (!cleaned) {
    return '';
  }

  // Common sender domains that map to a service brand.
  const mappings: Record<string, string> = {
    'facebookmail.com': 'facebook',
    'linkedin.com': 'linkedin',
    'twitter.com': 'x',
    'x.com': 'x',
    'instagram.com': 'instagram',
    'google.com': 'google',
    'accounts.google.com': 'google',
    'amazon.com': 'amazon',
    'paypal.com': 'paypal',
  };

  const mapped = mappings[cleaned];
  if (mapped) {
    return mapped;
  }

  return rootDomain(cleaned);
}

function safeIsoDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : undefined;
}

export function discoverAccountsFromMbox(text: string, options?: { maxMessages?: number }): ParseAccountsResult {
  const maxMessages = options?.maxMessages ?? 2000;
  const normalized = `\n${text}`;
  const chunks = normalized.split(/\nFrom [^\n]*\n/gu);

  const rows: ImportedAccountRow[] = [];
  let processed = 0;

  for (let index = 1; index < chunks.length; index += 1) {
    if (processed >= maxMessages) {
      break;
    }
    processed += 1;

    const message = chunks[index] ?? '';
    const headers = parseHeaderSection(message);

    const fromLine = headers['from'] ?? headers['return-path'] ?? '';
    const toLine = headers['delivered-to'] ?? headers['x-original-to'] ?? headers['to'] ?? '';
    const dateLine = headers['date'];

    const fromEmails = extractEmails(fromLine);
    const toEmails = extractEmails(toLine);
    const fromEmail = fromEmails[0] ?? '';
    const toEmail = toEmails[0] ?? '';

    if (!fromEmail || !toEmail) {
      continue;
    }

    const service = serviceFromEmail(fromEmail);
    if (!service) {
      continue;
    }

    rows.push({
      service,
      username: toEmail,
      status: 'unknown',
      lastSeenAt: safeIsoDate(dateLine),
      source: 'mbox'
    });
  }

  return {
    format: 'generic',
    rows: dedupe(rows),
    errors: processed >= maxMessages ? [`Parsed first ${maxMessages} messages (file may be larger).`] : []
  };
}
