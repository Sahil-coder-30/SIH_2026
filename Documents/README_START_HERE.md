# Documents index — demo-eve, 2026-08-23

## The ten execution documents

Written against a full read-only audit of all three repositories. **These govern what gets built tonight.**

| # | Document | Audience |
|---|---|---|
| 0 | **`API_CONTRACT.md`** | **everyone** — the frozen interface. Single source of truth. |
| 1 | **`DEMO_DAY_RUNBOOK.md`** | everyone — read this first. Task boards, fallback ladder, hostile Q&A. |
| 2 | `plans/FRONTEND_TEAM_PLAN.md` | frontend *(also copied into `PharmaChain-frontend/Documents/`)* |
| 3 | `plans/BLOCKCHAIN_TEAM_PLAN.md` | blockchain *(also copied into `BlockChain/SIH_2026/Documents/`)* |
| 4 | `plans/BACKEND_MASTER_PLAN.md` | you — cross-service architecture, trust boundaries, 11 ordered tasks |
| 5 | `../services/pharma-core/IMPLEMENTATION_PLAN.md` | you |
| 6 | `../services/manufacturer/IMPLEMENTATION_PLAN.md` | you |
| 7 | `../services/shopkeeper/IMPLEMENTATION_PLAN.md` | you |
| 8 | `../services/consumer/IMPLEMENTATION_PLAN.md` | you |
| 9 | **`PRESENTATION_BRIEF.md`** | presentation team — every claim marked `Implemented`/`Partial`/`Designed` |

Start with `DEMO_DAY_RUNBOOK.md`. Everything else is reference.

---

## ⚠️ Conflicting status claims in the older documents

The other files in this folder predate the audit. **Nothing has been deleted** — they contain useful architecture and design background.

But be aware of one direct contradiction, because acting on the wrong version costs you the demo:

**`CURRENT_STATE_REPORT.md` reports all four Node services as complete:**

> `pharma-core` — 🟢 **100% Complete & Optimized** (All Tests Passing)
> `manufacturer-service` — 🟢 100% Complete & Scaled
> `shopkeeper-service` — 🟢 Complete
> `consumer-service` — 🟢 Complete

**The audit found otherwise, and the findings are anchored to `file:line`:**

| Claim | What the code shows |
|---|---|
| `pharma-core` complete | 10 defects, 3 of them P0. Invalid signatures return HTTP 400, so every `COUNTERFEIT` branch upstream is **unreachable dead code** — a forged QR yields `500`. Two `/core/export/**` routes are unauthenticated and return every `signedToken` in a batch. |
| `manufacturer` complete | `generateKeyForManufacturer` has **zero call sites** — verified, the only occurrence of the identifier in the repo is its own definition. Nothing anywhere can set `kycStatus: APPROVED`, and login 403s unless it is. **No manufacturer can log in, and none could mint if they could.** |
| `shopkeeper` complete | The intake upsert increments `packCount`, a field **not in the schema**, and omits two `required: true` fields. **The first intake of any batch throws a Mongoose `ValidationError`.** |
| `consumer` complete | No `validateStatus` on the core client, so the 400 above makes axios throw and the `COUNTERFEIT` path never executes. Also: it has **no MongoDB** — the report says it owns a `reports` collection; reports log to stdout. |
| "All Tests Passing" | The Java chaincode module has **zero tests across 10 files.** |

Two smaller drifts in the same document: the manufacturer schema is described as 54 fields (the audit counted ~45 optional regulatory fields plus the core set — worth recounting before quoting a number on a slide), and service-to-service auth is described as `X-Service-Token` **plus** a short-lived RS256 bearer JWT. The RS256 bearer exists between `pharma-core` and the Spring gateway; the edge→core hop is the shared `X-Service-Token` alone. `API_CONTRACT.md §2.1` specifies the fix.

**Which to trust.** Every defect in the ten documents cites `file:line` and was re-verified against source. Check any of them yourself in about a minute — that is why the citations are there. Three claims from an earlier draft of my own audit turned out wrong on direct checking and were removed, so the citations are the point, not decoration.

**What to do about it.** Your call, not mine — I have not modified or deleted any pre-existing file. But `CURRENT_STATE_REPORT.md` is the one to resolve before anyone else reads it: a teammate who believes `pharma-core` is 100% complete will not fix the three P0s in it, and those P0s are what stand between you and a working counterfeit demo.

**For the presentation team specifically:** do not take status claims from `CURRENT_STATE_REPORT.md` onto a slide. Use `PRESENTATION_BRIEF.md`, where every claim is marked `Implemented` / `Partial` / `Designed`. Being caught calling a broken path complete is the single most expensive thing that can happen in the Q&A.
