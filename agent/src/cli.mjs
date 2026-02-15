#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { agentJobSchema, agentResultsSchema } from './schema.mjs';
import { runAgentJob } from './run_job.mjs';
import { discoverAccountsFromMboxPath } from './mbox_discover.mjs';

function usage() {
  return [
    'unlinkd-agent',
    '',
    'Commands:',
    '  run <job.json> [--out results.json] [--headed] [--passphrase-env UNLINKD_PASSPHRASE] [--set key=value ...]',
    '  mbox-discover <mailbox.mbox> [--out accounts.csv] [--max-messages 200000]',
    ''
  ].join('\n');
}

function parseArgs(argv) {
  const out = {
    command: null,
    positional: [],
    out: null,
    headed: false,
    passphraseEnv: 'UNLINKD_PASSPHRASE',
    vars: {},
    maxMessages: null
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!out.command && !arg.startsWith('-')) {
      out.command = arg;
      continue;
    }

    if (!arg) {
      continue;
    }

    if (arg === '--out') {
      out.out = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--headed') {
      out.headed = true;
      continue;
    }

    if (arg === '--passphrase-env') {
      out.passphraseEnv = argv[index + 1] ?? out.passphraseEnv;
      index += 1;
      continue;
    }

    if (arg === '--set') {
      const pair = argv[index + 1] ?? '';
      index += 1;
      const eq = pair.indexOf('=');
      if (eq === -1) {
        throw new Error(`Invalid --set value: ${pair}`);
      }
      const key = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!key) {
        throw new Error(`Invalid --set value: ${pair}`);
      }
      out.vars[key] = value;
      continue;
    }

    if (arg === '--max-messages') {
      out.maxMessages = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (!arg.startsWith('-')) {
      out.positional.push(arg);
      continue;
    }

    throw new Error(`Unknown flag: ${arg}`);
  }

  return out;
}

function mustReadFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

async function run() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    console.error('');
    console.error(usage());
    process.exit(2);
  }

  if (!args.command) {
    console.error(usage());
    process.exit(2);
  }

  if (args.command === 'run') {
    const jobPath = args.positional[0];
    if (!jobPath) {
      console.error(usage());
      process.exit(2);
    }

    const passphrase = process.env[args.passphraseEnv];
    if (!passphrase) {
      console.error(`Missing passphrase. Set ${args.passphraseEnv} in your environment.`);
      process.exit(2);
    }

    let jobRaw;
    try {
      jobRaw = JSON.parse(mustReadFile(jobPath));
    } catch {
      console.error('Agent job is not valid JSON.');
      process.exit(2);
    }

    const parsed = agentJobSchema.safeParse(jobRaw);
    if (!parsed.success) {
      console.error('Agent job failed validation.');
      console.error(parsed.error.toString());
      process.exit(2);
    }

    const job = {
      ...parsed.data,
      variables: parsed.data.variables ?? {}
    };

    const results = await runAgentJob(job, { passphrase, headed: args.headed, variables: args.vars });
    const validated = agentResultsSchema.safeParse(results);
    if (!validated.success) {
      console.error('Internal error: agent results failed validation.');
      process.exit(2);
    }

    const outPath = args.out ?? path.resolve(process.cwd(), `unlinkd-agent-results-${job.jobId}.json`);
    ensureDir(outPath);
    fs.writeFileSync(outPath, `${JSON.stringify(validated.data, null, 2)}\n`);
    process.stdout.write(`${outPath}\n`);
    return;
  }

  if (args.command === 'mbox-discover') {
    const mboxPath = args.positional[0];
    if (!mboxPath) {
      console.error(usage());
      process.exit(2);
    }

    const maxMessages =
      args.maxMessages === null
        ? 200_000
        : Number.isFinite(Number(args.maxMessages))
          ? Number(args.maxMessages)
          : 200_000;

    const result = await discoverAccountsFromMboxPath(mboxPath, { maxMessages });
    const outPath = args.out ?? path.resolve(process.cwd(), `unlinkd-accounts-${Date.now()}.csv`);
    ensureDir(outPath);
    fs.writeFileSync(outPath, `${result.csv}\n`);
    process.stdout.write(`${outPath}\n`);
    return;
  }

  console.error(`Unknown command: ${args.command}`);
  console.error('');
  console.error(usage());
  process.exit(2);
}

await run();
