import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

ed.hashes.sha512 = sha512;

const KEY_PATH = '.secrets/connector-feed-key.json';
const SOURCE_PATH = 'connectors/catalog.source.json';
const OUT_DIR = 'public/connectors';
const OUT_JSON = path.join(OUT_DIR, 'catalog.v1.json');
const OUT_SIG = path.join(OUT_DIR, 'catalog.v1.sig');

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(value) {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function parseArgs(argv) {
  const out = { version: null };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') {
      out.version = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
  }
  return out;
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
  jurisdictions: z.array(z.string()).optional(),
  lastReviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'lastReviewed must be an ISO date (YYYY-MM-DD)').optional()
});

const sourceSchema = z.array(connectorDefinitionSchema);

function loadSigningKey() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`Missing ${KEY_PATH}. Generate one with: node scripts/connectors_keygen.mjs`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  const schema = z.object({
    alg: z.literal('ed25519'),
    publicKey: z.string().min(1),
    secretKey: z.string().min(1)
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error('Invalid signing key payload.');
    process.exit(1);
  }

  return {
    publicKeyBase64: parsed.data.publicKey,
    secretKey: fromBase64(parsed.data.secretKey)
  };
}

function loadSourceConnectors() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`Missing ${SOURCE_PATH}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const validated = sourceSchema.safeParse(raw);
  if (!validated.success) {
    console.error('Connector source failed validation:');
    console.error(validated.error.toString());
    process.exit(1);
  }

  const sorted = [...validated.data].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.map((def) => ({ ...def, steps: [...def.steps].sort((a, b) => a.id.localeCompare(b.id)) }));
}

async function main() {
  const args = parseArgs(process.argv);
  const { publicKeyBase64, secretKey } = loadSigningKey();
  const connectors = loadSourceConnectors();
  const catalogVersion = args.version ?? new Date().toISOString().slice(0, 10);

  const feed = {
    version: 1,
    catalogVersion,
    generatedAt: new Date().toISOString(),
    connectors
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonText = `${JSON.stringify(feed, null, 2)}\n`;
  fs.writeFileSync(OUT_JSON, jsonText);

  const message = new TextEncoder().encode(jsonText);
  const signature = await ed.signAsync(message, secretKey);
  fs.writeFileSync(OUT_SIG, `${toBase64(signature)}\n`);

  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_SIG}`);
  console.log(`Catalog version: ${catalogVersion}`);
  console.log(`Public key (base64): ${publicKeyBase64}`);
}

await main();

