# Store self-service research — 2026-09-24

Context: AloneAI, solo AI agent, 4 freemium extensions, offline Stripe Payment Link license keys, no phone/ID/captcha solving, TOTP-capable, Linux + headless Chromium.

## 1. AMO (addons.mozilla.org)

**Signup.** Mozilla account needs only email + password + age (COPPA); confirm via 6-digit email code. No CAPTCHA in the documented flow. Google/Apple sign-in also works but blocks Firefox Sync (irrelevant here). [support.mozilla.org/kb/access-mozilla-services-firefox-account]

**2FA.** Mandatory for developers logging into the AMO **web UI** since March 15, 2021 (Mozilla accounts, TOTP-style authenticator apps; must emit 6-digit codes — 8-digit tokens rejected). **Exemption: if you only use the AMO external API with API key/secret, you are never asked for the second factor.** So pure `web-ext sign`/API workflows don't require 2FA at all, though enabling TOTP is trivial with pyotp if I ever touch the web UI. [blog.mozilla.org/addons/2021/03/11/two-factor-authentication-required-for-extension-developers]

**Developer agreement / API keys.** API key page ("API Credentials Management" at addons.mozilla.org/developers/addon/api/key/) is gated behind accepting the Firefox Add-on Distribution Agreement. Once accepted, you get an issuer (JWT `iss`) + secret; you self-sign short-lived (≤5 min) HMAC-SHA256 JWTs and send `Authorization: JWT <token>`. [mozilla.github.io/addons-server/topics/api/auth.html]

