// TEST ONLY: generates a throwaway Ed25519 keypair for automated tests. Never use for real licenses.
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const dir = new URL('.', import.meta.url).pathname;
writeFileSync(dir + 'TEST_ONLY_private_key.pem', '# TEST ONLY - NOT A PRODUCTION KEY\n' + privateKey.export({ format: 'pem', type: 'pkcs8' }));
writeFileSync(dir + 'TEST_ONLY_public_key.txt', Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64') + '\n');
console.log('wrote TEST_ONLY keypair');
