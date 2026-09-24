// End-to-end check with the REAL signing key: for every payment link in wrangler.toml, run the Worker against a
// mocked paid Stripe session, pull the token out of the page, and verify it with that extension's own license.js.
// Also checks that a token for one product does not unlock another. Prints no key material.
import worker from "./worker.js";
import { readFileSync } from "node:fs";

const key = JSON.parse(readFileSync(new URL("../../private/license-signing-key.json", import.meta.url)));
const PRODUCTS = JSON.parse(JSON.parse(readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8").match(/^PRODUCTS = (".*")$/m)[1]));
const env = { STRIPE_KEY: "rk_mock", SIGNING_KEY_PKCS8_B64: key.pkcs8_b64, PRODUCTS: JSON.stringify(PRODUCTS) };
const tokens = {};
let fail = 0;
for (const [link, slug] of Object.entries(PRODUCTS)) {
  globalThis.fetch = async () => new Response(JSON.stringify({ payment_link: link, payment_status: "paid", created: 1790000000,
    customer_details: { email: "Buyer@Example.com " } }), { status: 200 });
  const html = await (await worker.fetch(new Request("https://x/license?session_id=cs_live_abc123DEF456"), env)).text();
  tokens[slug] = html.match(/<textarea[^>]*>([^<]+)</)[1].replace(/&amp;/g, "&");
}
for (const slug of Object.values(PRODUCTS)) {
  const lic = await import(`../ext-${slug}/license.js`);
  for (const [other, tok] of Object.entries(tokens)) {
    const wrapped = tok.replace(/(.{40})/g, "$1\n  "); // as pasted from an email with line breaks
    const ok = await lic.verifyToken(tok), okWrapped = await lic.verifyToken(wrapped);
    const want = other === slug;
    const line = `${slug} <- ${other} token: ${ok}${okWrapped === ok ? "" : ` (wrapped: ${okWrapped})`}`;
    if (ok !== want) { fail++; console.log("FAIL", line); } else if (want) console.log("ok  ", line);
    if (want && okWrapped !== true) { fail++; console.log("FAIL", slug, "rejects a key with line breaks"); }
  }
}
console.log(fail ? `${fail} failure(s)` : "all tokens verify only for their own product");
process.exit(fail ? 1 : 0);
