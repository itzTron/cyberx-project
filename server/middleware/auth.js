'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Express middleware that verifies the JWT sent in the Authorization header.
 * On success, attaches `req.user = { user_id, email }` and calls next().
 * On failure, responds with 401.
 *
 * Usage:
 *   const { verifyJwt } = require('../middleware/auth');
 *   router.get('/protected', verifyJwt, handler);
 */
const verifyJwt = (req, res, next) => {
  if (!JWT_SECRET) {
    console.error('[auth middleware] JWT_SECRET is not set in environment');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Attach decoded payload so downstream handlers can use req.user
    req.user = {
      user_id: payload.user_id,
      email: payload.email,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired. Please sign in again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Please sign in again.' });
    }
    return res.status(401).json({ error: 'Authentication failed.' });
  }
};

module.exports = { verifyJwt };
