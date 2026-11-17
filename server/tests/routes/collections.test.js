import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Paper } from '../../src/models/Paper.js';
import { Collection } from '../../src/models/Collection.js';
import { generateToken } from '../../src/utils/token.js';
import { config } from '../../src/config/env.js';

const TEST_DB_PATH = '/tmp/rf-collections-routes-test-db';
const TEST_PORT = 27028;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_collections_route_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_collections_route_test';

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
      throw new Error('Unable to establish MongoDB connection for collections route test suite.');
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

  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
  }

  if (mongodProcess) {
    mongodProcess.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    rmSync(TEST_DB_PATH, { recursive: true, force: true });
  } catch {}
}

describe('Collections Route Integration Tests', () => {
  before(async () => {
    await setupDatabaseConnection();
    await User.syncIndexes();
    await Paper.syncIndexes();
    await Collection.syncIndexes();

    serverInstance = app.listen(0);
    const address = serverInstance.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    testUser1 = await User.create({
      email: 'curator1@researchforge.io',
      passwordHash: '$2b$12$e8m4QO90rJzFqN8WkJ1pveFm6p01b0JqZ2h12V34567890abcdef.',
      displayName: 'Lead Curator',
    });

    testUser2 = await User.create({
      email: 'curator2@researchforge.io',
      passwordHash: '$2b$12$e8m4QO90rJzFqN8WkJ1pveFm6p01b0JqZ2h12V34567890abcdef.',
      displayName: 'Peer Curator',
    });

    const token1 = generateToken({ id: testUser1._id.toString(), email: testUser1.email });
    const token2 = generateToken({ id: testUser2._id.toString(), email: testUser2.email });
    authCookie1 = `${config.cookieName}=${token1}`;
    authCookie2 = `${config.cookieName}=${token2}`;
  });

  after(async () => {
    await teardownDatabaseConnection();
  });

  beforeEach(async () => {
    await Collection.deleteMany({});
    await Paper.deleteMany({});
  });

  describe('POST /api/collections (Create Collection)', () => {
    it('returns 401 when request lacks authentication cookie', async () => {
      const res = await fetch(`${baseUrl}/api/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Robotics' }),
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Authentication required. No token provided.');
    });

    it('returns 401 when token is invalid or tampered', async () => {
      const res = await fetch(`${baseUrl}/api/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${config.cookieName}=invalid.tampered.token`,
        },
        body: JSON.stringify({ name: 'Robotics' }),
      });

      assert.strictEqual(res.status, 401);
    });

    it('creates a collection with valid name and returns 201 with { collection }', async () => {
      const res = await fetch(`${baseUrl}/api/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          name: 'Quantum Optics',
          description: 'Key papers in quantum photonic circuits',
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.ok(data.collection);
      assert.ok(data.collection.id);
      assert.strictEqual(data.collection.name, 'Quantum Optics');
      assert.strictEqual(data.collection.description, 'Key papers in quantum photonic circuits');
      assert.strictEqual(data.collection.owner, testUser1._id.toString());
      assert.deepStrictEqual(data.collection.papers, []);

      // Verify persisted in MongoDB
      const doc = await Collection.findById(data.collection.id);
      assert.ok(doc);
      assert.strictEqual(doc.name, 'Quantum Optics');
    });

    it('returns 400 when name is missing or empty', async () => {
      const res = await fetch(`${baseUrl}/api/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ name: '   ' }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Collection name is required');
    });

    it('returns 400 when name exceeds 100 characters', async () => {
      const res = await fetch(`${baseUrl}/api/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ name: 'Z'.repeat(101) }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Collection name cannot exceed 100 characters');
    });

    it('ignores client-supplied owner and strictly binds to authenticated user', async () => {
      const spoofedOwnerId = testUser2._id.toString();

      const res = await fetch(`${baseUrl}/api/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          name: 'Spoof Test',
          owner: spoofedOwnerId,
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.collection.owner, testUser1._id.toString());
      assert.notStrictEqual(data.collection.owner, spoofedOwnerId);
    });

    it('returns 409 Conflict when creating a collection with a duplicate name for the same user', async () => {
      await Collection.create({
        name: 'Deep Learning',
        owner: testUser1._id,
      });

      const res = await fetch(`${baseUrl}/api/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ name: 'Deep Learning' }),
      });

      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'A collection with this name already exists in your library');
    });

    it('allows different users to create collections with the same name', async () => {
      await Collection.create({
        name: 'Deep Learning',
        owner: testUser1._id,
      });

      const res = await fetch(`${baseUrl}/api/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie2,
        },
        body: JSON.stringify({ name: 'Deep Learning' }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.collection.name, 'Deep Learning');
      assert.strictEqual(data.collection.owner, testUser2._id.toString());
    });
  });

  describe('GET /api/collections (List Collections)', () => {
    it('returns 401 when request lacks authentication cookie', async () => {
      const res = await fetch(`${baseUrl}/api/collections`);
      assert.strictEqual(res.status, 401);
    });

    it('returns HTTP 200 with empty array when user has no collections', async () => {
      const res = await fetch(`${baseUrl}/api/collections`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.deepStrictEqual(data.collections, []);
    });

    it('returns only collections belonging to authenticated user sorted newest-first', async () => {
      const c1 = await Collection.create({
        name: 'First Collection',
        owner: testUser1._id,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      const c2 = await Collection.create({
        name: 'Second Collection',
        owner: testUser1._id,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      });

      // User 2 collection should not appear in user 1's list
      await Collection.create({
        name: 'User 2 Secret Collection',
        owner: testUser2._id,
      });

      const res = await fetch(`${baseUrl}/api/collections`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.collections.length, 2);
      assert.strictEqual(data.collections[0].name, 'Second Collection');
      assert.strictEqual(data.collections[1].name, 'First Collection');
      assert.ok(data.collections.every((c) => c.owner === testUser1._id.toString()));
    });

    it('populates paper details within collections correctly', async () => {
      const paper = await Paper.create({
        title: 'Attention Is All You Need',
        authors: ['Vaswani et al.'],
        doi: '10.5555/3295222.3295349',
        owner: testUser1._id,
      });

      await Collection.create({
        name: 'Transformer Papers',
        owner: testUser1._id,
        papers: [paper._id],
      });

      const res = await fetch(`${baseUrl}/api/collections`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.collections.length, 1);
      assert.strictEqual(data.collections[0].papers.length, 1);
      assert.strictEqual(data.collections[0].papers[0].title, 'Attention Is All You Need');
      assert.strictEqual(data.collections[0].papers[0].id, paper._id.toString());
      assert.strictEqual(data.collections[0].papers[0]._id, undefined);
    });

    it('does not expose foreign papers if an unexpected cross-user reference exists in MongoDB', async () => {
      const user1Paper = await Paper.create({
        title: 'User 1 Legitimate Paper',
        authors: ['Author 1'],
        owner: testUser1._id,
      });

      const user2Paper = await Paper.create({
        title: 'User 2 Secret Paper',
        authors: ['Secret Author'],
        owner: testUser2._id,
      });

      // Force a cross-user paper reference directly into MongoDB collection document
      await Collection.create({
        name: 'Mixed Collection',
        owner: testUser1._id,
        papers: [user1Paper._id, user2Paper._id],
      });

      const res = await fetch(`${baseUrl}/api/collections`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const col = data.collections.find((c) => c.name === 'Mixed Collection');
      assert.ok(col);
      assert.strictEqual(col.papers.length, 1);
      assert.strictEqual(col.papers[0].title, 'User 1 Legitimate Paper');
      assert.strictEqual(col.papers[0].id, user1Paper._id.toString());
      assert.ok(!col.papers.some((p) => p.title === 'User 2 Secret Paper' || p.id === user2Paper._id.toString()));
    });
  });

  describe('POST /api/collections/:id/papers (Add Paper to Collection)', () => {
    let paper1 = null;
    let collection1 = null;

    beforeEach(async () => {
      paper1 = await Paper.create({
        title: 'Quantum Advantage with Superconducting Qubits',
        authors: ['Arute et al.'],
        doi: '10.1038/s41586-019-1666-5',
        owner: testUser1._id,
      });

      collection1 = await Collection.create({
        name: 'Quantum Computing',
        owner: testUser1._id,
      });
    });

    it('returns 401 when request lacks authentication cookie', async () => {
      const res = await fetch(`${baseUrl}/api/collections/${collection1._id}/papers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId: paper1._id.toString() }),
      });

      assert.strictEqual(res.status, 401);
    });

    it('successfully adds paper to collection and returns 200 with populated papers', async () => {
      const res = await fetch(`${baseUrl}/api/collections/${collection1._id}/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ paperId: paper1._id.toString() }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.collection);
      assert.strictEqual(data.collection.papers.length, 1);
      assert.strictEqual(data.collection.papers[0].title, 'Quantum Advantage with Superconducting Qubits');

      // Verify in database
      const doc = await Collection.findById(collection1._id);
      assert.strictEqual(doc.papers.length, 1);
      assert.strictEqual(doc.papers[0].toString(), paper1._id.toString());
    });

    it('does not duplicate paper references when adding the same paper multiple times ($addToSet)', async () => {
      // Add first time
      await fetch(`${baseUrl}/api/collections/${collection1._id}/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ paperId: paper1._id.toString() }),
      });

      // Add second time
      const res2 = await fetch(`${baseUrl}/api/collections/${collection1._id}/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ paperId: paper1._id.toString() }),
      });

      assert.strictEqual(res2.status, 200);
      const data = await res2.json();
      assert.strictEqual(data.collection.papers.length, 1);

      const doc = await Collection.findById(collection1._id);
      assert.strictEqual(doc.papers.length, 1);
    });

    it('returns 400 for malformed collection ID format', async () => {
      const res = await fetch(`${baseUrl}/api/collections/not-a-valid-id/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ paperId: paper1._id.toString() }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Invalid collection ID format');
    });

    it('returns 400 for malformed paper ID format', async () => {
      const res = await fetch(`${baseUrl}/api/collections/${collection1._id}/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ paperId: 'bad-paper-id' }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Invalid paper ID format');
    });

    it('returns 404 when collection does not exist', async () => {
      const nonExistentColId = new mongoose.Types.ObjectId().toString();

      const res = await fetch(`${baseUrl}/api/collections/${nonExistentColId}/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ paperId: paper1._id.toString() }),
      });

      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Collection not found');
    });

    it('returns 404 when collection belongs to another user (anti-enumeration & isolation)', async () => {
      const user2Col = await Collection.create({
        name: 'User 2 Col',
        owner: testUser2._id,
      });

      const res = await fetch(`${baseUrl}/api/collections/${user2Col._id}/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ paperId: paper1._id.toString() }),
      });

      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Collection not found');
    });

    it('returns 404 when paper does not exist', async () => {
      const nonExistentPaperId = new mongoose.Types.ObjectId().toString();

      const res = await fetch(`${baseUrl}/api/collections/${collection1._id}/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ paperId: nonExistentPaperId }),
      });

      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Paper not found');
    });

    it('returns 404 when attempting to add another user paper to collection', async () => {
      const user2Paper = await Paper.create({
        title: 'User 2 Confidential Paper',
        authors: ['Secret Author'],
        owner: testUser2._id,
      });

      const res = await fetch(`${baseUrl}/api/collections/${collection1._id}/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ paperId: user2Paper._id.toString() }),
      });

      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Paper not found');

      // Verify collection remains empty
      const doc = await Collection.findById(collection1._id);
      assert.strictEqual(doc.papers.length, 0);
    });

    it('ensures the Paper document itself is not modified', async () => {
      const paperBefore = await Paper.findById(paper1._id).lean();

      await fetch(`${baseUrl}/api/collections/${collection1._id}/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ paperId: paper1._id.toString() }),
      });

      const paperAfter = await Paper.findById(paper1._id).lean();
      assert.deepStrictEqual(paperBefore, paperAfter);
    });
  });

  describe('DELETE /api/collections/:id/papers/:paperId (Remove Paper from Collection)', () => {
    let paper1 = null;
    let collection1 = null;

    beforeEach(async () => {
      paper1 = await Paper.create({
        title: 'CRISPR Gene Editing Overview',
        authors: ['Doudna et al.'],
        owner: testUser1._id,
      });

      collection1 = await Collection.create({
        name: 'Genetics',
        owner: testUser1._id,
        papers: [paper1._id],
      });
    });

    it('returns 401 when request lacks authentication cookie', async () => {
      const res = await fetch(
        `${baseUrl}/api/collections/${collection1._id}/papers/${paper1._id}`,
        { method: 'DELETE' }
      );

      assert.strictEqual(res.status, 401);
    });

    it('successfully removes paper from collection and returns 200 with updated collection', async () => {
      const res = await fetch(
        `${baseUrl}/api/collections/${collection1._id}/papers/${paper1._id}`,
        {
          method: 'DELETE',
          headers: { Cookie: authCookie1 },
        }
      );

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.message, 'Paper removed from collection');
      assert.ok(data.collection);
      assert.strictEqual(data.collection.papers.length, 0);

      // Verify in MongoDB
      const doc = await Collection.findById(collection1._id);
      assert.strictEqual(doc.papers.length, 0);

      // Verify paper document itself is untouched and still exists
      const paperStillExists = await Paper.findById(paper1._id);
      assert.ok(paperStillExists);
      assert.strictEqual(paperStillExists.title, 'CRISPR Gene Editing Overview');
    });

    it('is idempotent: removing a paper not currently in the collection succeeds with 200', async () => {
      // First removal
      await fetch(
        `${baseUrl}/api/collections/${collection1._id}/papers/${paper1._id}`,
        {
          method: 'DELETE',
          headers: { Cookie: authCookie1 },
        }
      );

      // Second removal of the same paper
      const res2 = await fetch(
        `${baseUrl}/api/collections/${collection1._id}/papers/${paper1._id}`,
        {
          method: 'DELETE',
          headers: { Cookie: authCookie1 },
        }
      );

      assert.strictEqual(res2.status, 200);
      const data = await res2.json();
      assert.strictEqual(data.collection.papers.length, 0);
    });

    it('returns 400 for malformed collection ID format', async () => {
      const res = await fetch(
        `${baseUrl}/api/collections/bad-col-id/papers/${paper1._id}`,
        {
          method: 'DELETE',
          headers: { Cookie: authCookie1 },
        }
      );

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Invalid collection ID format');
    });

    it('returns 400 for malformed paper ID format', async () => {
      const res = await fetch(
        `${baseUrl}/api/collections/${collection1._id}/papers/bad-paper-id`,
        {
          method: 'DELETE',
          headers: { Cookie: authCookie1 },
        }
      );

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Invalid paper ID format');
    });

    it('returns 404 when collection does not exist', async () => {
      const nonExistentColId = new mongoose.Types.ObjectId().toString();

      const res = await fetch(
        `${baseUrl}/api/collections/${nonExistentColId}/papers/${paper1._id}`,
        {
          method: 'DELETE',
          headers: { Cookie: authCookie1 },
        }
      );

      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Collection not found');
    });

    it('returns 404 when collection belongs to another user', async () => {
      const user2Col = await Collection.create({
        name: 'User 2 Genetics',
        owner: testUser2._id,
        papers: [paper1._id],
      });

      const res = await fetch(
        `${baseUrl}/api/collections/${user2Col._id}/papers/${paper1._id}`,
        {
          method: 'DELETE',
          headers: { Cookie: authCookie1 },
        }
      );

      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Collection not found');

      // Verify User 2 collection remains intact
      const doc = await Collection.findById(user2Col._id);
      assert.strictEqual(doc.papers.length, 1);
    });
  });

  describe('Paper Deletion Integration (Cascade Cleanup)', () => {
    it('automatically removes paper reference from user collections when paper is deleted', async () => {
      const paperA = await Paper.create({
        title: 'Paper to be Deleted',
        authors: ['Author X'],
        owner: testUser1._id,
      });

      const paperB = await Paper.create({
        title: 'Paper to Remain',
        authors: ['Author Y'],
        owner: testUser1._id,
      });

      const col1 = await Collection.create({
        name: 'Collection Alpha',
        owner: testUser1._id,
        papers: [paperA._id, paperB._id],
      });

      const col2 = await Collection.create({
        name: 'Collection Beta',
        owner: testUser1._id,
        papers: [paperA._id],
      });

      // User 2 collection with different paper
      const colUser2 = await Collection.create({
        name: 'User 2 Collection',
        owner: testUser2._id,
        papers: [paperB._id],
      });

      // Delete paperA via DELETE /api/papers/:id
      const delRes = await fetch(`${baseUrl}/api/papers/${paperA._id}`, {
        method: 'DELETE',
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(delRes.status, 200);

      // Verify paperA is deleted from MongoDB
      const paperInDb = await Paper.findById(paperA._id);
      assert.strictEqual(paperInDb, null);

      // Verify col1 had paperA removed but retains paperB
      const updatedCol1 = await Collection.findById(col1._id);
      assert.strictEqual(updatedCol1.papers.length, 1);
      assert.strictEqual(updatedCol1.papers[0].toString(), paperB._id.toString());

      // Verify col2 had paperA removed and is now empty
      const updatedCol2 = await Collection.findById(col2._id);
      assert.strictEqual(updatedCol2.papers.length, 0);

      // Verify User 2 collection is completely untouched
      const updatedColUser2 = await Collection.findById(colUser2._id);
      assert.strictEqual(updatedColUser2.papers.length, 1);
      assert.strictEqual(updatedColUser2.papers[0].toString(), paperB._id.toString());
    });

    it('does not report success or leave orphaned paper state if collection cleanup fails during paper deletion', async () => {
      const paper = await Paper.create({
        title: 'Cascade Failure Test Paper',
        authors: ['Author Fail'],
        owner: testUser1._id,
      });

      const collection = await Collection.create({
        name: 'Failure Test Collection',
        owner: testUser1._id,
        papers: [paper._id],
      });

      // Temporarily mock Collection.updateMany to simulate database failure during cleanup
      const originalUpdateMany = Collection.updateMany;
      Collection.updateMany = async () => {
        throw new Error('Database write error during collection cleanup');
      };

      try {
        const res = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
          method: 'DELETE',
          headers: { Cookie: authCookie1 },
        });

        // Must not report HTTP 200 success
        assert.strictEqual(res.status, 500);
        const data = await res.json();
        assert.match(data.error.message, /Database write error during collection cleanup/);

        // Verify the Paper document was NOT deleted, preserving consistency for retry
        const paperStillExists = await Paper.findById(paper._id);
        assert.ok(paperStillExists, 'Paper should remain in DB when collection cleanup fails');
        assert.strictEqual(paperStillExists.title, 'Cascade Failure Test Paper');
      } finally {
        Collection.updateMany = originalUpdateMany;
      }

      // Verify that after restoring updateMany, a retry succeeds cleanly
      const retryRes = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'DELETE',
        headers: { Cookie: authCookie1 },
      });
      assert.strictEqual(retryRes.status, 200);

      // Verify both Paper and Collection reference are now cleaned up
      const paperAfterRetry = await Paper.findById(paper._id);
      assert.strictEqual(paperAfterRetry, null);
      const collectionAfterRetry = await Collection.findById(collection._id);
      assert.deepStrictEqual(collectionAfterRetry.papers, []);
    });
  });
});
