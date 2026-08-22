# Legal & Compliance — Email

All emails produced by this skill must satisfy the requirements of CAN-SPAM (USA),
GDPR (EU/UK), CASL (Canada), and general ESP sender policies.

---

## Quick Reference: What's Required Where

| Requirement | Transactional | Marketing | Onboarding | Lifecycle | Re-engagement |
|---|:---:|:---:|:---:|:---:|:---:|
| Unsubscribe link | NO | **YES** | YES | **YES** | **YES** |
| Physical address | NO | **YES** | YES | **YES** | **YES** |
| "Receiving this because" line | NO | **YES** | YES | **YES** | **YES** |
| Honest sender identity | **YES** | **YES** | **YES** | **YES** | **YES** |
| No deceptive subject line | **YES** | **YES** | **YES** | **YES** | **YES** |
| Explicit consent (GDPR) | NO | **YES** | NO* | **YES** | **YES** |
| Honor opt-out within 10 days | N/A | **YES** | YES | **YES** | **YES** |

*Onboarding: Signup qualifies as legitimate interest / contractual necessity.

---

## 1. CAN-SPAM Act (USA) Requirements

**Applies to:** All commercial emails sent to US recipients.

### Mandatory Elements

1. **From Name & Address must be accurate** — Do not use deceptive sender names.
2. **Subject line must not be deceptive** — Do not imply the email is a personal reply (e.g., no `Re:` prefix on cold outreach).
3. **Identify the message as an advertisement** — Required for cold marketing emails; warm opt-in emails are exempt if consent is clear.
4. **Include physical mailing address** — Must be your company's valid, current postal address, P.O. Box, or registered mail drop.
5. **Provide a clear and conspicuous unsubscribe mechanism** — Must be clearly labeled. One-click is required.
6. **Honor opt-out requests within 10 business days** — Ideally process instantly via webhook/API.
7. **Do not charge for unsubscribing** — The process must be free and require no login.

### Implementation in Template

```html
<!-- REQUIRED CAN-SPAM FOOTER (paste in every marketing email) -->
<tr>
  <td style="padding:32px 40px;background-color:#f9fafb;border-top:1px solid #e8e8e8;"
      class="padding-mobile">
    <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;
              line-height:20px;color:#6b7280;text-align:center;" class="footer-text">
      You're receiving this because you signed up for {{company_name}} at
      <a href="{{product_url}}" style="color:#6b7280;" class="footer-link">{{product_url}}</a>.
    </p>
    <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;
              line-height:20px;color:#6b7280;text-align:center;" class="footer-text">
      {{company_name}} &bull; {{company_address}}
    </p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
              line-height:20px;text-align:center;">
      <a href="{{manage_preferences_url}}" target="_blank"
         style="color:#6b7280;text-decoration:underline;" class="footer-link">
        Email Preferences
      </a>
      &nbsp;&bull;&nbsp;
      <a href="{{unsubscribe_url}}" target="_blank"
         style="color:#6b7280;text-decoration:underline;" class="footer-link">
        Unsubscribe
      </a>
      &nbsp;&bull;&nbsp;
      <a href="{{privacy_policy_url}}" target="_blank"
         style="color:#6b7280;text-decoration:underline;" class="footer-link">
        Privacy Policy
      </a>
    </p>
    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
              line-height:20px;color:#6b7280;text-align:center;" class="footer-text">
      &copy; {{current_year}} {{company_name}}. All rights reserved.
    </p>
  </td>
</tr>
```

---

## 2. GDPR (EU/UK) Requirements

**Applies to:** All emails sent to EU or UK residents.

### Key Rules

1. **Lawful basis required** — Marketing emails require explicit, freely given, prior opt-in consent.
   - Transactional emails: Legitimate interest / contract performance (no opt-in needed).
   - Onboarding: Legitimate interest (user signed up; reasonable to send product-related emails).
   - Marketing / newsletters: Explicit opt-in consent REQUIRED.

2. **Right to withdraw consent** — Must be as easy to opt out as it was to opt in. One-click unsubscribe satisfies this.

3. **Right to access / erasure** — Your system must support "forget me" requests. Email templates should link to a privacy contact.

4. **Data minimization** — Only use personal data necessary for the email purpose. Don't expose data that wasn't given for this purpose.

