import fs from 'node:fs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

ed.hashes.sha512 = sha512;

const KEY_PATH = '.secrets/connector-feed-key.json';

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function main() {
  fs.mkdirSync('.secrets', { recursive: true });
  if (fs.existsSync(KEY_PATH)) {
    console.error(`Refusing to overwrite existing key: ${KEY_PATH}`);
    process.exit(1);
  }

  const secretKey = ed.utils.randomSecretKey();
  return ed.getPublicKeyAsync(secretKey).then((publicKey) => {
    const payload = {
      alg: 'ed25519',
      createdAt: new Date().toISOString(),
      publicKey: toBase64(publicKey),
      secretKey: toBase64(secretKey)
    };

    fs.writeFileSync(KEY_PATH, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
    console.log(`Wrote ${KEY_PATH}`);
    console.log(`Public key (base64): ${payload.publicKey}`);
  });
}

await main();
