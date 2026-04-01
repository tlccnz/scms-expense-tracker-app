# Myte — Time & Expense Log
## Claude Code Project Instructions

---

## Repository
- **GitHub:** https://github.com/tlccnz/myte
- **GitHub Pages URL:** https://tlccnz.github.io/myte
- **Cloudflare account:** mason.kevinc@gmail.com

## Project structure
```
myte/
├── CLAUDE.md               ← this file (Claude Code reads on startup)
├── index.html              ← PWA frontend (single file, deployed to GitHub Pages)
├── worker/
│   ├── worker.js           ← Cloudflare Worker (auth + data API)
│   └── wrangler.toml       ← Wrangler config
└── docs/
    └── myte-spec-v3.md     ← spec reference
```

## Cloudflare resources
- **Account ID:** 6afd0b305a3baabca9252bbe1ed3afa3
- **KV namespace:** MYTE_DATA
- **KV namespace ID:** 9a10da6f31174faba55c4dddaa4b1f5a
- **Worker name:** myte-log-api
- **Worker URL:** https://myte-log-api.mason-kevinc.workers.dev

## Key constant in index.html
```js
const WORKER_URL = 'https://myte-log-api.mason-kevinc.workers.dev';
```

---

## Deploy commands

### Deploy frontend to GitHub Pages
```bash
git add index.html
git commit -m "chore: update frontend"
git push origin main
```

### Deploy Worker to Cloudflare
```bash
cd worker && wrangler deploy && cd ..
```

### Deploy both at once
```bash
git add -A && git commit -m "chore: update" && git push origin main
cd worker && wrangler deploy && cd ..
```

### First-time Worker setup (run once only)
```bash
cd worker
wrangler deploy
wrangler secret put ADMIN_SECRET
wrangler secret put GOOGLE_MAPS_KEY
cd ..
```

### Create a user account (once per user)
```bash
curl -X POST https://myte-log-api.mason-kevinc.workers.dev/api/admin/create-user \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -d '{"email":"user@example.com","password":"their-password","name":"Their Name"}'
```

---

## Tech stack
| Layer | Technology |
|---|---|
| Frontend | Single HTML file PWA (~2900 lines) |
| Backend | Cloudflare Worker (ES module) |
| Storage | Cloudflare KV (MYTE_DATA) |
| Maps | Google Maps via Worker proxy (GOOGLE_MAPS_KEY secret, never in browser) |
| Auth | Email + PBKDF2 password hash, 90-day tokens in KV |
| Offline | localStorage cache namespaced per userId, syncs on reconnect |
| Hosting | GitHub Pages (frontend) + Cloudflare Workers (API) |

---

## Current build status
| Component | Status |
|---|---|
| PWA frontend (single user) | Done |
| Mileage tracking + Google Maps | Done |
| Expense tracking + receipt photos | Done |
| Time logging (timesheet) | Done |
| Invoice generation (HTML to PDF) | Done |
| Cloudflare Worker backend | Done |
| Multi-user auth (email + password) | Done |
| Cloud KV data sync + offline cache | Done |
| UI redesign (Apple-style light theme) | Done - v3 |
| UX improvements | Done - v3 |
| V4 enhancements | Done - see queue below for remaining items |

---

## Notes for Claude Code
- **Always run a JS syntax check after editing index.html** — unicode chars can corrupt str_replace
- Syntax check: `sed -n '/<script>/,/<\/script>/p' index.html | sed '1d;$d' > /tmp/check.js && node --check /tmp/check.js`
- File is large (~2900 lines) — use targeted edits, not full rewrites
- **Use Python `str.replace()` for any edit touching a line with emoji or JS unicode escapes** (`\uXXXX`) — the Edit tool corrupts these
- Never use `window.open()` — PWA standalone mode has no way to close new windows
- Never call Google Maps via `fetch()` directly — CORS blocks it; all Maps calls go through Worker proxy (`apiFetch('/api/maps/...', 'POST', body)`)
- Receipts stored as base64 in localStorage — intentional, no server upload needed
- `apiFetch(path, method='GET', body=null, rawBody=false)` — authenticated fetch wrapper used for all API calls

---

## Key data model (v4)
```js
destinations: [{ id, name, icon, address, region }]
purposes:     [{ text, usageCount }]
clients:      [{ id, name, addressLine1, addressLine2, phone, email, isDefault }]
bizDetails:   { name, addressLine1, addressLine2, phone, email, bank }
timeTypes:    [{ id, name, rate, fixedPrice }]          // fixedPrice: bool
invoiceDefaults: { incTime, incMileage, incExpenses }   // all bool
```

### Fixed price billing types
- `hours[typeId] = 1` = included, absent = not included
- Same earnings formula (1 × rate = $amount)
- Entry form: checkbox "Include" instead of hours input
- Invoice: `— | Fixed | $amount`, excluded from hours total

### Maps proxy endpoints (all POST, auth required)
- `/api/maps/places` — autocomplete predictions (`{ query }`)
- `/api/maps/place-details` — address components (`{ placeId }`)
- `/api/maps/distance` — distance matrix (`{ origins, destinations }`)

---

## V4 queue — remaining items

### Invoice preview fixes (medium priority)
Multiple small fixes needed in `buildInvoiceHTML()`:
- Remove the "Period:" line from top-right meta (invLabel already shown in billing period bar)
- Address lines (From/To) show literal `\n` instead of line breaks — fix `.join('\\n')` to use actual newline character
- Invoice From missing suburb — verify addressLine2 join logic with autocomplete data
- Hide section header + subtotal row when only one entry type is included (e.g. Time only → no "Time" header or subtotal row)

---

## V4 completed (for reference)

All items below are shipped. Listed for context only.

1. ✅ Google Maps API key — Worker secret only, UI input removed; all Maps calls proxied
2. ✅ Login rate limiting — 10 attempts → 15 min lockout in KV `login-attempts:{email}`
3. ✅ Danger Zone removed from Summary tab — only in Settings → Advanced
4. ✅ History — tap entry to edit (pre-populates form, edit banner shown)
5. ✅ Invoice tab — scrollable client chip row; default client pre-selected
6. ✅ Address autocomplete via Maps proxy in Settings (Your Details + Clients); splits into Line 1 / Line 2
7. ✅ Trip purpose [object Object] bug — purposes are `{text, usageCount}` objects; renderer uses `p.text`
8. ✅ Client delete button — 🗑️ per client in Settings → Clients
9. ✅ Emoji rendering bug — Python replaced `\U` escape sequences with actual emoji chars
10. ✅ Destination edit name + icon — edit modal now includes Name input and Icon select (14 options)
11. ✅ Client default management — "Set Default" button per non-default client; star (★) marks default
12. ✅ Edit banner unicode — rendered as actual ✏️ and — chars
13. ✅ Invoice To label — shown above client chip row
14. ✅ Billing Types & Rates — fixed price support (checkbox + `fixedPrice` flag on timeTypes)
15. ✅ Non-NZ addresses — removed `country:nz` restriction from Worker autocomplete
16. ✅ Invoice Payment Options card — Bank Transfer toggle + Custom instructions textarea
17. ✅ Edit history creates duplicate bug — save functions check `editingEntryId`, splice-replace in-place
18. ✅ Danger Zone two-tier — "Clear Transactions" (keeps config) + "Reset Everything" (factory reset + cloud wipe)
