// TEST ONLY helper: node make-license.mjs <private.pem> [email] [product]  -> prints token
import { createPrivateKey, sign, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export function makeToken(pem, email = 'test@example.com', product = 'cookie-crate') {
  const key = createPrivateKey(pem.replace(/^#.*\n/gm, ''));
  const payload = { product, email_hash: createHash('sha256').update(email).digest('hex'), sid: 'test_sid', iat: Math.floor(Date.now() / 1000) };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = sign(null, Buffer.from(body, 'ascii'), key).toString('base64url');
  return body + '.' + sig;
}
if (process.argv[1] && process.argv[1].endsWith('make-license.mjs')) {
  console.log(makeToken(readFileSync(process.argv[2], 'utf8'), process.argv[3], process.argv[4]));
}
