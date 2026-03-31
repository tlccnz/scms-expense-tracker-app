# Myte — Time & Expense Log
## Claude Code Project Instructions

---

## Repository
- **GitHub:** https://github.com/tlccnz/myte
- **GitHub Pages URL:** https://tlccnz.github.io/myte (or custom domain if configured)
- **Cloudflare account:** mason.kevinc@gmail.com

## Project structure
```
myte/
├── CLAUDE.md               ← this file
├── app/
│   └── index.html          ← PWA frontend (single file, deployed to GitHub Pages)
├── worker/
│   ├── worker.js           ← Cloudflare Worker (auth + data API)
│   └── wrangler.toml       ← Wrangler config
└── docs/
    └── te-log-spec-v3.md   ← spec reference (see Google Drive for .docx)
```

## Cloudflare resources
- **Account ID:** 6afd0b305a3baabca9252bbe1ed3afa3
- **KV namespace:** TE_LOG_DATA
- **KV namespace ID:** 9a10da6f31174faba55c4dddaa4b1f5a
- **Worker name:** te-log-api (not yet deployed — deploy first time with: cd worker && wrangler deploy)
- **Worker URL:** https://te-log-api.mason-kevinc.workers.dev (update in index.html after first deploy)

## Key constant to update after Worker deploy
In `app/index.html`, find and update:
```js
const WORKER_URL = 'https://te-log-api.mason-kevinc.workers.dev';
```

---

## Deploy commands

### Deploy frontend to GitHub Pages
```bash
git add app/index.html
git commit -m "chore: update frontend"
git push origin main
```

### Deploy Worker to Cloudflare
```bash
cd worker
wrangler deploy
cd ..
```

### Deploy both at once
```bash
git add -A
git commit -m "chore: update"
git push origin main
cd worker && wrangler deploy && cd ..
```

### First-time Worker setup (run once)
```bash
cd worker
wrangler deploy
wrangler secret put ADMIN_SECRET
# Enter a strong secret when prompted — keep it safe
cd ..
```

### Create a user account (run once per user)
```bash
curl -X POST https://te-log-api.mason-kevinc.workers.dev/api/admin/create-user \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -d '{"email":"user@example.com","password":"their-password","name":"Their Name"}'
```

---

## Tech stack
| Layer | Technology |
|---|---|
| Frontend | Single HTML file PWA |
| Backend | Cloudflare Worker (ES module) |
| Storage | Cloudflare KV (TE_LOG_DATA) |
| Maps | Google Maps JS SDK (Distance Matrix + Places) |
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
| Invoice generation (HTML → PDF) | Done |
| Cloudflare Worker backend | Built, not yet deployed |
| Multi-user auth (email + password) | Built, not yet deployed |
| Cloud KV data sync + offline cache | Built, not yet deployed |
| UI redesign (Apple-style light theme) | Planned — v3 |
| UX improvements (see spec) | Planned — v3 |

---

## v3 spec summary (see te-log-spec-v3.docx in Google Drive for full detail)

### UI redesign
- Light theme: #F2F2F7 bg, white cards, #007AFF blue, system font stack
- Soft shadows, 12px card radius, 10px input radius, 22px pill radius

### UX changes
1. **Mileage form** — date + purpose side by side (compact, one card)
2. **Purpose sort** — frequency descending, then alpha; usageCount tracked in config
3. **Route builder** — Home pinned first (full width); remaining destinations grouped by region with region headers; alpha within region
4. **Region auto-detection** — parsed from Places address; keyword map: Hutt→"Hutt Valley", Porirua→"Porirua", Masterton/Carterton/Greytown→"Wairarapa", else→"Wellington"
5. **Expense form** — date + amount side by side
6. **History edit** — edit button navigates to pre-populated form; save replaces original entry; edit banner shown while editing
7. **Invoice defaults** — time ON, mileage OFF, expenses OFF
8. **Invoice preview** — in-app full-screen overlay with close button (replaces window.open)
9. **Settings** — two-level navigation (home menu → sub-screens with back button); Advanced section contains API key + Delete All Data
10. **Bank account** — NZ format masking: ##-####-#######-### auto-formatted as user types
11. **Invoice address** — structured lines: Address Line 1, Address Line 2, Phone, Email
12. **Multiple clients** — clients array in config; client selector on Invoice tab; isDefault flag
13. **Address fields** — split into addressLine1 + addressLine2 everywhere (Your Details + Clients)

### Data model additions (v3)
```js
// Destination (adds region)
{ id, name, icon, address, region }

// Purpose (adds usageCount)
purposes: [{ text: 'Client visit', usageCount: 12 }, ...]

// Clients (replaces single clientDetails)
clients: [{ id, name, addressLine1, addressLine2, phone, email, isDefault }, ...]

// Business details (splits address)
bizDetails: { name, addressLine1, addressLine2, phone, email, bank }

// Invoice defaults
invoiceDefaults: { incTime: true, incMileage: false, incExpenses: false }
```

---

## Notes for Claude Code
- Always run a JS syntax check after editing index.html (the file uses unicode chars that can corrupt str_replace operations — use Python for bulk edits)
- The file is large (~2100 lines) — use targeted edits, not full rewrites where possible
- After any edit, verify with: `node --input-type=module < /tmp/check.js` (extract script tag first)
- Do not use window.open() anywhere — PWA standalone mode has no way to close new windows
- All Google Maps calls must go through the JS SDK (loaded via script tag), never via fetch() — CORS will block fetch-based calls
- Receipts are stored as base64 in localStorage under the user-namespaced receipts key — this is intentional (no server upload needed)
