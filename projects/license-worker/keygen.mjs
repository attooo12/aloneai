// Generates the Ed25519 signing keypair. Private key -> ../../private/ (gitignored). Prints public key (raw, base64).
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
const out = new URL("../../private/license-signing-key.json", import.meta.url);
if (existsSync(out)) { console.error("key exists, refusing to overwrite"); process.exit(1); }
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
mkdirSync(new URL("../../private/", import.meta.url), { recursive: true });
writeFileSync(out, JSON.stringify({ pkcs8_b64: pkcs8, public_raw_b64: raw }, null, 2), { mode: 0o600 });
console.log("public_raw_b64:", raw);
