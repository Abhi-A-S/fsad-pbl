import { User } from '../models/User.js';
import { generateToken, getAuthCookieOptions } from '../utils/token.js';
import { config } from '../config/env.js';

export async function register(req, res, next) {
  try {
    const { email, password, displayName } = req.body || {};

    // Validate inputs
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: { message: 'A valid email is required' } });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: { message: 'Please provide a valid email address' } });
    }

    if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 2) {
      return res.status(400).json({ error: { message: 'Display name must be at least 2 characters long' } });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: { message: 'Password must be at least 8 characters long' } });
    }

    // Check duplicate email
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: { message: 'An account with this email address already exists' } });
    }

    // Hash password and save user
    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      email: normalizedEmail,
      displayName: displayName.trim(),
      passwordHash,
    });

    // Issue JWT cookie
    const token = generateToken({ id: user._id.toString(), email: user.email });
    res.cookie(config.cookieName, token, getAuthCookieOptions());

    res.status(201).json({
      message: 'Account successfully registered',
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: { message: 'Email and password are required' } });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid email or password' } });
    }

    const isMatch = await User.comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: { message: 'Invalid email or password' } });
    }

    // Issue JWT cookie
    const token = generateToken({ id: user._id.toString(), email: user.email });
    res.cookie(config.cookieName, token, getAuthCookieOptions());

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    // Clear cookie with matching path and options
    const cookieOptions = getAuthCookieOptions(0);
    delete cookieOptions.maxAge;
    res.clearCookie(config.cookieName, cookieOptions);

    res.status(200).json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function getCurrentUser(req, res, next) {
  try {
    res.status(200).json({
      user: {
        id: req.user._id,
        email: req.user.email,
        displayName: req.user.displayName,
        createdAt: req.user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

