import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkBreaches,
  checkPasswordPwned,
  generateManualCheckSuggestions,
} from './hibp';
import type { HibpConfig } from './hibp';
import type { Identifier } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIdentifier(
  overrides: Partial<Identifier> & Pick<Identifier, 'type' | 'value'>,
): Identifier {
  return {
    id: crypto.randomUUID(),
    sensitivity: 2,
    consent: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// checkBreaches
// ---------------------------------------------------------------------------

describe('checkBreaches', () => {
  it('returns null when no API key is configured', async () => {
    const config: HibpConfig = { apiKey: null };
    const result = await checkBreaches('test@example.com', config);
    expect(result).toBeNull();
  });

  it('returns empty breaches on a proxied 404 (no breaches found)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'x-hibp-proxy': '1' }),
    });

    const config: HibpConfig = { apiKey: 'test-key' };
    const result = await checkBreaches('safe@example.com', config);

    expect(result).not.toBeNull();
    expect(result!.email).toBe('safe@example.com');
    expect(result!.breaches).toEqual([]);
    expect(result!.checkedAt).toBeTruthy();
  });

  it('throws on a 404 without the proxy marker (proxy route missing)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    });

    const config: HibpConfig = { apiKey: 'test-key' };

    await expect(checkBreaches('safe@example.com', config)).rejects.toThrow(
      /proxy route not available/,
    );
  });

  it('returns parsed breach data on success', async () => {
    const apiResponse = [
      {
        Name: 'Adobe',
        Domain: 'adobe.com',
        BreachDate: '2013-10-04',
        DataClasses: ['Email addresses', 'Password hints', 'Passwords'],
        Description: 'Adobe breach description.',
        IsVerified: true,
        PwnCount: 152445165,
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(apiResponse),
    });

    const config: HibpConfig = { apiKey: 'test-key' };
    const result = await checkBreaches('victim@example.com', config);

    expect(result).not.toBeNull();
    expect(result!.email).toBe('victim@example.com');
    expect(result!.breaches).toHaveLength(1);
    expect(result!.breaches[0]!.name).toBe('Adobe');
    expect(result!.breaches[0]!.domain).toBe('adobe.com');
    expect(result!.breaches[0]!.isVerified).toBe(true);
    expect(result!.breaches[0]!.pwnCount).toBe(152445165);
    expect(result!.breaches[0]!.dataClasses).toContain('Passwords');

    // Verify the request goes through the same-origin proxy with the key header.
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/hibp/breachedaccount/victim%40example.com');
    expect((init.headers as Record<string, string>)['hibp-api-key']).toBe('test-key');
  });

  it('throws on non-404 error responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const config: HibpConfig = { apiKey: 'bad-key' };

    await expect(checkBreaches('test@example.com', config)).rejects.toThrow(
      /HIBP API error 401/,
    );
  });

  it('does not include raw email in error messages', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const config: HibpConfig = { apiKey: 'test-key' };

    try {
      await checkBreaches('secretuser@example.com', config);
      expect.fail('should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain('secretuser@example.com');
      expect(message).toContain('s***@example.com');
    }
  });

  it('retries on 429 rate limiting', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '1' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'x-hibp-proxy': '1' }),
      });

    globalThis.fetch = fetchMock;

    const config: HibpConfig = { apiKey: 'test-key' };
    const result = await checkBreaches('retry@example.com', config);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    expect(result!.breaches).toEqual([]);
  });

  it('gives up after max retries on persistent 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '1' }),
    });

    globalThis.fetch = fetchMock;

    const config: HibpConfig = { apiKey: 'test-key' };

    // 429 is not ok and not 404, so it will throw.
    await expect(checkBreaches('ratelimited@example.com', config)).rejects.toThrow(
      /HIBP API error 429/,
    );

    // 1 initial + 2 retries = 3 total
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// checkPasswordPwned
// ---------------------------------------------------------------------------

describe('checkPasswordPwned', () => {
  it('returns the count when the password hash suffix is found', async () => {
    // The Pwned Passwords range API is defined over SHA-1 hashes and returns
    // lines of "SUFFIX:count" where SUFFIX is the uppercase SHA-1 hash minus
    // the first 5 characters.
    const mockPassword = 'test-password';

    // Mock fetch to return a response that contains the matching SHA-1 suffix.
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      // Extract the 5-char prefix from the URL.
      const prefix = url.toString().split('/range/')[1];
      expect(prefix).toBeTruthy();
      expect(prefix!.length).toBe(5);

      // Compute the SHA-1 hash to know what suffix to include.
      const { sha1Hex } = await import('./crypto');
      const hash = (await sha1Hex(mockPassword)).toUpperCase();
      const suffix = hash.slice(5);

      return {
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            [
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:100',
              `${suffix}:42`,
              'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:200',
            ].join('\n'),
          ),
      };
    });

    const count = await checkPasswordPwned(mockPassword);
    expect(count).toBe(42);
  });

  it('returns 0 when the password hash suffix is not found', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          [
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:100',
            'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:200',
            'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC:300',
          ].join('\n'),
        ),
    });

    const count = await checkPasswordPwned('my-unique-passphrase-never-seen');
    expect(count).toBe(0);
  });

  it('throws on API error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(checkPasswordPwned('anything')).rejects.toThrow(
      /Pwned Passwords API error 503/,
    );
  });

  it('sends the correct prefix to the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\n'),
    });

    globalThis.fetch = fetchMock;

    await checkPasswordPwned('test');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[A-F0-9]{5}$/);
  });
});

