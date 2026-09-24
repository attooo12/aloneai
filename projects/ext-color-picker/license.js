// Offline license verification (Ed25519, WebCrypto). No network requests.
// Token: body + "." + sig
//   body = base64url(UTF-8 JSON {product, email_hash, sid, iat}), no padding
//   sig  = base64url(Ed25519 signature over the ASCII bytes of the body string), no padding
export const PRODUCT = 'color-picker';
// Production public key (raw 32 bytes, standard base64).
export const PUBLIC_KEY = '0uJJ0p1QQh0KAlFKvkeBIh6AZC3lvEXuyZRMqQw5w7w=';

// Accepts standard or url-safe base64, with or without padding.
export function b64ToBytes(s) {
  let t = String(s).trim().replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function verifyToken(token, publicKey = PUBLIC_KEY) {
  try {
    if (typeof token !== 'string' || !publicKey) return false;
    const parts = String(token).replace(/\s+/g, '').split('.'); // keys pasted from an email often carry line breaks
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    const [body, sig] = parts;
    const keyBytes = b64ToBytes(publicKey);
    if (keyBytes.length !== 32) return false;
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'Ed25519' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, b64ToBytes(sig), new TextEncoder().encode(body));
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64ToBytes(body)));
    return !!payload && payload.product === PRODUCT;
  } catch {
    return false;
  }
}

export async function isPro() {
  const { license } = await chrome.storage.sync.get('license');
  return license ? verifyToken(license) : false;
}
