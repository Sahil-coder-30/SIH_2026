# QA Checklist — Pre-Send Email Audit

Run this full checklist against every email before delivery to the user.
Mark all items as PASS or note the specific failure.

---

## Section 1: HTML Structure & Size

| # | Check | Standard | Status |
|---|---|---|---|
| 1.1 | DOCTYPE is XHTML 1.0 Transitional | `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"...>` | [ ] |
| 1.2 | `<html>` has `lang="en"` attribute | `<html lang="en">` | [ ] |
| 1.3 | `<html>` has VML namespaces declared | `xmlns:v` and `xmlns:o` present | [ ] |
| 1.4 | Viewport meta tag present | `<meta name="viewport" content="width=device-width, initial-scale=1.0">` | [ ] |
| 1.5 | Color scheme meta tags present | Both `color-scheme` and `supported-color-schemes` | [ ] |
| 1.6 | Total HTML file size < 102 KB | Measure with: `wc -c email.html` | [ ] |
| 1.7 | No external CSS `<link>` tags | None in `<head>` or `<body>` | [ ] |
| 1.8 | No `@import` in CSS | Not in `<head>` `<style>` block | [ ] |
| 1.9 | No JavaScript present | No `<script>` tags or `on*` attributes | [ ] |
| 1.10 | No `<form>` elements | None | [ ] |

---

## Section 2: Layout & Rendering

| # | Check | Standard | Pass? |
|---|---|---|---|
| 2.1 | Outer table is 100% width | `width="100%"` on outer wrapper | [ ] |
| 2.2 | Inner container max-width is 600px | `max-width:600px;width:100%` | [ ] |
| 2.3 | MSO ghost tables wrap inner container | `<!--[if mso]>` conditional wraps | [ ] |
| 2.4 | All layout tables have `role="presentation"` | Every `<table>` has this attribute | [ ] |
| 2.5 | All layout tables have `cellpadding="0" cellspacing="0" border="0"` | On every `<table>` | [ ] |
| 2.6 | No Flexbox or CSS Grid used | Search for `flex` or `grid` in CSS | [ ] |
| 2.7 | No `position:absolute/relative/fixed` | Search CSS for `position:` | [ ] |
| 2.8 | No `margin` on tables or td cells | Use `padding` instead | [ ] |
| 2.9 | Mobile media query present | `@media only screen and (max-width: 620px)` | [ ] |
| 2.10 | Two-column sections stack on mobile | `.stack-on-mobile { display:block !important; width:100% !important; }` | [ ] |
| 2.11 | Layout renders at 320px width | Visual check or preview | [ ] |
| 2.12 | Layout renders at 600px width | Visual check or preview | [ ] |

---

## Section 3: Typography & Color

| # | Check | Standard | Pass? |
|---|---|---|---|
| 3.1 | Font stack is web-safe | Ends in `Arial, Helvetica, sans-serif` or `Georgia, serif` | [ ] |
| 3.2 | Minimum body font size is 16px | No body `<p>` smaller than 16px | [ ] |
| 3.3 | Minimum caption font size is 13px | No text smaller than 13px | [ ] |
| 3.4 | Line height is at least 1.5x font size | 16px body → 24px+ line-height | [ ] |
| 3.5 | Body text contrast ratio ≥ 4.5:1 | `#374151` on `#ffffff` = 10.4:1 ✓ | [ ] |
| 3.6 | Secondary text contrast ratio ≥ 4.5:1 | `#6b7280` on `#ffffff` = 4.6:1 ✓ | [ ] |
| 3.7 | CTA button text contrast ≥ 4.5:1 | White on brand primary color | [ ] |
| 3.8 | Dark mode colors override correctly | `@media (prefers-color-scheme: dark)` applied | [ ] |
| 3.9 | Links are underlined | `text-decoration:underline` | [ ] |
| 3.10 | Links are distinguishable from body text | Different color or underline | [ ] |

---

## Section 4: Images

| # | Check | Standard | Pass? |
|---|---|---|---|
| 4.1 | Every `<img>` has `alt` attribute | Not empty, not "image" — descriptive | [ ] |
| 4.2 | Every `<img>` has explicit `width` and `height` | Prevents layout collapse | [ ] |
| 4.3 | Every `<img>` has `display:block` | Removes phantom whitespace gap | [ ] |
| 4.4 | Every `<img>` has `border="0"` | Removes Outlook link border | [ ] |
| 4.5 | No images wider than 600px | Check `width` attributes | [ ] |
| 4.6 | All image URLs are absolute HTTPS | No relative paths | [ ] |
| 4.7 | Logo has solid background | No transparent PNG | [ ] |
| 4.8 | Each image file < 200KB | Check CDN/hosted file sizes | [ ] |
| 4.9 | Email makes sense with images blocked | Read alt-text-only version | [ ] |
| 4.10 | No more than 4 images total | Deliverability risk above this | [ ] |

