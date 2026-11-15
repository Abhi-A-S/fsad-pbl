import { User } from '../models/User.js';
import { verifyToken } from '../utils/token.js';
import { config } from '../config/env.js';

/**
 * Authentication middleware.
 * Inspects httpOnly cookie, validates JWT, fetches user, attaches to req.user.
 */
export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[config.cookieName];

    if (!token) {
      return res.status(401).json({
        error: {
          message: 'Authentication required. No token provided.',
        },
      });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: {
            message: 'Authentication token has expired. Please log in again.',
          },
        });
      }
      return res.status(401).json({
        error: {
          message: 'Invalid authentication token.',
        },
      });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        error: {
          message: 'User belonging to this token no longer exists.',
        },
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

