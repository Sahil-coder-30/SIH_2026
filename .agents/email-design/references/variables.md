# Variable Placeholders — Email

All dynamic content must use double-curly `{{variable_name}}` syntax (Mustache/Handlebars compatible).
This works with Postmark, Resend, SendGrid, Mailchimp, Customer.io, and most ESPs.

---

## Universal Variables (All Emails)

| Variable | Description | Example |
|---|---|---|
| `{{first_name}}` | Recipient's first name | `Sarah` |
| `{{full_name}}` | Recipient's full name | `Sarah Johnson` |
| `{{email}}` | Recipient's email address | `sarah@acme.com` |
| `{{company_name}}` | Your SaaS product/company name | `Acme Analytics` |
| `{{product_url}}` | Homepage / app root URL | `https://app.acme.com` |
| `{{logo_url}}` | Absolute URL of your logo image | `https://cdn.acme.com/logo.png` |
| `{{support_email}}` | Support email address | `support@acme.com` |
| `{{privacy_policy_url}}` | Privacy policy page URL | `https://acme.com/privacy` |
| `{{email_subject}}` | Email subject (used in `<title>`) | `Reset your Acme password` |
| `{{preheader_text}}` | 50–100 char inbox preview text | `Click to reset your password. Link expires in 2 hours.` |
| `{{current_year}}` | Current year for copyright | `2025` |

---

## Transactional Variables

### Password Reset

| Variable | Description | Example |
|---|---|---|
| `{{reset_url}}` | One-time reset link | `https://app.acme.com/reset?token=abc123` |
| `{{expiry_hours}}` | Hours until link expires | `2` |
| `{{request_ip}}` | IP address of the requester | `192.168.1.1` |
| `{{request_location}}` | Approximate location | `Mumbai, India` |
| `{{request_device}}` | Device / browser | `Chrome on Mac` |
| `{{request_time}}` | Timestamp of request | `23 Jul 2025 at 10:32 AM IST` |

### Email Verification

| Variable | Description | Example |
|---|---|---|
| `{{verification_url}}` | Email verification link | `https://app.acme.com/verify?token=xyz` |
| `{{expiry_hours}}` | Hours until link expires | `24` |

### Invoice / Receipt

| Variable | Description | Example |
|---|---|---|
| `{{invoice_number}}` | Invoice ID | `INV-2025-00142` |
| `{{invoice_date}}` | Invoice date | `23 July 2025` |
| `{{plan_name}}` | Subscription plan | `Pro Plan` |
| `{{billing_period}}` | Billing period | `Jul 1 – Jul 31, 2025` |
| `{{amount_paid}}` | Total amount | `$49.00` |
| `{{currency}}` | Currency code | `USD` |
| `{{payment_method}}` | Card/payment method | `Visa ending in 4242` |
| `{{invoice_url}}` | Link to full invoice PDF | `https://app.acme.com/invoice/INV-2025-00142` |
| `{{next_billing_date}}` | Next renewal date | `23 August 2025` |

### Payment Failure

| Variable | Description | Example |
|---|---|---|
| `{{failed_amount}}` | Amount that failed | `$49.00` |
| `{{failure_reason}}` | Decline reason | `Insufficient funds` |
| `{{update_payment_url}}` | Link to update card | `https://app.acme.com/billing` |
| `{{retry_date}}` | When we'll retry | `26 July 2025` |
| `{{account_suspension_date}}` | Date account will suspend | `2 August 2025` |

### API / System Alert

| Variable | Description | Example |
|---|---|---|
| `{{alert_type}}` | Alert category | `Usage Limit Warning` |
| `{{alert_message}}` | Alert description | `Your API usage is at 90% of your plan limit.` |
| `{{metric_name}}` | The metric that triggered | `API Requests` |
| `{{current_value}}` | Current metric value | `9,000` |
| `{{limit_value}}` | Plan limit | `10,000` |
| `{{dashboard_url}}` | Link to relevant dashboard | `https://app.acme.com/usage` |

---

## Onboarding Variables

