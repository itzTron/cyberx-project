'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const router = express.Router();
const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

const followLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many follow actions. Please slow down.' },
});

const createTransporter = () =>
  nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

const buildFollowEmailHtml = (followerName, followerUsername, targetName) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;letter-spacing:3px;color:#e0e0ff;text-transform:uppercase;font-weight:600;">Cyberspace-X 2.0</p>
            <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">New Follower ✦</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px;text-align:center;">
            <p style="margin:0 0 6px;font-size:15px;color:#e0e0ff;">Hi <strong>${targetName}</strong>,</p>
            <p style="margin:0 0 24px;color:#9ca3af;font-size:14px;">Someone just followed your profile on Cyberspace-X.</p>
            <div style="background:#1a1a2e;border:2px solid #6366f1;border-radius:10px;padding:20px 32px;margin-bottom:24px;display:inline-block;">
              <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#a5b4fc;">@${followerUsername}</p>
              <p style="margin:0;font-size:14px;color:#9ca3af;">${followerName} is now following you.</p>
            </div>
            <p style="margin:0;color:#6b7280;font-size:13px;">Visit their profile on Cyberspace-X to follow back.</p>
          </td>
        </tr>
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

// POST /follow/notify — called after a follow insert on the client
router.post('/notify', followLimiter, async (req, res) => {
  try {
    const followerName     = (req.body?.followerName     || 'Someone').toString().trim();
    const followerUsername = (req.body?.followerUsername || 'user').toString().trim();
    const targetName       = (req.body?.targetName       || 'there').toString().trim();
    const targetEmail      = (req.body?.targetEmail      || '').toString().trim().toLowerCase();

    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(400).json({ error: 'Valid target email is required.' });
    }
    if (!SMTP_USER || !SMTP_PASS) {
      return res.status(500).json({ error: 'Email service not configured.' });
    }

    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
      to: targetEmail,
      subject: `@${followerUsername} started following you — Cyberspace-X`,
      text: `Hi ${targetName},\n\n${followerName} (@${followerUsername}) just started following you on Cyberspace-X.\n\nVisit their profile to follow back!\n\n— Cyberspace-X`,
      html: buildFollowEmailHtml(followerName, followerUsername, targetName),
    });

    console.log(`[follow] Notification sent to ${targetEmail} from @${followerUsername}`);
    return res.status(200).json({ message: 'Follow notification sent.' });
  } catch (err) {
    console.error('[follow] Error:', err.message);
    return res.status(500).json({ error: 'Failed to send follow notification.' });
  }
});

module.exports = router;
