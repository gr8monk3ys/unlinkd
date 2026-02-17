import { chromium } from 'playwright';
import { encryptBytes, sha256HexBytes } from './crypto.mjs';

function nowIso() {
  return new Date().toISOString();
}

function substituteTemplates(value, variables) {
  if (!value) {
    return value;
  }

  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu, (_, key) => {
    if (!(key in variables)) {
      throw new Error(`Missing required variable: ${key}`);
    }
    return String(variables[key]);
  });
}

const MAX_VARIABLE_LENGTH = 4000;

function resolveAction(action, variables) {
  const resolved = {
    kind: action.kind,
    selector: action.selector ? substituteTemplates(action.selector, variables) : undefined,
    value: action.value ? substituteTemplates(action.value, variables) : undefined,
    url: action.url ? substituteTemplates(action.url, variables) : undefined
  };

  if (resolved.url) {
    let parsed;
    try {
      parsed = new URL(resolved.url);
    } catch {
      throw new Error(`Invalid URL: ${resolved.url}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Rejected URL protocol "${parsed.protocol}" — only http: and https: are allowed.`);
    }
  }

  for (const field of ['selector', 'value', 'url']) {
    if (resolved[field] && resolved[field].length > MAX_VARIABLE_LENGTH) {
      throw new Error(`Resolved ${field} exceeds maximum length of ${MAX_VARIABLE_LENGTH} characters.`);
    }
  }

  return resolved;
}

async function waitForText(page, text, timeoutMs = 20_000) {
  if (!text) {
    throw new Error('waitForText requires a value.');
  }

  await page.waitForFunction(
    (needle) => {
      const body = document.body;
      return !!body && body.innerText.includes(String(needle));
    },
    text,
    { timeout: timeoutMs }
  );
}

export async function runAgentJob(job, options) {
  const variables = { ...(job.variables ?? {}), ...(options.variables ?? {}) };
  const passphrase = options.passphrase;
  const headed = options.headed ?? false;

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext();
  const page = await context.newPage();

  const evidence = [];

  try {
    for (const step of job.steps) {
      const action = resolveAction(step.action, variables);

      if (action.kind === 'navigate') {
        if (!action.url) {
          throw new Error(`Step ${step.id} navigate requires url.`);
        }
        await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        continue;
      }

      if (action.kind === 'click') {
        if (!action.selector) {
          throw new Error(`Step ${step.id} click requires selector.`);
        }
        await page.click(action.selector, { timeout: 15_000 });
        continue;
      }

      if (action.kind === 'fill') {
        if (!action.selector || action.value === undefined) {
          throw new Error(`Step ${step.id} fill requires selector and value.`);
        }
        await page.fill(action.selector, action.value, { timeout: 15_000 });
        continue;
      }

      if (action.kind === 'waitForText') {
        await waitForText(page, action.value ?? '');
        continue;
      }

      if (action.kind === 'screenshot') {
        let bytes;
        if (action.selector) {
          bytes = await page.locator(action.selector).first().screenshot({ timeout: 30_000 });
        } else {
          bytes = await page.screenshot({ fullPage: true, timeout: 30_000 });
        }

        const sha256 = sha256HexBytes(bytes);
        const payload = await encryptBytes(bytes, passphrase);
        const id = crypto.randomUUID();
        const filename = `agent-${job.jobId}-${step.id}.png`;

        evidence.push({
          meta: {
            id,
            connectorInstanceId: job.connectorInstanceId,
            kind: 'screenshot',
            filename,
            mimeType: 'image/png',
            size: bytes.length,
            sha256,
            createdAt: nowIso(),
            label: step.title
          },
          payload
        });
        continue;
      }

      throw new Error(`Unknown action kind: ${action.kind}`);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return {
    version: 1,
    jobId: job.jobId,
    createdAt: job.createdAt,
    finishedAt: nowIso(),
    connectorId: job.connectorId,
    connectorInstanceId: job.connectorInstanceId,
    evidence
  };
}
