import { Channel } from '../enums/channel.enum';

/** A code-defined template variant for one channel. */
export interface TemplateVariant {
  subject?: string;
  html?: string;
  text?: string;
}

export type TemplateEntry = Partial<Record<Channel, TemplateVariant>>;

// Brand tokens — keep in sync with the CMS-UI brand.ts palette.
const TEAL = '#1EC9A0';
const NAVY = '#0C1A2E';
const TEAL_BG = '#f0fdfb';
const TEAL_DARK = '#18B490';
const SLATE = '#64748b';
const LIGHT = '#f8fafc';
const BORDER = '#e2e8f0';
const MUTED = '#94a3b8';

// ── Shared layout shells ─────────────────────────────────────────────────────

function emailWrapper(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>ClevScaffold</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-font-smoothing:antialiased;">
<!--[if mso]><center><table width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background-color:#f1f5f9;min-width:100%;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
        style="width:100%;max-width:560px;">

        ${header()}
        ${body}
        ${footer()}

      </table>
    </td>
  </tr>
</table>
<!--[if mso]></td></tr></table></center><![endif]-->
</body>
</html>`;
}

function header(): string {
  return `
        <!-- ── Header ── -->
        <tr>
          <td style="background-color:${NAVY};border-radius:16px 16px 0 0;padding:22px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <span style="font-size:20px;font-weight:800;color:${TEAL};
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                    letter-spacing:-0.5px;text-decoration:none;">
                    ClevScaffold
                  </span>
                </td>
                <td align="right">
                  <span style="font-size:11px;color:${TEAL};opacity:0.65;
                    font-family:Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;">
                    Build faster, ship safer
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Teal accent strip -->
        <tr>
          <td height="3" bgcolor="${TEAL}" style="font-size:0;line-height:0;">&nbsp;</td>
        </tr>`;
}

function footer(): string {
  return `
        <!-- ── Footer ── -->
        <tr>
          <td style="padding:24px 16px 8px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:${MUTED};
              font-family:Arial,sans-serif;line-height:1.5;">
              © ClevScaffold · Build faster, ship safer
            </p>
            <p style="margin:0;font-size:11px;color:#cbd5e1;
              font-family:Arial,sans-serif;line-height:1.5;">
              You're receiving this email because someone used your address on ClevScaffold.
            </p>
          </td>
        </tr>`;
}

function card(content: string): string {
  return `
        <!-- ── Card ── -->
        <tr>
          <td style="background-color:#ffffff;padding:36px 32px 32px;
            border-radius:0 0 16px 16px;
            box-shadow:0 4px 24px rgba(12,26,46,0.07);">
            ${content}
          </td>
        </tr>`;
}

function button(label: string, href: string): string {
  return `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <td style="border-radius:10px;background-color:${TEAL};">
                  <a href="${href}" target="_blank"
                    style="display:inline-block;padding:14px 36px;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                      font-size:15px;font-weight:700;color:#ffffff;
                      text-decoration:none;letter-spacing:-0.2px;
                      border-radius:10px;
                      background-color:${TEAL};
                      mso-padding-alt:14px 36px;">
                    ${label}
                  </a>
                </td>
              </tr>
            </table>`;
}

function dividerOr(): string {
  return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
              style="margin:24px 0;">
              <tr>
                <td style="border-top:1px solid ${BORDER};font-size:0;">&nbsp;</td>
                <td style="padding:0 14px;font-size:12px;color:${MUTED};
                  font-family:Arial,sans-serif;white-space:nowrap;">
                  or
                </td>
                <td style="border-top:1px solid ${BORDER};font-size:0;">&nbsp;</td>
              </tr>
            </table>`;
}

// ── Template registry ────────────────────────────────────────────────────────

/**
 * In-code template defaults. A row in message_templates (key + channel + locale)
 * overrides the matching entry here. Keep text versions clean and short — they're
 * shown in notification previews and SMS fallbacks.
 */
