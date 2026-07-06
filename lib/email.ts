// Thin wrapper around Resend (https://resend.com — free tier: 3,000
// emails/month, 100/day, no cost). Every send is logged to email_log
// so managers have the same visibility the old "Outbox" tab gave them.
//
// Requires RESEND_API_KEY and EMAIL_FROM in env vars. If RESEND_API_KEY
// isn't set, sends are skipped but still logged with status
// 'skipped_no_api_key' so nothing throws in local/dev without a key.

import { Resend } from "resend";

let resendClient: Resend | null = null;
function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

export async function sendEmail({
  supabaseAdmin,
  to,
  subject,
  html,
}: {
  supabaseAdmin: any;
  to: string;
  subject: string;
  html: string;
}) {
  const resend = getResend();
  let status = "sent";
  let errorMessage: string | null = null;

  if (!resend) {
    status = "skipped_no_api_key";
  } else {
    try {
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || "Club Tennis <onboarding@resend.dev>",
        to,
        subject,
        html,
      });
      if (error) {
        status = "failed";
        errorMessage = error.message;
      }
    } catch (err: any) {
      status = "failed";
      errorMessage = err?.message ?? "unknown error";
    }
  }

  await supabaseAdmin.from("email_log").insert({
    recipient: to,
    subject,
    body: html,
    status: errorMessage ? `${status}: ${errorMessage}` : status,
  });

  return { status, errorMessage };
}

export function matchProposedEmail({
  firstName,
  matchDate,
  timeSlot,
  courtName,
  teammates,
  acceptUrl,
}: {
  firstName: string;
  matchDate: string;
  timeSlot: string;
  courtName: string;
  teammates: string[];
  acceptUrl: string;
}) {
  return {
    subject: `New match proposed: ${matchDate}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>You've been proposed for a match:</p>
      <ul>
        <li><strong>Date:</strong> ${matchDate}</li>
        <li><strong>Time:</strong> ${timeSlot}</li>
        <li><strong>Court:</strong> ${courtName}</li>
        <li><strong>Playing with:</strong> ${teammates.join(", ")}</li>
      </ul>
      <p>Please accept or decline as soon as you can — the match will
      auto-cancel if everyone hasn't accepted in time.</p>
      <p><a href="${acceptUrl}">Respond to this match</a></p>
    `,
  };
}

export function matchNudgeEmail({
  firstName,
  matchDate,
  timeSlot,
  acceptUrl,
}: {
  firstName: string;
  matchDate: string;
  timeSlot: string;
  acceptUrl: string;
}) {
  return {
    subject: `Reminder: respond to your ${matchDate} match`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Just a reminder — you still have a proposed match on
      <strong>${matchDate}</strong> (${timeSlot}) waiting on your response.
      It will be automatically cancelled if you don't respond in time.</p>
      <p><a href="${acceptUrl}">Respond now</a></p>
    `,
  };
}

export function matchCancelledEmail({
  firstName,
  matchDate,
  timeSlot,
  reason,
}: {
  firstName: string;
  matchDate: string;
  timeSlot: string;
  reason: string;
}) {
  return {
    subject: `Match cancelled: ${matchDate}`,
    html: `
      <p>Hi ${firstName},</p>
      <p>Your match on <strong>${matchDate}</strong> (${timeSlot}) has been
      cancelled. Reason: ${reason}</p>
      <p>Check your availability and matches page for updates.</p>
    `,
  };
}
