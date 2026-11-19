import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { generateToken } from '../../src/utils/token.js';
import { config } from '../../src/config/env.js';

const TEST_DB_PATH = '/tmp/rf-auth-route-test-db';
const TEST_PORT = 27030;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_auth_route_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_auth_route_test';

let mongodProcess = null;
let serverInstance = null;
let baseUrl = '';

async function setupDatabaseConnection() {
  try {
    await mongoose.connect(DEFAULT_URI, { serverSelectionTimeoutMS: 1000 });
  } catch {
    try {
      rmSync(TEST_DB_PATH, { recursive: true, force: true });
    } catch {}
    mkdirSync(TEST_DB_PATH, { recursive: true });

    mongodProcess = spawn('/usr/bin/mongod', [
      '--dbpath', TEST_DB_PATH,
      '--port', String(TEST_PORT),
      '--bind_ip', '127.0.0.1',
      '--nounixsocket',
    ]);

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        await mongoose.connect(FALLBACK_URI, { serverSelectionTimeoutMS: 500 });
        connected = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!connected) {
      throw new Error('Unable to establish MongoDB connection for Auth route test suite.');
    }
  }
}

async function teardownDatabaseConnection() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  } catch {}

  if (mongodProcess) {
    mongodProcess.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    rmSync(TEST_DB_PATH, { recursive: true, force: true });
  } catch {}
}

