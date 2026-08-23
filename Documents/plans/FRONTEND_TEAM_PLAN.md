# Frontend Team Plan

**Audience:** frontend team · **Repo:** `~/Desktop/PharmaChain-frontend`
**Apps:** `Manufacture-DashBoard` · `shopkeeper-mobile` · `customer-mobile`
**Contract:** `API_CONTRACT.md` — read §4 and §6 before writing any code.

---

## Rules

| # | Rule |
|---|---|
| **R1** | **Scope discipline.** No new screens, no redesigns, no new libraries. Bug fixes and wiring only. Anything not in the task lists below is out of scope. |
| **R2** | `API_CONTRACT.md` is the source of truth. If it looks wrong, say so and get it changed — do not work around it. |
| **R3** | **Four new backend endpoints are being built tonight** (`API_CONTRACT.md §7` Tier 1) — KYC approve, shopkeeper inventory, verification-status, logout. Write real calls for those four. **Everything else stays mocked**, including the eight Tier 3 endpoints your apps already call. |
| **R4** | **Never fail open.** Every `switch` on a verification state needs a `default` that renders *suspect*, never *authentic*. |
| **R5** | **No fabricated data.** A `catch` block may never invent a success response. |
| **R6** | The UI improvements appendix is **fenced**. Do not start it before the demo. |

---

## What we found, and what it means for you

We compared every HTTP call in all three apps against every route defined in the backend.

**2 of 24 call sites resolve to an endpoint that exists.**

- Shopkeeper app: **0 of 11.** It calls `/api/v1/transactions/receive|sell|return`; the backend exposes `/api/shopkeeper/scan/intake` and `/api/shopkeeper/scan/sale`. Its default base URL is port **8000**; the service listens on **3002**.
- Dashboard: **2 of 13** — only `POST /batch` and `POST /batch/:id/recall`.
- Customer app: **0.** Its API layer contains no verify call at all.

**Twelve endpoints the apps call have never existed in the backend.** Four of those are being built tonight — see R3 and the Tier 1 table in `API_CONTRACT.md §7`. The other eight stay mocked. Do not lobby for them; they need email delivery, a TOTP store, or data models that do not exist.

**The good news is how small the real fix is.** Every path change lives inside the API-layer modules — `auth.api.ts`, `dashboard.api.ts`, `shopkeeper-mobile/src/services/api/*.ts`, `customer-mobile/src/services/api/client.ts`. **No screen or component needs restructuring.** Roughly 20 000 lines of UI stay exactly as they are.

**One thing that will save you time:** the backend already parses QR strings. `extractTokenAndHashFromQrData` in both the consumer and shopkeeper services accepts a full URL with `?token=`, a path-only URL, or a bare JWT. **Send whatever the camera returned, verbatim, as `qrData`.** Do not parse, split, or regex it on the client.

---

## Task 1 · P0 · M — Build the mock layer once, properly

You will work without a backend until it is ready. Do it so that integration is a **one-line change**, not a refactor.

**The pattern:** keep the real module's signatures exactly as the contract defines, add a `.mock.ts` sibling with identical signatures, and select between them in one place.

```ts
// src/services/api/verify.ts — the real implementation
import client from './client';
import type { VerifyResponse } from '@/types/verify';

export async function verifyPack(qrData: string): Promise<VerifyResponse> {
  const { data } = await client.post<VerifyResponse>('/api/consumer/verify', { qrData });
  return data;                       // no try/catch — let it throw, the caller renders the failure
}
```

```ts
// src/services/api/verify.mock.ts — identical signature
import type { VerifyResponse } from '@/types/verify';
import { FIXTURES } from './verify.fixtures';

export async function verifyPack(qrData: string): Promise<VerifyResponse> {
  await new Promise(r => setTimeout(r, 600));            // visible but not annoying
  if (qrData.startsWith('__FORCE__')) {                  // dev verdict picker, see below
    return FIXTURES[qrData.replace('__FORCE__', '') as keyof typeof FIXTURES];
  }
  return FIXTURES.GENUINE;
}
```

```ts
// src/services/api/index.ts — the single switch
const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS === 'true';   // dashboard: import.meta.env.VITE_USE_MOCKS
export const { verifyPack } = USE_MOCKS
  ? await import('./verify.mock')
  : await import('./verify');
```

**Integration day is then: set the env var to `false`.** Nothing else.

### Fixtures must cover all seven states

Not just the happy one. Per `API_CONTRACT.md §4.1`: `GENUINE` · `AT_SHOP` · `ALREADY_SOLD` · `RECALLED` · `EXPIRED` · `COUNTERFEIT` · `NOT_FOUND`.

Match the real envelope exactly, including the fields that are **absent** in some states — `COUNTERFEIT` has no `payload` and no `packHash`, `EXPIRED` has no `packHash`. If your fixtures always include every field, your UI will crash on the first real counterfeit.

