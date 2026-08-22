# Base HTML Templates — SaaS Email

This file contains 5 production-ready, copy-paste base templates.
Each template is a complete HTML document. Replace `{{variables}}` and customize content.

---

## BASE-TRANSACTIONAL (Password Reset / Verification / Alert)

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
  <noscript><xml><o:OfficeDocumentSettings>
    <o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
    body{margin:0!important;padding:0!important;width:100%!important;}
    #outlook a{padding:0;}
    @media(prefers-color-scheme:dark){
      body,.email-body-bg{background-color:#1a1a1a!important;}
      .email-wrapper{background-color:#2d2d2d!important;}
      .email-body-text{color:#e0e0e0!important;}
      .email-heading{color:#ffffff!important;}
      .email-subtext{color:#a0a0a0!important;}
      .email-divider{border-color:#444444!important;}
      .footer-text{color:#888888!important;}
      .footer-link{color:#aaaaaa!important;}
      .alert-box{background-color:#3a2a00!important;border-color:#d97706!important;}
      .alert-text{color:#fcd34d!important;}
    }
    @media only screen and(max-width:620px){
      .email-container{width:100%!important;max-width:100%!important;}
      h1{font-size:26px!important;line-height:32px!important;}
      h2{font-size:20px!important;line-height:26px!important;}
      .padding-mobile{padding:24px 20px!important;}
      .btn-mobile{width:100%!important;text-align:center!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;" class="email-body-bg">
  <!-- Preheader -->
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;
              max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    {{preheader_text}}
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0"
         width="100%" style="background-color:#f4f4f5;">
    <tr><td align="center" style="padding:24px 0 40px;">
      <!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td width="600"><![endif]-->
      <table role="presentation" class="email-container" border="0" cellpadding="0"
             cellspacing="0" width="600"
             style="max-width:600px;width:100%;background-color:#ffffff;
                    border-radius:8px;overflow:hidden;" class="email-wrapper">

        <!-- HEADER -->
        <tr>
          <td align="center"
              style="padding:32px 40px 28px;background-color:#ffffff;
                     border-bottom:1px solid #e8e8e8;" class="padding-mobile email-divider">
            <a href="{{product_url}}" target="_blank" style="text-decoration:none;">
              <img src="{{logo_url}}" alt="{{company_name}}" width="130" height="auto"
                   style="display:block;max-width:130px;height:auto;">
            </a>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:40px 40px 32px;" class="padding-mobile">
            <h1 style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;
                       font-size:26px;font-weight:700;line-height:34px;color:#111827;"
                class="email-heading">
              {{email_headline}}
            </h1>
            <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;
                      font-size:16px;line-height:26px;color:#374151;"
               class="email-body-text">
              Hi {{first_name}},
            </p>
            <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;
                      font-size:16px;line-height:26px;color:#374151;"
               class="email-body-text">
              {{body_paragraph_1}}
            </p>

            <!-- CTA BUTTON -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0"
                   width="100%">
              <tr>
                <td align="center" style="padding:8px 0 24px;">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                               xmlns:w="urn:schemas-microsoft-com:office:word"
                               href="{{cta_url}}"
                               style="height:52px;v-text-anchor:middle;width:220px;"
                               arcsize="8%" strokecolor="#6366f1" fillcolor="#6366f1">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;
                                   font-size:16px;font-weight:700;">{{cta_label}}</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <a href="{{cta_url}}" target="_blank"
                     style="background-color:#6366f1;border-radius:6px;color:#ffffff;
                            display:inline-block;font-family:Arial,Helvetica,sans-serif;
                            font-size:16px;font-weight:700;line-height:52px;
                            text-align:center;text-decoration:none;width:220px;
                            -webkit-text-size-adjust:none;mso-hide:all;"
                     class="btn-mobile">
                    {{cta_label}}
                  </a>
                  <!--<![endif]-->
                </td>
              </tr>
            </table>

            <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;
                      font-size:14px;line-height:22px;color:#6b7280;"
               class="email-subtext">
              This link expires in {{expiry_hours}} hours. If you didn't request this,
              please ignore this email or
              <a href="mailto:{{support_email}}"
                 style="color:#6366f1;text-decoration:underline;">contact support</a>.
            </p>

            <!-- SECURITY CONTEXT BOX (Optional — for password reset) -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0"
                   width="100%">
              <tr>
                <td style="background-color:#f9fafb;border-left:4px solid #e8e8e8;
                           border-radius:4px;padding:16px 20px;margin-top:8px;"
                    class="alert-box">
                  <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;
                            font-size:13px;font-weight:700;color:#374151;"
                     class="alert-text">
                    Request details
                  </p>
                  <p style="margin:0;font-family:'Courier New',Courier,monospace;
                            font-size:13px;line-height:20px;color:#6b7280;"
                     class="email-subtext">
                    Time: {{request_time}}<br>
                    Device: {{request_device}}<br>
                    Location: {{request_location}}
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- FOOTER (Transactional — No Unsubscribe Required) -->
        <tr>
          <td style="padding:24px 40px;background-color:#f9fafb;
                     border-top:1px solid #e8e8e8;" class="padding-mobile email-divider">
            <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;
                      font-size:13px;line-height:20px;color:#6b7280;text-align:center;"
               class="footer-text">
              This is an automated security email from {{company_name}}.
              Please do not reply to this message.
            </p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                      font-size:13px;line-height:20px;text-align:center;">
              <a href="mailto:{{support_email}}"
                 style="color:#6b7280;text-decoration:underline;" class="footer-link">
                Contact Support
              </a>
              &nbsp;&bull;&nbsp;
              <a href="{{privacy_policy_url}}" target="_blank"
                 style="color:#6b7280;text-decoration:underline;" class="footer-link">
                Privacy Policy
              </a>
            </p>
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>

  <!--
  PLAIN TEXT FALLBACK:
  Hi {{first_name}},

  {{email_headline}}

  {{body_paragraph_1}}

  {{cta_label}}: {{cta_url}}

  This link expires in {{expiry_hours}} hours.

  ---
  {{company_name}} | {{support_email}}
  {{privacy_policy_url}}
  -->
</body>
</html>
```

---

## BASE-ONBOARDING (Welcome / Feature Spotlight)

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
  <noscript><xml><o:OfficeDocumentSettings>
    <o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
    body{margin:0!important;padding:0!important;width:100%!important;}
    #outlook a{padding:0;}
    @media(prefers-color-scheme:dark){
      body,.email-body-bg{background-color:#1a1a1a!important;}
      .email-wrapper{background-color:#2d2d2d!important;}
      .email-body-text{color:#e0e0e0!important;}
      .email-heading{color:#ffffff!important;}
      .email-subtext{color:#a0a0a0!important;}
      .email-divider{border-color:#444444!important;}
      .footer-text{color:#888888!important;}
      .footer-link{color:#aaaaaa!important;}
      .step-number{background-color:#4f46e5!important;}
    }
    @media only screen and(max-width:620px){
      .email-container{width:100%!important;max-width:100%!important;}
      h1{font-size:26px!important;line-height:32px!important;}
      h2{font-size:20px!important;line-height:26px!important;}
      .padding-mobile{padding:24px 20px!important;}
      .btn-mobile{width:100%!important;text-align:center!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;" class="email-body-bg">
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;
              max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    {{preheader_text}}
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0"
         width="100%" style="background-color:#f4f4f5;">
    <tr><td align="center" style="padding:24px 0 40px;">
      <!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td width="600"><![endif]-->
      <table role="presentation" class="email-container" border="0" cellpadding="0"
             cellspacing="0" width="600"
             style="max-width:600px;width:100%;background-color:#ffffff;" class="email-wrapper">

        <!-- BRANDED HEADER WITH COLOR BAR -->
        <tr>
          <td align="center"
              style="padding:0;background-color:#6366f1;height:6px;font-size:0;line-height:0;">
            &nbsp;
          </td>
        </tr>
        <tr>
          <td align="center"
              style="padding:32px 40px 28px;background-color:#ffffff;
                     border-bottom:1px solid #e8e8e8;" class="padding-mobile email-divider">
            <a href="{{product_url}}" target="_blank" style="text-decoration:none;">
              <img src="{{logo_url}}" alt="{{company_name}}" width="140" height="auto"
                   style="display:block;max-width:140px;height:auto;">
            </a>
          </td>
        </tr>

        <!-- WELCOME HERO -->
        <tr>
          <td style="padding:40px 40px 0;" class="padding-mobile">
            <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;
                       font-size:32px;font-weight:700;line-height:40px;color:#111827;"
                class="email-heading">
              {{email_headline}}
            </h1>
            <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;
                      font-size:16px;line-height:26px;color:#374151;"
               class="email-body-text">
              Hi {{first_name}}, {{body_paragraph_1}}
            </p>
          </td>
        </tr>

        <!-- GETTING STARTED STEPS -->
        <tr>
          <td style="padding:0 40px 32px;" class="padding-mobile">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <!-- Step 1 -->
              <tr>
                <td valign="top" width="40" style="padding:8px 12px 8px 0;">
                  <div style="background-color:#6366f1;border-radius:50%;width:32px;
                              height:32px;line-height:32px;text-align:center;
                              font-family:Arial,Helvetica,sans-serif;font-size:14px;
                              font-weight:700;color:#ffffff;" class="step-number">
                    1
                  </div>
                </td>
                <td valign="top" style="padding:8px 0;">
                  <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;
                            font-size:16px;font-weight:700;line-height:24px;color:#111827;"
                     class="email-heading">
                    {{step_1_title}}
                  </p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                            font-size:14px;line-height:22px;color:#6b7280;"
                     class="email-subtext">
                    {{step_1_description}}
                  </p>
                </td>
              </tr>
              <!-- Step 2 -->
              <tr>
                <td valign="top" width="40" style="padding:8px 12px 8px 0;">
                  <div style="background-color:#6366f1;border-radius:50%;width:32px;
                              height:32px;line-height:32px;text-align:center;
                              font-family:Arial,Helvetica,sans-serif;font-size:14px;
                              font-weight:700;color:#ffffff;" class="step-number">
                    2
                  </div>
                </td>
                <td valign="top" style="padding:8px 0;">
                  <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;
                            font-size:16px;font-weight:700;line-height:24px;color:#111827;"
                     class="email-heading">
                    {{step_2_title}}
                  </p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                            font-size:14px;line-height:22px;color:#6b7280;"
                     class="email-subtext">
                    {{step_2_description}}
                  </p>
                </td>
              </tr>
              <!-- Step 3 -->
              <tr>
                <td valign="top" width="40" style="padding:8px 12px 8px 0;">
                  <div style="background-color:#6366f1;border-radius:50%;width:32px;
                              height:32px;line-height:32px;text-align:center;
                              font-family:Arial,Helvetica,sans-serif;font-size:14px;
                              font-weight:700;color:#ffffff;" class="step-number">
                    3
                  </div>
                </td>
                <td valign="top" style="padding:8px 0;">
                  <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;
                            font-size:16px;font-weight:700;line-height:24px;color:#111827;"
                     class="email-heading">
                    {{step_3_title}}
                  </p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                            font-size:14px;line-height:22px;color:#6b7280;"
                     class="email-subtext">
                    {{step_3_description}}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- DIVIDER -->
        <tr>
          <td style="padding:0 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid #e8e8e8;" class="email-divider">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:32px 40px;" class="padding-mobile">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                         xmlns:w="urn:schemas-microsoft-com:office:word"
                         href="{{cta_url}}"
                         style="height:52px;v-text-anchor:middle;width:240px;"
                         arcsize="8%" strokecolor="#6366f1" fillcolor="#6366f1">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;
                             font-size:16px;font-weight:700;">{{cta_label}}</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="{{cta_url}}" target="_blank"
               style="background-color:#6366f1;border-radius:6px;color:#ffffff;
                      display:inline-block;font-family:Arial,Helvetica,sans-serif;
                      font-size:16px;font-weight:700;line-height:52px;text-align:center;
                      text-decoration:none;width:240px;-webkit-text-size-adjust:none;
                      mso-hide:all;" class="btn-mobile">
              {{cta_label}}
            </a>
            <!--<![endif]-->
            <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;
                      font-size:14px;line-height:22px;color:#6b7280;text-align:center;"
               class="email-subtext">
              Your free trial ends on <strong>{{trial_end_date}}</strong>.
            </p>
          </td>
        </tr>

        <!-- MARKETING FOOTER -->
        <tr>
          <td style="padding:24px 40px;background-color:#f9fafb;
                     border-top:1px solid #e8e8e8;" class="padding-mobile email-divider">
            <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                      line-height:20px;color:#6b7280;text-align:center;" class="footer-text">
              You're receiving this because you signed up for {{company_name}}.
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
            <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                      line-height:18px;color:#9ca3af;text-align:center;" class="footer-text">
              &copy; {{current_year}} {{company_name}}. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>
```

---

## BASE-LIFECYCLE (Trial Expiry / Upgrade / Upsell)

> Note: This template features a prominent urgency banner and benefit-focused layout.
> Swap urgency banner color: amber `#fef3c7` / `#d97706` for warning; red `#fee2e2` / `#dc2626` for danger.

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
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>{{email_subject}}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
    body{margin:0!important;padding:0!important;width:100%!important;}
    @media(prefers-color-scheme:dark){
      body,.email-body-bg{background-color:#1a1a1a!important;}
      .email-wrapper{background-color:#2d2d2d!important;}
      .email-body-text{color:#e0e0e0!important;}
      .email-heading{color:#ffffff!important;}
      .email-subtext{color:#a0a0a0!important;}
      .email-divider{border-color:#444444!important;}
      .footer-text{color:#888888!important;}
      .footer-link{color:#aaaaaa!important;}
      .urgency-banner{background-color:#3a2a00!important;border-color:#d97706!important;}
      .urgency-text{color:#fcd34d!important;}
    }
    @media only screen and(max-width:620px){
      .email-container{width:100%!important;max-width:100%!important;}
      h1{font-size:26px!important;line-height:32px!important;}
      .padding-mobile{padding:24px 20px!important;}
      .btn-mobile{width:100%!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;" class="email-body-bg">
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;
              max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    {{preheader_text}}
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0"
         width="100%" style="background-color:#f4f4f5;">
    <tr><td align="center" style="padding:24px 0 40px;">
      <!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td width="600"><![endif]-->
      <table role="presentation" class="email-container" border="0" cellpadding="0"
             cellspacing="0" width="600"
             style="max-width:600px;width:100%;background-color:#ffffff;" class="email-wrapper">

        <!-- HEADER -->
        <tr>
          <td align="center" style="padding:28px 40px;border-bottom:1px solid #e8e8e8;"
              class="padding-mobile email-divider">
            <a href="{{product_url}}" target="_blank" style="text-decoration:none;">
              <img src="{{logo_url}}" alt="{{company_name}}" width="130" height="auto"
                   style="display:block;max-width:130px;height:auto;">
            </a>
          </td>
        </tr>

        <!-- URGENCY BANNER -->
        <tr>
          <td style="padding:24px 40px 0;" class="padding-mobile">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="background-color:#fef3c7;border-left:4px solid #d97706;
                           border-radius:4px;padding:14px 20px;" class="urgency-banner">
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                            font-size:14px;font-weight:700;line-height:22px;color:#92400e;"
                     class="urgency-text">
                    &#9888; {{urgency_message}}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:32px 40px;" class="padding-mobile">
            <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;
                       font-size:28px;font-weight:700;line-height:36px;color:#111827;"
                class="email-heading">
              {{email_headline}}
            </h1>
            <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;
                      font-size:16px;line-height:26px;color:#374151;"
               class="email-body-text">
              Hi {{first_name}}, {{body_paragraph_1}}
            </p>

            <!-- BENEFITS LIST -->
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="background-color:#f8f9ff;border-radius:8px;padding:24px;">
                  <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;
                            font-size:15px;font-weight:700;color:#111827;" class="email-heading">
                    What you'll unlock:
                  </p>
                  <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;
                            font-size:15px;line-height:24px;color:#374151;" class="email-body-text">
                    &#10003; &nbsp;{{benefit_1}}
                  </p>
                  <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;
                            font-size:15px;line-height:24px;color:#374151;" class="email-body-text">
                    &#10003; &nbsp;{{benefit_2}}
                  </p>
                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                            font-size:15px;line-height:24px;color:#374151;" class="email-body-text">
                    &#10003; &nbsp;{{benefit_3}}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:0 40px 32px;" class="padding-mobile">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                         xmlns:w="urn:schemas-microsoft-com:office:word"
                         href="{{cta_url}}"
                         style="height:52px;v-text-anchor:middle;width:240px;"
                         arcsize="8%" strokecolor="#6366f1" fillcolor="#6366f1">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;
                             font-size:16px;font-weight:700;">{{cta_label}}</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="{{cta_url}}" target="_blank"
               style="background-color:#6366f1;border-radius:6px;color:#ffffff;
                      display:inline-block;font-family:Arial,Helvetica,sans-serif;
                      font-size:16px;font-weight:700;line-height:52px;text-align:center;
                      text-decoration:none;width:240px;-webkit-text-size-adjust:none;
                      mso-hide:all;" class="btn-mobile">
              {{cta_label}}
            </a>
            <!--<![endif]-->
            <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;
                      font-size:13px;line-height:20px;color:#6b7280;text-align:center;"
               class="email-subtext">
              {{cta_subtext}}
            </p>
          </td>
        </tr>

        <!-- MARKETING FOOTER -->
        <tr>
          <td style="padding:24px 40px;background-color:#f9fafb;
                     border-top:1px solid #e8e8e8;" class="padding-mobile email-divider">
            <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                      line-height:20px;color:#6b7280;text-align:center;" class="footer-text">
              You're receiving this because you signed up for {{company_name}}.
            </p>
            <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                      line-height:20px;color:#6b7280;text-align:center;" class="footer-text">
              {{company_name}} &bull; {{company_address}}
            </p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;
                      line-height:20px;text-align:center;">
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
            <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                      line-height:18px;color:#9ca3af;text-align:center;" class="footer-text">
              &copy; {{current_year}} {{company_name}}. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>
```

---

## BASE-RETENTION (Weekly Digest / Newsletter / Feature Update)

> A richer, content-heavy template with a metric summary section and content cards.

Structure: Header → Metrics bar → Feature/content section(s) → CTA → Footer
See `html-coding-rules.md` Section 11 for the two-column content card pattern.

Key customizations from base-transactional:
- Add a metrics row with 2–3 stat boxes after the header
- Use `<h2>` for section headings with a bottom border
- Include a "tip of the week" box using the alert pattern
- Footer must include unsubscribe and physical address

---

## BASE-REENGAGEMENT (Win-back / Inactivity)

> Low-pressure, empathetic design. Minimal imagery. Focus on what they're missing.

Structure: Header → Empathetic opener → "Here's what's new" list → Optional discount code box → CTA → Easy opt-out note → Footer

Key customizations:
- Softer tone — no urgency banner
- Offer to unsubscribe prominently (reduces friction; reduces spam complaints)
- If discount code: use the code box pattern from design-system.md
- Subject line: Never "We miss you" as first word — leads with a value statement

---

## Template Customization Guide

When adapting any base template:

1. **Replace `#6366f1`** with `{{brand_primary_hex}}` throughout (search-replace)
2. **Replace logo** `src` with your actual logo CDN URL
3. **Add/remove step rows** in onboarding based on actual onboarding flow
4. **Adjust `width` attributes** if your logo is wider or narrower than 130px
5. **Change body background** `#f4f4f5` to match brand outer background if needed
6. **Dark mode colors**: Update the `@media (prefers-color-scheme: dark)` block if brand colors change
7. **Always keep VML button color** in sync with the non-MSO button background color
