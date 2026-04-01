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
- **Worker name:** myte-api
- **Worker URL:** https://myte-api.mason-kevinc.workers.dev (update in index.html after first deploy)

## Key constant in index.html
```js
const WORKER_URL = 'https://myte-api.mason-kevinc.workers.dev';
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
curl -X POST https://myte-api.mason-kevinc.workers.dev/api/admin/create-user \
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
| Storage | Cloudflare KV (MYTE_DATA) |
| Maps | Google Maps via Worker proxy (key stored as Worker secret) |
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

---

## v3 spec summary

### UI redesign
- Light theme: #F2F2F7 bg, white cards, #007AFF blue, system font stack
- Soft shadows, 12px card radius, 10px input radius, 22px pill radius

### UX changes delivered in v3
1. Mileage form - date + purpose side by side (compact, one card)
2. Purpose sort - frequency descending, then alpha; usageCount tracked in config
3. Route builder - Home pinned first (full width); destinations grouped by region with headers; alpha within region
4. Region auto-detection - Hutt to Hutt Valley, Porirua to Porirua, Masterton/Carterton/Greytown to Wairarapa, else Wellington
5. Expense form - date + amount side by side
6. History edit - edit button navigates to pre-populated form; save replaces original; edit banner shown
7. Invoice defaults - time ON, mileage OFF, expenses OFF
8. Invoice preview - in-app full-screen overlay with close button (no window.open)
9. Settings - two-level navigation (home menu to sub-screens); Advanced section has API key + Delete All Data
10. Bank account - NZ format masking: ##-####-#######-###
11. Invoice address - structured lines: Address Line 1, Address Line 2, Phone, Email
12. Multiple clients - clients array in config; client selector on Invoice tab; isDefault flag
13. Address fields - split into addressLine1 + addressLine2 everywhere

### Data model (v3)
```js
{ id, name, icon, address, region }                                           // destination
purposes: [{ text: 'Client visit', usageCount: 12 }, ...]                    // purpose
clients: [{ id, name, addressLine1, addressLine2, phone, email, isDefault }]  // clients
bizDetails: { name, addressLine1, addressLine2, phone, email, bank }          // your details
invoiceDefaults: { incTime: true, incMileage: false, incExpenses: false }     // invoice
```

---

## Notes for Claude Code
- Always run a JS syntax check after editing index.html - unicode chars can corrupt str_replace; use Python for bulk edits
- File is large (~2100 lines) - use targeted edits, not full rewrites
- Syntax check: extract script tag to /tmp/check.js then: node --input-type=module < /tmp/check.js
- Never use window.open() - PWA standalone mode has no way to close new windows
- Never call Google Maps via fetch() directly - CORS blocks it; all Maps calls go through Worker proxy
- Receipts stored as base64 in localStorage - intentional, no server upload needed
- Use Python str.replace() for edits involving emoji or unicode, not the str_replace tool

---

## V4 - Planned enhancements (queue)

1. **Google Maps API key - Worker secret only, remove from UI** - Remove the API key input field from Settings -> Advanced entirely. Proxy all Maps calls through the Worker. New endpoints: POST /api/maps/distance, /api/maps/places, /api/maps/place-details (all require auth token). Store key via: wrangler secret put GOOGLE_MAPS_KEY. Restrict key in Google Cloud Console to myte-api domain only. Remove loadMapsSDK(), api-key-notice banner, Save Key/Test buttons from frontend.

2. **Login rate limiting** - Lock account for 15 mins after 10 failed attempts. Track in KV under login-attempts:{email} -> { count, lockedUntil }. Reset on successful login. Return consistent error message regardless of whether email exists (prevent user enumeration).

3. **Remove Danger Zone from Summary tab** - The Delete All Data card is orphaned on the Summary tab. Remove it. Individual entry delete in History stays. Delete All Data remains in Settings -> Advanced only.

4. **History - tap entry to edit** - Tapping anywhere on an entry card opens the pre-populated edit form. More natural on mobile. Delete button stays visible within the card as a secondary action.

5. **Invoice tab - visible client selector** - Show scrollable chip row at top of Invoice tab showing all saved clients. Default client (isDefault: true) pre-selected on load. Tapping a chip switches the active client and updates the invoice preview immediately. If no clients configured, show a prompt linking to Settings -> Clients.

6. **Address lookup via Maps API in Settings** - Address Line 1 fields in Settings -> Your Details and Settings -> Clients (both add and edit forms) use Places autocomplete. Selecting a suggestion auto-fills Line 1 and Line 2. Verified badge shown on selection. All calls routed through Worker proxy POST /api/maps/places (key never in browser).

7. **Bug: Trip purpose shows [object Object]** - When adding a new purpose in Settings -> Purposes, the saved entry displays as "[object Object]" instead of the typed name. Likely a regression from the v3 purposes migration to objects ({text, usageCount}) — the addPurpose() function may be pushing a plain string while renderPurposes() expects an object, or vice versa.

8. **Bug: No delete button for clients** - Settings -> Clients shows an edit button per client but no delete button. Add a delete (🗑️) button alongside the edit (✏️) button in the clients list. Should prompt for confirmation before deleting.

9. **Bug: Emoji rendering as codepoint in clients list** - The 🏢 icon (U+1F3E2) is rendering as the literal string "U0001f3e2" somewhere in the clients list UI. Likely a str_replace corruption of the emoji in a template literal. Use Python to fix — find the broken string and replace with the correct emoji character.
