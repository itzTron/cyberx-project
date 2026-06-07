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
  FRONTEND_ORIGIN,
} = process.env;

// Derive the frontend base URL (used in email links)
const FRONTEND_BASE = (FRONTEND_ORIGIN || 'http://localhost:8080').replace(/\/$/, '');

const getRequestBase = (req) => {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${protocol}://${host}`.replace(/\/$/, '');
};

const getBearerToken = (req) => {
  const authHeader = req.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }
  return authHeader.slice(7).trim();
};

const getAuthenticatedSessionUser = async (req) => {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    const error = new Error('Missing or malformed Authorization header.');
    error.statusCode = 401;
    throw error;
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) {
    const authError = new Error('Invalid or expired session. Please sign in again.');
    authError.statusCode = 401;
    throw authError;
  }

  return {
    supabase,
    user: data.user,
  };
};

const cleanupAccountArtifacts = async ({
  supabase,
  userId,
  primaryEmail,
  secondaryEmail,
}) => {
  const normalizedPrimaryEmail = (primaryEmail || '').trim().toLowerCase();
  const normalizedSecondaryEmail = (secondaryEmail || '').trim().toLowerCase();
  const secondaryOtpPrefix = `secondary:${userId}:`;

  await Promise.allSettled([
    supabase.from('notifications').delete().eq('from_user_id', userId),
    supabase.from('activity_logs').delete().eq('user_id', userId),
    normalizedPrimaryEmail
      ? supabase.from('activity_logs').delete().eq('email', normalizedPrimaryEmail)
      : Promise.resolve(),
    supabase.from('pending_password_changes').delete().eq('user_id', userId),
    normalizedPrimaryEmail
      ? supabase.from('pending_password_changes').delete().eq('user_email', normalizedPrimaryEmail)
      : Promise.resolve(),
    normalizedPrimaryEmail
      ? supabase.from('otp_tokens').delete().eq('email', normalizedPrimaryEmail)
      : Promise.resolve(),
    normalizedSecondaryEmail
      ? supabase.from('otp_tokens').delete().eq('email', normalizedSecondaryEmail)
      : Promise.resolve(),
    supabase.from('otp_tokens').delete().like('email', `${secondaryOtpPrefix}%`),
  ]);
};


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
const ACCOUNT_ACTION_CONFIRM_EXPIRY_HOURS = 1;

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
 * HTML-encode a string to prevent XSS when interpolating into HTML email templates.
 */
