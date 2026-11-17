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

const TEST_DB_PATH = '/tmp/rf-delete-test-suite-db';
const TEST_PORT = 27025;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_delete_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_delete_test';

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
      throw new Error('Unable to establish MongoDB connection for delete paper test suite.');
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

describe('DELETE /api/papers/:id Integration Tests', () => {
  before(async () => {
    await setupDatabaseConnection();
    await User.syncIndexes();
    await Paper.syncIndexes();

    testUser1 = await User.create({
      email: 'deleteowner1@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'Delete Primary Owner',
    });
    const token1 = generateToken({ id: testUser1._id.toString(), email: testUser1.email });
    authCookie1 = `${config.cookieName}=${token1}`;

    testUser2 = await User.create({
      email: 'deleteowner2@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'Delete Secondary Owner',
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
    it('should return HTTP 401 when no authentication cookie is provided', async () => {
      const paper = await Paper.create({
        title: 'Protected Paper',
        authors: ['Author One'],
        owner: testUser1._id,
      });

      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'DELETE',
      });

      assert.equal(response.status, 401);
      const data = await response.json();
      assert.match(data.error.message, /authentication required/i);

      // Verify paper was not deleted
      const check = await Paper.findById(paper._id);
      assert.ok(check);
    });

    it('should return HTTP 401 when an invalid or tampered token is provided', async () => {
      const paper = await Paper.create({
        title: 'Protected Paper',
        authors: ['Author One'],
        owner: testUser1._id,
      });

      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'DELETE',
        headers: {
          Cookie: `${config.cookieName}=invalid-tampered-token`,
        },
      });

      assert.equal(response.status, 401);
      const data = await response.json();
      assert.match(data.error.message, /invalid authentication token/i);

      // Verify paper was not deleted
      const check = await Paper.findById(paper._id);
      assert.ok(check);
    });
  });

  describe('ID Format Validation', () => {
    it('should return HTTP 400 for malformed ObjectId values', async () => {
      const malformedIds = [
        'invalid-id',
        '123',
        '507f1f77bcf86cd799439011extra',
        '507f1f77bcf86cd79943901z',
      ];

      for (const badId of malformedIds) {
        const response = await fetch(`${baseUrl}/api/papers/${badId}`, {
          method: 'DELETE',
          headers: {
            Cookie: authCookie1,
          },
        });

        assert.equal(response.status, 400, `Expected 400 for bad ID "${badId}"`);
        const data = await response.json();
        assert.equal(data.error.message, 'Invalid paper ID format');
      }
    });
  });

  describe('Successful Deletion and Verification', () => {
    it('should successfully delete an existing paper belonging to the authenticated user', async () => {
      const paper = await Paper.create({
        title: 'Paper to Delete',
        authors: ['Author One', 'Author Two'],
        doi: '10.1000/delete-doi',
        owner: testUser1._id,
      });

      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'DELETE',
        headers: {
          Cookie: authCookie1,
        },
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.message, 'Paper deleted successfully');
      assert.equal(data.id, paper._id.toString());

      // Verify the document no longer exists in MongoDB
      const check = await Paper.findById(paper._id);
      assert.equal(check, null);
    });

    it('should return HTTP 404 upon repeated deletion attempts for the same paper', async () => {
      const paper = await Paper.create({
        title: 'One-Time Paper',
        authors: ['Author'],
        owner: testUser1._id,
      });

      // First deletion: succeeds with 200
      const res1 = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'DELETE',
        headers: { Cookie: authCookie1 },
      });
      assert.equal(res1.status, 200);

      // Second deletion: returns 404 Not Found
      const res2 = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'DELETE',
        headers: { Cookie: authCookie1 },
      });
      assert.equal(res2.status, 404);
      const data2 = await res2.json();
      assert.equal(data2.error.message, 'Paper not found');
    });

    it('should ignore any request body or query parameters attempting to alter deletion scope', async () => {
      const paper = await Paper.create({
        title: 'Scoped Paper',
        authors: ['Author'],
        owner: testUser1._id,
      });

      // Try passing extra body or query params to tamper with owner
      const response = await fetch(`${baseUrl}/api/papers/${paper._id}?owner=${testUser2._id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ owner: testUser2._id.toString() }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.message, 'Paper deleted successfully');
      assert.equal(data.id, paper._id.toString());

      // Confirm removed
      const check = await Paper.findById(paper._id);
      assert.equal(check, null);
    });
  });

  describe('Security Boundaries & Cross-User Isolation', () => {
    it('should return HTTP 404 when attempting to delete a nonexistent paper ID', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();

      const response = await fetch(`${baseUrl}/api/papers/${nonExistentId}`, {
        method: 'DELETE',
        headers: {
          Cookie: authCookie1,
        },
      });

      assert.equal(response.status, 404);
      const data = await response.json();
      assert.equal(data.error.message, 'Paper not found');
    });

    it('should return HTTP 404 when attempting to delete another user paper and leave it untouched', async () => {
      // User 2 owns this paper
      const user2Paper = await Paper.create({
        title: 'User 2 Research',
        authors: ['Researcher 2'],
        doi: '10.1000/user2-intact-doi',
        owner: testUser2._id,
      });

      // User 1 attempts to delete User 2's paper
      const response = await fetch(`${baseUrl}/api/papers/${user2Paper._id}`, {
        method: 'DELETE',
        headers: {
          Cookie: authCookie1,
        },
      });

      assert.equal(response.status, 404);
      const data = await response.json();
      assert.equal(data.error.message, 'Paper not found');

      // Verify User 2's paper remains intact in MongoDB
      const check = await Paper.findById(user2Paper._id);
      assert.ok(check);
      assert.equal(check.title, 'User 2 Research');
      assert.equal(check.owner.toString(), testUser2._id.toString());
    });
  });

  describe('Route Non-Interference', () => {
    it('should preserve existing behavior of /lookup, list, detail, create, and update routes', async () => {
      // 1. Create a paper (POST /api/papers)
      const createRes = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Preserved Route Paper',
          authors: ['Author X'],
          doi: '10.1000/preserved-route',
        }),
      });
      assert.equal(createRes.status, 201);
      const createData = await createRes.json();
      const paperId = createData.paper.id;

      // 2. Retrieve paper (GET /api/papers/:id)
      const getRes = await fetch(`${baseUrl}/api/papers/${paperId}`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(getRes.status, 200);

      // 3. List papers (GET /api/papers)
      const listRes = await fetch(`${baseUrl}/api/papers`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      assert.ok(listData.papers.length >= 1);

      // 4. Update paper (PUT /api/papers/:id)
      const putRes = await fetch(`${baseUrl}/api/papers/${paperId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Preserved Route Paper Updated',
        }),
      });
      assert.equal(putRes.status, 200);
      const putData = await putRes.json();
      assert.equal(putData.paper.title, 'Preserved Route Paper Updated');

      // 5. Crossref lookup (GET /api/papers/lookup)
      const lookupRes = await fetch(`${baseUrl}/api/papers/lookup?doi=invalid-doi-format`, {
        headers: { Cookie: authCookie1 },
      });
      // Structural validation on DOI returns 400 without invoking Crossref, confirming route is reached
      assert.equal(lookupRes.status, 400);

      // 6. Delete paper (DELETE /api/papers/:id)
      const delRes = await fetch(`${baseUrl}/api/papers/${paperId}`, {
        method: 'DELETE',
        headers: { Cookie: authCookie1 },
      });
      assert.equal(delRes.status, 200);
    });
  });
});
