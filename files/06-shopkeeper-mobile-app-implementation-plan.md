# Shopkeeper Mobile App — Implementation Plan
### POS / Intake Companion for Retail Chemists

---

## 1. Purpose

This is the app a chemist uses at the counter: scan a box on delivery (intake), scan a strip at checkout (sale), and glance at stock levels. It's a working-tool app, used many times a day under time pressure — speed and a scanner that "just works" matter more than visual polish.

---

## 2. Tech Stack

- **React Native** (fits your JS/MERN background and lets you share validation logic with the web dashboard) with a QR/barcode camera library (e.g. `vision-camera` + a code-scanning plugin), or a lighter-weight PWA with `getUserMedia` + a JS QR decoder if you want to skip native build tooling for the hackathon
- Secure token storage (Keychain/Keystore via a library, not `AsyncStorage` in plaintext) for the JWT
- Talks only to `shopkeeper-service` (`:3002`)

---

## 3. Screens

### 3.1 Login
- Against `shopkeeper-service` JWT auth.

### 3.2 Intake Scan
- Full-screen camera scanner. Decodes the QR URL (`https://pharmachain.gov.in/verify/:packHash?token=...`), extracting `:packHash` and `token`. Sends either raw URL or token to `POST /api/shopkeeper/scan/intake`.
- Shows brief confirmation (medicine name, batch, expiry) with clear pass/fail status.
- Supports **rapid sequential scans** without extra taps for multi-pack deliveries.

### 3.3 Sale Scan (POS)
- Tuned for the checkout moment: scans strip QR URL → instant `SOLD` confirmation on blockchain.
- If a pack fails (already sold, recalled, not in this shop's stock), triggers an **impossible-to-miss visual & audio alert** to stop counterfeit/recalled medication from reaching the patient.

### 3.4 Inventory Dashboard
- Stock counts by batch, expiry-approaching alerts, low-stock alerts — pulled pre-computed from `shopkeeper-service` rather than calculated on-device.

---

## 4. API Integration Points

- `POST /api/shopkeeper/login`
- `POST /api/shopkeeper/scan/intake`
- `POST /api/shopkeeper/scan/sale`
- `GET /api/shopkeeper/inventory`

---

## 5. MVP Priority Ranking

1. **Critical:** the scanner itself (fast, reliable decode) + intake scan + sale scan flows, with unmistakable accept/reject feedback. This *is* the app, from the anti-counterfeit standpoint — a shopkeeper who can't quickly tell "this pack is fine to sell" from "this pack is already sold/recalled" defeats the whole chain-of-custody design.
2. **Important:** clear, distinct error states for each rejection reason (duplicate intake, expired, recalled, not-in-my-stock) — a generic "scan failed" message isn't enough for a chemist to know what to do next.
3. **Nice-to-have CRUD (defer):** the inventory dashboard's visual polish, historical sales views, multi-staff logins per shop, export/reporting. These support the "ease of use, drives adoption" side benefit you noted, but they're secondary to getting scans working correctly.
4. **Should-have if time allows:** offline scan queueing for poor-connectivity counters — genuinely useful for real-world adoption, but build and demo the online path first since it's simpler to get right and is what the judges will actually see scanned live.

---

## 6. Build Order Suggestion

1. Login
2. Camera scanner wired to intake endpoint, verify against real minted packs from the manufacturer dashboard
3. Sale scan wired the same way, verify the `AT_SHOP → SOLD` transition actually blocks a second sale attempt
4. Inventory screen
5. Polish / offline queueing, time permitting
