# Awesome-list submissions — researched, not submitted

Status: research only, nothing has been opened as a PR or issue anywhere. Each repo below was
checked directly (via the GitHub API and its raw README/CONTRIBUTING files) on 2026-09-24 for:
still active (recent commits, not archived), real contribution rules, and an actual section our
extensions would fit into. Stars/last-push figures are from that check and will drift over time —
re-verify before submitting.

General rule for all four: disclose in the PR description that we're the maker (several of these
lists explicitly require this), never touch the extension's own star/watch count, and don't submit
more than one PR to the same list in a short window.

---

## 1. themeselection/best-chrome-extensions

**URL:** https://github.com/themeselection/best-chrome-extensions
**Stats at check time:** 580 stars, MIT-licensed, last push 2026-03-23, active (accepts PRs).

**Contribution rules (from its `CONTRIBUTING.md`):**
- One extension per pull request.
- Row format: `| No | [**Title**](Chrome Web Store URL, no affiliate params) | Description (130–170 characters) |`
- **The extension must have received a Chrome Web Store update within the last 6 months.**
- Add the new row after the existing rows in the matching category; don't reorder existing rows.
- Clean spelling/grammar, no trailing whitespace.

**Blocker: this list requires a live Chrome Web Store URL.** None of our four extensions are
published yet, so none of these can be submitted until each one is approved and live. Revisit
this list right after each Chrome Web Store approval.

**Where each product fits, and the exact line to add once live** (URL is a placeholder until the
real Chrome Web Store listing ID exists):

- Color Picker & Palette → section `### 🌈 Best Color Pickers and Palettes Chrome Extensions`:
  `| 11 | [**Color Picker & Palette**](https://chromewebstore.google.com/detail/{{COLOR_PICKER_CWS_ID}}) | Eyedropper color picker with HEX/RGB/HSL/OKLCH, named palettes with CSS/Tailwind export, and a WCAG AA/AAA contrast checker. Free, Pro is a one-time €5, no subscription. |`
- Tab Lifeboat → section `### 📂 Tab Management`:
  `| N | [**Tab Lifeboat**](https://chromewebstore.google.com/detail/{{TAB_LIFEBOAT_CWS_ID}}) | Saves tabs, windows and tab groups as named sessions with automatic crash snapshots, and restores them later. Local only, no account. Free, Pro is a one-time €5. |`
- Cookie Crate → section `### 🧪 Debugging and Testing`:
  `| N | [**Cookie Crate**](https://chromewebstore.google.com/detail/{{COOKIE_CRATE_CWS_ID}}) | Edits cookies (including HttpOnly and partitioned), localStorage and sessionStorage for the current site, with JSON and cookies.txt export/import. Free, Pro is a one-time €7. |`
- Reload Until → section `### 🚀 Automation and Productivity Tools`:
  `| N | [**Reload Until**](https://chromewebstore.google.com/detail/{{RELOAD_UNTIL_CWS_ID}}) | Refreshes a tab on a timer and alerts you when a word appears or disappears: booking slots, restocks, results pages. Never clicks or submits anything for you. Free, Pro is a one-time €9. |`

(`N` = next free row number in that table at submission time; check the current row count first.)

---

## 2. dailydotdev/awesome-developer-essentials

**URL:** https://github.com/dailydotdev/awesome-developer-essentials
**Stats at check time:** 54 stars, CC0-1.0, last push 2026-06 ("Last Verified: 2026-02" per its
own README footer), active, explicit `contributing.md`.

**Contribution rules (from its `contributing.md`):**
- Format: `[Name](URL) - Description.` — description starts with a capital letter, ends with a
  period, and stays clear/concise.
- One resource per pull request; search for existing duplicates first.
- Resource must be "specifically relevant to developers staying informed, productive, and
  growing." Explicitly **excludes** "general tools with no clear developer relevance" and
  anything "unmaintained, deprecated, or archived."
- **Must disclose affiliation with the resource in the PR description** if you're the maker
  (applies directly to us).
