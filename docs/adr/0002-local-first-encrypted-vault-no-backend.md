# Local-first encrypted vault with no backend

unlinkd runs entirely in the browser as a static Vite bundle deployed to Cloudflare Pages. All state is encrypted with AES-256-GCM under a scrypt-derived key from the user's passphrase and stored in browser storage and IndexedDB; there is no server, account or telemetry. The trade-off is that there is no passphrase recovery and storage can be evicted, so encrypted backup export is a first-class feature, and the audit log's HMAC chain can only defend against attackers who lack the passphrase.
