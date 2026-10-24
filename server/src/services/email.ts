import { config } from "../config.js";

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Recent messages, kept in memory outside production so tests and dev can read codes. */
export const outbox: Email[] = [];

let warned = false;

export async function sendEmail(msg: Email): Promise<void> {
  // Roster students without an email get a placeholder address that can't receive mail.
  if (msg.to.endsWith(".invalid")) return;

  if (!config.isProd) {
    outbox.push(msg);
    if (outbox.length > 50) outbox.shift();
  }

  if (!config.resendApiKey) {
    if (!config.isProd && !config.isTest) {
      console.log(`\n[wheelie] email to ${msg.to}\n  Subject: ${msg.subject}\n  ${msg.text.replace(/\n/g, "\n  ")}\n`);
    } else if (config.isProd && !warned) {
      warned = true;
      console.warn("[wheelie] email not sent: RESEND_API_KEY is not set.");
    }
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.emailFrom, to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) console.error(`[wheelie] email failed (${res.status})`);
  } catch (e: any) {
    console.error("[wheelie] email failed:", e?.message ?? e);
  }
}