const escapeHtml = (str) => {
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
              <p style="margin:0 0 28px;color:#6b7280;font-size:12px;">This code expires in <strong style="color:#a78bfa;">${escapeHtml(OTP_EXPIRY_MINUTES)} minutes</strong> and can only be used once.</p>

              <!-- OTP box -->
              <div style="display:inline-block;background:#1a1a2e;border:2px solid #6366f1;border-radius:10px;padding:18px 36px;margin-bottom:28px;">
                <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:#a5b4fc;font-family:'Courier New',monospace;">${escapeHtml(otp)}</span>
              </div>

              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">If you did not request this code, you can safely ignore this email.</p>
              <p style="margin:0;color:#6b7280;font-size:12px;">Do <strong>not</strong> share this code with anyone.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
              <p style="margin:0;color:#4b5563;font-size:11px;">© ${escapeHtml(new Date().getFullYear())} Cyberspace-X. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;


// ── Helper: resolve username / secondary-email / primary-email → primary email ─
/**
 * Accepts any of: primary email, username, or secondary email.
 * Returns the resolved primary email string, or throws with a user-friendly message.
 */
const resolveIdentifierToEmail = async (identifier) => {
  const supabase = getAdminClient();
  const id = identifier.trim().toLowerCase();

  // Already looks like an email — could be primary or secondary
  if (isValidEmail(id)) {
    // Check if it matches a primary email directly
    const { data: listData } = await supabase.auth.admin.listUsers();
    const byPrimary = (listData?.users || []).find((u) => u.email?.toLowerCase() === id);
    if (byPrimary) return byPrimary.email.toLowerCase();

    // Otherwise check secondary_email in user_profiles
    const { data: secProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('secondary_email', id)
      .maybeSingle();
    if (secProfile) {
      // Fetch the primary email for this user
      const match = (listData?.users || []).find((u) => u.id === secProfile.id);
      if (match) return match.email.toLowerCase();
    }
    // Unknown email
    return null;
  }

  // Treat as username — look up user_profiles
  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('username', id)
    .maybeSingle();
  if (!profileRow) return null;

  const { data: listData } = await supabase.auth.admin.listUsers();
  const match = (listData?.users || []).find((u) => u.id === profileRow.id);
  return match ? match.email.toLowerCase() : null;
};

// ── POST /auth/send-otp ───────────────────────────────────────────────────────
router.post('/send-otp', sendOtpLimiter, async (req, res) => {
  try {
    const purpose = (req.body?.purpose || 'signin').toString().trim().toLowerCase();
    const isSignupPurpose = purpose === 'signup';
    const rawIdentifier = (req.body?.email || '').toString().trim();

    if (!rawIdentifier) {
      return res.status(400).json({ error: 'Email or username is required.' });
    }

    if (!SMTP_USER || !SMTP_PASS) {
      console.error('[send-otp] SMTP credentials are not configured.');
      return res.status(500).json({ error: 'Email service is not configured on the server.' });
    }

    const supabase = getAdminClient();
    let rawEmail = '';

    if (isSignupPurpose) {
      if (!isValidEmail(rawIdentifier)) {
        return res.status(400).json({ error: 'A valid email address is required.' });
      }

      rawEmail = rawIdentifier.toLowerCase();

      const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        console.error('[send-otp] listUsers error:', listError.message);
        return res.status(500).json({ error: 'Failed to look up account. Please try again.' });
      }

      const existingUser = (listData?.users || []).find(
        (user) => user.email?.toLowerCase() === rawEmail,
      );
      if (existingUser) {
        return res.status(409).json({
          error: 'This email is already registered. Try signing in or use a different email address.',
          code: 'EMAIL_ALREADY_REGISTERED',
        });
      }

      const { data: secondaryProfile, error: secondaryLookupError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('secondary_email', rawEmail)
        .maybeSingle();

      if (secondaryLookupError) {
        console.error('[send-otp] secondary email lookup error:', secondaryLookupError.message);
        return res.status(500).json({ error: 'Failed to look up account. Please try again.' });
      }

      if (secondaryProfile) {
        return res.status(409).json({
          error: 'This email is already linked to another account. Use a different email address.',
          code: 'EMAIL_ALREADY_REGISTERED',
        });
      }
    } else {
      try {
        rawEmail = await resolveIdentifierToEmail(rawIdentifier);
      } catch (resolveErr) {
        console.error('[send-otp] resolve error:', resolveErr.message);
        return res.status(500).json({ error: 'Failed to look up account. Please try again.' });
      }

      if (!rawEmail) {
        return res.status(200).json({ message: 'OTP sent. Check your inbox.' });
      }
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

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

    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
      to: rawEmail,
      subject: isSignupPurpose
        ? `Your Cyberspace-X signup code: ${otp}`
        : `Your Cyberspace-X sign-in code: ${otp}`,
      text: `Your one-time passcode is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this, please ignore this email.`,
      html: buildOtpEmailHtml(otp).replace(
        'Use the code below to sign in to your account.',
        isSignupPurpose
          ? 'Use the code below to verify your email address for your Cyberspace-X signup.'
          : 'Use the code below to sign in to your account.',
      ),
    });

    console.log(`[send-otp] OTP sent to ${rawEmail} (purpose: ${purpose}, requested as: ${rawIdentifier})`);
    return res.status(200).json({ message: 'OTP sent. Check your inbox.' });
  } catch (err) {
    console.error('[send-otp] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// ── POST /auth/verify-otp ─────────────────────────────────────────────────────
router.post('/verify-otp', verifyOtpLimiter, async (req, res) => {
  try {
    const purpose = (req.body?.purpose || 'signin').toString().trim().toLowerCase();
    const isSignupPurpose = purpose === 'signup';
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

    if (isSignupPurpose) {
      return res.status(200).json({
        verified: true,
        email: rawEmail,
        message: 'Email verified successfully.',
      });
    }

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


// ── POST /auth/secondary-email/send-otp ──────────────────────────────────────
// Sends a 6-digit OTP to the requested secondary email address.
// Rate-limited to 3 sends per email per 10 minutes.
router.post('/secondary-email/send-otp', sendOtpLimiter, async (req, res) => {
  try {
    const rawEmail = (req.body?.email || '').toString().trim().toLowerCase();
    const userId   = (req.body?.userId || '').toString().trim();

    if (!isValidEmail(rawEmail)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }
    if (!SMTP_USER || !SMTP_PASS) {
      return res.status(500).json({ error: 'Email service is not configured.' });
    }

    const supabase = getAdminClient();

    // Make sure the requested email is NOT already a primary email on any account
    const { data: listData } = await supabase.auth.admin.listUsers();
    const conflict = (listData?.users || []).find(
      (u) => u.email?.toLowerCase() === rawEmail && u.id !== userId,
    );
    if (conflict) {
      return res.status(409).json({
        error: 'This email is already the primary email of another account.',
        code: 'PRIMARY_EMAIL_CONFLICT',
      });
    }

    const otp       = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
    const otpKey    = `secondary:${userId}:${rawEmail}`;   // namespaced so it won't collide with sign-in OTPs

    const { error: dbError } = await supabase.from('otp_tokens').upsert(
      { email: otpKey, otp, expires_at: expiresAt, attempts: 0 },
      { onConflict: 'email' },
    );
    if (dbError) {
      console.error('[secondary-email/send-otp] DB error:', dbError.message);
      return res.status(500).json({ error: 'Failed to store OTP. Please try again.' });
    }

    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
      to: rawEmail,
      subject: `Verify your secondary email — ${otp}`,
      text: `Your verification code is: ${otp}\n\nExpires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`,
      html: buildOtpEmailHtml(otp).replace(
        'sign in to your account.',
        'verify your secondary email address on Cyberspace-X.',
      ),
    });

    console.log(`[secondary-email/send-otp] OTP sent to ${rawEmail} for user ${userId}`);
    return res.status(200).json({ message: 'Verification code sent. Check your inbox.' });
  } catch (err) {
    console.error('[secondary-email/send-otp] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }
});

// ── POST /auth/secondary-email/verify ────────────────────────────────────────
// Verifies the OTP and saves secondary_email to user_profiles.
router.post('/secondary-email/verify', verifyOtpLimiter, async (req, res) => {
  try {
    const rawEmail = (req.body?.email || '').toString().trim().toLowerCase();
    const userId   = (req.body?.userId || '').toString().trim();
    const otp      = (req.body?.otp || '').toString().trim();

    if (!isValidEmail(rawEmail)) return res.status(400).json({ error: 'Valid email required.' });
    if (!userId)                  return res.status(400).json({ error: 'User ID required.' });
    if (!/^\d{6}$/.test(otp))     return res.status(400).json({ error: 'OTP must be 6 digits.' });

    const supabase = getAdminClient();
    const otpKey   = `secondary:${userId}:${rawEmail}`;

    const { data: record, error: fetchErr } = await supabase
      .from('otp_tokens').select('otp, expires_at, attempts').eq('email', otpKey).maybeSingle();

    if (fetchErr) return res.status(500).json({ error: 'Verification failed. Please try again.' });
    if (!record)  return res.status(400).json({ error: 'No verification code found. Please request a new one.' });

    if (record.attempts >= MAX_ATTEMPTS) {
      await supabase.from('otp_tokens').delete().eq('email', otpKey);
      return res.status(429).json({ error: `Too many attempts. Please request a new code.`, code: 'MAX_ATTEMPTS_REACHED' });
    }

    await supabase.from('otp_tokens').update({ attempts: record.attempts + 1 }).eq('email', otpKey);

    if (new Date() > new Date(record.expires_at)) {
      await supabase.from('otp_tokens').delete().eq('email', otpKey);
      return res.status(400).json({ error: 'Code expired. Please request a new one.', code: 'OTP_EXPIRED' });
    }

    if (!safeCompare(otp, record.otp)) {
      const remaining = MAX_ATTEMPTS - (record.attempts + 1);
      return res.status(400).json({
        error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        code: 'INVALID_OTP', attemptsRemaining: remaining,
      });
    }

    // OTP valid — clean up and write secondary_email to user_profiles
    await supabase.from('otp_tokens').delete().eq('email', otpKey);

    const { error: profileErr } = await supabase
      .from('user_profiles')
      .update({ secondary_email: rawEmail })
      .eq('id', userId);

    if (profileErr) {
      console.error('[secondary-email/verify] profile update error:', profileErr.message, '| code:', profileErr.code);
      return res.status(500).json({
        error: `Verified, but could not save secondary email (${profileErr.message}). Please try again.`,
      });
    }

    console.log(`[secondary-email/verify] Saved secondary email ${rawEmail} for user ${userId}`);
    return res.status(200).json({ message: 'Secondary email verified and saved successfully.' });
  } catch (err) {
    console.error('[secondary-email/verify] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});


// ── POST /auth/resolve-identifier ────────────────────────────────────────────
// Resolves a username / secondary email / primary email to a primary email.
// Used by the frontend password sign-in to support username/secondary-email login.
router.post('/resolve-identifier', async (req, res) => {
  try {
    const identifier = (req.body?.identifier || '').toString().trim();
    if (!identifier) return res.status(400).json({ error: 'Identifier is required.' });

    const email = await resolveIdentifierToEmail(identifier);
    if (!email) {
      // Return null — caller decides the error message
      return res.status(200).json({ email: null });
    }
    return res.status(200).json({ email });
  } catch (err) {
    console.error('[resolve-identifier] error:', err.message);
    return res.status(500).json({ error: 'Failed to resolve identifier.' });
  }
});

// ── POST /auth/change-username ────────────────────────────────────────────────
// Verifies the user's current password, then updates their username.
// Requires: { userId, currentPassword, newUsername }
const changeUsernameLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many username change attempts. Please wait before trying again.' },
});

const verifyCurrentPasswordOrThrow = async ({
  userEmail,
  currentPassword,
  invalidPasswordMessage = 'Incorrect password.',
}) => {
  if (!currentPassword) {
    const missingPasswordError = new Error('Current password is required.');
    missingPasswordError.statusCode = 400;
    throw missingPasswordError;
  }

  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!anonKey) {
    const configError = new Error('Server configuration error (missing anon key).');
    configError.statusCode = 500;
    throw configError;
  }

  const anonClient = createClient(SUPABASE_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: signInErr } = await anonClient.auth.signInWithPassword({
    email: userEmail,
    password: currentPassword,
  });

  if (signInErr) {
    const invalidPasswordError = new Error(invalidPasswordMessage);
    invalidPasswordError.statusCode = 401;
    throw invalidPasswordError;
  }

  await anonClient.auth.signOut().catch(() => {});
};

router.post('/change-username', changeUsernameLimiter, async (req, res) => {
  try {
    const userId       = (req.body?.userId || '').toString().trim();
    const newUsername  = (req.body?.newUsername || '').toString().trim().toLowerCase();
    const currentPassword = (req.body?.currentPassword || '').toString();

    if (!userId)        return res.status(400).json({ error: 'User ID is required.' });
    if (!currentPassword) return res.status(400).json({ error: 'Current password is required.' });

    // Validate new username format: 3–30 chars, alphanumeric + . - _
    if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(newUsername)) {
      return res.status(400).json({
        error: 'Username must be 3–30 characters, start and end with a letter or number, and may contain . - _',
      });
    }

    const adminSupabase = getAdminClient();

    // 1. Get user's email so we can verify their password
    const { data: userData, error: userErr } = await adminSupabase.auth.admin.getUserById(userId);
    if (userErr || !userData?.user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const userEmail = userData.user.email;

    await verifyCurrentPasswordOrThrow({
      userEmail,
      currentPassword,
      invalidPasswordMessage: 'Incorrect password. Username was not changed.',
    });

    // 3. Check uniqueness
    const { data: existing } = await adminSupabase
      .from('user_profiles')
      .select('id')
      .eq('username', newUsername)
      .maybeSingle();
    if (existing && existing.id !== userId) {
      return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
    }

    // 4. Update
    const { error: updateErr } = await adminSupabase
      .from('user_profiles')
      .update({ username: newUsername })
      .eq('id', userId);
    if (updateErr) {
      console.error('[change-username] update error:', updateErr.message);
      return res.status(500).json({ error: 'Failed to update username. Please try again.' });
    }

    console.log(`[change-username] User ${userId} changed username to ${newUsername}`);
    return res.status(200).json({ message: 'Username updated successfully.', username: newUsername });
  } catch (err) {
    console.error('[change-username] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Failed to update username. Please try again.' });
  }
});


// ── AES-256-GCM helpers for encrypting the pending password ─────────────────
const accountLifecycleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => getBearerToken(req) || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account management requests. Please wait and try again.' },
});

const getAccountActionConfig = (actionType) => {
  if (actionType === 'disable') {
    return {
      subject: 'Confirm your Cyberspace-X account disable request',
      title: 'Confirm Account Disable',
      eyebrow: 'Cyberspace-X Security Check',
      intro: 'We received a request to temporarily disable your Cyberspace-X account.',
      detail: 'Your password has already been verified. Your account will remain active until you confirm this request from your primary email.',
      warning: 'If you do not reactivate within 60 days after disabling, your account and associated data will be permanently removed.',
      buttonLabel: 'Yes, Disable My Account',
      cancelLabel: 'No, Keep My Account Active',
      requestMessage: 'A confirmation email has been sent to your primary email address. Your account will only be disabled after you click Yes in that email.',
    };
  }

  if (actionType === 'delete') {
    return {
      subject: 'Confirm permanent deletion of your Cyberspace-X account',
      title: 'Confirm Permanent Deletion',
      eyebrow: 'Cyberspace-X Security Check',
      intro: 'We received a request to permanently delete your Cyberspace-X account.',
      detail: 'Your password has already been verified. Nothing will be deleted until you confirm this request from your primary email.',
      warning: 'This action is permanent. Your profile, repositories, notifications, reset records, and related account data will be removed.',
      buttonLabel: 'Yes, Delete My Account',
      cancelLabel: 'No, Keep My Account',
      requestMessage: 'A confirmation email has been sent to your primary email address. Your account will only be deleted after you click Yes in that email.',
    };
  }

  throw new Error(`Unsupported account action type: ${actionType}`);
};

const buildAccountActionEmailHtml = ({ actionType, confirmLink, cancelLink }) => {
  const config = getAccountActionConfig(actionType);
  const accentGradient = actionType === 'delete' ? '#ef4444,#b91c1c' : '#f59e0b,#d97706';
  const accentText = actionType === 'delete' ? '#fca5a5' : '#fbbf24';
  const eyebrowColor = actionType === 'delete' ? '#fee2e2' : '#fffbeb';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(config.title)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,${accentGradient});padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;color:${eyebrowColor};text-transform:uppercase;font-weight:600;">${escapeHtml(config.eyebrow)}</p>
              <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">${escapeHtml(config.title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;text-align:center;">
              <p style="margin:0 0 8px;color:#9ca3af;font-size:14px;">${escapeHtml(config.intro)}</p>
              <p style="margin:0 0 28px;color:#6b7280;font-size:12px;">${escapeHtml(config.detail)}</p>

              <div style="margin-bottom:24px;">
                <a href="${encodeURI(confirmLink)}" style="display:inline-block;background:linear-gradient(135deg,${accentGradient});color:#ffffff;font-size:14px;font-weight:600;padding:14px 30px;border-radius:8px;text-decoration:none;margin:0 8px 12px;">${escapeHtml(config.buttonLabel)}</a>
                <a href="${encodeURI(cancelLink)}" style="display:inline-block;background:#1f2937;border:1px solid #374151;color:#ffffff;font-size:14px;font-weight:600;padding:14px 30px;border-radius:8px;text-decoration:none;margin:0 8px 12px;">${escapeHtml(config.cancelLabel)}</a>
              </div>

              <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">This link expires in <strong style="color:${accentText};">${escapeHtml(ACCOUNT_ACTION_CONFIRM_EXPIRY_HOURS)} hour${ACCOUNT_ACTION_CONFIRM_EXPIRY_HOURS === 1 ? '' : 's'}</strong>.</p>
              <p style="margin:0 0 20px;color:#6b7280;font-size:12px;">If you did not request this action, click No or ignore this email.</p>

              <div style="padding:16px;background:#1a1a2e;border:1px solid #292524;border-radius:8px;text-align:left;">
                <p style="margin:0;color:${accentText};font-size:12px;font-weight:600;">Important</p>
                <p style="margin:6px 0 0;color:#9ca3af;font-size:12px;">${escapeHtml(config.warning)}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
              <p style="margin:0;color:#4b5563;font-size:11px;">&copy; ${escapeHtml(new Date().getFullYear())} Cyberspace-X. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

const buildAccountActionRedirect = ({ actionType = '', status = '', error = '' }) => {
  const params = new URLSearchParams();
  if (actionType) params.set('action', actionType);
  if (status) params.set('status', status);
  if (error) params.set('error', error);
  return `${FRONTEND_BASE}/account-action-confirm?${params.toString()}`;
};

const isMissingUserDeleteError = (error) =>
  /user.*not found|not found|does not exist/i.test((error?.message || '').toString());

const sendAccountActionConfirmationEmail = async ({ req, supabase, user, actionType }) => {
  if (!SMTP_USER || !SMTP_PASS) {
    const emailConfigError = new Error('Email service is not configured on the server.');
    emailConfigError.statusCode = 500;
    throw emailConfigError;
  }

  const config = getAccountActionConfig(actionType);
  const userEmail = (user.email || '').trim().toLowerCase();
  const confirmToken = crypto.randomBytes(32).toString('hex');
  const cancelToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ACCOUNT_ACTION_CONFIRM_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  const { error: clearErr } = await supabase
    .from('pending_account_actions')
    .delete()
    .eq('user_id', user.id)
    .eq('status', 'pending');

  if (clearErr) {
    console.error(`[account/${actionType}] pending cleanup error:`, clearErr.message);
    throw new Error(`Failed to prepare ${actionType} confirmation.`);
  }

  const { error: insertErr } = await supabase.from('pending_account_actions').insert({
    user_id: user.id,
    user_email: userEmail,
    action_type: actionType,
    confirm_token: confirmToken,
    cancel_token: cancelToken,
    password_verified_at: new Date().toISOString(),
    expires_at: expiresAt,
    requested_from: req.ip || '',
  });

  if (insertErr) {
    console.error(`[account/${actionType}] insert error:`, insertErr.message);
    throw new Error(`Failed to prepare ${actionType} confirmation.`);
  }

  const confirmLink = `${getRequestBase(req)}/auth/account/confirm-action?token=${encodeURIComponent(confirmToken)}`;
  const cancelLink = `${getRequestBase(req)}/auth/account/cancel-action?token=${encodeURIComponent(cancelToken)}`;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
    to: userEmail,
    subject: config.subject,
    text: `${config.intro}\n\nYes: ${confirmLink}\nNo: ${cancelLink}\n\nThis link expires in ${ACCOUNT_ACTION_CONFIRM_EXPIRY_HOURS} hour${ACCOUNT_ACTION_CONFIRM_EXPIRY_HOURS === 1 ? '' : 's'}.\n\nIf you did not request this action, choose No or ignore this email.`,
    html: buildAccountActionEmailHtml({ actionType, confirmLink, cancelLink }),
  });

  return config.requestMessage;
};

router.post('/account/disable', accountLifecycleLimiter, async (req, res) => {
  try {
    const { supabase, user } = await getAuthenticatedSessionUser(req);
    const currentPassword = (req.body?.currentPassword || '').toString();

    await verifyCurrentPasswordOrThrow({
      userEmail: (user.email || '').trim().toLowerCase(),
      currentPassword,
      invalidPasswordMessage: 'Incorrect password. Account disable email was not sent.',
    });

    const { data: profile, error: fetchErr } = await supabase
      .from('user_profiles')
      .select('account_status')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchErr) {
      console.error('[account/disable] profile fetch error:', fetchErr.message);
      return res.status(500).json({ error: 'Failed to prepare account disable confirmation. Please try again.' });
    }

    if (profile?.account_status === 'disabled') {
      return res.status(400).json({ error: 'This account is already disabled.' });
    }

    const message = await sendAccountActionConfirmationEmail({
      req,
      supabase,
      user,
      actionType: 'disable',
    });

    return res.status(200).json({ message });
  } catch (err) {
    console.error('[account/disable] error:', err.message);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode === 401 ? err.message : 'Failed to send account disable confirmation email. Please try again.',
    });
  }
});

router.get('/account/confirm-action', async (req, res) => {
  try {
    const token = (req.query?.token || '').toString().trim();
    if (!token) {
      return res.redirect(buildAccountActionRedirect({ error: 'missing_token' }));
    }

    const supabase = getAdminClient();
    const { data: record, error: fetchErr } = await supabase
      .from('pending_account_actions')
      .select('*')
      .eq('confirm_token', token)
      .maybeSingle();

    if (fetchErr || !record) {
      return res.redirect(buildAccountActionRedirect({ error: 'invalid_token' }));
    }

    const actionType = (record.action_type || '').toString();
    if (!['disable', 'delete'].includes(actionType)) {
      return res.redirect(buildAccountActionRedirect({ error: 'invalid_token' }));
    }

    if (record.status === 'completed') {
      return res.redirect(buildAccountActionRedirect({ actionType, status: 'completed' }));
    }

    if (record.status === 'cancelled') {
      return res.redirect(buildAccountActionRedirect({ actionType, status: 'cancelled' }));
    }

    if (record.status === 'expired' || new Date() > new Date(record.expires_at)) {
      await supabase.from('pending_account_actions').update({ status: 'expired' }).eq('id', record.id);
      return res.redirect(buildAccountActionRedirect({ actionType, error: 'expired' }));
    }

    const confirmedAt = new Date().toISOString();

    if (actionType === 'disable') {
      const { data: profile, error: profileErr } = await supabase
        .from('user_profiles')
        .select('account_status')
        .eq('id', record.user_id)
        .maybeSingle();

      if (profileErr || !profile) {
        console.error('[account/confirm-action] disable profile fetch error:', profileErr?.message || 'profile not found');
        return res.redirect(buildAccountActionRedirect({ actionType, error: 'server_error' }));
      }

      if (profile.account_status !== 'disabled') {
        const { error: updateErr } = await supabase
          .from('user_profiles')
          .update({
            account_status: 'disabled',
            account_disabled_at: confirmedAt,
          })
          .eq('id', record.user_id);

        if (updateErr) {
          console.error('[account/confirm-action] disable profile update error:', updateErr.message);
          return res.redirect(buildAccountActionRedirect({ actionType, error: 'server_error' }));
        }
      }

      await Promise.allSettled([
        supabase.from('pending_password_changes').delete().eq('user_id', record.user_id),
        supabase.from('otp_tokens').delete().like('email', `secondary:${record.user_id}:%`),
        supabase.from('activity_logs').insert({
          user_id: record.user_id,
          email: (record.user_email || '').trim().toLowerCase(),
          activity_type: 'account_disabled',
          activity_context: { source: 'email_link' },
        }),
        supabase
          .from('pending_account_actions')
          .update({ status: 'expired' })
          .eq('user_id', record.user_id)
          .eq('status', 'pending')
          .neq('id', record.id),
      ]);
    }

    if (actionType === 'delete') {
      const { data: profile, error: profileErr } = await supabase
        .from('user_profiles')
        .select('secondary_email')
        .eq('id', record.user_id)
        .maybeSingle();

      if (profileErr) {
        console.error('[account/confirm-action] delete profile fetch error:', profileErr.message);
        return res.redirect(buildAccountActionRedirect({ actionType, error: 'server_error' }));
      }

      await Promise.allSettled([
        supabase
          .from('pending_account_actions')
          .update({ status: 'expired' })
          .eq('user_id', record.user_id)
          .eq('status', 'pending')
          .neq('id', record.id),
      ]);

      await cleanupAccountArtifacts({
        supabase,
        userId: record.user_id,
        primaryEmail: record.user_email || '',
        secondaryEmail: profile?.secondary_email || '',
      });

      const { error: deleteErr } = await supabase.auth.admin.deleteUser(record.user_id, false);
      if (deleteErr && !isMissingUserDeleteError(deleteErr)) {
        console.error('[account/confirm-action] auth delete error:', deleteErr.message);
        return res.redirect(buildAccountActionRedirect({ actionType, error: 'server_error' }));
      }
    }

    const { error: completeErr } = await supabase
      .from('pending_account_actions')
      .update({
        status: 'completed',
        confirmed_at: confirmedAt,
        completed_at: confirmedAt,
      })
      .eq('id', record.id);

    if (completeErr) {
      console.error('[account/confirm-action] completion update error:', completeErr.message);
      return res.redirect(buildAccountActionRedirect({ actionType, error: 'server_error' }));
    }

    return res.redirect(buildAccountActionRedirect({ actionType, status: 'completed' }));
  } catch (err) {
    console.error('[account/confirm-action] error:', err.message);
    return res.redirect(buildAccountActionRedirect({ error: 'server_error' }));
  }
});

router.get('/account/cancel-action', async (req, res) => {
  try {
    const token = (req.query?.token || '').toString().trim();
    if (!token) {
      return res.redirect(buildAccountActionRedirect({ error: 'missing_token' }));
    }

    const supabase = getAdminClient();
    const { data: record, error: fetchErr } = await supabase
      .from('pending_account_actions')
      .select('*')
      .eq('cancel_token', token)
      .maybeSingle();

    if (fetchErr || !record) {
      return res.redirect(buildAccountActionRedirect({ error: 'invalid_token' }));
    }

    const actionType = (record.action_type || '').toString();
    if (!['disable', 'delete'].includes(actionType)) {
      return res.redirect(buildAccountActionRedirect({ error: 'invalid_token' }));
    }

    if (record.status === 'cancelled') {
      return res.redirect(buildAccountActionRedirect({ actionType, status: 'cancelled' }));
    }

    if (record.status === 'completed') {
      return res.redirect(buildAccountActionRedirect({ actionType, status: 'completed' }));
    }

    if (record.status === 'expired' || new Date() > new Date(record.expires_at)) {
      await supabase.from('pending_account_actions').update({ status: 'expired' }).eq('id', record.id);
      return res.redirect(buildAccountActionRedirect({ actionType, error: 'expired' }));
    }

    const { error: cancelErr } = await supabase
      .from('pending_account_actions')
      .update({ status: 'cancelled' })
      .eq('id', record.id);

    if (cancelErr) {
      console.error('[account/cancel-action] cancel update error:', cancelErr.message);
      return res.redirect(buildAccountActionRedirect({ actionType, error: 'server_error' }));
    }

    return res.redirect(buildAccountActionRedirect({ actionType, status: 'cancelled' }));
  } catch (err) {
    console.error('[account/cancel-action] error:', err.message);
    return res.redirect(buildAccountActionRedirect({ error: 'server_error' }));
  }
});

/**
 * Build a branded HTML email for account reactivation.
 */
const buildReactivationEmailHtml = (reactivationLink) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reactivate your Cyberspace-X account</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;color:#fffbeb;text-transform:uppercase;font-weight:600;">Cyberspace-X 2.0</p>
              <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Account Reactivation</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;text-align:center;">
              <p style="margin:0 0 8px;color:#9ca3af;font-size:14px;">You requested to reactivate your Cyberspace-X account.</p>
              <p style="margin:0 0 28px;color:#6b7280;font-size:12px;">This link expires in <strong style="color:#fbbf24;">24 hours</strong>. If you did not request this, you can safely ignore this email.</p>

              <a href="${encodeURI(reactivationLink)}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;margin-bottom:28px;">Reactivate My Account</a>

              <p style="margin:20px 0 8px;color:#6b7280;font-size:12px;">Or copy and paste this link into your browser:</p>
              <p style="margin:0;color:#4b5563;font-size:11px;word-break:break-all;">${escapeHtml(reactivationLink)}</p>

              <div style="margin-top:28px;padding:16px;background:#1a1a2e;border:1px solid #292524;border-radius:8px;">
                <p style="margin:0;color:#fbbf24;font-size:12px;font-weight:600;">⚠️ Important</p>
                <p style="margin:6px 0 0;color:#9ca3af;font-size:12px;">If you do not reactivate your account within 60 days of disabling it, your account and all associated data will be permanently removed.</p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
              <p style="margin:0;color:#4b5563;font-size:11px;">© ${escapeHtml(new Date().getFullYear())} Cyberspace-X. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ── POST /auth/account/reactivate ────────────────────────────────────────────
// Sends a reactivation email with a signed JWT link to the user's primary email.
// The user must click the link to actually reactivate their account.
router.post('/account/reactivate', accountLifecycleLimiter, async (req, res) => {
  try {
    const { supabase, user } = await getAuthenticatedSessionUser(req);

    if (!JWT_SECRET) {
      console.error('[account/reactivate] JWT_SECRET is not configured.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    if (!SMTP_USER || !SMTP_PASS) {
      console.error('[account/reactivate] SMTP credentials are not configured.');
      return res.status(500).json({ error: 'Email service is not configured on the server.' });
    }

    // Verify that the account is actually disabled
    const { data: profile, error: fetchErr } = await supabase
      .from('user_profiles')
      .select('username, account_status')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchErr) {
      console.error('[account/reactivate] profile fetch error:', fetchErr.message);
      return res.status(500).json({ error: 'Failed to send reactivation email. Please try again.' });
    }

    if (profile?.account_status !== 'disabled') {
      return res.status(400).json({ error: 'This account is already active.' });
    }

    // Generate a signed JWT reactivation token (24-hour expiry)
    const reactivationToken = jwt.sign(
      { user_id: user.id, purpose: 'reactivate' },
      JWT_SECRET,
      { expiresIn: '24h', issuer: 'cyberspace-x', audience: 'cyberspace-x-client' },
    );

    const reactivationLink = `${FRONTEND_BASE}/reactivate-account?token=${encodeURIComponent(reactivationToken)}`;
    const userEmail = (user.email || '').trim().toLowerCase();

    // Send the reactivation email
    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
      to: userEmail,
      subject: 'Reactivate your Cyberspace-X account',
      text: `You requested to reactivate your Cyberspace-X account.\n\nClick the link below to reactivate:\n${reactivationLink}\n\nThis link expires in 24 hours.\n\nIf you did not request this, you can safely ignore this email.`,
      html: buildReactivationEmailHtml(reactivationLink),
    });

    console.log(`[account/reactivate] Reactivation email sent to ${userEmail} for user ${user.id}`);

    await Promise.allSettled([
      supabase.from('activity_logs').insert({
        user_id: user.id,
        email: userEmail,
        activity_type: 'reactivation_email_sent',
        activity_context: { source: 'sign_in' },
      }),
    ]);

    return res.status(200).json({
      message: 'A reactivation link has been sent to your registered email. Check your inbox to reactivate your account.',
    });
  } catch (err) {
    console.error('[account/reactivate] error:', err.message);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode === 401 ? err.message : 'Failed to send reactivation email. Please try again.',
    });
  }
});

