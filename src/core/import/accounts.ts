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
  // Prefer an exact header match (so e.g. the variant "name" does not bind to a
  // "username" column) before falling back to substring matches.
  for (const variant of variants) {
    const exact = normalized.indexOf(variant);
    if (exact !== -1) {
      return exact;
    }
  }
  for (const variant of variants) {
    const partial = normalized.findIndex((header) => header.includes(variant));
    if (partial !== -1) {
      return partial;
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

type ColumnKey = 'service' | 'username' | 'url' | 'status' | 'lastSeenAt';

interface FormatSpec {
  format: ParseAccountsResult['format'];
  columns: Partial<Record<ColumnKey, string[]>>;
  /** Columns that must resolve, or parsing returns `requiredError`. */
  required: ColumnKey[];
  requiredError: string;
  source: string;
  /** Bitwarden: only rows whose `type` column is empty or "login" are kept. */
  loginTypeFilter?: string[];
  /** LastPass/Chrome: when the service column is empty, fall back to the URL. */
  serviceFallbackToUrl?: boolean;
  parseStatus?: boolean;
  parseLastSeen?: boolean;
}

const FORMAT_SPECS: Record<ParseAccountsResult['format'], FormatSpec> = {
  bitwarden: {
    format: 'bitwarden',
    columns: {
      service: ['name'],
      username: ['login_username', 'login username', 'username'],
      url: ['login_uri', 'login_uri_1', 'login uri']
    },
    required: ['service', 'username'],
    requiredError: 'Bitwarden CSV must include name and login_username columns.',
    source: 'csv:bitwarden',
    loginTypeFilter: ['type']
  },
  '1password': {
    format: '1password',
    columns: { service: ['title'], username: ['username'], url: ['url'] },
    required: ['service', 'username'],
    requiredError: '1Password CSV must include title and username columns.',
    source: 'csv:1password'
  },
  lastpass: {
    format: 'lastpass',
    columns: { service: ['name'], username: ['username'], url: ['url'] },
    required: ['username', 'url'],
    requiredError: 'LastPass CSV must include url and username columns.',
    source: 'csv:lastpass',
    serviceFallbackToUrl: true
  },
  chrome: {
    format: 'chrome',
    columns: { service: ['name'], username: ['username'], url: ['origin', 'url'] },
    required: ['username', 'url'],
    requiredError: 'Chrome CSV must include origin/url and username columns.',
    source: 'csv:chrome',
    serviceFallbackToUrl: true
  },
  generic: {
    format: 'generic',
    columns: {
      service: ['service', 'site', 'provider', 'app', 'name'],
      username: ['username', 'user', 'login', 'account'],
      url: ['url', 'website', 'link', 'login_url'],
      status: ['status', 'state'],
      lastSeenAt: ['lastseenat', 'last_seen_at', 'last seen at', 'last_seen']
    },
    required: ['service', 'username'],
    requiredError: 'CSV must include columns for service and username.',
    source: 'csv:generic',
    parseStatus: true,
    parseLastSeen: true
  }
};

function field(fields: string[], index: number): string {
  return index !== -1 ? (fields[index] ?? '').trim() : '';
}

type ColumnIndices = Record<ColumnKey, number> & { type: number };

function resolveIndices(header: string[], spec: FormatSpec): ColumnIndices {
  const indices = { service: -1, username: -1, url: -1, status: -1, lastSeenAt: -1, type: -1 };
  (Object.keys(spec.columns) as ColumnKey[]).forEach((key) => {
    indices[key] = findColumn(header, spec.columns[key]!);
  });
  if (spec.loginTypeFilter) {
    indices.type = findColumn(header, spec.loginTypeFilter);
  }
  return indices;
}

function isLoginRow(fields: string[], indices: ColumnIndices, spec: FormatSpec): boolean {
  if (!spec.loginTypeFilter) {
    return true;
  }
  const type = indices.type !== -1 ? field(fields, indices.type).toLowerCase() : 'login';
  return !type || type === 'login';
}

function mapRow(fields: string[], indices: ColumnIndices, spec: FormatSpec): ImportedAccountRow | null {
  if (!isLoginRow(fields, indices, spec)) {
    return null;
  }

  const username = field(fields, indices.username);
  const url = field(fields, indices.url);
  let service = field(fields, indices.service);
  if (spec.serviceFallbackToUrl) {
    service = service || url;
  }

  if (!username || !service) {
    return null;
  }

  const statusRaw = spec.parseStatus ? field(fields, indices.status) : '';
  const lastSeenRaw = spec.parseLastSeen ? field(fields, indices.lastSeenAt) : '';

  return {
    service,
    username,
    url: url ? url : undefined,
    status: statusRaw ? normalizeAccountStatus(statusRaw) : 'unknown',
    lastSeenAt: lastSeenRaw ? safeIsoDate(lastSeenRaw) : undefined,
    source: spec.source
  };
}

function buildRows(lines: string[], header: string[], spec: FormatSpec): ParseAccountsResult {
  const indices = resolveIndices(header, spec);

  for (const key of spec.required) {
    if (indices[key] === -1) {
      return { format: spec.format, rows: [], errors: [spec.requiredError] };
    }
  }

  const rows: ImportedAccountRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const row = mapRow(parseCsvLine(lines[index]!), indices, spec);
    if (row) {
      rows.push(row);
    }
  }

  return { format: spec.format, rows: dedupe(rows), errors: [] };
}

export function parseAccountsCsv(text: string): ParseAccountsResult {
  const lines = splitNonEmptyLines(text);
  if (lines.length === 0) {
    return { format: 'generic', rows: [], errors: ['CSV is empty.'] };
  }

  const header = parseCsvLine(lines[0]!);
  const format = detectFormat(header);
  return buildRows(lines, header, FORMAT_SPECS[format]);
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
