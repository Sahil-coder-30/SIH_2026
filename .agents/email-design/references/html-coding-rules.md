# HTML Coding Rules — Email

All HTML emails produced by this skill must follow these rules exactly. No exceptions.

---

## 1. Document Structure

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"
      xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>{{email_subject}}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    /* RESET */
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }

    /* CLIENT-SPECIFIC FIXES */
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    #outlook a { padding: 0; }
    .ReadMsgBody { width: 100%; } .ExternalClass { width: 100%; }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font,
    .ExternalClass td, .ExternalClass div { line-height: 100%; }

    /* DARK MODE */
    @media (prefers-color-scheme: dark) {
      body, .email-body-bg { background-color: #1a1a1a !important; }
      .email-wrapper { background-color: #2d2d2d !important; }
      .email-body-text { color: #e0e0e0 !important; }
      .email-heading { color: #ffffff !important; }
      .email-subtext { color: #a0a0a0 !important; }
      .email-divider { border-color: #444444 !important; }
      .footer-text { color: #888888 !important; }
      .footer-link { color: #aaaaaa !important; }
    }

    /* MOBILE */
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid { width: 100% !important; max-width: 100% !important; height: auto !important; }
      .stack-on-mobile { display: block !important; width: 100% !important; }
      .hide-on-mobile { display: none !important; }
      .center-on-mobile { text-align: center !important; }
      .btn-full { width: 100% !important; text-align: center !important; }
      h1 { font-size: 26px !important; line-height: 32px !important; }
      h2 { font-size: 20px !important; line-height: 26px !important; }
      .body-text { font-size: 16px !important; line-height: 24px !important; }
      .padding-mobile { padding: 24px 20px !important; }
    }
  </style>
</head>
```

---

## 2. Body & Wrapper Structure

Always wrap the full email in a 100%-wide outer table. Use MSO ghost tables to center and constrain to 600px on Outlook.

```html
<body style="margin:0;padding:0;background-color:#f4f4f5;" class="email-body-bg">

  <!-- Visually Hidden Preheader -->
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;
              max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    {{preheader_text}}
  </div>

  <!-- Outer 100% table -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0"
         width="100%" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:20px 0;">

        <!-- MSO Ghost Table (centers the 600px inner table in Outlook) -->
        <!--[if mso]>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0">
          <tr><td width="600">
        <![endif]-->

        <!-- Inner Email Container -->
        <table role="presentation" class="email-container" border="0"
               cellpadding="0" cellspacing="0" width="600"
               style="max-width:600px;width:100%;background-color:#ffffff;"
               class="email-wrapper">
          <!-- === EMAIL CONTENT HERE === -->
        </table>

        <!--[if mso]>
          </td></tr>
        </table>
        <![endif]-->

      </td>
    </tr>
  </table>

</body>
```

---

## 3. Header Component

```html
<!-- HEADER -->
<tr>
  <td align="center" style="padding:32px 40px;background-color:#ffffff;
                             border-bottom:1px solid #e8e8e8;"
      class="email-divider padding-mobile">
    <a href="{{product_url}}" target="_blank" style="text-decoration:none;">
      <img src="{{logo_url}}" alt="{{company_name}}" width="140" height="auto"
           style="display:block;max-width:140px;height:auto;">
    </a>
  </td>
</tr>
```

---

## 4. Hero / Banner Component (Optional)

```html
<!-- HERO (with VML background image fallback for Outlook) -->
<tr>
  <td>
    <!--[if mso]>
    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false"
            style="width:600px;height:200px;">
      <v:fill type="frame" src="{{hero_image_url}}" color="#{{brand_color}}"/>
      <v:textbox inset="0,0,0,0"><div><![endif]-->
    <div style="background-color:#{{brand_color}};background-image:url('{{hero_image_url}}');
                background-size:cover;background-position:center;
                min-height:200px;text-align:center;padding:48px 40px;">
      <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;
                 font-size:30px;font-weight:700;line-height:38px;
                 color:#ffffff;" class="email-heading">
        {{email_headline}}
      </h1>
    </div>
    <!--[if mso]></div></v:textbox></v:rect><![endif]-->
  </td>
</tr>
```

---

## 5. Body Text Component

```html
<!-- BODY CONTENT -->
<tr>
  <td style="padding:40px 40px 32px;background-color:#ffffff;"
      class="padding-mobile">
    <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;
              font-size:16px;line-height:26px;color:#374151;"
       class="email-body-text body-text">
      Hi {{first_name}},
    </p>
    <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;
              font-size:16px;line-height:26px;color:#374151;"
       class="email-body-text body-text">
      {{body_paragraph_1}}
    </p>
    <!-- Repeat <p> blocks as needed. Never write walls of text. -->
  </td>
</tr>
```

---

## 6. CTA Button (Bulletproof — Works in All Clients)

This pattern renders correctly in Gmail, Apple Mail, AND Outlook (via VML).

```html
<!-- CTA BUTTON ROW -->
<tr>
  <td align="center" style="padding:16px 40px 40px;" class="padding-mobile btn-full">

    <!-- VML Button for Outlook -->
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                 xmlns:w="urn:schemas-microsoft-com:office:word"
                 href="{{cta_url}}"
                 style="height:52px;v-text-anchor:middle;width:220px;"
                 arcsize="8%" strokecolor="#{{brand_color}}" fillcolor="#{{brand_color}}">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;
                     font-size:16px;font-weight:700;">
        {{cta_label}}
      </center>
    </v:roundrect>
    <![endif]-->

    <!-- Standard Button (hidden from Outlook via mso-hide) -->
    <!--[if !mso]><!-->
    <a href="{{cta_url}}" target="_blank"
       style="background-color:#{{brand_color}};border-radius:6px;
              color:#ffffff;display:inline-block;
              font-family:Arial,Helvetica,sans-serif;font-size:16px;
              font-weight:700;line-height:52px;text-align:center;
              text-decoration:none;width:220px;-webkit-text-size-adjust:none;
              mso-hide:all;">
      {{cta_label}}
    </a>
    <!--<![endif]-->

  </td>
</tr>
```

---

## 7. Divider Component

```html
<tr>
  <td style="padding:0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="border-top:1px solid #e8e8e8;" class="email-divider">&nbsp;</td>
      </tr>
    </table>
  </td>
</tr>
```

---

## 8. Image Component

Every image must have:
- Explicit `width` and `height` attributes (prevents layout shift)
- Descriptive `alt` text (accessibility + images-blocked fallback)
- `display:block` (removes phantom whitespace gap below images)
- `max-width:100%` for fluid mobile scaling

```html
<tr>
  <td align="center" style="padding:24px 40px;" class="padding-mobile">
    <img src="{{image_url}}"
         alt="{{image_alt_text}}"
         width="520" height="260"
         style="display:block;max-width:100%;height:auto;border-radius:8px;">
  </td>
</tr>
```

---

## 9. Legal Footer (Marketing Emails — Required)

```html
<!-- LEGAL FOOTER -->
<tr>
  <td style="padding:32px 40px;background-color:#f9fafb;
             border-top:1px solid #e8e8e8;" class="padding-mobile">
    <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;
              font-size:13px;line-height:20px;color:#6b7280;text-align:center;"
       class="footer-text">
      You're receiving this email because you signed up for {{company_name}}.
    </p>
    <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;
              font-size:13px;line-height:20px;color:#6b7280;text-align:center;"
       class="footer-text">
      {{company_name}} &bull; {{company_address}}
    </p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
              font-size:13px;line-height:20px;text-align:center;">
      <a href="{{privacy_policy_url}}" target="_blank"
         style="color:#6b7280;text-decoration:underline;" class="footer-link">
        Privacy Policy
      </a>
      &nbsp;&bull;&nbsp;
      <a href="{{unsubscribe_url}}" target="_blank"
         style="color:#6b7280;text-decoration:underline;" class="footer-link">
        Unsubscribe
      </a>
    </p>
  </td>
</tr>
```

---

## 10. Transactional Footer (Non-Marketing Emails)

```html
<!-- TRANSACTIONAL FOOTER -->
<tr>
  <td style="padding:24px 40px;background-color:#f9fafb;
             border-top:1px solid #e8e8e8;" class="padding-mobile">
    <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;
              font-size:13px;line-height:20px;color:#6b7280;text-align:center;"
       class="footer-text">
      This is an automated message from {{company_name}}. Please do not reply directly.
    </p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
              font-size:13px;line-height:20px;color:#6b7280;text-align:center;"
       class="footer-text">
      Need help?
      <a href="mailto:{{support_email}}" style="color:#6b7280;text-decoration:underline;"
         class="footer-link">Contact Support</a>
      &nbsp;&bull;&nbsp;
      <a href="{{privacy_policy_url}}" target="_blank"
         style="color:#6b7280;text-decoration:underline;" class="footer-link">
        Privacy Policy
      </a>
    </p>
  </td>
</tr>
```

---

## 11. Two-Column Layout (Retention / Feature Announcement)

```html
<!-- TWO-COLUMN FEATURE BLOCK -->
<tr>
  <td style="padding:24px 40px;" class="padding-mobile">
    <!--[if mso]>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td width="240" valign="top">
    <![endif]-->
    <div style="display:inline-block;width:100%;max-width:240px;
                vertical-align:top;" class="stack-on-mobile">
      <!-- Left column content -->
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                font-size:16px;line-height:24px;color:#374151;"
         class="email-body-text">
        {{feature_1_description}}
      </p>
    </div>
    <!--[if mso]></td><td width="40">&nbsp;</td><td width="240" valign="top"><![endif]-->
    <div style="display:inline-block;width:100%;max-width:240px;
                vertical-align:top;" class="stack-on-mobile">
      <!-- Right column content -->
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                font-size:16px;line-height:24px;color:#374151;"
         class="email-body-text">
        {{feature_2_description}}
      </p>
    </div>
    <!--[if mso]></td></tr></table><![endif]-->
  </td>
</tr>
```

---

## 12. Key CSS Rules (Always Inline on <td> and <p> Tags)

| Property | Value | Reason |
|---|---|---|
| `font-family` | `Arial, Helvetica, sans-serif` | Web-safe fallback |
| `font-size` (body) | `16px` | Minimum readable size |
| `line-height` (body) | `26px` | 1.5x–1.625x for readability |
| `color` (body text) | `#374151` | High contrast on white |
| `color` (secondary) | `#6b7280` | Meets 4.5:1 on white |
| `text-decoration` (links) | `underline` | Accessibility |
| `border:0` | On all `<img>` | Removes Outlook border |
| `display:block` | On all `<img>` | Removes whitespace gap |
| `mso-table-lspace:0pt` | On `<table>` | Removes Outlook cell spacing |

---

## 13. What NOT to Do

- **NO** `position:absolute/relative/fixed`
- **NO** `display:flex` or `display:grid`
- **NO** JavaScript of any kind
- **NO** `<form>` elements
- **NO** `<video>` (use animated GIF with `<img>` instead)
- **NO** external stylesheet links
- **NO** `@import` in CSS
- **NO** transparent PNG logos (use solid-background logos for dark mode safety)
- **NO** images wider than 600px
- **NO** font sizes smaller than 13px