// ── POST /auth/account/verify-reactivation ───────────────────────────────────
// Verifies the signed JWT token from the reactivation email link
// and reactivates the user's account.
router.post('/account/verify-reactivation', async (req, res) => {
  try {
    const token = (req.body?.token || '').toString().trim();

    if (!token) {
      return res.status(400).json({ error: 'Reactivation token is required.' });
    }

    if (!JWT_SECRET) {
      console.error('[account/verify-reactivation] JWT_SECRET is not configured.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    // Verify the JWT token
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET, {
        issuer: 'cyberspace-x',
        audience: 'cyberspace-x-client',
      });
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(400).json({ error: 'This reactivation link has expired. Please request a new one from the sign-in page.' });
      }
      return res.status(400).json({ error: 'Invalid reactivation link. Please request a new one from the sign-in page.' });
    }

    if (!payload || payload.purpose !== 'reactivate' || !payload.user_id) {
      return res.status(400).json({ error: 'Invalid reactivation token.' });
    }

    const supabase = getAdminClient();
    const userId = payload.user_id;

    // Fetch the profile to get username
    const { data: profile, error: fetchErr } = await supabase
      .from('user_profiles')
      .select('username, account_status')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr) {
      console.error('[account/verify-reactivation] profile fetch error:', fetchErr.message);
      return res.status(500).json({ error: 'Failed to reactivate account. Please try again.' });
    }

    if (!profile) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    if (profile.account_status !== 'disabled') {
      return res.status(200).json({
        message: 'This account is already active.',
        username: (profile.username || '').toString().trim(),
        alreadyActive: true,
      });
    }

    // Reactivate the account
    const { error: updateErr } = await supabase
      .from('user_profiles')
      .update({
        account_status: 'active',
        account_disabled_at: null,
      })
      .eq('id', userId);

    if (updateErr) {
      console.error('[account/verify-reactivation] profile update error:', updateErr.message);
      return res.status(500).json({ error: 'Failed to reactivate account. Please try again.' });
    }

    // Fetch user email for activity log
    let userEmail = '';
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      userEmail = (userData?.user?.email || '').trim().toLowerCase();
    } catch { /* non-fatal */ }

    await Promise.allSettled([
      supabase.from('activity_logs').insert({
        user_id: userId,
        email: userEmail,
        activity_type: 'account_reactivated',
        activity_context: { source: 'email_link' },
      }),
    ]);

    console.log(`[account/verify-reactivation] Account reactivated for user ${userId}`);

    return res.status(200).json({
      message: 'Account reactivated successfully! You can now sign in.',
      username: (profile.username || '').toString().trim(),
    });
  } catch (err) {
    console.error('[account/verify-reactivation] error:', err.message);
    return res.status(500).json({ error: 'Failed to reactivate account. Please try again.' });
  }
});

