import fs from 'node:fs';
import readline from 'node:readline';

function extractEmails(value) {
  const matches = String(value ?? '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu);
  return matches ? matches.map((match) => match.toLowerCase()) : [];
}

const knownSecondLevelTlds = new Set(['co.uk', 'com.au', 'co.jp', 'co.in', 'com.br', 'com.mx', 'com.tr']);

function rootDomain(domain) {
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

function serviceFromEmail(fromEmail) {
  const domain = fromEmail.split('@')[1] ?? '';
  const cleaned = domain.trim().toLowerCase();
  if (!cleaned) {
    return '';
  }

  const mappings = {
    'facebookmail.com': 'facebook',
    'linkedin.com': 'linkedin',
    'twitter.com': 'x',
    'x.com': 'x',
    'instagram.com': 'instagram',
    'google.com': 'google',
    'accounts.google.com': 'google',
    'amazon.com': 'amazon',
    'paypal.com': 'paypal'
  };

  return mappings[cleaned] ?? rootDomain(cleaned);
}

function safeIsoDate(value) {
  if (!value) {
    return null;
  }
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function parseHeaderLine(line) {
  const idx = line.indexOf(':');
  if (idx <= 0) {
    return null;
  }

  return {
    key: line.slice(0, idx).trim().toLowerCase(),
    value: line.slice(idx + 1).trim()
  };
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/gu, '""')}"`;
  }
  return text;
}

export async function discoverAccountsFromMboxPath(inputPath, options) {
  const maxMessages = options?.maxMessages ?? Infinity;

  const stream = fs.createReadStream(inputPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const merged = new Map();
  let processed = 0;

  let headers = {};
  let inHeaders = false;
  let currentKey = null;

  function flush() {
    if (!headers || Object.keys(headers).length === 0) {
      headers = {};
      inHeaders = false;
      currentKey = null;
      return;
    }

    const fromLine = headers.from ?? headers['return-path'] ?? '';
    const toLine = headers['delivered-to'] ?? headers['x-original-to'] ?? headers.to ?? '';
    const dateLine = headers.date ?? '';

    const fromEmail = extractEmails(fromLine)[0] ?? '';
    const toEmail = extractEmails(toLine)[0] ?? '';
    if (!fromEmail || !toEmail) {
      headers = {};
      inHeaders = false;
      currentKey = null;
      return;
    }

    const service = serviceFromEmail(fromEmail);
    if (!service) {
      headers = {};
      inHeaders = false;
      currentKey = null;
      return;
    }

    const lastSeenAt = safeIsoDate(dateLine);
    const key = `${service.toLowerCase()}:${toEmail.toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { service, username: toEmail, status: 'unknown', lastSeenAt });
    } else if (lastSeenAt && (!existing.lastSeenAt || lastSeenAt > existing.lastSeenAt)) {
      merged.set(key, { ...existing, lastSeenAt });
    }

    headers = {};
    inHeaders = false;
    currentKey = null;
  }

  for await (const line of rl) {
    if (line.startsWith('From ')) {
      if (processed > 0) {
        flush();
      }
      processed += 1;
      if (processed > maxMessages) {
        break;
      }
      inHeaders = true;
      continue;
    }

    if (!inHeaders) {
      continue;
    }

    if (line.trim() === '') {
      inHeaders = false;
      continue;
    }

    if ((line.startsWith(' ') || line.startsWith('\t')) && currentKey) {
      headers[currentKey] = `${headers[currentKey]} ${line.trim()}`.trim();
      continue;
    }

    const parsed = parseHeaderLine(line);
    if (!parsed) {
      continue;
    }
    headers[parsed.key] = headers[parsed.key] ? `${headers[parsed.key]}, ${parsed.value}` : parsed.value;
    currentKey = parsed.key;
  }

  flush();

  const rows = [...merged.values()].sort((a, b) => a.service.localeCompare(b.service) || a.username.localeCompare(b.username));
  return {
    processed,
    rows,
    csv: [
      ['service', 'username', 'status', 'lastSeenAt', 'source'].join(','),
      ...rows.map((row) =>
        [row.service, row.username, row.status, row.lastSeenAt ?? '', 'mbox'].map(escapeCsv).join(',')
      )
    ].join('\n')
  };
}
