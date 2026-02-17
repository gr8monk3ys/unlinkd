import { z } from 'zod';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import type { ConnectorDefinition } from '../core/types';
import { fromBase64, isRecord } from '../core/utils';

ed.hashes.sha512 = sha512;

export interface ConnectorCatalogFeedV1 {
  version: 1;
  catalogVersion: string;
  generatedAt: string;
  connectors: ConnectorDefinition[];
}

export interface CachedConnectorFeedV1 {
  cachedAt: string;
  feed: ConnectorCatalogFeedV1;
  signature: string | null;
  verified: boolean | null;
  sourceUrl: string;
}

const cachedFeedStorageKey = 'unlinkd.connectors.feed.v1';

function signatureUrlFor(feedUrl: string): string {
  return feedUrl.endsWith('.json') ? feedUrl.slice(0, -'.json'.length) + '.sig' : `${feedUrl}.sig`;
}

const connectorStepSchema = z.union([
  z.object({
    id: z.string().min(1),
    type: z.literal('manual'),
    title: z.string().min(1),
    instructions: z.string().min(1),
    evidenceHint: z.string().optional()
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('agent'),
    title: z.string().min(1),
    action: z.object({
      kind: z.enum(['navigate', 'fill', 'click', 'waitForText', 'screenshot']),
      selector: z.string().optional(),
      value: z.string().optional(),
      url: z.string().optional()
    }),
    evidenceHint: z.string().optional()
  })
]);

const connectorDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['broker', 'account', 'search', 'other']),
  description: z.string().min(1),
  defaultRecheckDays: z.number().int().positive(),
  steps: z.array(connectorStepSchema).min(1),
  jurisdictions: z.array(z.string()).optional()
});

const feedSchema = z.object({
  version: z.literal(1),
  catalogVersion: z.string().min(1),
  generatedAt: z.string().min(1),
  connectors: z.array(connectorDefinitionSchema)
});

function cachedFeedSchema(): z.ZodType<CachedConnectorFeedV1> {
  return z.object({
    cachedAt: z.string().min(1),
    feed: feedSchema,
    signature: z.string().nullable(),
    verified: z.boolean().nullable(),
    sourceUrl: z.string().min(1)
  });
}

export function loadCachedConnectorFeed(): CachedConnectorFeedV1 | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(cachedFeedStorageKey);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const validated = cachedFeedSchema().safeParse(parsed);
  return validated.success ? validated.data : null;
}

export function saveCachedConnectorFeed(value: CachedConnectorFeedV1): void {
  try {
    localStorage.setItem(cachedFeedStorageKey, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function clearCachedConnectorFeed(): void {
  try {
    localStorage.removeItem(cachedFeedStorageKey);
  } catch {
    // ignore
  }
}

async function verifySignature(
  message: Uint8Array,
  signatureBase64: string,
  publicKeyBase64: string
): Promise<boolean> {
  try {
    const signature = fromBase64(signatureBase64);
    const publicKey = fromBase64(publicKeyBase64);
    return await ed.verifyAsync(signature, message, publicKey);
  } catch {
    return false;
  }
}

export async function fetchConnectorFeed(options: {
  feedUrl: string;
  publicKeyBase64: string | null;
}): Promise<CachedConnectorFeedV1> {
  const response = await fetch(options.feedUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to fetch connector feed (${response.status}).`);
  }

  const jsonText = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Connector feed is not valid JSON.');
  }

  const validated = feedSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error('Connector feed failed validation.');
  }

  let signature: string | null = null;
  let verified: boolean | null = null;

  const sigUrl = signatureUrlFor(options.feedUrl);
  try {
    const sigResponse = await fetch(sigUrl, { cache: 'no-store' });
    if (sigResponse.ok) {
      signature = (await sigResponse.text()).trim();
    }
  } catch {
    signature = null;
  }

  if (options.publicKeyBase64) {
    if (!signature) {
      throw new Error('Connector feed signature is missing.');
    }

    verified = await verifySignature(new TextEncoder().encode(jsonText), signature, options.publicKeyBase64);
    if (!verified) {
      throw new Error('Connector feed signature verification failed.');
    }
  }

  return {
    cachedAt: new Date().toISOString(),
    feed: validated.data,
    signature,
    verified,
    sourceUrl: options.feedUrl
  };
}

export function isCachedConnectorFeedV1(value: unknown): value is CachedConnectorFeedV1 {
  return isRecord(value) && cachedFeedSchema().safeParse(value).success;
}

export function parseConnectorCatalogFeedV1(value: unknown): ConnectorCatalogFeedV1 | null {
  const validated = feedSchema.safeParse(value);
  return validated.success ? validated.data : null;
}

export function parseConnectorDefinitions(value: unknown): ConnectorDefinition[] | null {
  const validated = z.array(connectorDefinitionSchema).safeParse(value);
  return validated.success ? validated.data : null;
}
