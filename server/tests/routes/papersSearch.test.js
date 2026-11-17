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

const TEST_DB_PATH = '/tmp/rf-search-test-suite-db';
const TEST_PORT = 27026;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_search_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_search_test';

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
      throw new Error('Unable to establish MongoDB connection for search papers test suite.');
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

describe('GET /api/papers/search Integration Tests', () => {
  before(async () => {
    await setupDatabaseConnection();
    await User.syncIndexes();
    await Paper.syncIndexes();

    testUser1 = await User.create({
      email: 'searchowner1@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'Search Primary Owner',
    });
    const token1 = generateToken({ id: testUser1._id.toString(), email: testUser1.email });
    authCookie1 = `${config.cookieName}=${token1}`;

    testUser2 = await User.create({
      email: 'searchowner2@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'Search Secondary Owner',
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
      const response = await fetch(`${baseUrl}/api/papers/search?q=quantum`);
      assert.equal(response.status, 401);
      const data = await response.json();
      assert.match(data.error.message, /authentication required/i);
    });

    it('should return HTTP 401 when an invalid or tampered token is provided', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=quantum`, {
        headers: {
          Cookie: `${config.cookieName}=invalid-tampered-token`,
        },
      });
      assert.equal(response.status, 401);
      const data = await response.json();
      assert.match(data.error.message, /invalid authentication token/i);
    });
  });

  describe('Query Validation', () => {
    it('should return HTTP 400 when "q" query parameter is missing', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.error.message, 'Search query parameter "q" is required');
    });

    it('should return HTTP 400 when "q" query parameter is empty string', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.error.message, 'Search query parameter "q" is required');
    });

    it('should return HTTP 400 when "q" query parameter is whitespace only', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=%20%20%20`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.error.message, 'Search query parameter "q" is required');
    });

    it('should return HTTP 400 when query exceeds maximum length of 500 characters', async () => {
      const longQuery = 'a'.repeat(501);
      const response = await fetch(`${baseUrl}/api/papers/search?q=${longQuery}`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.error.message, 'Search query cannot exceed 500 characters');
    });
  });

  describe('Matching Capabilities', () => {
    beforeEach(async () => {
      await Paper.create([
        {
          title: 'Attention Is All You Need',
          authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'],
          abstract: 'We propose the Transformer, a model architecture eschewing recurrence...',
          doi: '10.5555/3295222.3295349',
          tags: ['deep-learning', 'transformers', 'attention'],
          venue: 'NeurIPS 2017',
          owner: testUser1._id,
        },
        {
          title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
          authors: ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee'],
          abstract: 'We introduce a new language representation model called BERT...',
          doi: '10.18653/v1/n19-1423',
          tags: ['nlp', 'transformers', 'language-models'],
          venue: 'NAACL 2019',
          owner: testUser1._id,
        },
        {
          title: 'Quantum Supremacy Using a Programmable Superconducting Processor',
          authors: ['Frank Arute', 'Kunald Arya', 'John M. Martinis'],
          abstract: 'The promise of quantum computers is that certain computational tasks...',
          doi: '10.1038/s41586-019-1666-5',
          tags: ['quantum-computing', 'physics', 'superconducting'],
          venue: 'Nature',
          owner: testUser1._id,
        },
      ]);
    });

    it('should match papers by title keyword (case-insensitive)', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=attention`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(Array.isArray(data.papers));
      assert.equal(data.papers.length, 1);
      assert.equal(data.papers[0].title, 'Attention Is All You Need');
    });

    it('should match papers by author name', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=Vaswani`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 1);
      assert.equal(data.papers[0].title, 'Attention Is All You Need');
    });

    it('should match papers by tag', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=transformers`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 2);
      const titles = data.papers.map((p) => p.title);
      assert.ok(titles.includes('Attention Is All You Need'));
      assert.ok(titles.includes('BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding'));
    });

    it('should match papers by exact DOI', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=10.1038/s41586-019-1666-5`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 1);
      assert.equal(data.papers[0].title, 'Quantum Supremacy Using a Programmable Superconducting Processor');
      assert.equal(data.papers[0].doi, '10.1038/s41586-019-1666-5');
    });

    it('should match papers by DOI with https://doi.org/ prefix', async () => {
      const response = await fetch(
        `${baseUrl}/api/papers/search?q=https://doi.org/10.1038/s41586-019-1666-5`,
        { headers: { Cookie: authCookie1 } }
      );
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 1);
      assert.equal(data.papers[0].doi, '10.1038/s41586-019-1666-5');
    });

    it('should match papers by DOI with doi: prefix', async () => {
      const response = await fetch(
        `${baseUrl}/api/papers/search?q=doi:%2010.1038/s41586-019-1666-5`,
        { headers: { Cookie: authCookie1 } }
      );
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 1);
      assert.equal(data.papers[0].doi, '10.1038/s41586-019-1666-5');
    });

    it('should match papers by partial DOI substring', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=s41586-019-1666-5`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 1);
      assert.equal(data.papers[0].title, 'Quantum Supremacy Using a Programmable Superconducting Processor');
    });

    it('should return HTTP 200 with an empty array when no matches are found', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=nonexistent+topic+xyz`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data.papers, []);
    });

    it('should return papers with JSON serialization (id string present, _id omitted)', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=quantum`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 1);
      const paper = data.papers[0];
      assert.ok(typeof paper.id === 'string');
      assert.equal(paper._id, undefined);
    });
  });

  describe('User Ownership Scoping & Isolation', () => {
    beforeEach(async () => {
      // User 1 paper
      await Paper.create({
        title: 'Deep Residual Learning for Image Recognition',
        authors: ['Kaiming He', 'Xiangyu Zhang'],
        doi: '10.1109/cvpr.2016.90',
        tags: ['resnet', 'computer-vision'],
        owner: testUser1._id,
      });

      // User 2 paper with same topic/keywords
      await Paper.create({
        title: 'Very Deep Convolutional Networks for Large-Scale Image Recognition',
        authors: ['Karen Simonyan', 'Andrew Zisserman'],
        doi: '10.48550/arxiv.1409.1556',
        tags: ['vgg', 'computer-vision'],
        owner: testUser2._id,
      });
    });

    it('should strictly limit search results to the authenticated user', async () => {
      // User 1 searches for "Image Recognition"
      const res1 = await fetch(`${baseUrl}/api/papers/search?q=Recognition`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(res1.status, 200);
      const data1 = await res1.json();
      assert.equal(data1.papers.length, 1);
      assert.equal(data1.papers[0].title, 'Deep Residual Learning for Image Recognition');

      // User 2 searches for "Image Recognition"
      const res2 = await fetch(`${baseUrl}/api/papers/search?q=Recognition`, {
        headers: { Cookie: authCookie2 },
      });
      assert.equal(res2.status, 200);
      const data2 = await res2.json();
      assert.equal(data2.papers.length, 1);
      assert.equal(data2.papers[0].title, 'Very Deep Convolutional Networks for Large-Scale Image Recognition');
    });

    it('should never expose another user papers when searching by another user DOI', async () => {
      // User 1 searches using User 2's DOI
      const response = await fetch(`${baseUrl}/api/papers/search?q=10.48550/arxiv.1409.1556`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data.papers, []);
    });
  });

  describe('Route Non-Interference', () => {
    it('should not be shadowed by /:id and should not interfere with existing endpoints', async () => {
      // 1. Create a paper (POST /api/papers)
      const createRes = await fetch(`${baseUrl}/api/papers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          title: 'Route Non-Interference Verification Paper',
          authors: ['Test Author'],
          doi: '10.1000/route-test-doi',
        }),
      });
      assert.equal(createRes.status, 201);
      const createData = await createRes.json();
      const paperId = createData.paper.id;

      // 2. Search endpoint works (GET /api/papers/search)
      const searchRes = await fetch(`${baseUrl}/api/papers/search?q=Verification`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(searchRes.status, 200);
      const searchData = await searchRes.json();
      assert.equal(searchData.papers.length, 1);
      assert.equal(searchData.papers[0].id, paperId);

      // 3. Detail endpoint works (GET /api/papers/:id)
      const getRes = await fetch(`${baseUrl}/api/papers/${paperId}`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(getRes.status, 200);

      // 4. List endpoint works (GET /api/papers)
      const listRes = await fetch(`${baseUrl}/api/papers`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(listRes.status, 200);

      // 5. Update endpoint works (PUT /api/papers/:id)
      const updateRes = await fetch(`${baseUrl}/api/papers/${paperId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({ title: 'Updated Verification Paper' }),
      });
      assert.equal(updateRes.status, 200);

      // 6. Crossref lookup endpoint works (GET /api/papers/lookup)
      const lookupRes = await fetch(`${baseUrl}/api/papers/lookup?doi=invalid-doi`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(lookupRes.status, 400);

      // 7. Delete endpoint works (DELETE /api/papers/:id)
      const deleteRes = await fetch(`${baseUrl}/api/papers/${paperId}`, {
        method: 'DELETE',
        headers: { Cookie: authCookie1 },
      });
      assert.equal(deleteRes.status, 200);
    });
  });
});
