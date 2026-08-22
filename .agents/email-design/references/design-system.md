# Design System — Email

All emails produced by this skill must follow these design tokens exactly.
Always inline tokens as literal values. Never reference CSS variables (they break in Outlook).

---

## Color Palette

### Default SaaS Tokens (Override with brand colors when provided)

| Token Name | Hex Value | Usage |
|---|---|---|
| `brand-primary` | `#6366f1` | CTA buttons, links, accent borders |
| `brand-primary-dark` | `#4f46e5` | CTA button hover (use for VML color) |
| `body-bg` | `#f4f4f5` | Outer email background |
| `card-bg` | `#ffffff` | Main email card background |
| `footer-bg` | `#f9fafb` | Footer section background |
| `text-primary` | `#111827` | H1, H2 headings |
| `text-body` | `#374151` | Body paragraphs |
| `text-secondary` | `#6b7280` | Secondary copy, labels, captions |
| `text-link` | `#4f46e5` | Inline hyperlinks |
| `border-default` | `#e8e8e8` | Dividers, card borders |
| `success-green` | `#059669` | Success states, confirmation emails |
| `warning-amber` | `#d97706` | Warning banners, trial expiry alerts |
| `danger-red` | `#dc2626` | Error states, payment failure |
| `dark-card-bg` | `#2d2d2d` | Dark mode card background |
| `dark-body-text` | `#e0e0e0` | Dark mode body text |
| `dark-heading` | `#ffffff` | Dark mode headings |
| `dark-secondary` | `#a0a0a0` | Dark mode secondary text |
| `dark-footer` | `#888888` | Dark mode footer text |
| `dark-link` | `#aaaaaa` | Dark mode footer links |

### Contrast Ratios (WCAG AA Compliance)

| Combination | Ratio | Status |
|---|---|---|
| `text-primary` (#111827) on `card-bg` (#ffffff) | 16.1:1 | PASS AAA |
| `text-body` (#374151) on `card-bg` (#ffffff) | 10.4:1 | PASS AAA |
| `text-secondary` (#6b7280) on `card-bg` (#ffffff) | 4.6:1 | PASS AA |
| `#ffffff` on `brand-primary` (#6366f1) | 5.1:1 | PASS AA |
| `dark-body-text` (#e0e0e0) on `dark-card-bg` (#2d2d2d) | 9.7:1 | PASS AAA |
| `dark-secondary` (#a0a0a0) on `dark-card-bg` (#2d2d2d) | 5.2:1 | PASS AA |

---

## Typography Scale

### Font Stack

```
Arial, Helvetica, sans-serif          (default — all body copy)
Georgia, 'Times New Roman', serif     (optional — pull quotes, testimonials)
'Courier New', Courier, monospace     (code snippets, API keys, tokens)
```

**Never use Google Fonts `@import`** — strip by Gmail.
**Custom web fonts via `@font-face`**: Only in `<style>` block in `<head>`. Always provide Arial fallback.

### Type Scale

| Element | Size | Line Height | Weight | Color Token |
|---|---|---|---|---|
| H1 | 32px | 40px | 700 | `text-primary` |
| H2 | 24px | 32px | 700 | `text-primary` |
| H3 | 20px | 28px | 600 | `text-primary` |
| Body Large | 18px | 28px | 400 | `text-body` |
| Body Default | 16px | 26px | 400 | `text-body` |
| Body Small | 14px | 22px | 400 | `text-secondary` |
| Caption / Footer | 13px | 20px | 400 | `text-secondary` |
| CTA Button | 16px | 52px | 700 | `#ffffff` |
| Code / Token | 14px | 22px | 400 | `text-primary` |

### Mobile Type Scale Overrides (via `@media` in `<head>`)

| Element | Desktop | Mobile |
|---|---|---|
| H1 | 32px / 40px lh | 26px / 32px lh |
| H2 | 24px / 32px lh | 20px / 26px lh |
| Body | 16px / 26px lh | 16px / 24px lh |

---

## Spacing System

All spacing is applied via `padding` on `<td>` cells. Never use `margin` on `<table>` or `<td>` (Outlook ignores it).

| Token | Value | Usage |
|---|---|---|
| `space-xs` | `8px` | Icon gaps, tight button padding |
| `space-sm` | `16px` | Between body paragraphs |
| `space-md` | `24px` | Section padding (vertical) |
| `space-lg` | `32px` | Header/footer padding, between sections |
| `space-xl` | `40px` | Main content area left/right padding |
| `space-2xl` | `48px` | Hero padding (vertical) |

### Standard Component Padding

| Component | Padding |
|---|---|
| Header | `32px 40px` |
| Hero | `48px 40px` |
| Body section | `40px 40px 32px 40px` |
| CTA button row | `16px 40px 40px 40px` |
| Divider | `0 40px` |
| Footer | `32px 40px` |
| Mobile override | `24px 20px` |

---

## Border Radius & Shadows

Outlook renders border-radius and box-shadow inconsistently. Apply only to `<a>` tags (not `<td>`).

| Element | Radius | Notes |
|---|---|---|
| CTA button (`<a>`) | `6px` | VML `arcsize="8%"` for Outlook |
| Card image | `8px` | CSS only; degrades gracefully in Outlook |
| Alert banner | `4px` | CSS only |

---

## CTA Button Specifications

| Property | Value |
|---|---|
| Minimum width | `160px` |
| Recommended width | `220px` |
| Height / line-height | `52px` |
| Touch target | `44px minimum` (enforced by 52px height) |
| Font size | `16px` |
| Font weight | `700` |
| Text color | `#ffffff` |
| Background | Brand primary color |
| Border radius | `6px` |
| Text transform | `none` (do not use ALL CAPS) |
| Alignment | `center` on mobile, `center` or `left` on desktop |

---

## Alert / Banner Block

Use for urgent messages (payment failed, trial ending, security notice).

```
Background: warning = #fef3c7 / danger = #fee2e2 / success = #d1fae5
Border-left: 4px solid warning=#d97706 / danger=#dc2626 / success=#059669
Padding: 16px 20px
Border-radius: 4px (CSS only)
Text color: warning=#92400e / danger=#991b1b / success=#065f46
```

---

## Image Guidelines

| Property | Rule |
|---|---|
| Max width | 600px (full-bleed), 520px (padded section) |
| Format | JPEG for photos (compression), PNG for logos/icons, GIF for animation |
| Logo background | Solid color — NO transparent PNGs (dark mode safety) |
| Alt text | Always descriptive (not "image" or empty) |
| File size | < 200KB per image |
| Total email images | < 3–4 images for deliverability |
| CDN hosting | Must be publicly accessible HTTPS URL |

---

## Iconography

Use **text emoji** or **inline SVG data URI** encoded as base64 PNG images. Never reference icon font libraries (FontAwesome, Material Icons) — they are blocked by most clients.

Recommended: Use Unicode symbols where possible:
- Checkmark: `&#10003;` or `✓`
- Warning: `&#9888;` or `⚠`
- Arrow: `&#8594;` or `→`
- Star: `&#9733;` or `★`
