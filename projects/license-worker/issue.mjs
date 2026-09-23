// Manual fallback while the Worker isn't deployed: runs the Worker locally with my own Stripe key.
//   node issue.mjs            -> list paid sessions for our products (last 100)
//   node issue.mjs <suffix>   -> print the license token for the session whose id ends with <suffix>
// The token holds no personal data (only a 16-hex email hash), so it can be posted in a support issue.
import worker from "./worker.js";
import { readFileSync } from "node:fs";

const key = JSON.parse(readFileSync(new URL("../../private/license-signing-key.json", import.meta.url)));
const PRODUCTS = JSON.parse(
  JSON.parse(readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8").match(/^PRODUCTS = (".*")$/m)[1])
);
const STRIPE_KEY = process.env.STRIPE_API_KEY;
const api = async (path) => {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${STRIPE_KEY}` } });
  if (!r.ok) throw new Error(`Stripe ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

const { data } = await api("checkout/sessions?limit=100&status=complete");
const ours = data.filter((s) => PRODUCTS[s.payment_link] && s.payment_status === "paid");
const suffix = process.argv[2];
if (!suffix) {
  for (const s of ours)
    console.log(new Date(s.created * 1000).toISOString(), PRODUCTS[s.payment_link], s.amount_total / 100, s.currency, "…" + s.id.slice(-6));
  console.log(`${ours.length} paid session(s) for our products`);
} else {
  const hits = ours.filter((s) => s.id.endsWith(suffix));
  if (hits.length !== 1) throw new Error(`${hits.length} sessions match "${suffix}"`);
  const env = { STRIPE_KEY, SIGNING_KEY_PKCS8_B64: key.pkcs8_b64, PRODUCTS: JSON.stringify(PRODUCTS) };
  const html = await (await worker.fetch(new Request(`https://local/license?session_id=${hits[0].id}`), env)).text();
  console.log(PRODUCTS[hits[0].payment_link], html.match(/<textarea[^>]*>([^<]+)</)[1]);
}
