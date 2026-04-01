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

7. ~~**Bug: Trip purpose shows [object Object]**~~ - Fixed. Renderer used `${p}` directly; updated to `p.text`. addPurpose() now pushes `{text, usageCount:0}` objects.

8. **Bug: No delete button for clients** - Settings -> Clients shows an edit button per client but no delete button. Add a delete (🗑️) button alongside the edit (✏️) button in the clients list. Should prompt for confirmation before deleting.

9. ~~**Bug: Emoji rendering as codepoint in clients list**~~ - Fixed. Python replaced \U escape sequences with actual emoji chars.

10. **[LOW] Destinations — edit name and icon** - Tapping ✏️ on a destination only opens the address edit modal. Should also allow editing the name and icon. Currently workaround is delete + re-enter.

11. **[LOW] Client list — default management** - First client saved always becomes default (isDefault logic sets true when no other default exists). Either remove the concept of a default client, or add a "Set as default" toggle per client in the list.

12. **Bug: Edit banner shows raw unicode escapes** - The edit banner HTML contains `\u270f\ufe0f` and `\u2014` as literal text rather than rendered characters. Fix: replace with actual ✏️ and — characters using Python.

13. **[LOW] Invoice tab — label client chip row** - The scrollable client chip row has no heading. Add a small "Invoice To" label above or before the chips so the purpose is clear.

19. **[LOW] Billing Types — fixed price support** - Rename "Time Types & Rates" → "Billing Types & Rates". Add a "Fixed Price" checkbox to the Add form. Fixed price types store `hours[typeId] = 1` (included) or absent (not included) — same data structure, earnings formula unchanged (1 × amount = $amount). Entry form: fixed types show a checkbox "Include" instead of hours input. History: shows "Fixed · $amount" not "X hrs · $amount". Invoice: fixed rows show `— | Fixed | $amount`; fixed types excluded from hours total. Settings list: shows "$X fixed" vs "$X/hr".

18. **[LOW] Bug: non-NZ addresses rejected in autocomplete** - Worker's `handleMapsPlaces` has `components: 'country:nz'` hard-coded, blocking US and other international addresses. Fix: remove the country restriction entirely so any address worldwide can be found. Affects all autocomplete fields (destinations, Your Details, Clients).

17. **[LOW] Invoice screen — Payment Options card** - Add a card on the Invoice tab below the include toggles. Two options: (1) "Bank Transfer" (default, pre-ticked) — pulls bank account number from Your Details and renders it in the existing green bank-box on the invoice; (2) "Custom instructions" — free-text field whose content appears below the bank box as a "Payment Instructions" section. If both are off, omit payment section from invoice entirely.

16. **[HIGH] Bug: editing history entry creates duplicate instead of updating** - `editEntry(id)` sets `editingEntryId` and navigates to the Add tab, but `saveMileage()`, `saveExpense()`, and `saveTime()` never check `editingEntryId` — they always call `uid()` and push a new entry. Fix: in each save function, if `editingEntryId` is set, replace the existing entry in-place (find by id, splice/replace) and preserve its original `createdAt`. Clear `editingEntryId` and hide the edit banner after save.

15. **[LOW] Danger Zone — two-tier delete** - Currently "Delete All Data" only clears entries/receipts. Add two options: (1) "Clear Transactions" — deletes entries + receipts only, keeps config/settings; (2) "Reset Everything" — full nuke of entries, receipts, config, and cloud KV data, returning app to factory state. Both need a confirmation modal with clear warning text. Useful for testing.

14. **Invoice preview — multiple fixes:**
    - Remove the "Period:" line from top-right meta (invLabel already shown in billing period bar; user wants it removed)
    - Change `Date:` label to `Invoice Date:`
    - Address lines (From/To) show literal `\n` instead of line breaks — fix `.join('\\n')` to use actual newline character
    - Invoice From missing suburb — ensure addressLine2 includes suburb (data from autocomplete should cover this; verify join logic)
    - Total Due amount does not align with the Amount column — add `padding-right:12px` to total-box to match table cell padding
    - Hide section header + subtotal row when only one entry type is on the invoice (e.g. Time only → no "Time" header or "Time Subtotal" row needed)
    - Remove the "🕐 Time & Expense Log" sub-line from the top-left INVOICE header
    - Footer: change to `Generated by MyTE on DD/MM/YYYY at HH:MM`
