import fs from 'node:fs';

const SOURCE_PATH = 'connectors/catalog.source.json';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const REVIEW_CADENCE_DAYS = 90; // warn
const MAX_AGE_DAYS = 365; // fail

function ageInDays(isoDate, now) {
  return (now - Date.parse(isoDate)) / (24 * 60 * 60 * 1000);
}

function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`Missing ${SOURCE_PATH}`);
    process.exit(1);
  }

  const connectors = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  const now = Date.now();

  const missing = [];
  const warn = [];
  const fail = [];

  for (const connector of connectors) {
    const { id, lastReviewed } = connector;
    if (!lastReviewed || !ISO_DATE.test(lastReviewed)) {
      missing.push(id);
      continue;
    }

    const age = ageInDays(lastReviewed, now);
    if (age > MAX_AGE_DAYS) {
      fail.push({ id, age: Math.round(age) });
    } else if (age > REVIEW_CADENCE_DAYS) {
      warn.push({ id, age: Math.round(age) });
    }
  }

  console.log(`Checked ${connectors.length} connectors.`);
  if (warn.length > 0) {
    console.warn(`\nDue for review (> ${REVIEW_CADENCE_DAYS}d):`);
    warn.forEach((w) => console.warn(`  - ${w.id} (${w.age}d)`));
  }

  if (missing.length > 0 || fail.length > 0) {
    if (missing.length > 0) {
      console.error(`\nMissing/invalid lastReviewed:`);
      missing.forEach((id) => console.error(`  - ${id}`));
    }
    if (fail.length > 0) {
      console.error(`\nStale beyond ceiling (> ${MAX_AGE_DAYS}d):`);
      fail.forEach((f) => console.error(`  - ${f.id} (${f.age}d)`));
    }
    process.exit(1);
  }

  console.log('All connectors within freshness policy.');
}

main();
