# unlinkd-agent

Local CLI tooling for `unlinkd` that runs on your machine (not deployed to Cloudflare Pages).

## Install

```bash
cd agent
npm install
npm run install:browsers
```

## Run a Playwright agent job

1. In the web app, add a connector instance that includes agent steps (example: `Agent: Capture URL Screenshot`).
2. Export an agent job JSON from the connector instance.

Run it locally:

```bash
cd agent
export UNLINKD_PASSPHRASE="your passphrase"
node src/cli.mjs run ../path/to/unlinkd-agent-job.json --set targetUrl="https://example.com" --out ./agent-results.json
```

Then in the web app:
- Connectors tab -> Import Agent Results (JSON)

## Mailbox discovery for large .mbox files

```bash
cd agent
node src/cli.mjs mbox-discover /path/to/mailbox.mbox --out ./accounts.csv
```

Import `accounts.csv` in the web app under Accounts -> Import Accounts CSV.

