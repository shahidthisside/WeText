import { config } from '../config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** In tests, mail is captured here instead of being sent. */
export const outbox: Mail[] = [];

export function mailConfigured() {
  return !!(config.brevoApiKey && config.mailFrom);
}

/**
 * Sends one transactional email through Brevo's HTTP API (free plan: 300 a day).
 * Never throws: callers must not reveal to users whether an email was sent.
 * Without credentials the message is printed to the server log (handy in development).
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (config.isTest) {
    outbox.push(mail);
    return true;
  }
  if (!mailConfigured()) {
    console.log(`\n[mail] Email is not configured, so this message was not sent.\n  To: ${mail.to}\n  Subject: ${mail.subject}\n  ${mail.text.replace(/\n/g, '\n  ')}\n`);
    return false;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.brevoApiKey!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: config.mailFromName, email: config.mailFrom },
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[mail] Brevo rejected the message (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mail] failed to send', err instanceof Error ? err.message : err);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function passwordResetMail(to: string, name: string, link: string): Mail {
  const minutes = Math.round(config.passwordResetTtlMs / 60000);
  return {
    to,
    subject: 'Reset your WeText password',
    text: `Hi ${name},\n\nSomeone asked to reset the password for your WeText account. Open this link to choose a new one (it works for ${minutes} minutes):\n\n${link}\n\nIf this wasn't you, ignore this email. Your password stays the same.\n\n— WeText`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1c1915">
<h2 style="margin:0 0 12px">Reset your password</h2>
<p>Hi ${esc(name)}, someone asked to reset the password for your WeText account.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#f05a2d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">Choose a new password</a></p>
<p style="color:#6b655c;font-size:14px">The link works for ${minutes} minutes. If this wasn't you, ignore this email and your password stays the same.</p>
</div>`,
  };
}
