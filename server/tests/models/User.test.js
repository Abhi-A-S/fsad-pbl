import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import mongoose from 'mongoose';
import { User } from '../../src/models/User.js';

const TEST_DB_PATH = '/tmp/rf-user-model-test-db';
const TEST_PORT = 27029;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_user_model_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_user_model_test';

let mongodProcess = null;

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
      throw new Error('Unable to establish MongoDB connection for User model test suite.');
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

describe('User Model Test Suite', () => {
  before(async () => {
    await setupDatabaseConnection();
    await User.syncIndexes();
  });

  after(async () => {
    await teardownDatabaseConnection();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('Index Synchronization & Schema Definitions', () => {
    it('creates unique index on email field', async () => {
      const indexes = await User.collection.indexes();
      const emailIndex = indexes.find((idx) => idx.key.email === 1);
      assert.ok(emailIndex, 'Expected index on email: 1');
      assert.strictEqual(emailIndex.unique, true, 'Expected email index to be unique');
    });
  });

  describe('Document Creation & Schema Defaults', () => {
    it('creates a valid user document with required fields', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      const user = await User.create({
        email: 'alice@institution.edu',
        displayName: 'Alice Researcher',
        passwordHash: hash,
      });

      assert.ok(user._id);
      assert.strictEqual(user.email, 'alice@institution.edu');
      assert.strictEqual(user.displayName, 'Alice Researcher');
      assert.ok(user.createdAt instanceof Date);
    });

    it('rejects document missing required email', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      await assert.rejects(
        User.create({
          displayName: 'No Email User',
          passwordHash: hash,
        }),
        /Email address is required/
      );
    });

    it('rejects document missing required displayName', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      await assert.rejects(
        User.create({
          email: 'noname@institution.edu',
          passwordHash: hash,
        }),
        /Display name is required/
      );
    });

    it('rejects document missing required passwordHash', async () => {
      await assert.rejects(
        User.create({
          email: 'nopass@institution.edu',
          displayName: 'No Pass User',
        }),
        /Password hash is required/
      );
    });
  });

  describe('Email Normalization & Validation', () => {
    it('trims leading/trailing whitespace and converts email to lowercase', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      const user = await User.create({
        email: '  Bob.Smith@ACADEMY.ORG  ',
        displayName: 'Bob Smith',
        passwordHash: hash,
      });

      assert.strictEqual(user.email, 'bob.smith@academy.org');
    });

    it('rejects malformed email formats', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      const invalidEmails = ['invalid', 'plainaddress', '@missinguser.com', 'missingdomain@', 'spaces in@email.com'];

      for (const email of invalidEmails) {
        await assert.rejects(
          User.create({
            email,
            displayName: 'Test User',
            passwordHash: hash,
          }),
          /Please provide a valid email address/
        );
      }
    });
  });

  describe('Display Name Validation', () => {
    it('trims whitespace from displayName', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      const user = await User.create({
        email: 'carol@institution.edu',
        displayName: '   Carol Danvers   ',
        passwordHash: hash,
      });

      assert.strictEqual(user.displayName, 'Carol Danvers');
    });

    it('rejects displayName shorter than 2 characters', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      await assert.rejects(
        User.create({
          email: 'shortname@institution.edu',
          displayName: 'A',
          passwordHash: hash,
        }),
        /Display name must be at least 2 characters/
      );
    });

    it('rejects displayName longer than 50 characters', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      await assert.rejects(
        User.create({
          email: 'longname@institution.edu',
          displayName: 'A'.repeat(51),
          passwordHash: hash,
        }),
        /Display name cannot exceed 50 characters/
      );
    });
  });

  describe('Unique Email Enforcement', () => {
    it('rejects duplicate email with code 11000', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      await User.create({
        email: 'dave@institution.edu',
        displayName: 'Dave Original',
        passwordHash: hash,
      });

      await assert.rejects(
        User.create({
          email: 'dave@institution.edu',
          displayName: 'Dave Clone',
          passwordHash: hash,
        }),
        (err) => err.code === 11000
      );
    });

    it('rejects duplicate email with case variation due to lowercase normalization', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      await User.create({
        email: 'eva@institution.edu',
        displayName: 'Eva Lower',
        passwordHash: hash,
      });

      await assert.rejects(
        User.create({
          email: 'EVA@INSTITUTION.EDU',
          displayName: 'Eva Upper',
          passwordHash: hash,
        }),
        (err) => err.code === 11000
      );
    });
  });

  describe('Password Hashing & Comparison (Static Methods)', () => {
    it('hashes passwords using bcrypt with cost factor 12', async () => {
      const plain = 'StrongPassword2026!';
      const hash = await User.hashPassword(plain);

      assert.ok(hash.startsWith('$2a$12$') || hash.startsWith('$2b$12$'));
      assert.notStrictEqual(plain, hash);
    });

    it('rejects passwords shorter than 8 characters', async () => {
      await assert.rejects(
        User.hashPassword('short'),
        /Password must be at least 8 characters long/
      );
    });

    it('rejects non-string password inputs', async () => {
      await assert.rejects(
        User.hashPassword(null),
        /Password must be at least 8 characters long/
      );
      await assert.rejects(
        User.hashPassword(12345678),
        /Password must be at least 8 characters long/
      );
    });

    it('successfully compares valid candidate password against hash', async () => {
      const plain = 'CorrectHorseBatteryStaple!';
      const hash = await User.hashPassword(plain);

      const isMatch = await User.comparePassword(plain, hash);
      assert.strictEqual(isMatch, true);
    });

    it('rejects incorrect candidate password against hash', async () => {
      const plain = 'CorrectHorseBatteryStaple!';
      const hash = await User.hashPassword(plain);

      const isMatch = await User.comparePassword('WrongPassword123!', hash);
      assert.strictEqual(isMatch, false);
    });

    it('returns false for empty or null candidate/hash comparison', async () => {
      assert.strictEqual(await User.comparePassword('', 'somehash'), false);
      assert.strictEqual(await User.comparePassword('pass', ''), false);
      assert.strictEqual(await User.comparePassword(null, null), false);
    });
  });

  describe('JSON Serialization & Field Selection Security', () => {
    it('omits passwordHash by default in Mongoose queries', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      const created = await User.create({
        email: 'secret@institution.edu',
        displayName: 'Secret User',
        passwordHash: hash,
      });

      const found = await User.findById(created._id);
      assert.strictEqual(found.passwordHash, undefined);
    });

    it('toJSON strips passwordHash even when explicitly selected', async () => {
      const hash = await User.hashPassword('SuperSecret123!');
      const created = await User.create({
        email: 'selected@institution.edu',
        displayName: 'Selected User',
        passwordHash: hash,
      });

      const foundWithHash = await User.findById(created._id).select('+passwordHash');
      assert.ok(foundWithHash.passwordHash);

      const json = foundWithHash.toJSON();
      assert.strictEqual(json.passwordHash, undefined);
      assert.strictEqual(json.email, 'selected@institution.edu');
      assert.strictEqual(json.displayName, 'Selected User');
    });
  });
});