router.post('/account/delete', accountLifecycleLimiter, async (req, res) => {
  try {
    const { supabase, user } = await getAuthenticatedSessionUser(req);
    const currentPassword = (req.body?.currentPassword || '').toString();

    await verifyCurrentPasswordOrThrow({
      userEmail: (user.email || '').trim().toLowerCase(),
      currentPassword,
      invalidPasswordMessage: 'Incorrect password. Account deletion email was not sent.',
    });

    const message = await sendAccountActionConfirmationEmail({
      req,
      supabase,
      user,
      actionType: 'delete',
    });

    return res.status(200).json({ message });
  } catch (err) {
    console.error('[account/delete] error:', err.message);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode === 401 ? err.message : 'Failed to send account deletion confirmation email. Please try again.',
    });
  }
});

const getEncryptionKey = () => {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set.');
  return crypto.scryptSync(JWT_SECRET, 'cyberx-pw-salt', 32);
};

const encryptPassword = (plaintext) => {
  const key = getEncryptionKey();
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${encrypted.toString('hex')}.${tag.toString('hex')}`;
};

const decryptPassword = (encryptedText) => {
  const key = getEncryptionKey();
  const [ivHex, encHex, tagHex] = encryptedText.split('.');
  const iv  = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
};

// ── Email builders ────────────────────────────────────────────────────────────
const buildPasswordResetEmailHtml = (resetLink) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Reset your Cyberspace-X password</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;letter-spacing:3px;color:#e0e0ff;text-transform:uppercase;font-weight:600;">Cyberspace-X 2.0</p>
          <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Password Reset</h1>
        </td></tr>
        <tr><td style="padding:36px 32px;text-align:center;">
          <p style="margin:0 0 8px;color:#9ca3af;font-size:14px;">We received a request to reset your Cyberspace-X password.</p>
          <p style="margin:0 0 28px;color:#6b7280;font-size:12px;">This link expires in <strong style="color:#a78bfa;">1 hour</strong>. If you didn't request this, you can safely ignore it.</p>
          <a href="${encodeURI(resetLink)}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;margin-bottom:28px;">Reset Password</a>
          <p style="margin:0;color:#4b5563;font-size:11px;word-break:break-all;">${escapeHtml(resetLink)}</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
          <p style="margin:0;color:#4b5563;font-size:11px;">© ${escapeHtml(new Date().getFullYear())} Cyberspace-X. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const buildPasswordConfirmEmailHtml = (confirmLink, disputeLink, userEmail) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Confirm your password change</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;letter-spacing:3px;color:#e0e0ff;text-transform:uppercase;font-weight:600;">Cyberspace-X 2.0</p>
          <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">Confirm Password Change</h1>
        </td></tr>
        <tr><td style="padding:36px 32px;text-align:center;">
          <p style="margin:0 0 8px;color:#9ca3af;font-size:14px;">A password change was requested for <strong style="color:#a78bfa;">${escapeHtml(userEmail)}</strong>.</p>
          <p style="margin:0 0 28px;color:#6b7280;font-size:12px;">Click <strong style="color:#a78bfa;">Yes, this was me</strong> to confirm. Your new password will be applied <strong style="color:#a78bfa;">immediately</strong> after confirmation.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
            <tr>
              <td style="padding-right:12px;">
                <a href="${encodeURI(confirmLink)}" style="display:inline-block;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">✓ Yes, this was me</a>
              </td>
              <td>
                <a href="${encodeURI(disputeLink)}" style="display:inline-block;background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">✕ Not me — Cancel</a>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#6b7280;font-size:12px;">These links expire in 1 hour. If you didn't make this request, click "Not me" immediately.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
          <p style="margin:0;color:#4b5563;font-size:11px;">© ${escapeHtml(new Date().getFullYear())} Cyberspace-X. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const buildPasswordAppliedEmailHtml = (userEmail) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Password changed successfully</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:28px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;letter-spacing:3px;color:#d1fae5;text-transform:uppercase;font-weight:600;">Cyberspace-X 2.0</p>
          <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">✅ Password Changed</h1>
        </td></tr>
        <tr><td style="padding:36px 32px;text-align:center;">
          <p style="margin:0 0 12px;color:#9ca3af;font-size:14px;">Your password for <strong style="color:#a78bfa;">${escapeHtml(userEmail)}</strong> has been successfully updated.</p>
          <p style="margin:0 0 28px;color:#6b7280;font-size:12px;">You can now sign in with your new password. If you did not make this change, contact support immediately.</p>
          <a href="${encodeURI(FRONTEND_BASE)}/signin" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Sign In</a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
          <p style="margin:0;color:#4b5563;font-size:11px;">© ${escapeHtml(new Date().getFullYear())} Cyberspace-X. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const buildPasswordDisputeEmailHtml = (newRecoveryLink, userEmail) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Password change cancelled</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#11111a;border:1px solid #1e1e2e;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#ef4444,#b91c1c);padding:28px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;letter-spacing:3px;color:#fee2e2;text-transform:uppercase;font-weight:600;">Cyberspace-X Security Alert</p>
          <h1 style="margin:8px 0 0;font-size:22px;color:#ffffff;font-weight:700;">⚠️ Change Cancelled</h1>
        </td></tr>
        <tr><td style="padding:36px 32px;text-align:center;">
          <p style="margin:0 0 8px;color:#9ca3af;font-size:14px;">The password change for <strong style="color:#f87171;">${escapeHtml(userEmail)}</strong> has been <strong>cancelled</strong>.</p>
          <p style="margin:0 0 28px;color:#6b7280;font-size:12px;">Your previous password remains active. If someone else attempted this, use the link below to set a new password immediately.</p>
          ${newRecoveryLink ? `<a href="${encodeURI(newRecoveryLink)}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#b45309);color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Set New Password Now</a>` : ''}
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;">
          <p style="margin:0;color:#4b5563;font-size:11px;">© ${escapeHtml(new Date().getFullYear())} Cyberspace-X. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

// ── Rate limiter for forgot-password ─────────────────────────────────────────
const forgotPasswordLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => (req.body?.email || req.ip).toLowerCase(),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please wait 10 minutes before trying again.' },
});