```ts
export const FIXTURES = {
  GENUINE: {
    status: 'success', uiState: 'GENUINE', valid: true,
    message: '100% Genuine Medicine — Registered & Safe',
    payload: { batchId: 'PC-BATCH-CIPLA0-20260814-A3F91C', serial: 'PKT-000042',
               expiryDate: '2028-01-14', manufacturerId: 'MFR_CIPLA_001',
               nonce: 'a91f…', ts: 1755000000 },
    packHash: 'a8f5f167f44f4964e6c998dee827110c…', blockchainStatus: 'Packaged', detail: null,
  },
  COUNTERFEIT: {
    status: 'success', uiState: 'COUNTERFEIT', valid: false,
    message: 'COUNTERFEIT WARNING: Invalid digital signature. Do not consume this medicine.',
    scannedHash: null,                       // ← note: no payload, no packHash
  },
  // … AT_SHOP, ALREADY_SOLD, RECALLED, EXPIRED, NOT_FOUND
} as const;
```

### Add a dev-only verdict picker

On each scan screen, behind `if (__DEV__)` / `import.meta.env.DEV`, add a small row of seven buttons that force a verdict.

This is worth more than it looks. It is how you test all seven paths without a backend, **and it is the best demo asset we have** — it lets you show counterfeit, recalled, and expired handling on command instead of hoping a fake QR is to hand. Build it first.

---

## Task 2 · P0 · M — Delete every lie

Twelve `catch` blocks currently fabricate a success response. This is the most dangerous code in the repository: it means a total backend outage renders as a normal, healthy, **authentic** result.

| File | What it does |
|---|---|
| `Manufacture-DashBoard/src/features/dashboard/service/dashboard.api.ts` | every catch returns plausible fake data |
| `Manufacture-DashBoard/src/features/auth/services/auth.api.ts` | same, plus items below |
| `shopkeeper-mobile/src/services/api/auth.ts:24-56` | `if (!error.response)` → returns `{success: true, accessToken: 'mock-jwt-token-…', verificationStatus: 'verified'}`. **Network down = logged in as a verified shopkeeper.** |
| `customer-mobile/app/(public)/verification.tsx:12-43` | hardcodes `status: "AUTHENTIC"` after a 2 000 ms fake delay; the `catch` at `:35-37` is unreachable |
| `shopkeeper-mobile/app/verification.tsx` | same pattern |

Also remove:

- `auth.api.ts:30-114` — **plaintext demo passwords**, currently shipped in the production bundle.
- `auth.slice.ts:39-47` — pre-authenticated boot state; the app starts logged in.
- `auth.api.ts:21-27` — a Bearer interceptor that shadows the cookie. The dashboard uses cookie auth (`withCredentials: true`, already correctly set). Remove the interceptor; keep `withCredentials`.

**Replace them with nothing.** Let the call throw and let the screen render a real error state. If a screen has no error state, that is Task 2's actual work.

---

## Task 3 · P0 · M — Make the scanners use what they scanned

All three scanners currently ignore the scanned payload entirely.

| File | Current behaviour |
|---|---|
| `shopkeeper-mobile/app/(shopkeeper)/scan.tsx:57-73` | destructures `data`, never uses it; hardcodes `id: '1'` → always "Verified 96/100"; fires `Haptics.NotificationFeedbackType.Success` **unconditionally** |
| `shopkeeper-mobile/app/public-scan.tsx:23-38` | `const randomId = data.length % 5 === 0 ? "4" : "1"` — authenticity by string length |
| `customer-mobile/app/(tabs)/scan.tsx:50-58` | ignores `data`; comment reads *"Default to authentic for live camera scan"* |
| `customer-mobile/app/(public)/verification.tsx:54-80` | switches on `result.status`, handles **2 of 7** states, `default` → grey Info card "Verification Failed" |

Each becomes: pass `data` straight through to the API function, `await`, render the returned `uiState`.

### The verdict rendering contract — identical in all three apps

```ts
switch (res.uiState) {
  case 'GENUINE':
  case 'AT_SHOP':        return renderSafe(res);      // green
  case 'ALREADY_SOLD':
  case 'NOT_FOUND':      return renderSuspect(res);   // amber
  case 'RECALLED':
  case 'EXPIRED':
  case 'COUNTERFEIT':    return renderDanger(res);    // red
  default:               return renderSuspect(res);   // ← never renderSafe
}
```

**Three hard requirements:**

1. Switch on **`uiState`** — never on `blockchainStatus`, never on the HTTP status code, never on `valid` alone.
2. The `default` branch renders **suspect**. A state we do not recognise is a state we do not trust.
3. **Haptics and sound must match the verdict.** A success buzz on a counterfeit actively misleads the user. Light tap for safe, warning pattern for suspect, heavy triple for danger.

