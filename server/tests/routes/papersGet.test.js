import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Paper } from '../../src/models/Paper.js';
import { generateToken } from '../../src/utils/token.js';
import { config } from '../../src/config/env.js';

const TEST_DB_PATH = '/tmp/rf-get-test-suite-db';
const TEST_PORT = 27022;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_get_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_get_test';

let mongodProcess = null;
let serverInstance = null;
let baseUrl = '';
let testUser1 = null;
let testUser2 = null;
let authCookie1 = '';
let authCookie2 = '';

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
      throw new Error('Unable to establish MongoDB connection for get paper test suite.');
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

describe('GET /api/papers/:id Integration Tests', () => {
  before(async () => {
    await setupDatabaseConnection();
    await User.syncIndexes();
    await Paper.syncIndexes();

    testUser1 = await User.create({
      email: 'owner1@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'Primary Owner',
    });
    const token1 = generateToken({ id: testUser1._id.toString(), email: testUser1.email });
    authCookie1 = `${config.cookieName}=${token1}`;

    testUser2 = await User.create({
      email: 'owner2@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'Secondary Owner',
    });
    const token2 = generateToken({ id: testUser2._id.toString(), email: testUser2.email });
    authCookie2 = `${config.cookieName}=${token2}`;

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
    await Paper.deleteMany({});
  });

  describe('Authentication Enforcement', () => {
    it('returns 401 Unauthorized when request lacks authentication cookie', async () => {
      const validObjectId = new mongoose.Types.ObjectId().toString();
      const res = await fetch(`${baseUrl}/api/papers/${validObjectId}`);

      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('Authentication required'));
    });

    it('returns 401 Unauthorized when token is invalid or tampered', async () => {
      const validObjectId = new mongoose.Types.ObjectId().toString();
      const res = await fetch(`${baseUrl}/api/papers/${validObjectId}`, {
        headers: { Cookie: `${config.cookieName}=tampered-jwt-token` },
      });

      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('Invalid authentication token'));
    });
  });

  describe('ID Validation', () => {
    it('returns 400 Bad Request when ID is not a valid 24-character hex ObjectId', async () => {
      const invalidIds = ['123', 'not-a-valid-id', '123456789012', 'zzzzzzzzzzzzzzzzzzzzzzzz', '!@#$%^&*()_+'];

      for (const badId of invalidIds) {
        const res = await fetch(`${baseUrl}/api/papers/${encodeURIComponent(badId)}`, {
          headers: { Cookie: authCookie1 },
        });

        assert.strictEqual(res.status, 400, `Expected 400 for bad ID "${badId}"`);
        const body = await res.json();
        assert.ok(body.error?.message?.includes('Invalid paper ID format'));
      }
    });
  });

  describe('Paper Retrieval & Serialization', () => {
    it('retrieves an existing paper belonging to the authenticated user and returns 200', async () => {
      const createdPaper = await Paper.create({
        title: 'Mastering the Game of Go without Human Knowledge',
        authors: ['David Silver', 'Julian Schrittwieser', 'Demis Hassabis'],
        abstract: 'A long-standing goal of artificial intelligence is an algorithm that learns...',
        doi: '10.1038/nature24270',
        year: 2017,
        publicationDate: new Date('2017-10-19'),
        venue: 'Nature',
        publisher: 'Nature Publishing Group',
        url: 'https://www.nature.com/articles/nature24270',
        tags: ['reinforcement-learning', 'alphago', 'ai'],
        owner: testUser1._id,
      });

      const res = await fetch(`${baseUrl}/api/papers/${createdPaper._id.toString()}`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.ok(body.paper);
      assert.strictEqual(body.paper.id, createdPaper._id.toString());
      assert.strictEqual(body.paper._id, undefined, '_id must be stripped by toJSON transform');
      assert.strictEqual(body.paper.title, 'Mastering the Game of Go without Human Knowledge');
      assert.deepStrictEqual(body.paper.authors, ['David Silver', 'Julian Schrittwieser', 'Demis Hassabis']);
      assert.strictEqual(body.paper.abstract, 'A long-standing goal of artificial intelligence is an algorithm that learns...');
      assert.strictEqual(body.paper.doi, '10.1038/nature24270');
      assert.strictEqual(body.paper.year, 2017);
      assert.strictEqual(new Date(body.paper.publicationDate).toISOString(), new Date('2017-10-19').toISOString());
      assert.strictEqual(body.paper.venue, 'Nature');
      assert.strictEqual(body.paper.publisher, 'Nature Publishing Group');
      assert.strictEqual(body.paper.url, 'https://www.nature.com/articles/nature24270');
      assert.deepStrictEqual(body.paper.tags, ['reinforcement-learning', 'alphago', 'ai']);
      assert.strictEqual(body.paper.owner, testUser1._id.toString());
      assert.ok(body.paper.createdAt);
      assert.ok(body.paper.updatedAt);
    });

    it('retrieves a minimal manual paper without DOI belonging to the authenticated user', async () => {
      const minimalPaper = await Paper.create({
        title: 'Manual Research Note',
        authors: ['Self Author'],
        owner: testUser1._id,
      });

      const res = await fetch(`${baseUrl}/api/papers/${minimalPaper._id.toString()}`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.strictEqual(body.paper.id, minimalPaper._id.toString());
      assert.strictEqual(body.paper.title, 'Manual Research Note');
      assert.strictEqual(body.paper.doi, undefined);
      assert.strictEqual(body.paper.owner, testUser1._id.toString());
    });
  });

  describe('Nonexistent & Cross-User Security Boundary (HTTP 404)', () => {
    it('returns 404 Not Found when paper ID does not exist in the database', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();

      const res = await fetch(`${baseUrl}/api/papers/${nonExistentId}`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error?.message, 'Paper not found');
    });

    it('returns 404 Not Found when paper belongs to another user (no information leakage)', async () => {
      // User 2 owns this paper
      const user2Paper = await Paper.create({
        title: 'Confidential Quantum Algorithm',
        authors: ['Secret Researcher'],
        doi: '10.1103/physrevlett.123.456789',
        owner: testUser2._id,
      });

      // User 1 attempts to retrieve User 2's paper
      const res = await fetch(`${baseUrl}/api/papers/${user2Paper._id.toString()}`, {
        headers: { Cookie: authCookie1 },
      });

      // Must return identical 404 status and message, preventing enumeration or existence leakage
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error?.message, 'Paper not found');
      assert.strictEqual(body.paper, undefined, 'No paper data must leak');

      // User 2 can retrieve their own paper
      const resUser2 = await fetch(`${baseUrl}/api/papers/${user2Paper._id.toString()}`, {
        headers: { Cookie: authCookie2 },
      });
      assert.strictEqual(resUser2.status, 200);
      const bodyUser2 = await resUser2.json();
      assert.strictEqual(bodyUser2.paper?.id, user2Paper._id.toString());
    });
  });

  describe('Route Disambiguation & Non-Interference', () => {
    it('ensures /lookup is not shadowed or matched as an :id parameter', async () => {
      // Request /api/papers/lookup with a missing doi param should return 400 from lookupPaperByDoi,
      // NOT 400 "Invalid paper ID format" or 404 "Paper not found" from getPaperById
      const res = await fetch(`${baseUrl}/api/papers/lookup`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('The "doi" query parameter is required'));
    });
  });
});
