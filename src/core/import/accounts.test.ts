import { describe, expect, it } from 'vitest';
import { discoverAccountsFromMbox, parseAccountsCsv } from './accounts';

describe('parseAccountsCsv', () => {
  it('detects Bitwarden exports and dedupes rows', () => {
    const csv = [
      'type,name,login_uri,login_username',
      'login,Facebook,https://facebook.com,user@example.com',
      'note,Personal Note,,',
      'login,Facebook,,user@example.com'
    ].join('\n');

    const parsed = parseAccountsCsv(csv);

    expect(parsed.format).toBe('bitwarden');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        service: 'Facebook',
        username: 'user@example.com',
        url: 'https://facebook.com',
        status: 'unknown',
        source: 'csv:bitwarden'
      }
    ]);
  });

  it('parses generic CSV lastSeenAt and normalizes status', () => {
    const csv = ['Service,Account,Status,Last Seen At,Website', 'Twitter,user,deleted,2025-01-01,https://x.com'].join('\n');

    const parsed = parseAccountsCsv(csv);

    expect(parsed.format).toBe('generic');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      service: 'Twitter',
      username: 'user',
      url: 'https://x.com',
      status: 'removed',
      lastSeenAt: new Date('2025-01-01').toISOString()
    });
  });
});

describe('discoverAccountsFromMbox', () => {
  it('extracts service and username from basic mbox headers', () => {
    const mbox = [
      'From sender@example.com Sat Jan  1 00:00:00 2022',
      'From: Facebook <notify@facebookmail.com>',
      'Delivered-To: user@example.com',
      'Date: Sat, 1 Jan 2022 00:00:00 +0000',
      '',
      'Hello',
      '',
      'From sender@example.com Sun Jan  2 00:00:00 2022',
      'From: Amazon <no-reply@amazon.com>',
      'To: user@example.com',
      'Date: Sun, 2 Jan 2022 00:00:00 +0000',
      '',
      'Hi',
      ''
    ].join('\n');

    const discovered = discoverAccountsFromMbox(mbox, { maxMessages: 10 });

    expect(discovered.format).toBe('generic');
    expect(discovered.errors).toEqual([]);
    expect(discovered.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          service: 'facebook',
          username: 'user@example.com',
          source: 'mbox',
          status: 'unknown',
          lastSeenAt: new Date('Sat, 1 Jan 2022 00:00:00 +0000').toISOString()
        }),
        expect.objectContaining({
          service: 'amazon',
          username: 'user@example.com',
          source: 'mbox',
          status: 'unknown',
          lastSeenAt: new Date('Sun, 2 Jan 2022 00:00:00 +0000').toISOString()
        })
      ])
    );
  });
});