// ── POST /auth/forgot-password ────────────────────────────────────────────────
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const rawEmail = (req.body?.email || '').toString().trim().toLowerCase();
    // Always return 200 to avoid email enumeration
    if (!isValidEmail(rawEmail)) {
      return res.status(200).json({ message: 'If an account exists for that email, a reset link has been sent.' });
    }
    if (!SMTP_USER || !SMTP_PASS) {
      return res.status(500).json({ error: 'Email service is not configured.' });
    }

    const supabase = getAdminClient();
    // Generate recovery link via Supabase Admin
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: rawEmail,
      options: { redirectTo: `${FRONTEND_BASE}/reset-password` },
    });

    if (linkErr) {
      // User may not exist — return generic 200
      console.warn('[forgot-password] generateLink:', linkErr.message);
      return res.status(200).json({ message: 'If an account exists for that email, a reset link has been sent.' });
    }

    const resetLink = linkData?.properties?.action_link || linkData?.properties?.email_otp_link;
    if (!resetLink) {
      return res.status(200).json({ message: 'If an account exists for that email, a reset link has been sent.' });
    }

    const transporter = createTransporter();
    await transporter.sendMail({
      from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
      to: rawEmail,
      subject: 'Reset your Cyberspace-X password',
      text: `Reset your password: ${resetLink}\n\nThis link expires in 1 hour.`,
      html: buildPasswordResetEmailHtml(resetLink),
    });

    console.log(`[forgot-password] Recovery email sent to ${rawEmail}`);
    return res.status(200).json({ message: 'If an account exists for that email, a reset link has been sent.' });
  } catch (err) {
    console.error('[forgot-password] error:', err.message);
    return res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
  }
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────
// Called by the frontend after Supabase session is established on /reset-password.
// Stores encrypted new password as PENDING, then waits for email confirmation before applying it.
router.post('/reset-password', async (req, res) => {
  try {
    const userId      = (req.body?.userId || '').toString().trim();
    const newPassword = (req.body?.newPassword || '').toString();

    if (!userId)                        return res.status(400).json({ error: 'User ID is required.' });
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const supabase = getAdminClient();
    // Verify user exists
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId);
    if (userErr || !userData?.user) return res.status(404).json({ error: 'User not found.' });
    const userEmail = userData.user.email;

    // Clean up any existing pending change for this user
    await supabase.from('pending_password_changes').delete().eq('user_id', userId).eq('status', 'pending');

    const encrypted    = encryptPassword(newPassword);
    const confirmToken = crypto.randomBytes(32).toString('hex');
    const disputeToken = crypto.randomBytes(32).toString('hex');
    const expiresAt    = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    const { error: insertErr } = await supabase.from('pending_password_changes').insert({
      user_id: userId,
      user_email: userEmail,
      encrypted_password: encrypted,
      confirm_token: confirmToken,
      dispute_token: disputeToken,
      expires_at: expiresAt,
      status: 'pending',
    });

    if (insertErr) {
      console.error('[reset-password] insert error:', insertErr.message);
      return res.status(500).json({ error: 'Failed to store pending change. Please try again.' });
    }

    // Send confirmation email
    const requestBase = getRequestBase(req);
    const confirmLink = `${requestBase}/auth/confirm-password-change?token=${confirmToken}`;
    const disputeLink = `${requestBase}/auth/dispute-password-change?token=${disputeToken}`;

    if (SMTP_USER && SMTP_PASS) {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
        to: userEmail,
        subject: 'Confirm your Cyberspace-X password change',
        text: `Confirm: ${confirmLink}\nDispute (Not me): ${disputeLink}`,
        html: buildPasswordConfirmEmailHtml(confirmLink, disputeLink, userEmail),
      });
    }

    console.log(`[reset-password] Pending change created for user ${userId}`);
    return res.status(200).json({ message: 'Check your email to confirm the password change.' });
  } catch (err) {
    console.error('[reset-password] error:', err.message);
    return res.status(500).json({ error: 'Failed to process password reset. Please try again.' });
  }
});