describe('Authentication Routes Integration Tests', () => {
  before(async () => {
    await setupDatabaseConnection();
    await User.syncIndexes();

    await new Promise((resolve) => {
      serverInstance = app.listen(0, '127.0.0.1', () => {
        const port = serverInstance.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    await teardownDatabaseConnection();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/register (Registration & Validation)', () => {
    it('successfully registers a new account and sets HttpOnly cookie', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'researcher@university.edu',
          password: 'SecurePassword123!',
          displayName: 'Dr. Jane Doe',
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();

      assert.strictEqual(data.message, 'Account successfully registered');
      assert.ok(data.user);
      assert.strictEqual(data.user.email, 'researcher@university.edu');
      assert.strictEqual(data.user.displayName, 'Dr. Jane Doe');
      assert.strictEqual(data.user.passwordHash, undefined);
      assert.strictEqual(data.user.password, undefined);

      // Verify Set-Cookie header
      const setCookie = res.headers.get('set-cookie');
      assert.ok(setCookie, 'Expected Set-Cookie header');
      assert.ok(setCookie.includes(config.cookieName));
      assert.ok(setCookie.toLowerCase().includes('httponly'));

      // Verify database record has bcrypt hash and NO plaintext password
      const userInDb = await User.findOne({ email: 'researcher@university.edu' }).select('+passwordHash');
      assert.ok(userInDb);
      assert.ok(userInDb.passwordHash.startsWith('$2a$') || userInDb.passwordHash.startsWith('$2b$'));
      assert.notStrictEqual(userInDb.passwordHash, 'SecurePassword123!');
    });

    it('rejects registration with missing or invalid email format (400)', async () => {
      const res1 = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: 'SecurePassword123!',
          displayName: 'Jane Doe',
        }),
      });
      assert.strictEqual(res1.status, 400);
      const data1 = await res1.json();
      assert.strictEqual(data1.error.message, 'A valid email is required');

      const res2 = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'notanemail',
          password: 'SecurePassword123!',
          displayName: 'Jane Doe',
        }),
      });
      assert.strictEqual(res2.status, 400);
      const data2 = await res2.json();
      assert.strictEqual(data2.error.message, 'Please provide a valid email address');
    });

    it('rejects registration with missing or short displayName (400)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'valid@university.edu',
          password: 'SecurePassword123!',
          displayName: 'J',
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Display name must be at least 2 characters long');
    });

    it('rejects registration with password shorter than 8 characters (400)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'valid@university.edu',
          password: 'short',
          displayName: 'Jane Doe',
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Password must be at least 8 characters long');
    });

    it('rejects duplicate email registration with HTTP 409', async () => {
      await User.create({
        email: 'existing@university.edu',
        passwordHash: await User.hashPassword('ExistingPassword123!'),
        displayName: 'Existing User',
      });

      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@university.edu',
          password: 'NewPassword123!',
          displayName: 'Another Name',
        }),
      });

      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'An account with this email address already exists');
    });

    it('rejects duplicate email with case variation (409)', async () => {
      await User.create({
        email: 'case@university.edu',
        passwordHash: await User.hashPassword('ExistingPassword123!'),
        displayName: 'Case User',
      });

      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'CASE@UNIVERSITY.EDU',
          password: 'NewPassword123!',
          displayName: 'Upper Name',
        }),
      });

      assert.strictEqual(res.status, 409);
    });
  });

  describe('POST /api/auth/login (Login & Authentication)', () => {
    beforeEach(async () => {
      await User.create({
        email: 'scholar@research.org',
        passwordHash: await User.hashPassword('MySecretPass2026!'),
        displayName: 'Professor Scholar',
      });
    });

    it('successfully logs in with valid credentials and sets HttpOnly cookie (200)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'scholar@research.org',
          password: 'MySecretPass2026!',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.message, 'Login successful');
      assert.strictEqual(data.user.email, 'scholar@research.org');
      assert.strictEqual(data.user.displayName, 'Professor Scholar');
      assert.strictEqual(data.user.passwordHash, undefined);

      const setCookie = res.headers.get('set-cookie');
      assert.ok(setCookie);
      assert.ok(setCookie.includes(config.cookieName));
      assert.ok(setCookie.toLowerCase().includes('httponly'));
    });

    it('allows login with case-insensitive email (200)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'SCHOLAR@RESEARCH.ORG',
          password: 'MySecretPass2026!',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.user.email, 'scholar@research.org');
    });

    it('rejects login with incorrect password (401)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'scholar@research.org',
          password: 'WrongPassword!',
        }),
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Invalid email or password');
    });

    it('rejects login with non-existent email (401)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nobody@research.org',
          password: 'AnyPassword123!',
        }),
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Invalid email or password');
    });

    it('rejects login with missing email or password (400)', async () => {
      const res1 = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'SomePassword!' }),
      });
      assert.strictEqual(res1.status, 400);

      const res2 = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'scholar@research.org' }),
      });
      assert.strictEqual(res2.status, 400);
    });
  });

  describe('POST /api/auth/logout (Logout)', () => {
    it('returns HTTP 200 and clears the authentication cookie', async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.message, 'Logged out successfully');

      const setCookie = res.headers.get('set-cookie');
      assert.ok(setCookie, 'Expected Set-Cookie header on logout');
      assert.ok(setCookie.includes(config.cookieName));
      // Verify cookie expiry
      assert.ok(
        setCookie.includes('Expires=Thu, 01 Jan 1970') ||
        setCookie.includes('Max-Age=0') ||
        setCookie.includes('max-age=0')
      );
    });
  });

  describe('GET /api/auth/me (Session Restoration & Verification)', () => {
    let testUser = null;
    let validToken = '';

    beforeEach(async () => {
      testUser = await User.create({
        email: 'active.researcher@lab.org',
        passwordHash: await User.hashPassword('ActivePass123!'),
        displayName: 'Active Researcher',
      });

      validToken = generateToken({
        id: testUser._id.toString(),
        email: testUser.email,
      });
    });

    it('returns HTTP 200 and user profile when valid auth cookie is presented', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `${config.cookieName}=${validToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.ok(data.user);
      assert.strictEqual(data.user.id, testUser._id.toString());
      assert.strictEqual(data.user.email, 'active.researcher@lab.org');
      assert.strictEqual(data.user.displayName, 'Active Researcher');
      assert.strictEqual(data.user.passwordHash, undefined);
    });

    it('returns HTTP 401 when no auth cookie is presented', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Authentication required. No token provided.');
    });

    it('returns HTTP 401 when token is malformed', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `${config.cookieName}=malformed.jwt.token`,
        },
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Invalid authentication token.');
    });

    it('returns HTTP 401 when token signature is tampered', async () => {
      const tampered = validToken.slice(0, -6) + 'abcdef';
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `${config.cookieName}=${tampered}`,
        },
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Invalid authentication token.');
    });

    it('returns HTTP 401 when token is expired', async () => {
      const expiredToken = jwt.sign(
        { id: testUser._id.toString(), email: testUser.email },
        config.jwtSecret,
        { expiresIn: '0s' }
      );

      // Brief delay to ensure expiry timestamp is passed
      await new Promise((r) => setTimeout(r, 50));

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `${config.cookieName}=${expiredToken}`,
        },
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Authentication token has expired. Please log in again.');
    });

    it('returns HTTP 401 when user in token has been deleted from MongoDB', async () => {
      await User.deleteOne({ _id: testUser._id });

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Cookie: `${config.cookieName}=${validToken}`,
        },
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'User belonging to this token no longer exists.');
    });
  });

  describe('Protected Route Access Boundaries', () => {
    it('blocks access to /api/papers without authentication (401)', async () => {
      const res = await fetch(`${baseUrl}/api/papers`);
      assert.strictEqual(res.status, 401);
    });

    it('blocks access to /api/collections without authentication (401)', async () => {
      const res = await fetch(`${baseUrl}/api/collections`);
      assert.strictEqual(res.status, 401);
    });

    it('allows access to protected routes when valid auth cookie is provided (200)', async () => {
      const user = await User.create({
        email: 'authorized@lab.org',
        passwordHash: await User.hashPassword('AuthPass2026!'),
        displayName: 'Authorized Researcher',
      });
      const token = generateToken({ id: user._id.toString(), email: user.email });

      const res = await fetch(`${baseUrl}/api/papers`, {
        headers: {
          Cookie: `${config.cookieName}=${token}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.papers));
    });
  });
});