| Variable | Description | Example |
|---|---|---|
| `{{signup_date}}` | Date user signed up | `23 July 2025` |
| `{{trial_days_remaining}}` | Days left in trial | `13` |
| `{{trial_end_date}}` | Trial expiry date | `5 August 2025` |
| `{{getting_started_url}}` | Quickstart guide URL | `https://docs.acme.com/quickstart` |
| `{{first_action_url}}` | URL to first key action | `https://app.acme.com/create` |
| `{{first_action_label}}` | Label for first action | `Create your first project` |
| `{{video_walkthrough_url}}` | Product tour video URL | `https://acme.com/tour` |
| `{{feature_name}}` | Featured feature name | `AI-powered reports` |
| `{{feature_description}}` | Short feature description | `Generate insights in one click` |
| `{{feature_url}}` | Feature page / docs URL | `https://docs.acme.com/reports` |
| `{{progress_percentage}}` | Onboarding completion % | `40` |
| `{{completed_steps}}` | List of completed steps | (rendered via loop) |
| `{{remaining_steps}}` | List of pending steps | (rendered via loop) |

---

## Retention & Engagement Variables

| Variable | Description | Example |
|---|---|---|
| `{{digest_period}}` | Week/period covered | `July 14–20, 2025` |
| `{{total_sessions}}` | Sessions in period | `12` |
| `{{key_metric_1_label}}` | Primary metric name | `Reports Generated` |
| `{{key_metric_1_value}}` | Primary metric value | `24` |
| `{{key_metric_2_label}}` | Secondary metric name | `Team Members Active` |
| `{{key_metric_2_value}}` | Secondary metric value | `5` |
| `{{streak_days}}` | Current active streak | `7` |
| `{{tip_title}}` | Tip or trick headline | `Speed up your workflow` |
| `{{tip_body}}` | Tip body text | `Use keyboard shortcut Cmd+K to...` |
| `{{feature_headline}}` | New feature name | `Introducing Smart Templates` |
| `{{feature_body}}` | Feature benefit copy | `Save 3 hours a week by...` |
| `{{release_notes_url}}` | Full changelog URL | `https://acme.com/changelog` |

---

## Lifecycle / Upsell Variables

| Variable | Description | Example |
|---|---|---|
| `{{trial_days_remaining}}` | Days left in trial | `7` |
| `{{trial_end_date}}` | Trial expiry date | `30 July 2025` |
| `{{current_plan}}` | User's current plan | `Free Trial` |
| `{{upgrade_plan}}` | Recommended plan to upgrade to | `Pro` |
| `{{upgrade_price}}` | Upgrade plan price | `$49/month` |
| `{{upgrade_url}}` | Upgrade CTA URL | `https://app.acme.com/upgrade` |
| `{{usage_percentage}}` | % of limit used | `95` |
| `{{usage_current}}` | Current usage amount | `9,500 API calls` |
| `{{usage_limit}}` | Plan limit | `10,000 API calls/month` |
| `{{annual_savings_amount}}` | Savings on annual plan | `$120` |
| `{{annual_savings_percent}}` | Savings percentage | `20%` |
| `{{annual_plan_url}}` | Annual plan checkout URL | `https://app.acme.com/billing/annual` |
| `{{milestone_name}}` | Milestone achieved | `100 Projects Created` |
| `{{unlock_feature_name}}` | Feature being unlocked/gated | `Advanced Analytics` |

---

## Re-engagement Variables

| Variable | Description | Example |
|---|---|---|
| `{{days_inactive}}` | Days since last login | `32` |
| `{{last_login_date}}` | Date of last session | `21 June 2025` |
| `{{new_features_since_last_login}}` | Count of new features | `5` |
| `{{re_login_url}}` | Direct link back to app | `https://app.acme.com/login` |
| `{{discount_code}}` | Win-back discount code | `COMEBACK20` |
| `{{discount_amount}}` | Value of discount | `20% off` |
| `{{discount_expiry_date}}` | Code expiry date | `31 August 2025` |
| `{{account_deletion_date}}` | Sunset — when account deletes | `1 September 2025` |

---

## Legal / Compliance Variables

| Variable | Description | Example |
|---|---|---|
| `{{unsubscribe_url}}` | One-click unsubscribe URL | `https://acme.com/unsubscribe?token=abc` |
| `{{manage_preferences_url}}` | Email preferences center | `https://acme.com/email-preferences` |
| `{{company_address}}` | Full physical postal address | `123 Tech Street, San Francisco, CA 94105, USA` |
| `{{current_year}}` | For copyright line | `2025` |

---

## Variable Naming Conventions

1. Use `snake_case` only — no camelCase, no hyphens
2. Keep names self-documenting — `{{trial_days_remaining}}` not `{{tdr}}`
3. Prefix loop variables with their parent — `{{invoice_line_item_description}}`
4. Date format: `D Month YYYY` (e.g., `23 July 2025`) — do not use locale-specific formats
5. Currency: Always include symbol + two decimal places — `$49.00`, `€29.00`
6. Percentages: Include `%` in the value string — `95%` not `95`