export const TEMPLATE_REGISTRY: Record<string, TemplateEntry> = {
  // ── Email verification ─────────────────────────────────────────────────────
  EMAIL_VERIFICATION: {
    [Channel.EMAIL]: {
      subject: 'Your ClevScaffold verification code: {{code}}',
      html: emailWrapper(
        card(`
            <!-- Icon circle -->
            <div style="text-align:center;margin-bottom:20px;">
              <div style="display:inline-block;width:64px;height:64px;border-radius:50%;
                background-color:${TEAL_BG};border:2px solid ${TEAL};
                text-align:center;line-height:60px;font-size:28px;">
                ✉️
              </div>
            </div>

            <!-- Heading -->
            <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:${NAVY};
              text-align:center;line-height:1.3;
              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
              Confirm your email address
            </h1>

            <!-- Greeting -->
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${SLATE};
              text-align:center;font-family:Arial,sans-serif;">
              Hi{{displayNameComma}} use this code to verify your account.
              It's valid for {{ttlMinutes}} minutes.
            </p>

            <!-- OTP code block -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
              style="margin-bottom:24px;">
              <tr>
                <td style="background-color:${TEAL_BG};border:2px solid ${TEAL};
                  border-radius:14px;padding:28px 16px;text-align:center;">
                  <p style="margin:0 0 8px;font-size:11px;font-weight:700;
                    text-transform:uppercase;letter-spacing:2px;color:${TEAL};
                    font-family:Arial,sans-serif;">
                    Verification code
                  </p>
                  <p style="margin:0;font-size:46px;font-weight:800;
                    letter-spacing:14px;color:${NAVY};
                    font-family:'Courier New',Courier,monospace;
                    line-height:1.2;">
                    {{code}}
                  </p>
                  <p style="margin:10px 0 0;font-size:12px;color:${MUTED};
                    font-family:Arial,sans-serif;">
                    Expires in {{ttlMinutes}} minutes
                  </p>
                </td>
              </tr>
            </table>

            ${dividerOr()}

            <!-- CTA button -->
            <div style="text-align:center;margin-bottom:28px;">
              ${button('Verify my email &rarr;', '{{link}}')}
            </div>

            <!-- Security note -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:${LIGHT};border-radius:10px;
                  padding:14px 16px;border-left:3px solid ${TEAL};">
                  <p style="margin:0;font-size:12px;line-height:1.7;color:${SLATE};
                    font-family:Arial,sans-serif;">
                    🔒 <strong>Security:</strong> ClevScaffold will never ask you for this code via
                    phone, chat, or another email. If you didn't sign up, you can safely ignore
                    this message.
                  </p>
                </td>
              </tr>
            </table>
      `),
      ),
      text: `Your ClevScaffold email verification code is: {{code}}\n\nExpires in {{ttlMinutes}} minutes.\n\nVerify here: {{link}}\n\nIf you didn't create a ClevScaffold account, ignore this email.`,
    },
  },

  // ── Phone OTP ─────────────────────────────────────────────────────────────
  PHONE_OTP: {
    [Channel.SMS]: {
      text: `ClevScaffold: {{code}} is your verification code. Valid for {{ttlMinutes}} min. Don't share this code.`,
    },
  },

  // ── Welcome ───────────────────────────────────────────────────────────────
  WELCOME: {
    [Channel.EMAIL]: {
      subject: 'Welcome to ClevScaffold, {{displayName}}! 🎉',
      html: emailWrapper(
        card(`
            <!-- Hero graphic area -->
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;width:72px;height:72px;border-radius:50%;
                background-color:${NAVY};text-align:center;line-height:72px;font-size:32px;">
                🚀
              </div>
            </div>

            <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:${NAVY};
              text-align:center;
              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
              You're all set{{displayNameComma}}
            </h1>

            <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${SLATE};
              text-align:center;font-family:Arial,sans-serif;">
              Your account is ready. Explore the sample modules — tasks,
              notifications, metrics — and make this project your own.
            </p>

            <!-- Feature highlights -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
              style="margin-bottom:32px;">
              <tr>
                <td style="padding:12px 16px;border-radius:10px;background:${LIGHT};">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="32" valign="top" style="padding-right:12px;font-size:20px;padding-top:2px;">🔐</td>
                      <td>
                        <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:${NAVY};font-family:Arial,sans-serif;">Secure auth built in</p>
                        <p style="margin:0;font-size:13px;color:${SLATE};font-family:Arial,sans-serif;">JWT + rotating refresh tokens</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr><td height="8"></td></tr>
              <tr>
                <td style="padding:12px 16px;border-radius:10px;background:${LIGHT};">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="32" valign="top" style="padding-right:12px;font-size:20px;padding-top:2px;">📨</td>
                      <td>
                        <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:${NAVY};font-family:Arial,sans-serif;">Omnichannel messaging</p>
                        <p style="margin:0;font-size:13px;color:${SLATE};font-family:Arial,sans-serif;">Email, SMS and in-app out of the box</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr><td height="8"></td></tr>
              <tr>
                <td style="padding:12px 16px;border-radius:10px;background:${LIGHT};">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="32" valign="top" style="padding-right:12px;font-size:20px;padding-top:2px;">📈</td>
                      <td>
                        <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:${NAVY};font-family:Arial,sans-serif;">Production observability</p>
                        <p style="margin:0;font-size:13px;color:${SLATE};font-family:Arial,sans-serif;">Audit logs, alerts and Prometheus metrics</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <div style="text-align:center;">
              ${button('Open the app 🚀', '{{link}}')}
            </div>
      `),
      ),
      text: `Welcome to ClevScaffold{{displayNameComma}}\n\nYour account is ready — explore the sample modules and make it your own.\n\nOpen the app: {{link}}`,
    },
  },

  // ── Password reset ────────────────────────────────────────────────────────
  PASSWORD_RESET: {
    [Channel.EMAIL]: {
      subject: 'Reset your ClevScaffold password',
      html: emailWrapper(
        card(`
            <!-- Icon -->
            <div style="text-align:center;margin-bottom:20px;">
              <div style="display:inline-block;width:64px;height:64px;border-radius:50%;
                background-color:#fef2f2;border:2px solid #fca5a5;
                text-align:center;line-height:60px;font-size:28px;">
                🔑
              </div>
            </div>

            <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:${NAVY};
              text-align:center;
              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
              Password reset request
            </h1>

            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${SLATE};
              text-align:center;font-family:Arial,sans-serif;">
              We received a request to reset your password.
              This link expires in <strong>{{expiresInMinutes}} minutes</strong>.
            </p>

            <div style="text-align:center;margin-bottom:28px;">
              ${button('Reset my password', '{{link}}')}
            </div>

            <!-- Warning box -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#fef2f2;border-radius:10px;
                  padding:14px 16px;border-left:3px solid #f87171;">
                  <p style="margin:0;font-size:12px;line-height:1.7;color:#7f1d1d;
                    font-family:Arial,sans-serif;">
                    ⚠️ If you didn't request a password reset, please ignore this email.
                    Your password will not change. If you're concerned about your account
                    security, contact our support team.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Link fallback -->
            <p style="margin:20px 0 0;font-size:12px;color:${MUTED};text-align:center;
              font-family:Arial,sans-serif;line-height:1.6;">
              Can't click the button? Copy and paste this link:<br>
              <span style="color:${TEAL_DARK};word-break:break-all;">{{link}}</span>
            </p>
      `),
      ),
      text: `ClevScaffold password reset\n\nReset your password here (expires in {{expiresInMinutes}} min):\n{{link}}\n\nIf you didn't request this, ignore this email.`,
    },
  },

  // ── Task assigned (demo module) ───────────────────────────────────────────
  TASK_ASSIGNED: {
    [Channel.EMAIL]: {
      subject: '{{assignerName}} assigned you "{{taskTitle}}"',
      html: emailWrapper(
        card(`
            <!-- Icon -->
            <div style="text-align:center;margin-bottom:20px;">
              <div style="display:inline-block;width:64px;height:64px;border-radius:50%;
                background-color:${TEAL_BG};border:2px solid ${TEAL};
                text-align:center;line-height:60px;font-size:28px;">
                🗺️
              </div>
            </div>

            <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:${NAVY};
              text-align:center;
              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
              A task landed on your desk
            </h1>

            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${SLATE};
              text-align:center;font-family:Arial,sans-serif;">
              <strong>{{assignerName}}</strong> has assigned you
            </p>

            <!-- Trip title highlight -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
              style="margin-bottom:28px;">
              <tr>
                <td style="background:linear-gradient(135deg,${NAVY},#1a3055);
                  border-radius:12px;padding:20px 24px;text-align:center;">
                  <p style="margin:0 0 4px;font-size:11px;color:${TEAL};
                    text-transform:uppercase;letter-spacing:1.5px;font-family:Arial,sans-serif;">
                    Task
                  </p>
                  <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                    letter-spacing:-0.3px;">
                    {{taskTitle}}
                  </p>
                </td>
              </tr>
            </table>

            <div style="text-align:center;margin-bottom:28px;">
              ${button('View task &rarr;', '{{link}}')}
            </div>

            <p style="margin:0;font-size:12px;color:${MUTED};text-align:center;
              font-family:Arial,sans-serif;line-height:1.6;">
              You can manage your tasks anytime from the app dashboard.
            </p>
      `),
      ),
      text: `{{assignerName}} assigned you "{{taskTitle}}" on ClevScaffold.\n\nView task: {{link}}`,
    },
    [Channel.IN_APP]: {
      text: `{{assignerName}} assigned you "{{taskTitle}}"`,
    },
  },
};