Also handle the two non-verdict outcomes distinctly, because they mean different things:
- **Request threw** (network, timeout, 500) → "Could not verify — try again". Not a verdict. Never green.
- **HTTP 400** → malformed scan; prompt to rescan.

---

## Task 4 · P1 · S — Migrate the path strings, and wire the four new endpoints

Full table in `API_CONTRACT.md §6`. Summary:

**Manufacture-DashBoard** — baseURL `/api/manufacturer` is already correct.
`/login` → `/auth/login` · `/register` → `/auth/register` · `/batches` → `/batch` (singular).
Keep `POST /batch` and `POST /batch/:id/recall` as-is.
**Add `POST /batch/:batchId/mint`** — it exists, returns `202` with a `pollUrl`, and the dashboard never calls it. `CreateBatchWizard.tsx:133-230` fakes the whole mint with a 4.3 s `setTimeout` chain and an invented random `txHash`. Replace with: create → mint → poll `GET /batch/:batchId` for `mintStatus` and `mintedPacksCount`.
**Rename `/kyc/verify-simulation` → `POST /auth/kyc/approve`** — being built tonight. It needs an `X-Admin-Token` header. Keep it on an internal/admin screen; it is not a user-facing action.
**Add `POST /auth/logout`** → `204`. Clear local state on any response, including a failure.
Mock-only: `/dashboard` *(Tier 2 — derive it from `GET /batch` instead; the query already supports `{status, tag, search, limit, page}`)*, `/forgot-password`, `/reset-password`, `/verify-2fa`, `/user/sync`, `/alert/:id/resolve`, `/order/:id/status`.

**shopkeeper-mobile** — base URL → **`:3002`**.
`/api/shopkeeper/login|register` → `/api/shopkeeper/auth/…`
`/api/v1/transactions/receive` → `/api/shopkeeper/scan/intake`
`/api/v1/transactions/sell` → `/api/shopkeeper/scan/sale` — **`/sale`, not `/sell`**
`/api/v1/scan/shopkeeper` → no such endpoint; fold into intake/sale.
**Three real endpoints land tonight — wire them, do not mock them:**
`GET /verification-status` → `/api/shopkeeper/auth/verification-status`, returns `{ kycStatus: 'PENDING'|'APPROVED'|'REJECTED' }`. Map that enum to your `verified`/`unverified` vocabulary **on the client** — the backend returns the model's values verbatim. This is what unblocks the `(auth)` pending screens.
`POST /logout` → `/api/shopkeeper/auth/logout` → `204`. Clear the secure-store token regardless of the response.
**`GET /api/shopkeeper/inventory`** → `{ status, total, page, items: [{ batchId, medicineName, expiryDate, currentStock, updatedAt }] }`, query `{ search?, expiringInDays?, limit=50, page=1 }`. Wire the inventory screen to it. ⚠️ Inventory rows carry **no recall flag** — do not render a recall badge; that needs a batch lookup and is Tier 2.
Mock-only: `/refresh`, `/forgot-password`, `/reset-password`, `/transactions/return`.
⚠️ The scan endpoints return **`409`** for already-sold and recalled, and **`400`** for expired. Those are verdicts, not failures — set `validateStatus: s => s < 500` on the client, or the app will treat a correctly-blocked sale as a crash.

**customer-mobile** — base URL → **`:3003`** (currently `:8000/api/v1`).
Add one function: `POST /api/consumer/verify` with `{ qrData: <raw scan string> }`.
`POST /api/consumer/report` also exists and works — `{ qrToken, location?, notes?, photoUrl? }` → `201`. Wire the report CTA to it.

---

## Definition of done

- [ ] `USE_MOCKS=true` — every screen in all three apps renders with no backend running.
- [ ] All seven `uiState` values reachable via the dev picker, each with correct colour, copy, and haptic.
- [ ] `grep -rn "return { success: true" src/` returns nothing outside `*.mock.ts`.
- [ ] No hardcoded password, token, or verdict anywhere outside `*.mock.ts` / `*.fixtures.ts`.
- [ ] Every path string matches `API_CONTRACT.md §6`.
- [ ] The four Tier-1 endpoints have **real** implementations, not mocks: `auth/kyc/approve`, `shopkeeper/inventory`, `auth/verification-status`, `auth/logout`.
- [ ] Turning `USE_MOCKS` off produces real network requests to the correct ports — verify in the network inspector, not by whether the UI looks right. **A screen that looks correct while mocked proves nothing.**

---

# POST-DEMO — do not start before the demo ships

Everything below is real, worthwhile work. None of it is worth touching tonight. Ordered by value.

## Missing infrastructure

