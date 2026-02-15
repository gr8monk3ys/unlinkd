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

function resolveAction(action, variables) {
  return {
    kind: action.kind,
    selector: action.selector ? substituteTemplates(action.selector, variables) : undefined,
    value: action.value ? substituteTemplates(action.value, variables) : undefined,
    url: action.url ? substituteTemplates(action.url, variables) : undefined
  };
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
        await page.goto(action.url, { waitUntil: 'domcontentloaded' });
        continue;
      }

      if (action.kind === 'click') {
        if (!action.selector) {
          throw new Error(`Step ${step.id} click requires selector.`);
        }
        await page.click(action.selector);
        continue;
      }

      if (action.kind === 'fill') {
        if (!action.selector || action.value === undefined) {
          throw new Error(`Step ${step.id} fill requires selector and value.`);
        }
        await page.fill(action.selector, action.value);
        continue;
      }

      if (action.kind === 'waitForText') {
        await waitForText(page, action.value ?? '');
        continue;
      }

      if (action.kind === 'screenshot') {
        let bytes;
        if (action.selector) {
          bytes = await page.locator(action.selector).first().screenshot();
        } else {
          bytes = await page.screenshot({ fullPage: true });
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
