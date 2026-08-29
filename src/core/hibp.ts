import { z } from 'zod';
import { sha1Hex } from './crypto';
import type { Identifier } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HibpConfig {
  apiKey: string | null; // null = no API key, use manual check suggestions
}

export interface BreachResult {
  email: string;
  breaches: BreachInfo[];
  checkedAt: string;
}

export interface BreachInfo {
  name: string;
  domain: string;
  breachDate: string;
  dataClasses: string[];
  description: string;
  isVerified: boolean;
  pwnCount: number;
}

export interface ManualCheckSuggestion {
  identifier: { type: string; value: string };
  service: string;
  url: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Zod schemas for HIBP API v3 responses
// ---------------------------------------------------------------------------

const breachApiSchema = z.object({
  Name: z.string(),
  Domain: z.string().default(''),
  BreachDate: z.string(),
  DataClasses: z.array(z.string()).default([]),
  Description: z.string().default(''),
  IsVerified: z.boolean().default(false),
  PwnCount: z.number().default(0),
});

const breachArraySchema = z.array(breachApiSchema);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HIBP_API_BASE = 'https://haveibeenpwned.com/api/v3';
const HIBP_USER_AGENT = 'unlinkd-privacy-tool';
const PASSWORD_API_BASE = 'https://api.pwnedpasswords.com';

// ---------------------------------------------------------------------------
// Breach check (requires paid API key)
// ---------------------------------------------------------------------------

/**
 * Check breaches for an email address using the HIBP v3 API.
 * Returns `null` if no API key is configured.
 */
export async function checkBreaches(
  email: string,
  config: HibpConfig,
): Promise<BreachResult | null> {
  if (!config.apiKey) {
    return null;
  }

  const encoded = encodeURIComponent(email);
  const url = `${HIBP_API_BASE}/breachedaccount/${encoded}?truncateResponse=false`;

  const response = await fetchWithRetry(url, {
    headers: {
      'hibp-api-key': config.apiKey,
      'user-agent': HIBP_USER_AGENT,
    },
  });

  // 404 means no breaches found — good result.
  if (response.status === 404) {
    return {
      email,
      breaches: [],
      checkedAt: new Date().toISOString(),
    };
  }

  if (!response.ok) {
    // Mask email in error messages for privacy.
    const maskedEmail = maskEmail(email);
    throw new Error(
      `HIBP API error ${response.status} checking breaches for ${maskedEmail}`,
    );
  }

  const json: unknown = await response.json();
  const parsed = breachArraySchema.safeParse(json);

  if (!parsed.success) {
    throw new Error('HIBP API returned an unexpected response shape');
  }

  const breaches: BreachInfo[] = parsed.data.map((b) => ({
    name: b.Name,
    domain: b.Domain,
    breachDate: b.BreachDate,
    dataClasses: b.DataClasses,
    description: b.Description,
    isVerified: b.IsVerified,
    pwnCount: b.PwnCount,
  }));

  return {
    email,
    breaches,
    checkedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Password check (FREE — uses k-anonymity model)
// ---------------------------------------------------------------------------

/**
 * Check whether a password has appeared in known data breaches using the
 * HIBP Pwned Passwords k-anonymity API.
 *
 * Returns the number of times the password was found (0 = safe).
 */
export async function checkPasswordPwned(password: string): Promise<number> {
  // The Pwned Passwords range API is defined over SHA-1 hashes.
  const hash = await sha1Hex(password);
  const upperHash = hash.toUpperCase();
  const prefix = upperHash.slice(0, 5);
  const suffix = upperHash.slice(5);

  const url = `${PASSWORD_API_BASE}/range/${prefix}`;
  const response = await fetchWithRetry(url, {
    headers: { 'user-agent': HIBP_USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Pwned Passwords API error ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split('\n');

  for (const line of lines) {
    const parts = line.split(':');
    const lineSuffix = parts[0]?.trim();
    const countStr = parts[1]?.trim();

    if (lineSuffix === suffix && countStr) {
      const count = parseInt(countStr, 10);
      return Number.isFinite(count) ? count : 0;
    }
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Manual check suggestions (no API key needed)
// ---------------------------------------------------------------------------

/**
 * Generate a list of "check these manually" suggestions for users without
 * a paid HIBP API key.
 */
export function generateManualCheckSuggestions(
  identifiers: Identifier[],
): ManualCheckSuggestion[] {
  const suggestions: ManualCheckSuggestion[] = [];

  for (const id of identifiers) {
    if (!id.consent) continue;

    switch (id.type) {
      case 'email':
        suggestions.push(
          {
            identifier: { type: id.type, value: id.value },
            service: 'Have I Been Pwned',
            url: 'https://haveibeenpwned.com/',
            description:
              'Search your email address on HIBP to see if it appeared in known data breaches.',
          },
          {
            identifier: { type: id.type, value: id.value },
            service: 'Mozilla Monitor',
            url: 'https://monitor.mozilla.org/',
            description:
              'Mozilla Monitor provides free breach alerts and can scan for your email in known breaches.',
          },
        );
        break;

      case 'phone':
        suggestions.push({
          identifier: { type: id.type, value: id.value },
          service: 'Have I Been Pwned',
          url: 'https://haveibeenpwned.com/',
          description:
            'HIBP supports phone number search — enter your number (with country code) to check for breaches.',
        });
        break;

      case 'username':
        suggestions.push({
          identifier: { type: id.type, value: id.value },
          service: 'NameChk',
          url: 'https://namechk.com/',
          description:
            'Check where this username is registered across social networks and services.',
        });
        break;

      case 'legal_name':
      case 'address':
        // For name + address combos, suggest data broker checks.
        // We add individual suggestions; the caller can merge name+address.
        suggestions.push({
          identifier: { type: id.type, value: id.value },
          service: 'Data Broker Check',
          url: 'https://www.privacyrights.org/data-brokers',
          description:
            'Search prominent data broker sites (Spokeo, WhitePages, BeenVerified) for your personal information.',
        });
        break;

      default:
        // device and other types — no specific suggestion.
        break;
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch with automatic retry on 429 (rate limited) responses.
 * Respects the Retry-After header.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init);

    if (response.status !== 429) {
      return response;
    }

    lastResponse = response;

    if (attempt < maxRetries) {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 10_000)
        : 1500;

      await sleep(Number.isFinite(waitMs) && waitMs > 0 ? waitMs : 1500);
    }
  }

  // All retries exhausted — return the last 429 response.
  return lastResponse!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mask an email for safe inclusion in error messages. */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 1) return '***@***';
  return email[0] + '***@' + email.slice(at + 1);
}