// ── GET /auth/confirm-password-change ────────────────────────────────────────
// User clicks "Yes, this was me" link in email.
// Apply the password immediately and make repeat opens resolve to success.
router.get('/confirm-password-change', async (req, res) => {
  try {
    const token = (req.query?.token || '').toString().trim();
    if (!token) return res.redirect(`${FRONTEND_BASE}/password-change-confirm?error=missing_token`);

    const supabase = getAdminClient();
    const { data: record, error: fetchErr } = await supabase
      .from('pending_password_changes')
      .select('*')
      .eq('confirm_token', token)
      .maybeSingle();

    if (fetchErr || !record) {
      return res.redirect(`${FRONTEND_BASE}/password-change-confirm?error=invalid_token`);
    }
    if (record.status === 'applied') {
      return res.redirect(`${FRONTEND_BASE}/password-change-confirm?status=changed`);
    }
    if (record.status === 'disputed') {
      return res.redirect(`${FRONTEND_BASE}/password-change-confirm?error=already_used`);
    }
    if (record.status === 'expired' || new Date() > new Date(record.expires_at)) {
      await supabase.from('pending_password_changes').update({ status: 'expired' }).eq('id', record.id);
      return res.redirect(`${FRONTEND_BASE}/password-change-confirm?error=expired`);
    }

    const plainPassword = decryptPassword(record.encrypted_password);
    const confirmedAt = record.confirmed_at || new Date().toISOString();

    const { error: updateErr } = await supabase.auth.admin.updateUserById(record.user_id, {
      password: plainPassword,
    });

    if (updateErr) {
      console.error(`[confirm-pw-change] Failed to update password for ${record.user_id}:`, updateErr.message);
      return res.redirect(`${FRONTEND_BASE}/password-change-confirm?error=server_error`);
    }

    await supabase.from('pending_password_changes').update({
      status: 'applied',
      confirmed_at: confirmedAt,
      applies_at: new Date().toISOString(),
    }).eq('id', record.id);

    if (SMTP_USER && SMTP_PASS) {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
        to: record.user_email,
        subject: '✅ Your Cyberspace-X password has been changed',
        text: `Your password has been successfully updated. If you didn't do this, contact support immediately.`,
        html: buildPasswordAppliedEmailHtml(record.user_email),
      });
    }

    console.log(`[confirm-pw-change] Password applied for user ${record.user_id} (${record.user_email})`);
    return res.redirect(`${FRONTEND_BASE}/password-change-confirm?status=changed`);
  } catch (err) {
    console.error('[confirm-pw-change] error:', err.message);
    return res.redirect(`${FRONTEND_BASE}/password-change-confirm?error=server_error`);
  }
});

