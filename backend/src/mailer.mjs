// mailer.mjs — Real SMTP sending via nodemailer for beneficiary notices and outreach.
// docker-compose ships Mailpit (a real SMTP server: :1025 SMTP, :8025 web inbox) so the
// local demo sends genuine SMTP traffic. Without SMTP_HOST, sends are recorded, not lost.

import nodemailer from 'nodemailer';

let transporter = null;

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

function getTransporter() {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 1025),
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendNoticeMail({ to, subject, text }) {
  const client = getTransporter();
  if (!client) {
    return { delivered: false, mode: 'recorded', detail: 'SMTP not configured (set SMTP_HOST; docker-compose Mailpit provides a real local server on :1025, web inbox :8025)' };
  }
  const info = await client.sendMail({ from: process.env.SMTP_FROM || 'notices@renewalcare.example', to, subject, text });
  return { delivered: true, mode: `smtp://${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 1025}`, messageId: info.messageId, accepted: info.accepted };
}

export function smtpStatus() {
  return { configured: smtpConfigured(), host: process.env.SMTP_HOST || null, port: Number(process.env.SMTP_PORT || 1025), from: process.env.SMTP_FROM || 'notices@renewalcare.example' };
}