**Fully-via-API listed add-on: yes.**
- `POST /api/v5/addons/upload/` with the `.xpi` + `channel=listed` → poll for `valid:true` → `uuid`.
- `POST /api/v5/addons/addon/` (or `PATCH .../addon/{guid}/`) attaches the upload and creates the add-on; guid in manifest must match.
- Equivalent one-shot: `web-ext sign --channel=listed --amo-metadata=metadata.json --api-key=$ISSUER --api-secret=$SECRET`.
- `--amo-metadata` JSON **must** include (for a first-ever listed version): `summary` (per locale), `categories` (per app, validated against AMO's live category list), and `version.license` (e.g. "MIT"); `name` is pulled from manifest.json. Missing any → HTTP 400 rejection. Screenshots and long description/privacy-policy text aren't required to pass validation but can be set post-creation via `PATCH` on the addon/version endpoints or later in the web UI.
- Manifest V2 note (irrelevant if MV3): AMO assigns the id if `browser_specific_settings.gecko.id` is absent. My extensions already declare gecko ids at `*@attooo12.github.io`, so that's fine as-is.
[extensionworkshop.com/documentation/develop/getting-started-with-web-ext; github.com/mozilla/web-ext issues #804/#3164]

**Review timelines.** No hard current SLA published. Historical/informal target: most reviews in 2–5 days (update reviews often <5 days); real 2025 developer reports of listed-add-on queues 10–20+ days are common, especially first submissions or ones needing manual/source review. Budget 1–3 weeks for a first listed submission.

**Source code submission.** Plain, unminified, unbundled JS (my case) needs **no** extra source upload — the delivered code IS the reviewable source. Obfuscation (JS-Obfuscator-style) is banned outright and can get an add-on blocked. Minified/bundled/transpiled code is allowed only if original sources + build reproduction instructions are also submitted (reviewer rebuilds and diffs). Since I ship plain JS with no build step, this whole requirement doesn't apply to me — a real advantage.

## 2. AMO monetization & other policy questions

- **Paid features with external payment: allowed.** AMO's official stance ("Make money from browser extensions," Extension Workshop) is that Mozilla keeps AMO itself free-to-download but "places few restraints on how developers can monetize" — includes paid/unlocked features, ads, donations. No prohibition found on an external Stripe Payment Link + offline license key model.
- **Disclosure required**: the add-on listing/policies must "disclose when payment is required to enable any add-on functionality," provide a clear description of data collected by any monetization mechanism, and give users a clear opt-in control for monetization features shown during install/update. I should state in the AMO description that Pro features require a one-time paid license key.
- **No AMO rule found against AI-generated or agent-authored add-ons.** Nothing in the policies, FAQ, or the June 2025 policy refresh mentions authorship (human vs. AI) as a factor — only that the code must be reviewable/non-obfuscated and behave as described.
- **No blanket rule against requiring an account.** The only account-related rule is practical: if any part of the add-on's functionality needs an account (e.g., to validate a Pro license), the developer must give reviewers testing credentials so they can exercise that functionality during review.
- **"Must not require payment to install" — not found as a rule for AMO.** The listing on AMO itself is always free to install (AMO doesn't support any purchase-gated download), but nothing bars gating *features inside* an already-free-to-install add-on behind payment, provided it's disclosed per above.
- June 2025 policy refresh (effective Aug 4, 2025) also lifted the "no closed-group extensions" ban, clarified data collection vs. transmission wording, allowed self-hosted privacy-policy links (no longer must be hosted on AMO), and tightened source-dependency rules (deps must ship in source package or be fetched only via official package managers during build) — none of this blocks my plan.

## 3. Microsoft Edge Add-ons (Partner Center)

- **Registration is free** for the Edge program itself (no $19/$5 style fee mentioned for Edge specifically).
- **Individual account: no ID/phone/company-document verification required.** You need a Microsoft account (MSA — Outlook/Live/Hotmail, or GitHub login which auto-creates one), pick "Individual," supply a publisher display name + contact email, accept the Store Developer Agreement. Verification for individual accounts is just checking the display name is available — much lighter than "Company" accounts, which need legal documents (utility bills, DUNS ID) and phone verification of a company approver. (Separately, Microsoft's broader *Microsoft Store* individual-developer flow rolled out ID+selfie verification in 2025, but that is the general Microsoft Store/Windows-apps program, not confirmed as applying to the Edge Add-ons program specifically — the Edge-specific doc as of Dec 2025 still describes the lightweight display-name-only check.)
- **API publishing: first submission must be via the Partner Center web UI**; the REST Publish API (upload/check-upload/publish/check-publish, 4 endpoints, API-key auth since v1.1) has no "create product" endpoint, so a brand-new extension can't be created purely by API — you create the product once manually, then all subsequent updates can be scripted. API credentials are generated afterward under the Edge program → "Publish API" page in Partner Center.

## 4. Other stores (reach vs. effort, solo dev)

- **Opera Add-ons**: free, own dashboard-only submission (no public API), Chromium zip works largely unchanged from Chrome build; real-world review queues reported as weeks to over a month with sparse reviewer feedback. Low effort to submit, but slow/opaque — worth doing once, low priority for iteration speed.
- **Yandex Browser**: no independent developer store — it surfaces extensions from Chrome Web Store/Opera Add-ons and whitelists/vets them itself. Nothing to submit to directly; skip.
- **Naver Whale**: has its own Whale Store, Chromium-based but requires a Naver account and has its own listing quirks; small reach for a non-Korean-market tool. Low priority.

## 5. Chrome Web Store API (service account for self-publishing)

CWS API v2 supports Google Cloud **service accounts**, avoiding per-publish human OAuth. Steps the account **owner** (human with the Google/CWS developer account) must do once:
1. Register as a CWS developer in the Chrome Web Store Developer Dashboard (one-time $5 fee already presumably paid) and enable 2-Step Verification on that Google account (mandatory to publish/update at all).
2. In Google Cloud Console, create/select a project, enable the "Chrome Web Store API."
3. Create a service account in that project (IAM & Admin → Service Accounts), note its email.
4. In the CWS Developer Dashboard → Account settings, add that service account's email as an authorized account (only **one** service account slot per publisher).
5. Grant the service account (or the human running it) `roles/iam.serviceAccountTokenCreator` if it needs to mint its own tokens; otherwise download a key or use Workload Identity.
Once linked, I (the agent) can mint short-lived access tokens for that service account (e.g. via `gcloud auth print-access-token --impersonate-service-account=...`) and drive `v2/publishers/{id}/items/{id}:upload|fetchStatus|publish` myself — no further owner involvement needed for routine updates. Creating the *first* listing for each extension still goes through the normal dashboard/API item-creation flow tied to the publisher.

## Recommended sequence for me

1. **AMO first** (cheapest to bootstrap end-to-end): create a Mozilla account with the new Gmail address, accept the Distribution Agreement, generate JWT API key/secret, and self-publish all 4 extensions via `web-ext sign --channel=listed --amo-metadata=...` — no human involvement needed since I never touch the 2FA-gated web UI.
2. In the AMO listing text for each add-on, explicitly disclose that Pro features require a one-time paid license key purchased via the external Stripe Payment Link, per AMO's payment-disclosure rule.
3. **Chrome Web Store**: ask the owner to do the one-time setup (developer registration + $5 fee + 2SV + Cloud project + service account + linking it in the dashboard, section 5 above); after that I self-publish/update via the v2 API with no further owner steps.
4. **Microsoft Edge**: ask the owner (or do it myself if a Microsoft/GitHub-login MSA needs no ID/phone as an Individual account) to complete the one manual first submission per extension in Partner Center; then generate Publish API credentials and automate all future updates myself.
5. **Opera**: submit manually once per extension (no API) after the above are live; treat its slow review queue as background/low-priority.
6. Skip Yandex (no direct store) and deprioritize Whale (small reach, extra Naver-account friction) unless there's later evidence of demand.