5. **No pre-ticked boxes** — Consent at signup must be affirmative, unchecked by default.

6. **Record keeping** — You must be able to prove consent was given (timestamp, source, IP). This is a backend/platform concern, not template-level.

### GDPR-Safe Subject Line Rule

Never use subject lines that could be construed as misleading about origin, sender, or content.

**NEVER:**
- `Re: Your account` (when it's not a reply)
- `URGENT: You've been selected` (false urgency)
- `Your free gift inside` (if no gift)

**ALWAYS:**
- `Your {{company_name}} weekly digest`
- `{{company_name}}: Your trial expires in 7 days`
- `New feature: AI-powered reports are here`

---

## 3. CASL (Canada) Requirements

**Applies to:** All commercial electronic messages sent to Canadian recipients.

CASL is stricter than CAN-SPAM:
- Requires **express consent** (implied consent only lasts 2 years and has limits).
- Consent must be **separate** from terms of service acceptance.
- Unsubscribe must process within **10 business days**.
- Sender information must be included in every message.
- No pre-ticked consent boxes.

---

## 4. Gmail & Yahoo Sender Requirements (2024+)

**Applies to:** Anyone sending to Gmail or Yahoo addresses (most SaaS users).

As of February 2024, Google and Yahoo mandate:

| Requirement | Threshold |
|---|---|
| SPF record on sending domain | **Required** |
| DKIM signature (1024-bit minimum, 2048-bit recommended) | **Required** |
| DMARC policy (`p=none` minimum, `p=reject` recommended) | **Required** |
| One-click unsubscribe (RFC 8058 `List-Unsubscribe-Post` header) | **Required for >5K/day senders** |
| Spam complaint rate | **< 0.10%** (< 0.08% recommended) |

**These are infrastructure requirements**, not template requirements. But the template must include the unsubscribe link that satisfies the one-click requirement.

### Required HTTP Header (set by ESP/backend, not in HTML)

```
List-Unsubscribe: <{{unsubscribe_url}}>, <mailto:unsubscribe@yourcompany.com?subject=unsubscribe>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

---

## 5. Accessibility Legal Requirements

WCAG 2.1 Level AA is increasingly a legal requirement in the EU (EAA), UK, Australia, and the USA (ADA).

Email-specific requirements:

| Requirement | Standard | Implementation |
|---|---|---|
| Color contrast ratio ≥ 4.5:1 | WCAG 1.4.3 | Verified in design-system.md |
| All images have descriptive `alt` text | WCAG 1.1.1 | Required on every `<img>` |
| Links have descriptive text | WCAG 2.4.4 | Not "click here" — use action labels |
| Language declared on `<html>` | WCAG 3.1.1 | `lang="en"` always |
| Tables use `role="presentation"` | WCAG | On all layout tables |
| Logical reading order | WCAG 1.3.2 | Always top-to-bottom single column |
| Text resizable to 200% | WCAG 1.4.4 | Use relative units in `<head>` CSS where possible |
| No color as only means of information | WCAG 1.4.1 | Add text labels alongside colored status indicators |

---

## 6. Content Rules

### Never Include in Transactional Emails

- Promotional banners or discount codes
- Upsell language ("Upgrade to Pro today!")
- Newsletter-style content
- Multiple CTAs

### Never Include in Any Email

- Purchased/rented email list recipients
- Pre-ticked opt-in consent boxes
- False urgency or fake scarcity
- Hidden or misleading unsubscribe mechanisms (e.g., tiny grey text)
- Unsubscribe links that require a login to complete
- Third-party advertising content

---

## 7. Compliance Self-Audit Before Send

Run this checklist against every marketing/lifecycle/re-engagement email:

- [ ] From Name is the brand / product name (not a personal name for bulk sends)
- [ ] From Email uses company domain (not Gmail/Yahoo)
- [ ] Subject line is accurate and non-deceptive
- [ ] Physical mailing address in footer
- [ ] "Why you're receiving this" statement in footer
- [ ] Working one-click unsubscribe link
- [ ] Privacy Policy link in footer
- [ ] `List-Unsubscribe` header set in ESP settings
- [ ] DKIM signature configured on sending domain
- [ ] No marketing content inside a transactional email
- [ ] Consent documented for all recipients (GDPR/CASL)
