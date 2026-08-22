# Email Categories — SaaS Reference

## Category 1: Transactional

**Definition:** System-triggered, 1:1 emails in response to a specific user action.
**Legal status:** Does NOT require opt-in or unsubscribe link (CAN-SPAM), but must not contain marketing content.
**Delivery SLA:** Must be sent within **10 seconds** of trigger event.
**Priority:** Highest. Use a dedicated subdomain (e.g., `mail.app.yourproduct.com`).

### Sub-types

| Sub-type | Trigger | Key CTA |
|---|---|---|
| Email verification | Account signup | Verify Email |
| Password reset | "Forgot password" click | Reset Password |
| Invoice / receipt | Successful payment | View Invoice |
| Payment failure | Card declined | Update Payment |
| API key generated | Developer action | View API Key |
| System alert | Usage threshold / error | View Dashboard |
| Account deletion confirmation | User-initiated delete | Cancel Deletion |

**Tone:** Clear, direct, functional. No emojis, no marketing language.
**Structure:** Header → 1-sentence context → Single CTA button → Short support line → Footer.
**Design:** Minimal. Single column. No hero image required. Brand logo + muted color accent only.

---

## Category 2: Onboarding

**Definition:** Time-based or behavior-triggered sequences guiding new users to their first "Aha!" moment.
**Legal status:** Requires consent (users signed up; this qualifies). Include unsubscribe option.
**Goal:** Drive feature adoption and activate the core value proposition within the first 7–14 days.

### Sequence Map

| Email # | Timing | Goal |
|---|---|---|
| 1 — Welcome | Immediately after signup | Set expectations, drive first login |
| 2 — Feature spotlight | Day 2 or after first login | Highlight the #1 value action |
| 3 — Progress check | Day 5 (if no key action taken) | Overcome friction, offer help |
| 4 — Social proof | Day 7 | Reinforce with case study / testimonial |
| 5 — Setup complete | On milestone completion | Celebrate and upsell next feature |

**Tone:** Warm, encouraging, educational. First-name personalization mandatory.
**Structure:** Greeting → Context/value statement → 1 feature/action → CTA → Support offer → Footer.
**Design:** Branded header with logo. Optional hero image. Use bold headlines for scannability.

---

## Category 3: Retention & Engagement

**Definition:** Regular-cadence emails delivering ongoing value to active users.
**Legal status:** Requires unsubscribe link and physical address.
**Goal:** Prevent churn by keeping users engaged with the product's value.

### Sub-types

| Sub-type | Cadence | Key Content |
|---|---|---|
| Weekly usage digest | Weekly | Usage stats, streak, comparison to last week |
| Feature announcement | On release | What's new, how to use it, what it unlocks |
| Tips & tricks | Bi-weekly | Power user tips, keyboard shortcuts, integrations |
| Monthly newsletter | Monthly | Industry insights, product highlights, customer stories |

**Tone:** Conversational, value-forward, light and helpful.
**Structure:** Subject-relevant hook → Value content (bullets/sections) → CTA → Footer.
**Design:** More visual than transactional. May use 2-column sections for content cards. Dividers and whitespace critical.

---

## Category 4: Lifecycle / Upsell

**Definition:** Behaviorally triggered emails around commercial milestones in the user's account.
**Legal status:** Requires unsubscribe link and physical address.
**Goal:** Convert, expand revenue, or prevent involuntary churn.

### Sub-types

| Sub-type | Trigger | CTA |
|---|---|---|
| Trial expiring (7 days) | 7 days before trial end | Upgrade Now |
| Trial expiring (1 day) | 1 day before trial end | Upgrade Now (urgent) |
| Usage limit reached | Usage threshold hit | Upgrade Plan |
| Plan upgrade prompt | Feature gating event | Unlock Feature |
| Annual plan offer | 6 months on monthly plan | Save XX% — Switch to Annual |
| Milestone celebration | N users / N tasks completed | Share Your Achievement |

**Tone:** Direct, benefit-focused. Urgency where appropriate but never fear-mongering.
**Structure:** Trigger context → Core benefit statement → CTA → Objection-handling line → Footer.
**Design:** High-contrast CTA button. Optionally include pricing comparison table. Keep copy short.

---

## Category 5: Re-engagement / Win-back

**Definition:** Emails to users who have been inactive or have churned.
**Legal status:** Requires unsubscribe link and physical address. Must honor previous opt-out status.
**Goal:** Re-activate dormant users or recover churned subscribers.

### Sub-types

| Sub-type | Trigger | CTA |
|---|---|---|
| Inactivity (30 days) | 30 days no login | See What's New |
| Inactivity (60 days) | 60 days no login | Come Back — Here's What's Changed |
| Win-back (churned) | 7 days after churn | We Miss You — Come Back |
| Sunset / goodbye | 90 days no login | Keep My Account / Unsubscribe |

**Tone:** Empathetic, low pressure. Acknowledge the silence. Show value, not desperation.
**Structure:** Empathetic opener → Value reminder (what they're missing) → New feature teaser → CTA → Easy unsubscribe option → Footer.
**Design:** Minimal design. Consider a personalized element (e.g., their actual usage metric). Avoid aggressive red/orange urgent colors.

---

## Decision Tree: Which Category?

```
User performed an action?
  YES → Is it security/billing/system-critical?
           YES → TRANSACTIONAL
           NO  → Is the account < 14 days old?
                   YES → ONBOARDING
                   NO  → LIFECYCLE (upsell/milestone)

No action / time-based?
  → Is user inactive (30+ days)?
       YES → RE-ENGAGEMENT
       NO  → RETENTION (digest/newsletter/tips)
```
