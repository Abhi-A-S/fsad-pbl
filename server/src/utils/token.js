import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

/**
 * Returns standard options for setting or clearing authentication cookies.
 * @param {number} [maxAgeMs]
 * @returns {import('express').CookieOptions}
 */
export function getAuthCookieOptions(maxAgeMs = 24 * 60 * 60 * 1000) {
  const isProd = config.env === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

/**
 * Signs a JWT with user payload.
 * @param {{ id: string, email: string }} payload
 * @returns {string}
 */
export function generateToken(payload) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Verifies a JWT token.
 * @param {string} token
 * @returns {object}
 */
export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