**`react-router` and a QR library are both absent from the dashboard.** Confirmed against `package.json`: no router, no QR generator, no test framework. `QRCodeHubView.tsx` exists but cannot be producing real QR images. Adding a router is a structural change touching every screen — deliberately deferred.

Components exist for features with no backend: `components/orders`, `components/inventory`, `components/alerts`, `components/traceability`. Keep them mocked until the endpoints are agreed. Do not lobby for the endpoints; agree the contract first.

## customer-mobile

1. **Chain-of-custody timeline** on `verification.tsx` — a vertical timeline of manufacturer → distributor → pharmacy → you, with timestamps. This makes the ledger *visible* and is the single highest-value UI addition in the project. Needs the backend to return `history[]` (post-demo envelope).
2. **Offline verification state.** When the ledger is unreachable but the signature verified, say so explicitly: *"Signature verified — genuine manufacturer. Custody check pending, no connection."* Do not show a failure. This is the product's strongest capability and there is currently no UI for it.
3. **Verdict-differentiated haptics and sound** — folded into Task 3 for the demo; extend to a full sensory language afterwards.
4. **Scan overlay**: animated reticle, torch toggle, "hold steady" hint, automatic low-light torch prompt.
5. **Report flow** on every non-`GENUINE` verdict → `POST /api/consumer/report`, with consent-gated geolocation. The endpoint already exists.
6. **Shareable verification receipt** — a screenshot-friendly card with pack hash, verdict, and timestamp. Cheap, and it spreads the product.
7. **Accessibility**: never encode a verdict in colour alone — always icon plus text. Currently colour-only in places, which fails for red-green colour blindness.
8. **History screen** backed by local cache, with each entry's verdict preserved.

## shopkeeper-mobile

1. **Visually distinct intake vs sell modes** — different accent colour and header, full-width. Today they are confusable, and picking the wrong one silently corrupts inventory. Cheap and prevents a real class of error.
2. **Continuous carton-intake mode** — keep the camera open, accumulate a scanned list with a running count, commit in one request. Scanning a 500-pack carton one modal at a time is unusable, and this is the difference between a demo and a deployable tool.
3. **Unmissable rejection feedback** — red flash, heavy haptic, sound, and the item lands in a "rejected" tray with its reason (`ALREADY_SOLD`, `RECALLED`, `EXPIRED`). Silent rejection is how counterfeits get shelved.
4. **Recall banner** pinned to `dashboard.tsx` whenever shelf stock is recalled → tap through to affected batches with a quarantine action.
5. **Offline scan queue.** Record scans locally, sync when connectivity returns, surface conflicts. Indian pharmacy connectivity is genuinely poor — this is a credibility win with judges and a requirement for real deployment.
6. **Inventory screen polish**: group by medicine, expand to batches; expiring-soon (< 90 days) and recalled badges; sort by expiry. The basic list is wired in Task 4 against the new `GET /api/shopkeeper/inventory`. The **recalled badge is the part that is still blocked** — inventory rows carry no recall flag, so it needs a batch-status lookup. Agree that contract first.
7. **Sales day-sheet** with a total, and CSV export.
8. Gate the `(auth)` screens whose endpoints are Tier 3 (`forgot-password`, `reset-password`, `account-suspended`) — they are currently reachable and lead nowhere. The `verification-pending` / `verification-rejected` / `registration-submitted` screens **do** become functional in Task 4 via `verification-status`, so keep those.

## Manufacture-DashBoard

1. **Real streamed mint progress** — poll `GET /batch/:batchId` and show genuine per-stage labels (signing → CSV → S3 → ledger) with `mintedPacksCount`. Replaces the fake 4.3 s chain. Partially covered by Task 4; finish it properly here.
2. **Recall confirmation with blast radius.** Require the batch number typed out, a reason dropdown plus free text, and show the impact before confirming — packs total, at shops, already sold. Recall is irreversible and currently one click.
3. **Virtualised pack table** for the 100 k-row preview, with QR thumbnail on hover and a print-ready PDF sheet export.
4. **Server-side pagination and search** on the batch table — status chips, search by batch number and medicine name. The endpoint already supports `{status, tag, search, limit, page}`.
5. **Counterfeit-scan geo map** — hotspots of failed verification attempts. Strongest possible SIH visual. Needs a backend aggregate endpoint; agree the contract first.
6. **Real empty, loading, and error states** across every screen. Currently unreachable because the fabricating catches meant errors never surfaced. Removing those catches in Task 2 will expose bare screens — this is the follow-up.
7. **Dark mode and an accessible government-style palette.** You are pitching to a ministry; WCAG AA contrast is table stakes.
8. **Role separation in the UI** (Admin / Production / QA) — the batch model already carries `qaOfficerId`, `supervisorId`, and internal-only fields that should not be visible to every role. Server-side enforcement is a backend task; the UI affordance can come first.
