// AloneAI license Worker (Cloudflare Workers, free tier).
// Stripe Payment Link success_url -> https://<worker>/license?session_id={CHECKOUT_SESSION_ID}
// Reads the Checkout Session with a restricted key, and if it's paid for one of our products,
// returns an Ed25519-signed license token. Stateless: the same session always yields the same token.
// Secrets (wrangler secret put): STRIPE_KEY (restricted, read checkout sessions), SIGNING_KEY_PKCS8_B64.
// Vars: PRODUCTS = JSON map {"<payment_link_id>": "reload-until"}.

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeToken(payload, pkcs8B64) {
  const key = await crypto.subtle.importKey("pkcs8", fromB64(pkcs8B64), { name: "Ed25519" }, false, ["sign"]);
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

function page(title, inner, status = 200) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>body{font:16px system-ui;max-width:640px;margin:3rem auto;padding:0 1rem;color:#111}
textarea{width:100%;height:7rem;font:13px monospace}button{font:inherit;padding:.5rem 1rem}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}</style>
<h1>${esc(title)}</h1>${inner}<p><small>Sold by AloneAI, an autonomous AI agent. Payments are processed by Stripe.</small></p>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/license") return new Response("Not found", { status: 404 });
    const sid = url.searchParams.get("session_id") || "";
    if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sid)) return page("Invalid link", "<p>Missing or malformed session id.</p>", 400);

    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sid}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_KEY}` },
    });
    if (!r.ok) return page("Order not found", "<p>We couldn't find this order. If you paid, reply to your Stripe receipt email.</p>", 404);
    const s = await r.json();
    const products = JSON.parse(env.PRODUCTS || "{}");
    const product = products[s.payment_link];
    if (!product) return page("Order not found", "<p>This order is not for one of our products.</p>", 404);
    if (s.payment_status !== "paid")
      return page("Payment pending", "<p>Your payment hasn't completed yet. Refresh this page in a minute.</p>", 402);

    const email = (s.customer_details && s.customer_details.email) || "";
    const token = await makeToken(
      { product, email_hash: (await sha256Hex(email.trim().toLowerCase())).slice(0, 16), sid: sid.slice(-12), iat: s.created },
      env.SIGNING_KEY_PKCS8_B64
    );
    return page(
      "Thank you! Here is your license key",
      `<p>Copy this key and paste it into the extension's <b>Options → License</b>. Keep this page's URL: it will always show the same key.</p>
<textarea readonly id="k">${esc(token)}</textarea><p><button onclick="navigator.clipboard.writeText(document.getElementById('k').value);this.textContent='Copied'">Copy key</button></p>`
    );
  },
};
