'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const router = express.Router();

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;

const OWNER_EMAIL = 'tanmoyn681@gmail.com';

// ── Rate limiter: max 3 contact submissions per IP per 15 minutes ─────────────
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages sent. Please wait before trying again.' },
});

// ── Nodemailer transporter ────────────────────────────────────────────────────
const createTransporter = () =>
  nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

// ── Branded HTML builder ──────────────────────────────────────────────────────
const buildNotificationHtml = ({ name, email, purpose, message }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Contact — Cyberspace-X</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;color:#e0e0ff;text-transform:uppercase;font-weight:600;">Cyberspace-X 2.0</p>
              <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">New Contact Message</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;">You received a new message through the Cyberspace-X contact form.</p>

              <!-- Sender details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                    <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">From</span>
                    <p style="margin:4px 0 0;font-size:15px;color:#e0e0ff;font-weight:600;">${name}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                    <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Email</span>
                    <p style="margin:4px 0 0;font-size:15px;color:#a5b4fc;">${email}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                    <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Purpose</span>
                    <p style="margin:4px 0 0;font-size:15px;color:#e0e0ff;font-weight:600;text-transform:capitalize;">${purpose || 'Not specified'}</p>
                  </td>
                </tr>
              </table>

              <!-- Message box -->
              <div style="background:#1a1a2e;border:1px solid #6366f1;border-radius:10px;padding:18px 22px;margin-bottom:20px;">
                <p style="margin:0 0 8px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Message</p>
                <p style="margin:0;font-size:14px;color:#d1d5db;line-height:1.6;white-space:pre-wrap;">${message}</p>
              </div>

              <p style="margin:0;color:#6b7280;font-size:12px;">Reply directly to this email to respond to ${name}.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
              <p style="margin:0;color:#4b5563;font-size:11px;">© ${new Date().getFullYear()} Cyberspace-X. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const buildAutoReplyHtml = (name) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>We Got Your Message — Cyberspace-X</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;color:#e0e0ff;text-transform:uppercase;font-weight:600;">Cyberspace-X 2.0</p>
              <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Message Received</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;text-align:center;">
              <p style="margin:0 0 8px;color:#9ca3af;font-size:14px;">Hi <strong style="color:#e0e0ff;">${name}</strong>,</p>
              <p style="margin:0 0 28px;color:#6b7280;font-size:13px;">Thank you for reaching out to us.</p>

              <!-- Status box -->
              <div style="display:inline-block;background:#1a1a2e;border:2px solid #6366f1;border-radius:10px;padding:18px 36px;margin-bottom:28px;">
                <span style="font-size:13px;font-weight:600;letter-spacing:1px;color:#a5b4fc;">✦ &nbsp; Our team has received your message &nbsp; ✦</span>
              </div>

              <p style="margin:0 0 8px;color:#9ca3af;font-size:14px;line-height:1.6;">
                We are currently reviewing your enquiry and working on it. Our team will get back to you as soon as possible — usually within <strong style="color:#a78bfa;">24 hours</strong>.
              </p>
              <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">If your matter is urgent, please reply directly to this email.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
              <p style="margin:0;color:#4b5563;font-size:11px;">© ${new Date().getFullYear()} Cyberspace-X. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ── POST /contact/send ────────────────────────────────────────────────────────
router.post('/send', contactLimiter, async (req, res) => {
  try {
    const name = (req.body?.name || '').toString().trim();
    const email = (req.body?.email || '').toString().trim().toLowerCase();
    const purpose = (req.body?.purpose || '').toString().trim();
    const message = (req.body?.message || '').toString().trim();

    // Basic validation
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    if (!SMTP_USER || !SMTP_PASS) {
      console.error('[contact] SMTP credentials not configured.');
      return res.status(500).json({ error: 'Email service is not configured on the server.' });
    }

    const transporter = createTransporter();
    const purposeLabel = purpose
      ? purpose.charAt(0).toUpperCase() + purpose.slice(1).replace(/-/g, ' ')
      : 'Not specified';

    // ── 1. Notify owner ───────────────────────────────────────────────────────
    await transporter.sendMail({
      from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
      to: OWNER_EMAIL,
      replyTo: email,
      subject: `[Cyberspace-X] New message from ${name} — ${purposeLabel}`,
      text: `From: ${name} <${email}>\nPurpose: ${purposeLabel}\n\n${message}`,
      html: buildNotificationHtml({ name, email, purpose: purposeLabel, message }),
    });

    console.log(`[contact] Notification sent to owner from ${email}`);

    // ── 2. Schedule auto-reply to sender after 1 minute ───────────────────────
    setTimeout(async () => {
      try {
        await transporter.sendMail({
          from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
          to: email,
          subject: `We received your message — Cyberspace-X`,
          text: `Hi ${name},\n\nThank you for reaching out. Our team has received your message and is working on it. We will get back to you as soon as possible.\n\nCyberspace-X Team`,
          html: buildAutoReplyHtml(name),
        });
        console.log(`[contact] Auto-reply sent to ${email}`);
      } catch (err) {
        console.error('[contact] Auto-reply failed:', err.message);
      }
    }, 60 * 1000); // 1 minute

    return res.status(200).json({ message: 'Your message has been sent. Watch your inbox for a confirmation.' });
  } catch (err) {
    console.error('[contact] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

module.exports = router;
