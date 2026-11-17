import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { Paper } from '../../src/models/Paper.js';
import { generateToken } from '../../src/utils/token.js';
import { config } from '../../src/config/env.js';

const TEST_DB_PATH = '/tmp/rf-create-test-suite-db';
const TEST_PORT = 27020;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_create_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_create_test';

let mongodProcess = null;
let serverInstance = null;
let baseUrl = '';
let testUser1 = null;
let testUser2 = null;
let authCookie1 = '';
let authCookie2 = '';
const originalFetch = globalThis.fetch;

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
      throw new Error('Unable to establish MongoDB connection for create paper test suite.');
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

describe('POST /api/papers Integration Tests', () => {
  before(async () => {
    await setupDatabaseConnection();
    await User.syncIndexes();
    await Paper.syncIndexes();

    // Create primary test user
    testUser1 = await User.create({
      email: 'user1@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'First Researcher',
    });
    const token1 = generateToken({ id: testUser1._id.toString(), email: testUser1.email });
    authCookie1 = `${config.cookieName}=${token1}`;

    // Create secondary test user for multi-user isolation checks
    testUser2 = await User.create({
      email: 'user2@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'Second Researcher',
    });
    const token2 = generateToken({ id: testUser2._id.toString(), email: testUser2.email });
    authCookie2 = `${config.cookieName}=${token2}`;

    // Start ephemeral server
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
    // Clear papers before each test while preserving users
    await Paper.deleteMany({});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Authentication Enforcement', () => {
    it('returns 401 Unauthorized when request lacks authentication cookie', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Unauthenticated Paper',
          authors: ['Jane Doe'],
        }),
      });

      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('Authentication required'));
    });

    it('returns 401 Unauthorized when token is invalid or tampered', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${config.cookieName}=invalid-token-signature`,
        },
        body: JSON.stringify({
          title: 'Tampered Token Paper',
          authors: ['Jane Doe'],
        }),
      });

      assert.strictEqual(res.status, 401);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('Invalid authentication token'));
    });
  });

  describe('Valid Paper Creation & Persistence', () => {
    it('creates a paper with full valid metadata, assigns authenticated owner, and returns 201', async () => {
      const payload = {
        title: 'Deep Residual Learning for Image Recognition',
        authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'],
        abstract: 'Deeper neural networks are more difficult to train...',
        doi: 'https://doi.org/10.1109/CVPR.2016.90',
        year: 2016,
        publicationDate: '2016-06-27T00:00:00.000Z',
        venue: 'IEEE Conference on Computer Vision and Pattern Recognition (CVPR)',
        publisher: 'IEEE',
        url: 'https://ieeexplore.ieee.org/document/7780459',
        tags: ['computer-vision', 'deep-learning', 'resnet'],
      };

      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify(payload),
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();

      assert.ok(body.paper);
      assert.ok(body.paper.id);
      assert.strictEqual(body.paper._id, undefined, '_id must be stripped by toJSON transform');
      assert.strictEqual(body.paper.title, payload.title);
      assert.deepStrictEqual(body.paper.authors, payload.authors);
      assert.strictEqual(body.paper.abstract, payload.abstract);
      assert.strictEqual(body.paper.doi, '10.1109/cvpr.2016.90', 'DOI should be normalized');
      assert.strictEqual(body.paper.year, 2016);
      assert.strictEqual(new Date(body.paper.publicationDate).toISOString(), new Date(payload.publicationDate).toISOString());
      assert.strictEqual(body.paper.venue, payload.venue);
      assert.strictEqual(body.paper.publisher, payload.publisher);
      assert.strictEqual(body.paper.url, payload.url);
      assert.deepStrictEqual(body.paper.tags, payload.tags);
      assert.strictEqual(body.paper.owner, testUser1._id.toString());
      assert.ok(body.paper.createdAt);
      assert.ok(body.paper.updatedAt);

      // Verify database persistence
      const savedDoc = await Paper.findById(body.paper.id);
      assert.ok(savedDoc);
      assert.strictEqual(savedDoc.title, payload.title);
      assert.strictEqual(savedDoc.owner.toString(), testUser1._id.toString());
    });

    it('creates a minimal paper with only required fields (title, authors) and without DOI', async () => {
      const payload = {
        title: 'A Minimal Manual Entry Without DOI',
        authors: ['Alice Smith'],
      };

      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify(payload),
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();

      assert.ok(body.paper.id);
      assert.strictEqual(body.paper.title, payload.title);
      assert.deepStrictEqual(body.paper.authors, payload.authors);
      assert.strictEqual(body.paper.doi, undefined);
      assert.strictEqual(body.paper.abstract, '');
      assert.strictEqual(body.paper.venue, '');
      assert.strictEqual(body.paper.publisher, '');
      assert.strictEqual(body.paper.url, '');
      assert.deepStrictEqual(body.paper.tags, []);
      assert.strictEqual(body.paper.owner, testUser1._id.toString());

      // Confirm persistence
      const count = await Paper.countDocuments({ owner: testUser1._id });
      assert.strictEqual(count, 1);
    });

    it('allows the same user to create multiple papers without DOIs without collision', async () => {
      const res1 = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Manual Paper One',
          authors: ['Author One'],
        }),
      });
      assert.strictEqual(res1.status, 201);

      const res2 = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Manual Paper Two',
          authors: ['Author Two'],
        }),
      });
      assert.strictEqual(res2.status, 201);

      const count = await Paper.countDocuments({ owner: testUser1._id });
      assert.strictEqual(count, 2);
    });
  });

  describe('Ownership Security & Spoofing Prevention', () => {
    it('ignores client-supplied owner in request body and strictly binds paper to authenticated user', async () => {
      const spoofedOwnerId = new mongoose.Types.ObjectId().toString();

      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Spoofing Attempt Paper',
          authors: ['Author Hack'],
          owner: spoofedOwnerId,
        }),
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();

      assert.notStrictEqual(body.paper.owner, spoofedOwnerId);
      assert.strictEqual(body.paper.owner, testUser1._id.toString());

      const savedDoc = await Paper.findById(body.paper.id);
      assert.strictEqual(savedDoc.owner.toString(), testUser1._id.toString());
      assert.notStrictEqual(savedDoc.owner.toString(), spoofedOwnerId);
    });
  });

  describe('Input Validation (HTTP 400)', () => {
    it('returns 400 when title is missing or empty string', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: '   ',
          authors: ['Author'],
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('title is required') || body.error?.message?.includes('Title cannot be empty'));
    });

    it('returns 400 when authors is missing or empty array', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'No Authors Paper',
          authors: [],
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('author is required'));
    });

    it('returns 400 when authors array contains empty or whitespace-only strings', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Whitespace Author Paper',
          authors: ['   '],
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('non-empty string'));
    });

    it('returns 400 when authors array contains strings exceeding 200 characters', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Long Author Paper',
          authors: ['A'.repeat(201)],
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('cannot exceed 200 characters'));
    });

    it('returns 400 when DOI format is invalid', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Bad DOI Paper',
          authors: ['Author'],
          doi: 'not-a-valid-doi',
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('valid DOI'));
    });

    it('returns 400 when year is not an integer or is outside allowed range', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Bad Year Paper',
          authors: ['Author'],
          year: 3050,
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('Publication year'));
    });

    it('returns 400 when publicationDate is an invalid date string', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Invalid Date Paper',
          authors: ['Author'],
          publicationDate: 'not-a-real-date',
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('date') || body.error?.message?.includes('Date'));
    });

    it('returns 400 when URL is invalid', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Invalid URL Paper',
          authors: ['Author'],
          url: 'ftp://not-http-url',
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('valid web URL'));
    });

    it('returns 400 when tags contain case-insensitive duplicates', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Duplicate Tags Paper',
          authors: ['Author'],
          tags: ['machine-learning', 'Machine-Learning'],
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('duplicate'));
    });

    it('returns 400 when tags exceed 30 items', async () => {
      const thirtyOneTags = Array.from({ length: 31 }, (_, i) => `tag-${i}`);
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Too Many Tags Paper',
          authors: ['Author'],
          tags: thirtyOneTags,
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('cannot exceed 30 items'));
    });

    it('returns 400 when tags contain empty strings or strings exceeding 50 characters', async () => {
      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Invalid Tag Paper',
          authors: ['Author'],
          tags: ['  '],
        }),
      });

      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.ok(body.error?.message?.includes('between 1 and 50 characters'));
    });
  });

  describe('Duplicate DOI Detection & Multi-User Independence', () => {
    it('returns 409 Conflict when authenticated user attempts to save a paper with a duplicate DOI', async () => {
      const paperData = {
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani'],
        doi: '10.48550/arXiv.1706.03762',
      };

      // First save succeeds
      const res1 = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify(paperData),
      });
      assert.strictEqual(res1.status, 201);

      // Second save with same DOI (even with prefix/case difference) returns 409 Conflict
      const res2 = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Attention Copy',
          authors: ['Vaswani'],
          doi: 'https://doi.org/10.48550/arxiv.1706.03762',
        }),
      });

      assert.strictEqual(res2.status, 409);
      const body2 = await res2.json();
      assert.ok(body2.error?.message?.includes('already exists in your library'));

      // Ensure only 1 document exists in database
      const count = await Paper.countDocuments({ owner: testUser1._id });
      assert.strictEqual(count, 1);
    });

    it('allows different authenticated users to save the same DOI independently', async () => {
      const doi = '10.1038/nature14539';

      // User 1 saves paper
      const res1 = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Deep Learning',
          authors: ['Yann LeCun', 'Yoshua Bengio', 'Geoffrey Hinton'],
          doi,
        }),
      });
      assert.strictEqual(res1.status, 201);

      // User 2 saves same DOI
      const res2 = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie2,
        },
        body: JSON.stringify({
          title: 'Deep Learning Review',
          authors: ['LeCun et al.'],
          doi,
        }),
      });
      assert.strictEqual(res2.status, 201);

      // Confirm both users own a paper with this DOI
      const user1Paper = await Paper.findOne({ owner: testUser1._id, doi: '10.1038/nature14539' });
      const user2Paper = await Paper.findOne({ owner: testUser2._id, doi: '10.1038/nature14539' });
      assert.ok(user1Paper);
      assert.ok(user2Paper);
      assert.notStrictEqual(user1Paper._id.toString(), user2Paper._id.toString());
    });
  });

  describe('External Service Isolation', () => {
    it('does not invoke Crossref or external network calls during paper creation', async () => {
      let fetchCalled = false;
      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.crossref.org')) {
          fetchCalled = true;
          throw new Error('External network calls should not happen during paper creation');
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Isolated Creation Paper',
          authors: ['Local Author'],
          doi: '10.1145/3065386',
        }),
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(fetchCalled, false, 'Paper creation must never query Crossref or make external network calls');
    });
  });
});