---

## Section 5: CTA Button

| # | Check | Standard | Pass? |
|---|---|---|---|
| 5.1 | VML button present for Outlook | `<!--[if mso]> <v:roundrect...` | [ ] |
| 5.2 | Non-MSO fallback button present | `<!--[if !mso]><!-->` wrapper | [ ] |
| 5.3 | Button height is at least 44px | `line-height:52px` on `<a>` | [ ] |
| 5.4 | Button width is at least 44px | `width:160px` minimum | [ ] |
| 5.5 | Button links to correct URL | `href="{{cta_url}}"` resolves correctly | [ ] |
| 5.6 | Button `target="_blank"` is set | Opens in new tab | [ ] |
| 5.7 | Button text is 16px, weight 700 | Legible and prominent | [ ] |
| 5.8 | Only ONE primary CTA button per email | No second competing CTA | [ ] |
| 5.9 | CTA visible without scrolling | Above the fold on mobile | [ ] |

---

## Section 6: Preheader Text

| # | Check | Standard | Pass? |
|---|---|---|---|
| 6.1 | Preheader `<div>` present | Invisible div with `display:none;overflow:hidden;` | [ ] |
| 6.2 | Preheader text is 50–100 characters | Not too short, not too long | [ ] |
| 6.3 | Preheader supports subject line | Adds context, does not repeat subject | [ ] |
| 6.4 | `{{preheader_text}}` variable injected | Not placeholder text | [ ] |

---

## Section 7: Variables & Personalization

| # | Check | Standard | Pass? |
|---|---|---|---|
| 7.1 | All `{{variables}}` are listed in Usage Notes | Complete inventory | [ ] |
| 7.2 | No unfilled/raw `{{variable}}` in deliverable | All replaced or noted as required | [ ] |
| 7.3 | `{{first_name}}` personalization present | In greeting or subject | [ ] |
| 7.4 | `{{company_name}}` used consistently | Matches brand | [ ] |
| 7.5 | Date variables use consistent format | `D Month YYYY` | [ ] |
| 7.6 | Currency variables include symbol and decimals | `$49.00` not `49` | [ ] |

---

## Section 8: Legal & Compliance

| # | Check | Marketing | Transactional |
|---|---|:---:|:---:|
| 8.1 | Unsubscribe link present and working | **REQUIRED** | NOT required |
| 8.2 | Physical postal address in footer | **REQUIRED** | NOT required |
| 8.3 | "You're receiving this because..." line | **REQUIRED** | NOT required |
| 8.4 | Privacy policy link in footer | **REQUIRED** | **REQUIRED** |
| 8.5 | Sender name is honest brand name | **REQUIRED** | **REQUIRED** |
| 8.6 | Subject line is non-deceptive | **REQUIRED** | **REQUIRED** |
| 8.7 | No marketing copy in transactional | N/A | **REQUIRED** |
| 8.8 | No fake urgency or false claims | **REQUIRED** | **REQUIRED** |
| 8.9 | Copyright year `{{current_year}}` in footer | Recommended | Recommended |

---

## Section 9: Subject Line & Deliverability

| # | Check | Standard | Pass? |
|---|---|---|---|
| 9.1 | Subject line < 50 characters | Count characters carefully | [ ] |
| 9.2 | Subject line is not ALL CAPS | Triggers spam filters | [ ] |
| 9.3 | Subject line has no excessive punctuation | No `!!!` or `???` | [ ] |
| 9.4 | Subject line has no spam trigger words | Avoid: "FREE", "GUARANTEED", "WINNER", "URGENT ACT NOW" | [ ] |
| 9.5 | Text-to-image ratio is 60:40 or better | More text than images | [ ] |
| 9.6 | No URL shorteners in email body | Use full branded URLs | [ ] |
| 9.7 | No red text in body copy | Common spam signal | [ ] |

---

## Final Sign-Off

Before delivering the email HTML to the user, confirm:

- [ ] All Section 1–9 checks are PASS
- [ ] Usage Notes block written with all variables listed
- [ ] Subject line recommendation (< 50 chars) included
- [ ] Preheader text recommendation (50–100 chars) included
- [ ] ESP-specific notes included if applicable
- [ ] File is saved with a descriptive name: `email-[type]-[purpose].html`
