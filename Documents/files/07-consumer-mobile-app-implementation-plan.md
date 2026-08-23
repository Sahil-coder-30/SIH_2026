# Consumer (User) App — Implementation Plan
### Patient-Facing Scan & Verify — The Public Face of the MVP

---

## 1. Purpose — and a Framing Decision to Make Early

This is what a patient uses to check whether the medicine in their hand is real. The master plan is explicit that scanning should work with **any phone camera (Google Lens, native camera app)** — meaning the QR code should encode a plain URL, and the "app" is really a **web landing page** that anyone can hit without installing anything.

**Recommendation:** build this as a responsive web page / PWA served by (or in front of) `consumer-service`, not a native app that requires a store download. A native app adds real friction to the one part of the system where friction directly works against your mission (patients scanning *right after* buying, often on someone else's phone or a low-end device). If you want an installable "app" for the pitch, wrap the same PWA — don't build two separate codebases.

---

## 2. Tech Stack

- **React (Vite) PWA**, mobile-first responsive layout, installable via "Add to Home Screen" but fully usable without installing.
- **Dual-Mode QR URL**: `https://pharmachain.gov.in/verify/:packHash?token=:signedToken`
  - **Native Phone Camera**: Opens the PWA directly to the route `/verify/:packHash?token=...`. The page reads `:packHash` from the route params and `token` from the query string on load.
  - **In-App QR Scanner**: Decodes the URL, immediately extracts `:packHash` from the path, and queries `consumer-service`.
- Talks only to `consumer-service` (`:3003`).

---

## 3. Screens

### 3.1 Verify Result (the entire product, essentially)
- Loads instantly on scan, shows one of the 7 states with unambiguous color coding (green = genuine/at-shop, amber/red = everything else) and the medicine's basic identity (name, expiry, manufacturer) pulled from the batch's public details.
- For anything except `GENUINE`/`AT_SHOP`, show a prominent "Report this" call to action right on the result screen — don't bury reporting behind navigation.

### 3.2 Report Counterfeit
- Short form: confirms the scanned token, requests geolocation permission (optional — don't block reporting if denied), lets the user add a note/photo if you have time. Submits to `consumer-service`'s report endpoint.

### 3.3 (Optional, lower priority) Learn/Info
- A simple static page explaining what the color codes mean and why this matters — useful for the public-awareness angle mentioned in your original notes, and cheap to build since it's static content.

---

## 4. API Integration Points

- `GET/POST /api/consumer/verify`
- `POST /api/consumer/report`

---

## 5. MVP Priority Ranking

1. **Critical — this is the actual product:** the verify result screen. Fast load, unmistakable visual states, no login wall. This single screen is what "eliminates fake medicines from the market" actually means in practice — a patient who can check in three seconds and trusts what they see.
2. **Critical:** the report-counterfeit flow, since it's what converts a scan into a real regulatory action, which is the enforcement mechanism behind the verification.
3. **Nice-to-have (explicitly deprioritized per your own framing):** accounts, scan history, saved/favorite medicines, push notifications for recalls on previously-scanned items. These are pleasant CRUD-style features for a "finished product," but they don't affect the core mission and should only be built if the verify/report flow is already solid and there's time left.
4. **Worth a mention in the pitch even if not built:** the SMS fallback for feature-phone users from your earlier notes — it's a strong equity argument (this shouldn't only work for smartphone owners) even as a "future work" slide if you run out of build time.

---

## 6. Build Order Suggestion

1. Verify result page wired to `consumer-service`, tested against real packs going through the full mint → intake → sale lifecycle from the other three apps
2. Report flow
3. Static info/education page
4. Anything account-related, only if time remains
