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

// ── Rate limiter: max 10 reports per IP per 15 minutes ────────────────────────
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reports submitted. Please try again later.' },
});

const createTransporter = () =>
  nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

// ── Owner notification email ──────────────────────────────────────────────────
const buildOwnerNotificationHtml = ({ reporterName, reporterEmail, repoName, threadTitle, messageContent, reportedAt }) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#ef4444,#b91c1c);padding:28px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;letter-spacing:3px;color:#fecaca;text-transform:uppercase;font-weight:600;">Cyberspace-X 2.0 · Tron AI</p>
            <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">⚑ Flagged Response Report</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;">A user has flagged a Tron AI response for review.</p>

            <!-- Reporter details -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                  <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Reporter</span>
                  <p style="margin:4px 0 0;font-size:15px;color:#e0e0ff;font-weight:600;">${reporterName}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                  <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Email</span>
                  <p style="margin:4px 0 0;font-size:15px;color:#a5b4fc;">${reporterEmail}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                  <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Repository</span>
                  <p style="margin:4px 0 0;font-size:15px;color:#e0e0ff;">${repoName || '—'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #1e1e2e;">
                  <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Conversation</span>
                  <p style="margin:4px 0 0;font-size:15px;color:#e0e0ff;">${threadTitle || 'Unnamed conversation'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;">
                  <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Reported At</span>
                  <p style="margin:4px 0 0;font-size:14px;color:#9ca3af;">${reportedAt}</p>
                </td>
              </tr>
            </table>

            <!-- Flagged message content -->
            <p style="margin:0 0 8px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Flagged Response</p>
            <div style="background:#1a1a2e;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:20px;">
              <p style="margin:0;font-size:13px;color:#d1d5db;line-height:1.7;white-space:pre-wrap;">${messageContent}</p>
            </div>

            <p style="margin:0;color:#6b7280;font-size:12px;">Reply to this email to reach the reporter directly.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
            <p style="margin:0;color:#4b5563;font-size:11px;">© ${new Date().getFullYear()} Cyberspace-X. Tron AI Report System.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`;

// ── User auto-reply email ─────────────────────────────────────────────────────
const buildUserAutoReplyHtml = (reporterName) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;letter-spacing:3px;color:#e0e0ff;text-transform:uppercase;font-weight:600;">Cyberspace-X 2.0 · Tron AI</p>
            <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Thank You for Your Feedback</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 32px;">
            <p style="margin:0 0 6px;font-size:15px;color:#e0e0ff;">Dear <strong>${reporterName}</strong>,</p>
            <p style="margin:0 0 24px;color:#9ca3af;font-size:14px;">Thank you for taking the time to flag this response.</p>

            <!-- Status card -->
            <div style="background:#1a1a2e;border:1px solid #6366f1;border-radius:10px;padding:22px 24px;margin-bottom:28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#a5b4fc;letter-spacing:0.5px;">✦ &nbsp; Report Received &nbsp; ✦</p>
              <p style="margin:0;font-size:14px;color:#d1d5db;line-height:1.7;">
                Our team is currently reviewing the flagged response and will work to resolve the issue as soon as possible. We are committed to continuously improving the quality and accuracy of Tron AI.
              </p>
            </div>

            <p style="margin:0 0 8px;font-size:14px;color:#9ca3af;line-height:1.6;">
              Your feedback is invaluable to us. If you have any additional context or details you'd like to share, please feel free to reply directly to this email.
            </p>

            <p style="margin:20px 0 0;font-size:14px;color:#a5b4fc;font-weight:600;">
              Thank you for using Tron AI. 🤖
            </p>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">
              — The Cyberspace-X Team
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
            <p style="margin:0;color:#4b5563;font-size:11px;">© ${new Date().getFullYear()} Cyberspace-X. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`;

// ── POST /report/flag ─────────────────────────────────────────────────────────
router.post('/flag', reportLimiter, async (req, res) => {
  try {
    const reporterName    = (req.body?.reporterName    || 'Unknown User').toString().trim();
    const reporterEmail   = (req.body?.reporterEmail   || '').toString().trim().toLowerCase();
    const repoName        = (req.body?.repoName        || '').toString().trim();
    const threadTitle     = (req.body?.threadTitle     || '').toString().trim();
    const messageContent  = (req.body?.messageContent  || '').toString().trim();

    if (!messageContent) {
      return res.status(400).json({ error: 'Flagged message content is required.' });
    }

    if (!SMTP_USER || !SMTP_PASS) {
      console.error('[report] SMTP credentials not configured.');
      return res.status(500).json({ error: 'Email service is not configured on the server.' });
    }

    const transporter = createTransporter();
    const reportedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    // ── 1. Notify owner immediately ───────────────────────────────────────────
    await transporter.sendMail({
      from: SMTP_FROM || `"Cyberspace-X Tron AI" <${SMTP_USER}>`,
      to: OWNER_EMAIL,
      replyTo: reporterEmail || SMTP_USER,
      subject: `[Tron AI] Flagged Response — ${reporterName} · ${new Date().toLocaleDateString('en-IN')}`,
      text: `Reporter: ${reporterName}\nEmail: ${reporterEmail || 'N/A'}\nRepo: ${repoName || 'N/A'}\nConversation: ${threadTitle || 'N/A'}\nFlagged At: ${reportedAt}\n\n--- Flagged Content ---\n${messageContent}`,
      html: buildOwnerNotificationHtml({ reporterName, reporterEmail: reporterEmail || 'Not provided', repoName, threadTitle, messageContent, reportedAt }),
    });

    console.log(`[report] Flag notification sent to owner for reporter: ${reporterEmail || reporterName}`);

    // ── 2. Send auto-reply to reporter (if email available) ───────────────────
    if (reporterEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail)) {
      // Fire-and-forget — don't block the response
      transporter.sendMail({
        from: SMTP_FROM || `"Cyberspace-X Tron AI" <${SMTP_USER}>`,
        to: reporterEmail,
        subject: `Your report has been received — Cyberspace-X Tron AI`,
        text: `Dear ${reporterName},\n\nThank you for flagging this response. Our team is reviewing the issue and will work to resolve it as soon as possible.\n\nThank you for using Tron AI.\n\n— The Cyberspace-X Team`,
        html: buildUserAutoReplyHtml(reporterName),
      }).then(() => {
        console.log(`[report] Auto-reply sent to: ${reporterEmail}`);
      }).catch((err) => {
        console.error('[report] Auto-reply failed:', err.message);
      });
    }

    return res.status(200).json({ message: 'Report submitted successfully. Thank you for your feedback.' });
  } catch (err) {
    console.error('[report] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Failed to submit report. Please try again.' });
  }
});

module.exports = router;