// ── GET /auth/dispute-password-change ────────────────────────────────────────
// User clicks "Not me — Cancel" link in email.
router.get('/dispute-password-change', async (req, res) => {
  try {
    const token = (req.query?.token || '').toString().trim();
    if (!token) return res.redirect(`${FRONTEND_BASE}/password-change-dispute?error=missing_token`);

    const supabase = getAdminClient();
    const { data: record, error: fetchErr } = await supabase
      .from('pending_password_changes')
      .select('*')
      .eq('dispute_token', token)
      .maybeSingle();

    if (fetchErr || !record) {
      return res.redirect(`${FRONTEND_BASE}/password-change-dispute?error=invalid_token`);
    }
    if (!['pending', 'confirmed'].includes(record.status)) {
      return res.redirect(`${FRONTEND_BASE}/password-change-dispute?error=already_used`);
    }

    // Cancel the change
    await supabase.from('pending_password_changes').update({ status: 'disputed' }).eq('id', record.id);

    // Generate a fresh recovery link so the real user can regain control
    let newRecoveryLink = null;
    try {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: record.user_email,
        options: { redirectTo: `${FRONTEND_BASE}/reset-password` },
      });
      newRecoveryLink = linkData?.properties?.action_link || null;
    } catch { /* non-fatal */ }

    // Send security alert email
    if (SMTP_USER && SMTP_PASS) {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
        to: record.user_email,
        subject: '⚠️ Password change cancelled — Cyberspace-X',
        text: `The password change for your account was cancelled.\n${newRecoveryLink ? `Set a new password: ${newRecoveryLink}` : ''}`,
        html: buildPasswordDisputeEmailHtml(newRecoveryLink, record.user_email),
      });
    }

    console.log(`[dispute-pw-change] Change disputed for user ${record.user_id}`);
    return res.redirect(`${FRONTEND_BASE}/password-change-dispute?status=cancelled`);
  } catch (err) {
    console.error('[dispute-pw-change] error:', err.message);
    return res.redirect(`${FRONTEND_BASE}/password-change-dispute?error=server_error`);
  }
});

