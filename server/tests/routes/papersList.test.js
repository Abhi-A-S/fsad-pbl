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

const TEST_DB_PATH = '/tmp/rf-list-test-suite-db';
const TEST_PORT = 27021;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_list_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_list_test';

let mongodProcess = null;
let serverInstance = null;
let baseUrl = '';
let testUserA = null;
let testUserB = null;
let authCookieA = '';
let authCookieB = '';

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
      throw new Error('Unable to establish MongoDB connection for list papers test suite.');
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

describe('GET /api/papers Integration Tests', () => {
  before(async () => {
    await setupDatabaseConnection();
    await User.syncIndexes();
    await Paper.syncIndexes();

    testUserA = await User.create({
      email: 'usera@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'User Alpha',
    });
    const tokenA = generateToken({ id: testUserA._id.toString(), email: testUserA.email });
    authCookieA = `${config.cookieName}=${tokenA}`;

    testUserB = await User.create({
      email: 'userb@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'User Beta',
    });
    const tokenB = generateToken({ id: testUserB._id.toString(), email: testUserB.email });
    authCookieB = `${config.cookieName}=${tokenB}`;

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
      const res = await fetch(`${baseUrl}/api/papers`);
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('Authentication required'));
    });

    it('returns 401 Unauthorized when token is invalid or tampered', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        headers: { Cookie: `${config.cookieName}=invalid-jwt-token` },
      });
      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('Invalid authentication token'));
    });
  });

  describe('Empty Library Handling', () => {
    it('returns empty papers array, total 0, and totalPages 0 when user has no papers', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        headers: { Cookie: authCookieA },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.deepStrictEqual(body.papers, []);
      assert.deepStrictEqual(body.pagination, {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });
  });

  describe('User Isolation & Ownership Scoping', () => {
    it('returns only papers belonging to the authenticated user and ignores papers belonging to other users', async () => {
      // Create 2 papers for user A
      await Paper.create([
        { title: 'Alpha Paper 1', authors: ['Author A1'], owner: testUserA._id },
        { title: 'Alpha Paper 2', authors: ['Author A2'], owner: testUserA._id },
      ]);

      // Create 3 papers for user B
      await Paper.create([
        { title: 'Beta Paper 1', authors: ['Author B1'], owner: testUserB._id },
        { title: 'Beta Paper 2', authors: ['Author B2'], owner: testUserB._id },
        { title: 'Beta Paper 3', authors: ['Author B3'], owner: testUserB._id },
      ]);

      // User A requests papers
      const resA = await fetch(`${baseUrl}/api/papers`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resA.status, 200);
      const bodyA = await resA.json();

      assert.strictEqual(bodyA.papers.length, 2);
      assert.strictEqual(bodyA.pagination.total, 2);
      assert.strictEqual(bodyA.pagination.totalPages, 1);
      assert.ok(bodyA.papers.every((p) => p.owner === testUserA._id.toString()));
      assert.ok(bodyA.papers.some((p) => p.title === 'Alpha Paper 1'));
      assert.ok(bodyA.papers.some((p) => p.title === 'Alpha Paper 2'));

      // User B requests papers
      const resB = await fetch(`${baseUrl}/api/papers`, {
        headers: { Cookie: authCookieB },
      });
      assert.strictEqual(resB.status, 200);
      const bodyB = await resB.json();

      assert.strictEqual(bodyB.papers.length, 3);
      assert.strictEqual(bodyB.pagination.total, 3);
      assert.strictEqual(bodyB.pagination.totalPages, 1);
      assert.ok(bodyB.papers.every((p) => p.owner === testUserB._id.toString()));
      assert.ok(bodyB.papers.every((p) => !p.title.startsWith('Alpha')));
    });

    it('ignores client-supplied owner query parameter and strictly scopes to authenticated user', async () => {
      await Paper.create({
        title: 'Secret Beta Research',
        authors: ['Author Beta'],
        owner: testUserB._id,
      });

      // User A attempts to inspect User B's papers via query param
      const res = await fetch(`${baseUrl}/api/papers?owner=${testUserB._id.toString()}`, {
        headers: { Cookie: authCookieA },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.papers.length, 0);
      assert.strictEqual(body.pagination.total, 0);
    });
  });

  describe('Default Sorting & Document Transformation', () => {
    it('returns papers sorted by createdAt descending (newest first) by default', async () => {
      const now = Date.now();
      await Paper.create({
        title: 'Old Paper',
        authors: ['Author 1'],
        owner: testUserA._id,
        createdAt: new Date(now - 100000),
      });
      await Paper.create({
        title: 'Middle Paper',
        authors: ['Author 2'],
        owner: testUserA._id,
        createdAt: new Date(now - 50000),
      });
      await Paper.create({
        title: 'Newest Paper',
        authors: ['Author 3'],
        owner: testUserA._id,
        createdAt: new Date(now),
      });

      const res = await fetch(`${baseUrl}/api/papers`, {
        headers: { Cookie: authCookieA },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.strictEqual(body.papers.length, 3);
      assert.strictEqual(body.papers[0].title, 'Newest Paper');
      assert.strictEqual(body.papers[1].title, 'Middle Paper');
      assert.strictEqual(body.papers[2].title, 'Old Paper');
    });

    it('returns properly formatted Paper documents with id instead of _id', async () => {
      await Paper.create({
        title: 'Formatted Document Test',
        authors: ['Author Format'],
        doi: '10.1000/182',
        owner: testUserA._id,
      });

      const res = await fetch(`${baseUrl}/api/papers`, {
        headers: { Cookie: authCookieA },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      const paper = body.papers[0];

      assert.ok(paper.id);
      assert.strictEqual(paper._id, undefined, '_id must be stripped by toJSON transform');
      assert.strictEqual(paper.title, 'Formatted Document Test');
      assert.strictEqual(paper.doi, '10.1000/182');
      assert.strictEqual(paper.owner, testUserA._id.toString());
      assert.ok(paper.createdAt);
      assert.ok(paper.updatedAt);
    });
  });

  describe('Pagination Logic', () => {
    it('paginates correctly using default page 1 and limit 10', async () => {
      // Create 15 papers for user A
      const papersToCreate = Array.from({ length: 15 }, (_, i) => ({
        title: `Paper ${String(i + 1).padStart(2, '0')}`,
        authors: [`Author ${i + 1}`],
        owner: testUserA._id,
      }));
      await Paper.create(papersToCreate);

      // Default request (page 1, limit 10)
      const res = await fetch(`${baseUrl}/api/papers`, {
        headers: { Cookie: authCookieA },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.strictEqual(body.papers.length, 10);
      assert.deepStrictEqual(body.pagination, {
        page: 1,
        limit: 10,
        total: 15,
        totalPages: 2,
      });
    });

    it('paginates with custom page and limit parameters', async () => {
      const now = Date.now();
      const papersToCreate = Array.from({ length: 12 }, (_, i) => ({
        title: `Item ${i + 1}`,
        authors: ['Author'],
        owner: testUserA._id,
        createdAt: new Date(now + i * 1000), // Item 12 is newest
      }));
      await Paper.create(papersToCreate);

      // Fetch page 2 with limit 5 (should return items 6 through 10 from newest: Item 7 through Item 3)
      const res = await fetch(`${baseUrl}/api/papers?page=2&limit=5`, {
        headers: { Cookie: authCookieA },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.strictEqual(body.papers.length, 5);
      assert.deepStrictEqual(body.pagination, {
        page: 2,
        limit: 5,
        total: 12,
        totalPages: 3,
      });
      assert.strictEqual(body.papers[0].title, 'Item 7');
      assert.strictEqual(body.papers[4].title, 'Item 3');
    });

    it('calculates total and totalPages correctly across multi-page collections', async () => {
      const papersToCreate = Array.from({ length: 25 }, (_, i) => ({
        title: `Collection Paper ${i + 1}`,
        authors: ['Author'],
        owner: testUserA._id,
      }));
      await Paper.create(papersToCreate);

      const res = await fetch(`${baseUrl}/api/papers?page=3&limit=10`, {
        headers: { Cookie: authCookieA },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.strictEqual(body.papers.length, 5);
      assert.deepStrictEqual(body.pagination, {
        page: 3,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('returns empty array when requested page exceeds totalPages', async () => {
      await Paper.create({
        title: 'Only Paper',
        authors: ['Author'],
        owner: testUserA._id,
      });

      const res = await fetch(`${baseUrl}/api/papers?page=5&limit=10`, {
        headers: { Cookie: authCookieA },
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();

      assert.deepStrictEqual(body.papers, []);
      assert.deepStrictEqual(body.pagination, {
        page: 5,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('Pagination Validation (HTTP 400)', () => {
    it('returns 400 when page is less than 1 (e.g. 0 or negative)', async () => {
      const resZero = await fetch(`${baseUrl}/api/papers?page=0`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resZero.status, 400);
      const bodyZero = await resZero.json();
      assert.ok(bodyZero.error?.message?.includes('Page parameter'));

      const resNeg = await fetch(`${baseUrl}/api/papers?page=-5`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resNeg.status, 400);
      const bodyNeg = await resNeg.json();
      assert.ok(bodyNeg.error?.message?.includes('Page parameter'));
    });

    it('returns 400 when page is not an integer (e.g. string or float)', async () => {
      const resString = await fetch(`${baseUrl}/api/papers?page=abc`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resString.status, 400);

      const resFloat = await fetch(`${baseUrl}/api/papers?page=1.5`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resFloat.status, 400);
    });

    it('returns 400 when limit is less than 1 (e.g. 0 or negative)', async () => {
      const resZero = await fetch(`${baseUrl}/api/papers?limit=0`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resZero.status, 400);

      const resNeg = await fetch(`${baseUrl}/api/papers?limit=-10`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resNeg.status, 400);
    });

    it('returns 400 when limit is not an integer (e.g. string or float)', async () => {
      const resString = await fetch(`${baseUrl}/api/papers?limit=xyz`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resString.status, 400);

      const resFloat = await fetch(`${baseUrl}/api/papers?limit=10.5`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resFloat.status, 400);
    });

    it('returns 400 when limit exceeds maximum page size of 50', async () => {
      const res = await fetch(`${baseUrl}/api/papers?limit=51`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('cannot exceed 50'));

      // Limit 50 should succeed
      const resMax = await fetch(`${baseUrl}/api/papers?limit=50`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resMax.status, 200);
    });
  });

  describe('Multi-User Pagination Non-Leakage', () => {
    it('ensures pagination count and pages do not leak records between different users', async () => {
      // User A creates 8 papers
      await Paper.create(
        Array.from({ length: 8 }, (_, i) => ({
          title: `User A Paper ${i + 1}`,
          authors: ['Alpha'],
          owner: testUserA._id,
        }))
      );

      // User B creates 15 papers
      await Paper.create(
        Array.from({ length: 15 }, (_, i) => ({
          title: `User B Paper ${i + 1}`,
          authors: ['Beta'],
          owner: testUserB._id,
        }))
      );

      // User A requests page 1 with limit 5 -> total 8, totalPages 2
      const resA = await fetch(`${baseUrl}/api/papers?page=1&limit=5`, {
        headers: { Cookie: authCookieA },
      });
      assert.strictEqual(resA.status, 200);
      const bodyA = await resA.json();
      assert.strictEqual(bodyA.papers.length, 5);
      assert.strictEqual(bodyA.pagination.total, 8);
      assert.strictEqual(bodyA.pagination.totalPages, 2);

      // User B requests page 1 with limit 5 -> total 15, totalPages 3
      const resB = await fetch(`${baseUrl}/api/papers?page=1&limit=5`, {
        headers: { Cookie: authCookieB },
      });
      assert.strictEqual(resB.status, 200);
      const bodyB = await resB.json();
      assert.strictEqual(bodyB.papers.length, 5);
      assert.strictEqual(bodyB.pagination.total, 15);
      assert.strictEqual(bodyB.pagination.totalPages, 3);
    });
  });
});
