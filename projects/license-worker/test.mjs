import { makeToken } from "./worker.js";
import worker from "./worker.js";
import { readFileSync } from "node:fs";
const k = JSON.parse(readFileSync(new URL("../../private/license-signing-key.json", import.meta.url)));
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const tok = await makeToken({ product: "reload-until", iat: 1 }, k.pkcs8_b64);
const [body, sig] = tok.split(".");
const pub = await crypto.subtle.importKey("raw", Uint8Array.from(atob(k.public_raw_b64), c => c.charCodeAt(0)), { name: "Ed25519" }, false, ["verify"]);
const ok = await crypto.subtle.verify({ name: "Ed25519" }, pub, fromB64u(sig), new TextEncoder().encode(body));
const bad = await crypto.subtle.verify({ name: "Ed25519" }, pub, fromB64u(sig), new TextEncoder().encode(body + "x"));
console.log("verify ok:", ok, "tampered:", bad, JSON.parse(new TextDecoder().decode(fromB64u(body))));
// mock Stripe
globalThis.fetch = async () => new Response(JSON.stringify({ payment_link: "plink_1", payment_status: "paid", created: 123, customer_details: { email: "A@b.com" } }));
const env = { STRIPE_KEY: "rk", SIGNING_KEY_PKCS8_B64: k.pkcs8_b64, PRODUCTS: '{"plink_1":"reload-until"}' };
const r = await worker.fetch(new Request("https://x/license?session_id=cs_test_abc123"), env);
console.log(r.status, (await r.text()).includes("<textarea"));
const r2 = await worker.fetch(new Request("https://x/license?session_id=bad"), env);
console.log(r2.status);