// ── Background job: apply confirmed password changes after 5 min ──────────────
const startPasswordApplyJob = () => {
  const JOB_INTERVAL_MS = 30 * 1000; // run every 30 seconds

  const applyPending = async () => {
    try {
      const supabase = getAdminClient();
      const now = new Date().toISOString();

      const { data: records } = await supabase
        .from('pending_password_changes')
        .select('*')
        .eq('status', 'confirmed')
        .lte('applies_at', now);

      if (!records || records.length === 0) return;

      for (const record of records) {
        try {
          const plainPassword = decryptPassword(record.encrypted_password);

          const { error: updateErr } = await supabase.auth.admin.updateUserById(record.user_id, {
            password: plainPassword,
          });

          if (updateErr) {
            console.error(`[pw-apply-job] Failed to update password for ${record.user_id}:`, updateErr.message);
            continue;
          }

          // Mark applied
          await supabase.from('pending_password_changes').update({
            status: 'applied',
            confirmed_at: record.confirmed_at,
          }).eq('id', record.id);

          // Send "password successfully changed" email
          if (SMTP_USER && SMTP_PASS) {
            const transporter = createTransporter();
            await transporter.sendMail({
              from: SMTP_FROM || `"Cyberspace-X" <${SMTP_USER}>`,
              to: record.user_email,
              subject: '✅ Your Cyberspace-X password has been changed',
              text: `Your password has been successfully updated. If you didn't do this, contact support.`,
              html: buildPasswordAppliedEmailHtml(record.user_email),
            });
          }

          console.log(`[pw-apply-job] Password applied for user ${record.user_id} (${record.user_email})`);
        } catch (recordErr) {
          console.error(`[pw-apply-job] Error processing record ${record.id}:`, recordErr.message);
        }
      }

      // Also clean up expired records
      await supabase
        .from('pending_password_changes')
        .update({ status: 'expired' })
        .eq('status', 'pending')
        .lt('expires_at', now);

    } catch (jobErr) {
      console.error('[pw-apply-job] Job error:', jobErr.message);
    }
  };

  // Run immediately then every 30s
  void applyPending();
  return setInterval(() => void applyPending(), JOB_INTERVAL_MS);
};

module.exports = { router, startPasswordApplyJob };
