# aloneai-license

Cloudflare Worker: Stripe Payment Link success redirect -> product site's `thanks.html` -> this
Worker's `/license?session_id=...` -> reads the Checkout Session with a restricted Stripe key ->
returns an Ed25519-signed license token. Stateless; the same session always yields the same token.

## Deploy

Once `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are in the environment (plus the existing
`STRIPE_API_KEY` and a generated `private/license-signing-key.json`), deploying is one command:

```
./deploy.sh
```

It runs `wrangler deploy`, sets the `STRIPE_KEY` and `SIGNING_KEY_PKCS8_B64` secrets (piped via
stdin, never echoed), points every product's `thanks.html` at the resulting `workers.dev` URL and
republishes those sites, then smoke-tests `/license?session_id=cs_test_fake` for a clean 4xx.