- Canonical HTTPS links only, no tracking parameters or shortened URLs.
- PR title should include a short note on why the resource belongs.

**Section to add to:** `## Browser Extensions` (already lists React/Redux DevTools, Wappalyzer,
Lighthouse, JSON Viewer, Octotree — genuine developer-tool extensions, not general consumer
add-ons, so this is a real fit for Cookie Crate and Color Picker, not for Reload Until or Tab
Lifeboat, which aren't developer-specific enough for this list's stated scope).

**No Chrome Web Store link required** — the product's own site can be used, so this one is
submittable now, honestly, as long as the description says what's actually true today.

**Exact lines to add:**
```
- [Cookie Crate](https://attooo12.github.io/cookie-crate/) - Edits cookies (including HttpOnly and partitioned), localStorage and sessionStorage for the current site, with JSON/cookies.txt export. Free, Pro is a one-time payment. Not yet in the Chrome Web Store; PR submitted by its maker.
```
```
- [Color Picker & Palette](https://attooo12.github.io/color-picker/) - Eyedropper color picker with HEX/RGB/HSL/OKLCH, named palettes with CSS/Tailwind export, and a WCAG AA/AAA contrast checker. Free, Pro is a one-time payment. Not yet in the Chrome Web Store; PR submitted by its maker.
```

---

## 3. devtoolsd/awesome-devtools

**URL:** https://github.com/devtoolsd/awesome-devtools
**Stats at check time:** 680 stars, Unlicense, last push 2025-10-12, active. No formal
`CONTRIBUTING.md`; the README ends with "PRs welcome!" and follows `sindresorhus/awesome` style
conventions implicitly (one line per entry, alphabetical-ish within a category, short factual
description).

**Contribution rules (inferred from the README's own format, since there's no separate
guidelines file):**
- Format: `* [Name](URL) - Description.`
- New entries go under the matching `##` category; add a new category only if none fits.
- Keep descriptions to one factual sentence, matching the tone of existing entries (no
  superlatives like "best" or "amazing" — the existing list avoids them).

**Section to add to:** `## Browser Extensions` (lists React/Redux DevTools, Wappalyzer, Octotree,
Web Developer, JSON Viewer — same developer-tool-extension scope as list #2, good fit for Cookie
Crate and Color Picker).

**No Chrome Web Store link required.**

**Exact lines to add:**
```
* [Cookie Crate](https://attooo12.github.io/cookie-crate/) - Cookie, localStorage and sessionStorage editor for the current site, including HttpOnly and partitioned cookies, with JSON/cookies.txt export and import.
```
```
* [Color Picker & Palette](https://attooo12.github.io/color-picker/) - Eyedropper color picker with HEX/RGB/HSL/OKLCH, palette export to CSS/Tailwind, and a WCAG AA/AAA contrast checker.
```

---

## Lists checked and rejected (for the record)

- **vitalets/awesome-browser-extensions-and-apps** — last push 2018, effectively unmaintained.
- **Miniato-Office/awesome-chrome-extensions** — only 7 stars, last push October 2023, too quiet
  to count as active.
- **xhacker/awesome-github-extensions** — active, but scoped specifically to extensions that
  enhance github.com; none of our four products fit that scope honestly.
- **pegaltier/awesome-utils-dev** — active and frequently pushed, but its structure is
  per-programming-language link dumps (JavaScript, Rust, Kubernetes, …) with no browser-extension
  category; not a genuine fit.
- **YSGStudyHards/Awesome-Tools** — very active (1000+ stars) but the whole list and its
  contribution norms are in Chinese with no browser-extension category; language and scope
  mismatch.

## Still open

No active, on-topic list was found that fits Reload Until or Tab Lifeboat *without* requiring a
live Chrome Web Store link (list #1 covers both, but only once each is published). Worth
rechecking after launch — new "awesome-productivity" or "awesome-tab-managers" lists get created
often enough that a fresh search closer to launch may turn up a better match for those two.
