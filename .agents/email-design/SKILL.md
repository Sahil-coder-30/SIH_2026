---
name: email-design
description: "Design production-grade, legally compliant, cross-client HTML emails for SaaS products. Covers all 5 SaaS email categories (transactional, onboarding, retention, lifecycle/marketing, and re-engagement), CAN-SPAM/GDPR compliance, cross-client rendering (Gmail, Outlook, Apple Mail), dark mode, WCAG AA accessibility, and Mustache/Handlebars variable injection. Actions: design email, generate email HTML, create email template, build email. Triggers on: email template, HTML email, transactional email, password reset email, welcome email, onboarding email, invoice email, upgrade email, win-back email, newsletter."
argument-hint: "[email-type] [brand-context] [purpose]"
license: MIT
metadata:
  author: capstone-team
  version: "1.0.0"
---

# Email Design — Production-Grade SaaS HTML Email System

Design legally compliant, cross-client, accessible, and brand-consistent HTML emails for every SaaS use case. Produces a **single self-contained `.html` file** per email that is ready to upload to any ESP (Postmark, Resend, SendGrid, AWS SES, etc.).

---

## When to Activate This Skill

| User Request | Email Category |
|---|---|
| "Design a welcome email" | Onboarding |
| "Create a password reset email" | Transactional |
| "Build an invoice / receipt email" | Transactional |
| "Make an upgrade / upsell prompt email" | Lifecycle |
| "Generate a trial expiration warning" | Lifecycle |
| "Write a weekly digest / usage report email" | Retention |
| "Build a win-back campaign email" | Re-engagement |
| "Create a feature announcement email" | Retention |
| "Design a newsletter" | Retention |
| "Build an API alert / system notification" | Transactional |

---

## Workflow (Follow Every Step in Order)

### Step 1 — Identify Category & Gather Context

Determine the email category from the user request using the table above.

Then collect (ask if missing):

1. **Email type** — which of the 5 SaaS categories (see `references/email-categories.md`)
2. **Brand** — primary color (hex), logo URL or path, company name, support email address
3. **Recipient** — first name variable placeholder, e.g. `{{first_name}}`
4. **Core purpose** — the one action you want the user to take
5. **CTA label & URL** — button text and destination link
6. **Dynamic variables** — list all `{{variable}}` placeholders needed (see `references/variables.md`)
7. **Tone** — professional, warm & friendly, urgent, celebratory
8. **Legal** — is this a marketing email? (requires unsubscribe link + physical address)

### Step 2 — Select a Base Template

Choose the correct base from `references/templates.md`:

| Category | Base Template |
|---|---|
| Transactional | `base-transactional` |
| Onboarding | `base-onboarding` |
| Retention / Newsletter | `base-retention` |
| Lifecycle (upsell / trial) | `base-lifecycle` |
| Re-engagement / Win-back | `base-reengagement` |

### Step 3 — Apply Design System

Read `references/design-system.md` for all spacing, typography, color, and component tokens.

Key rules:
- Max layout width: **600px**
- Font stack: brand font (if web-safe) -> `Arial, Helvetica, sans-serif`
- Minimum body font size: **16px** (14px minimum for secondary copy)
- CTA button: minimum **44 x 44 px** touch target, min contrast **4.5:1**
- All widths use `max-width` + 100% fluid fallback (hybrid/spongy method)

### Step 4 — Write the HTML

Follow ALL rules in `references/html-coding-rules.md`:

- Table-based layout with MSO conditional ghost tables for Outlook
- All CSS **inlined** (no `<link>`, no `@import` in body)
- `<style>` block in `<head>` for media queries and dark mode only
- VML bulletproof buttons and background images for Outlook
- Dark mode `@media (prefers-color-scheme: dark)` overrides
- Every `<img>` has `alt` text, explicit `width` and `height`
- Total HTML size **< 102 KB** (Gmail clipping threshold)
- Plain-text fallback copy included as a comment block at the bottom

### Step 5 — Inject Variables

Replace all dynamic content with `{{mustache}}` / `{{handlebars}}` placeholders per `references/variables.md`.

### Step 6 — Apply Legal & Compliance Layer

Verify against `references/compliance.md`:

**Marketing emails (mandatory):**
- [ ] One-click unsubscribe link `{{unsubscribe_url}}` in footer
- [ ] Physical postal address in footer `{{company_address}}`
- [ ] "You're receiving this because..." context line

**All emails (mandatory):**
- [ ] No deceptive subject line
- [ ] Sender name and reply-to address are honest
- [ ] `<html lang="en">` declared
- [ ] `role="presentation"` on all layout tables

### Step 7 — QA Checklist

Run through `references/qa-checklist.md` before delivering:
- [ ] Renders correctly at 320px (mobile minimum)
- [ ] Renders correctly at 600px (desktop)
- [ ] Dark mode colors are correct
- [ ] All images have alt text
- [ ] CTA button works without images enabled
- [ ] HTML file < 102 KB
- [ ] All `{{variables}}` are present
- [ ] Unsubscribe link present (marketing only)
- [ ] Physical address present (marketing only)
- [ ] Contrast ratio >= 4.5:1 for all body text

### Step 8 — Deliver

Output:
1. The complete, self-contained HTML file saved at the path the user specifies
2. A short **Usage Notes** block listing:
   - All `{{variable}}` placeholders and their expected values
   - Subject line recommendation (< 50 characters)
   - Preheader text recommendation (50-100 characters)
   - ESP compatibility notes (if any)

---

## Hard Rules (Never Violate)

1. **Never use Flexbox or CSS Grid** in email layout — use tables only.
2. **Never link external CSS** — all styles must be inline or in a `<head>` `<style>` block.
3. **Always wrap Outlook-only code** in `<!--[if mso]>...<![endif]-->` conditional comments.
4. **Never exceed 102 KB** total HTML size — Gmail will clip the message.
5. **Always include alt text** for every `<img>` tag.
6. **Always provide a VML bulletproof button** as the Outlook fallback for every CTA.
7. **Always include an unsubscribe link** in marketing emails — omitting it is illegal.
8. **Never place marketing copy** inside transactional emails.
9. **Always use `role="presentation"`** on layout tables.
10. **Always test mobile layout** at 320px minimum width.

---

## References

| File | Purpose |
|---|---|
| `references/email-categories.md` | Full breakdown of all 5 SaaS email categories with goals, tone, and trigger logic |
| `references/templates.md` | Fully coded HTML base templates for each category |
| `references/design-system.md` | Color tokens, typography scale, spacing system, component library |
| `references/html-coding-rules.md` | Table layout, MSO conditionals, VML, dark mode, inline CSS rules |
| `references/variables.md` | All standard Mustache/Handlebars variable placeholders per category |
| `references/compliance.md` | CAN-SPAM, GDPR, CASL requirements and legal footer components |
| `references/qa-checklist.md` | Pre-send QA checklist for every email |
