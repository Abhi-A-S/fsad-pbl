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

const TEST_DB_PATH = '/tmp/rf-update-test-suite-db';
const TEST_PORT = 27024;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_update_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_update_test';

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
      throw new Error('Unable to establish MongoDB connection for update paper test suite.');
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

describe('PUT /api/papers/:id Integration Tests', () => {
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
    it('should return HTTP 401 when no authentication cookie is provided', async () => {
      const paper = await Paper.create({
        title: 'Original Title',
        authors: ['Alice Smith'],
        owner: testUser1._id,
      });

      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      });

      assert.equal(response.status, 401);
      const data = await response.json();
      assert.match(data.error.message, /authentication required/i);
    });

    it('should return HTTP 401 when an invalid/tampered cookie is provided', async () => {
      const paper = await Paper.create({
        title: 'Original Title',
        authors: ['Alice Smith'],
        owner: testUser1._id,
      });

      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${config.cookieName}=invalid-tampered-token`,
        },
        body: JSON.stringify({ title: 'New Title' }),
      });

      assert.equal(response.status, 401);
      const data = await response.json();
      assert.match(data.error.message, /invalid authentication token/i);
    });
  });

  describe('ID Format Validation', () => {
    it('should return HTTP 400 for malformed ObjectId values', async () => {
      const malformedIds = [
        'invalid-id',
        '12345',
        '507f1f77bcf86cd799439011extra',
        '507f1f77bcf86cd79943901z',
      ];

      for (const badId of malformedIds) {
        const response = await fetch(`${baseUrl}/api/papers/${badId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: authCookie1,
          },
          body: JSON.stringify({ title: 'Updated Title' }),
        });

        assert.equal(response.status, 400, `Expected 400 for bad ID "${badId}"`);
        const data = await response.json();
        assert.equal(data.error.message, 'Invalid paper ID format');
      }
    });
  });

  describe('Metadata Field Updates', () => {
    it('should successfully update each editable metadata field individually and together', async () => {
      const paper = await Paper.create({
        title: 'Original Title',
        authors: ['Author One'],
        abstract: 'Original abstract',
        doi: '10.1000/original-doi',
        year: 2020,
        publicationDate: new Date('2020-01-01'),
        venue: 'Original Venue',
        publisher: 'Original Publisher',
        url: 'https://example.org/original',
        tags: ['original-tag'],
        owner: testUser1._id,
      });

      const updatePayload = {
        title: 'Updated Modern Transformer Architectures',
        authors: ['Alice Walker', 'Bob Vance'],
        abstract: 'Updated comprehensive analysis of transformer mechanisms.',
        doi: 'https://doi.org/10.1000/updated-doi', // tests normalization
        year: 2024,
        publicationDate: '2024-06-15T00:00:00.000Z',
        venue: 'NeurIPS 2024',
        publisher: 'Curran Associates',
        url: 'https://neurips.cc/paper/2024/updated',
        tags: ['machine-learning', 'transformers'],
      };

      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify(updatePayload),
      });

      assert.equal(response.status, 200);
      const data = await response.json();

      assert.ok(data.paper);
      assert.equal(data.paper.id, paper._id.toString());
      assert.equal(data.paper.title, 'Updated Modern Transformer Architectures');
      assert.deepEqual(data.paper.authors, ['Alice Walker', 'Bob Vance']);
      assert.equal(data.paper.abstract, 'Updated comprehensive analysis of transformer mechanisms.');
      assert.equal(data.paper.doi, '10.1000/updated-doi'); // normalized
      assert.equal(data.paper.year, 2024);
      assert.equal(new Date(data.paper.publicationDate).toISOString(), '2024-06-15T00:00:00.000Z');
      assert.equal(data.paper.venue, 'NeurIPS 2024');
      assert.equal(data.paper.publisher, 'Curran Associates');
      assert.equal(data.paper.url, 'https://neurips.cc/paper/2024/updated');
      assert.deepEqual(data.paper.tags, ['machine-learning', 'transformers']);
      assert.equal(data.paper._id, undefined, '_id must be transformed to id');

      // Verify directly from MongoDB
      const stored = await Paper.findById(paper._id);
      assert.equal(stored.title, 'Updated Modern Transformer Architectures');
      assert.equal(stored.doi, '10.1000/updated-doi');
      assert.equal(stored.year, 2024);
    });

    it('should treat PUT as partial metadata update and retain omitted fields', async () => {
      const paper = await Paper.create({
        title: 'Initial Title',
        authors: ['Original Author'],
        abstract: 'Initial abstract preserved across partial update',
        doi: '10.1000/partial-doi',
        year: 2021,
        venue: 'ACM SIGMOD',
        publisher: 'ACM',
        url: 'https://sigmod.org/2021',
        tags: ['databases', 'systems'],
        owner: testUser1._id,
      });

      // Update only title and tags; omit authors, abstract, doi, year, venue, publisher, url
      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Revised Title Only',
          tags: ['databases', 'indexing'],
        }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();

      assert.equal(data.paper.title, 'Revised Title Only');
      assert.deepEqual(data.paper.tags, ['databases', 'indexing']);
      // Retained fields
      assert.deepEqual(data.paper.authors, ['Original Author']);
      assert.equal(data.paper.abstract, 'Initial abstract preserved across partial update');
      assert.equal(data.paper.doi, '10.1000/partial-doi');
      assert.equal(data.paper.year, 2021);
      assert.equal(data.paper.venue, 'ACM SIGMOD');
      assert.equal(data.paper.publisher, 'ACM');
      assert.equal(data.paper.url, 'https://sigmod.org/2021');
    });

    it('should update updatedAt timestamp normally', async () => {
      const paper = await Paper.create({
        title: 'Timestamp Test',
        authors: ['Author'],
        owner: testUser1._id,
      });

      const initialUpdatedAt = paper.updatedAt.getTime();

      // Ensure minimal time delta
      await new Promise((r) => setTimeout(r, 20));

      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ title: 'New Timestamp Title' }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      const updatedTimestamp = new Date(data.paper.updatedAt).getTime();
      assert.ok(updatedTimestamp >= initialUpdatedAt, 'updatedAt must be updated');
    });
  });

  describe('Security and Ownership Isolation', () => {
    it('should ignore attempts to spoof or reassign the owner field', async () => {
      const paper = await Paper.create({
        title: 'Protected Ownership Paper',
        authors: ['Original Owner'],
        owner: testUser1._id,
      });

      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Owner Spoofing Attempt',
          owner: testUser2._id.toString(), // Attempted spoof
        }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.paper.owner, testUser1._id.toString());

      // Verify in DB directly
      const refreshed = await Paper.findById(paper._id);
      assert.equal(refreshed.owner.toString(), testUser1._id.toString());
    });

    it('should ignore attempts to modify internal fields (_id, createdAt, __v)', async () => {
      const originalCreatedAt = new Date('2020-01-01T00:00:00.000Z');
      const paper = await Paper.create({
        title: 'Internal Fields Protection',
        authors: ['System Author'],
        createdAt: originalCreatedAt,
        owner: testUser1._id,
      });

      const newFakeId = new mongoose.Types.ObjectId().toString();

      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          _id: newFakeId,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          __v: 99,
          title: 'Safe Update',
        }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.paper.id, paper._id.toString());
      assert.equal(new Date(data.paper.createdAt).toISOString(), originalCreatedAt.toISOString());
    });

    it('should return HTTP 404 when updating a nonexistent paper ID', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();

      const response = await fetch(`${baseUrl}/api/papers/${nonExistentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ title: 'Does Not Exist' }),
      });

      assert.equal(response.status, 404);
      const data = await response.json();
      assert.equal(data.error.message, 'Paper not found');
    });

    it('should return HTTP 404 and prevent updating another user paper', async () => {
      // User 2 owns this paper
      const user2Paper = await Paper.create({
        title: 'User 2 Secret Paper',
        authors: ['User 2'],
        abstract: 'Top secret research',
        owner: testUser2._id,
      });

      // User 1 tries to update User 2's paper
      const response = await fetch(`${baseUrl}/api/papers/${user2Paper._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Hacked Title By User 1',
          abstract: 'Overwritten abstract',
        }),
      });

      assert.equal(response.status, 404);
      const data = await response.json();
      assert.equal(data.error.message, 'Paper not found');

      // Verify User 2's paper remains completely unchanged
      const intact = await Paper.findById(user2Paper._id);
      assert.equal(intact.title, 'User 2 Secret Paper');
      assert.equal(intact.abstract, 'Top secret research');
      assert.equal(intact.owner.toString(), testUser2._id.toString());
    });
  });

  describe('DOI Uniqueness and Conflict Handling', () => {
    it('should return HTTP 409 when updating DOI to one already owned by the same user', async () => {
      await Paper.create({
        title: 'Existing First Paper',
        authors: ['Author One'],
        doi: '10.1000/existing-shared-doi',
        owner: testUser1._id,
      });

      const paper2 = await Paper.create({
        title: 'Second Paper',
        authors: ['Author Two'],
        doi: '10.1000/distinct-doi',
        owner: testUser1._id,
      });

      // Attempt to update paper2's DOI to match paper1's DOI
      const response = await fetch(`${baseUrl}/api/papers/${paper2._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          doi: '10.1000/existing-shared-doi',
        }),
      });

      assert.equal(response.status, 409);
      const data = await response.json();
      assert.equal(data.error.message, 'A paper with this DOI already exists in your library');

      // Verify paper2's DOI in DB was not changed
      const refreshed = await Paper.findById(paper2._id);
      assert.equal(refreshed.doi, '10.1000/distinct-doi');
    });

    it('should allow retaining the same DOI on the paper being updated', async () => {
      const paper = await Paper.create({
        title: 'Current Paper',
        authors: ['Author One'],
        doi: '10.1000/self-retained-doi',
        owner: testUser1._id,
      });

      const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Updated Title Same DOI',
          doi: '10.1000/self-retained-doi',
        }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.paper.title, 'Updated Title Same DOI');
      assert.equal(data.paper.doi, '10.1000/self-retained-doi');
    });

    it('should allow updating to a DOI owned by another user', async () => {
      // User 2 owns a paper with this DOI
      await Paper.create({
        title: 'User 2 Paper',
        authors: ['Author Two'],
        doi: '10.1000/cross-user-allowed-doi',
        owner: testUser2._id,
      });

      // User 1 has a paper
      const paper1 = await Paper.create({
        title: 'User 1 Paper',
        authors: ['Author One'],
        owner: testUser1._id,
      });

      // User 1 updates their paper to the same DOI
      const response = await fetch(`${baseUrl}/api/papers/${paper1._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          doi: '10.1000/cross-user-allowed-doi',
        }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.paper.doi, '10.1000/cross-user-allowed-doi');

      // Both papers exist independently
      const count = await Paper.countDocuments({ doi: '10.1000/cross-user-allowed-doi' });
      assert.equal(count, 2);
    });
  });

  describe('Validation and Non-Persistence on Failure', () => {
    it('should reject invalid metadata with HTTP 400 and not partially persist changes', async () => {
      const paper = await Paper.create({
        title: 'Initial Solid Title',
        authors: ['Valid Author'],
        year: 2022,
        doi: '10.1000/solid-doi',
        tags: ['valid-tag'],
        owner: testUser1._id,
      });

      const invalidPayloads = [
        {
          name: 'Empty title',
          payload: { title: '', year: 2023 },
          expectedStatus: 400,
        },
        {
          name: 'Invalid DOI format',
          payload: { doi: 'not-a-valid-doi' },
          expectedStatus: 400,
        },
        {
          name: 'Out-of-range future year',
          payload: { year: 2099 },
          expectedStatus: 400,
        },
        {
          name: 'Empty authors array',
          payload: { authors: [] },
          expectedStatus: 400,
        },
        {
          name: 'Invalid date string',
          payload: { publicationDate: 'not-a-real-date' },
          expectedStatus: 400,
        },
        {
          name: 'Duplicate tags',
          payload: { tags: ['Quantum', 'quantum'] },
          expectedStatus: 400,
        },
        {
          name: 'Exceeding max tags count',
          payload: { tags: Array.from({ length: 31 }, (_, i) => `tag-${i}`) },
          expectedStatus: 400,
        },
        {
          name: 'Invalid URL format',
          payload: { url: 'ftp://invalid-url.com' },
          expectedStatus: 400,
        },
      ];

      for (const testCase of invalidPayloads) {
        const response = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Cookie: authCookie1,
          },
          body: JSON.stringify(testCase.payload),
        });

        assert.equal(
          response.status,
          testCase.expectedStatus,
          `Failed for case: ${testCase.name}`
        );
        const data = await response.json();
        assert.ok(data.error && data.error.message, `Expected error message for: ${testCase.name}`);

        // Verify document in database was NOT altered
        const dbCheck = await Paper.findById(paper._id);
        assert.equal(dbCheck.title, 'Initial Solid Title');
        assert.equal(dbCheck.year, 2022);
        assert.equal(dbCheck.doi, '10.1000/solid-doi');
        assert.deepEqual(dbCheck.tags, ['valid-tag']);
      }
    });
  });
});