// ---------------------------------------------------------------------------
// generateManualCheckSuggestions
// ---------------------------------------------------------------------------

describe('generateManualCheckSuggestions', () => {
  it('generates suggestions for email identifiers', () => {
    const identifiers = [
      makeIdentifier({ type: 'email', value: 'user@example.com' }),
    ];

    const suggestions = generateManualCheckSuggestions(identifiers);

    expect(suggestions.length).toBeGreaterThanOrEqual(2);

    const hibpSuggestion = suggestions.find(
      (s) => s.service === 'Have I Been Pwned',
    );
    expect(hibpSuggestion).toBeDefined();
    expect(hibpSuggestion!.url).toBe('https://haveibeenpwned.com/');

    const mozillaSuggestion = suggestions.find(
      (s) => s.service === 'Mozilla Monitor',
    );
    expect(mozillaSuggestion).toBeDefined();
    expect(mozillaSuggestion!.url).toBe('https://monitor.mozilla.org/');
  });

  it('generates suggestions for phone identifiers', () => {
    const identifiers = [
      makeIdentifier({ type: 'phone', value: '+15551234567' }),
    ];

    const suggestions = generateManualCheckSuggestions(identifiers);

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0]!.service).toBe('Have I Been Pwned');
    expect(suggestions[0]!.identifier.type).toBe('phone');
  });

  it('generates suggestions for username identifiers', () => {
    const identifiers = [
      makeIdentifier({ type: 'username', value: 'cooluser42' }),
    ];

    const suggestions = generateManualCheckSuggestions(identifiers);

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const namechk = suggestions.find((s) => s.service === 'NameChk');
    expect(namechk).toBeDefined();
    expect(namechk!.url).toBe('https://namechk.com/');
  });

  it('generates suggestions for legal_name and address identifiers', () => {
    const identifiers = [
      makeIdentifier({ type: 'legal_name', value: 'Jane Doe' }),
      makeIdentifier({ type: 'address', value: '123 Main St' }),
    ];

    const suggestions = generateManualCheckSuggestions(identifiers);

    const brokerSuggestions = suggestions.filter(
      (s) => s.service === 'Data Broker Check',
    );
    expect(brokerSuggestions.length).toBe(2); // one for name, one for address
  });

  it('skips identifiers without consent', () => {
    const identifiers = [
      makeIdentifier({
        type: 'email',
        value: 'noconsent@example.com',
        consent: false,
      }),
    ];

    const suggestions = generateManualCheckSuggestions(identifiers);
    expect(suggestions).toEqual([]);
  });

  it('handles mixed identifier types', () => {
    const identifiers = [
      makeIdentifier({ type: 'email', value: 'user@example.com' }),
      makeIdentifier({ type: 'phone', value: '+15551234567' }),
      makeIdentifier({ type: 'username', value: 'user42' }),
      makeIdentifier({ type: 'legal_name', value: 'Jane Doe' }),
      makeIdentifier({ type: 'address', value: '123 Main St' }),
      makeIdentifier({ type: 'device', value: 'iPhone-A1234' }),
    ];

    const suggestions = generateManualCheckSuggestions(identifiers);

    // email: 2 (HIBP + Mozilla), phone: 1 (HIBP), username: 1 (NameChk),
    // legal_name: 1 (broker), address: 1 (broker), device: 0
    expect(suggestions.length).toBe(6);
  });

  it('returns an empty array for no identifiers', () => {
    const suggestions = generateManualCheckSuggestions([]);
    expect(suggestions).toEqual([]);
  });

  it('preserves identifier type and value in each suggestion', () => {
    const identifiers = [
      makeIdentifier({ type: 'email', value: 'specific@test.com' }),
    ];

    const suggestions = generateManualCheckSuggestions(identifiers);

    for (const suggestion of suggestions) {
      expect(suggestion.identifier.type).toBe('email');
      expect(suggestion.identifier.value).toBe('specific@test.com');
    }
  });
});
