'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// ── Environment ───────────────────────────────────────────────────────────────
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  JWT_SECRET,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;

// ── Supabase Admin client (service role — bypasses RLS) ───────────────────────
const getAdminClient = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

// ── Nodemailer transporter ────────────────────────────────────────────────────
const createTransporter = () =>
  nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(SMTP_PORT || '587', 10),
    secure: SMTP_SECURE === 'true', // true for port 465, false for 587 STARTTLS
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

// ── Rate limiters ─────────────────────────────────────────────────────────────
// send-otp: max 3 sends per email per 10 minutes
const sendOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => (req.body?.email || req.ip).toLowerCase(),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests. Please wait before requesting a new code.' },
});

// verify-otp: max 10 attempts per IP per 15 minutes (attempt tracking is also in DB)
const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again later.' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 3;

/**
 * Generate a cryptographically secure 6-digit OTP string.
 */
const generateOtp = () => {
  // Use crypto.randomInt for uniform distribution without modulo bias
  const otp = crypto.randomInt(100000, 999999);
  return String(otp);
};

/**
 * Constant-time string comparison to prevent timing attacks.
 */
const safeCompare = (a, b) => {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Validate that a string is a plausible email address.
 */
const isValidEmail = (email) =>
  typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/**
 * Derive a username slug from name / email / userId (matches frontend logic).
 */
const deriveUsername = ({ userId, fullName, email }) => {
  const slugify = (s) =>
    (s || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  return (
    slugify(fullName) ||
    slugify((email || '').split('@')[0]) ||
    `user-${userId.slice(0, 6).toLowerCase()}`
  );
};

/**
 * Build a branded HTML email for the OTP.
 */
const buildOtpEmailHtml = (otp) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Cyberspace-X OTP</title>
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
              <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">One-Time Passcode</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;text-align:center;">
              <p style="margin:0 0 8px;color:#9ca3af;font-size:14px;">Use the code below to sign in to your account.</p>
              <p style="margin:0 0 28px;color:#6b7280;font-size:12px;">This code expires in <strong style="color:#a78bfa;">${OTP_EXPIRY_MINUTES} minutes</strong> and can only be used once.</p>

              <!-- OTP box -->
              <div style="display:inline-block;background:#1a1a2e;border:2px solid #6366f1;border-radius:10px;padding:18px 36px;margin-bottom:28px;">
                <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:#a5b4fc;font-family:'Courier New',monospace;">${otp}</span>
              </div>

              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">If you did not request this code, you can safely ignore this email.</p>
              <p style="margin:0;color:#6b7280;font-size:12px;">Do <strong>not</strong> share this code with anyone.</p>
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

// ── POST /auth/send-otp ───────────────────────────────────────────────────────
router.post('/send-otp', sendOtpLimiter, async (req, res) => {
  try {
    const rawEmail = (req.body?.email || '').toString().trim().toLowerCase();

    if (!isValidEmail(rawEmail)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    if (!SMTP_USER || !SMTP_PASS) {
      console.error('[send-otp] SMTP credentials are not configured.');
      return res.status(500).json({ error: 'Email service is not configured on the server.' });
    }

    const supabase = getAdminClient();
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    // Upsert — if the email already has a pending OTP, overwrite it
    const { error: dbError } = await supabase.from('otp_tokens').upsert(
      {
        email: rawEmail,
        otp,
        expires_at: expiresAt,
        attempts: 0,
      },
      { onConflict: 'email' },
    );

    if (dbError) {
      console.error('[send-otp] DB upsert error:', dbError.message);
      return res.status(500).json({ error: 'Failed to store OTP. Please try again.' });
    }

    // Send email
    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
      to: rawEmail,
      subject: `Your Cyberspace-X sign-in code: ${otp}`,
      text: `Your one-time passcode is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this, please ignore this email.`,
      html: buildOtpEmailHtml(otp),
    });

    console.log(`[send-otp] OTP sent to ${rawEmail}`);
    return res.status(200).json({ message: 'OTP sent. Check your inbox.' });
  } catch (err) {
    console.error('[send-otp] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// ── POST /auth/verify-otp ─────────────────────────────────────────────────────
router.post('/verify-otp', verifyOtpLimiter, async (req, res) => {
  try {
    const rawEmail = (req.body?.email || '').toString().trim().toLowerCase();
    const submittedOtp = (req.body?.otp || '').toString().trim();

    if (!isValidEmail(rawEmail)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    if (!/^\d{6}$/.test(submittedOtp)) {
      return res.status(400).json({ error: 'OTP must be a 6-digit number.' });
    }

    if (!JWT_SECRET) {
      console.error('[verify-otp] JWT_SECRET is not configured.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const supabase = getAdminClient();

    // Fetch OTP record
    const { data: record, error: fetchError } = await supabase
      .from('otp_tokens')
      .select('otp, expires_at, attempts')
      .eq('email', rawEmail)
      .maybeSingle();

    if (fetchError) {
      console.error('[verify-otp] DB fetch error:', fetchError.message);
      return res.status(500).json({ error: 'Verification failed. Please try again.' });
    }

    if (!record) {
      return res.status(400).json({
        error: 'No OTP found for this email. Please request a new one.',
      });
    }

    // Check max attempts (guard before incrementing)
    if (record.attempts >= MAX_ATTEMPTS) {
      // Clean up the exhausted record
      await supabase.from('otp_tokens').delete().eq('email', rawEmail);
      return res.status(429).json({
        error: `Maximum attempts reached (${MAX_ATTEMPTS}). Please request a new OTP.`,
        code: 'MAX_ATTEMPTS_REACHED',
      });
    }

    // Increment attempts immediately
    await supabase
      .from('otp_tokens')
      .update({ attempts: record.attempts + 1 })
      .eq('email', rawEmail);

    // Check expiry
    if (new Date() > new Date(record.expires_at)) {
      await supabase.from('otp_tokens').delete().eq('email', rawEmail);
      return res.status(400).json({
        error: 'OTP has expired. Please request a new one.',
        code: 'OTP_EXPIRED',
      });
    }

    // Verify OTP (constant-time)
    if (!safeCompare(submittedOtp, record.otp)) {
      const remaining = MAX_ATTEMPTS - (record.attempts + 1);
      return res.status(400).json({
        error: `Incorrect OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        code: 'INVALID_OTP',
        attemptsRemaining: remaining,
      });
    }

    // ── OTP is valid — delete record immediately (one-time use) ──────────────
    await supabase.from('otp_tokens').delete().eq('email', rawEmail);

    // ── Fetch or create user via Supabase Admin API ───────────────────────────
    let userId;
    let userEmail = rawEmail;
    let fullName = '';
    let username = '';

    // Try to find an existing user with this email
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('[verify-otp] listUsers error:', listError.message);
      return res.status(500).json({ error: 'Failed to look up user account.' });
    }

    const existingUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === rawEmail,
    );

    if (existingUser) {
      userId = existingUser.id;
      userEmail = existingUser.email || rawEmail;
      fullName =
        (existingUser.user_metadata?.full_name) ||
        (existingUser.user_metadata?.name) ||
        '';
    } else {
      // Create new user (no password — OTP-only account)
      const { data: createData, error: createError } =
        await supabase.auth.admin.createUser({
          email: rawEmail,
          email_confirm: true, // mark email as confirmed immediately
          user_metadata: { full_name: '', signup_method: 'otp' },
        });

      if (createError) {
        console.error('[verify-otp] createUser error:', createError.message);
        return res.status(500).json({ error: 'Failed to create user account.' });
      }

      userId = createData.user.id;
      userEmail = createData.user.email || rawEmail;
    }

    // Resolve username from user_profiles table (same pattern as authApi.ts)
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle();

    username =
      profileData?.username ||
      deriveUsername({ userId, fullName, email: userEmail });

    // ── Issue custom JWT (kept for API calls that need it) ────────────────────
    const token = jwt.sign(
      { user_id: userId, email: userEmail },
      JWT_SECRET,
      { expiresIn: '7d', issuer: 'cyberspace-x', audience: 'cyberspace-x-client' },
    );

    // ── Generate a Supabase magic-link token so the frontend can create a real
    //    Supabase session via supabase.auth.verifyOtp({ token_hash, type })
    //    This is what allows supabase.auth.getUser() / getSession() to work. ──
    let supabaseTokenHash = null;
    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: userEmail,
        options: { shouldCreateUser: false },
      });
      if (linkError) {
        console.warn('[verify-otp] generateLink warning:', linkError.message);
      } else {
        supabaseTokenHash = linkData?.properties?.hashed_token ?? null;
      }
    } catch (linkErr) {
      // Non-fatal: the custom JWT is still returned; session just won't be Supabase-native
      console.warn('[verify-otp] generateLink threw:', linkErr.message);
    }

    console.log(`[verify-otp] Authenticated user ${userEmail} (${userId})`);

    return res.status(200).json({
      token,
      supabase_token_hash: supabaseTokenHash,
      user: {
        id: userId,
        email: userEmail,
        name: fullName,
        username,
      },
    });
  } catch (err) {
    console.error('[verify-otp] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

module.exports = router;
