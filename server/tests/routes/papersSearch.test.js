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

  describe('Search Pagination', () => {
    beforeEach(async () => {
      const papersToCreate = [];
      for (let i = 1; i <= 15; i++) {
        papersToCreate.push({
          title: `Transformer Architecture Study Part ${i}`,
          authors: [`Author ${i}`],
          doi: `10.1000/transformer-${i}`,
          tags: ['transformer', 'nlp'],
          owner: testUser1._id,
        });
      }
      await Paper.create(papersToCreate);
    });

    it('should return pagination metadata with default page 1 and limit 10', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=transformer`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 10);
      assert.deepEqual(data.pagination, {
        page: 1,
        limit: 10,
        total: 15,
        totalPages: 2,
      });
    });

    it('should navigate to page 2 and return remaining results', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=transformer&page=2&limit=10`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 5);
      assert.deepEqual(data.pagination, {
        page: 2,
        limit: 10,
        total: 15,
        totalPages: 2,
      });
    });

    it('should respect custom limit parameter', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=transformer&page=1&limit=5`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 5);
      assert.deepEqual(data.pagination, {
        page: 1,
        limit: 5,
        total: 15,
        totalPages: 3,
      });
    });

    it('should return total 0 and totalPages 0 when no search matches found', async () => {
      const response = await fetch(`${baseUrl}/api/papers/search?q=nonexistent`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.papers.length, 0);
      assert.deepEqual(data.pagination, {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });

    it('should return HTTP 400 for invalid page values', async () => {
      const badPages = ['0', '-1', 'abc', '1.5'];
      for (const badPage of badPages) {
        const response = await fetch(`${baseUrl}/api/papers/search?q=transformer&page=${badPage}`, {
          headers: { Cookie: authCookie1 },
        });
        assert.equal(response.status, 400);
        const data = await response.json();
        assert.equal(data.error.message, 'Page parameter must be a positive integer greater than or equal to 1');
      }
    });

    it('should return HTTP 400 for invalid limit values or limit > 50', async () => {
      const badLimits = ['0', '-1', 'xyz', '51'];
      for (const badLimit of badLimits) {
        const response = await fetch(`${baseUrl}/api/papers/search?q=transformer&limit=${badLimit}`, {
          headers: { Cookie: authCookie1 },
        });
        assert.equal(response.status, 400);
        const data = await response.json();
        if (badLimit === '51') {
          assert.equal(data.error.message, 'Limit parameter cannot exceed 50 items per page');
        } else {
          assert.equal(data.error.message, 'Limit parameter must be a positive integer greater than or equal to 1');
        }
      }
    });
    it('should correctly handle page boundaries straddling DOI and text-search results', async () => {
      // Clear papers and create a controlled set:
      // 3 papers matching DOI only (title does not contain "straddle")
      // 3 papers matching text search only (title contains "straddle", DOI does not)
      await Paper.deleteMany({});

      const doiOnlyPapers = [
        { title: 'Alpha Physics', authors: ['Author A'], doi: '10.1000/straddle-doi-1', owner: testUser1._id },
        { title: 'Beta Physics', authors: ['Author B'], doi: '10.1000/straddle-doi-2', owner: testUser1._id },
        { title: 'Gamma Physics', authors: ['Author C'], doi: '10.1000/straddle-doi-3', owner: testUser1._id },
      ];
      for (const p of doiOnlyPapers) {
        await Paper.create(p);
      }

      const textOnlyPapers = [
        { title: 'Straddle Mechanics First', authors: ['Author D'], doi: '10.1000/mechanics-1', owner: testUser1._id },
        { title: 'Straddle Mechanics Second', authors: ['Author E'], doi: '10.1000/mechanics-2', owner: testUser1._id },
        { title: 'Straddle Mechanics Third', authors: ['Author F'], doi: '10.1000/mechanics-3', owner: testUser1._id },
      ];
      for (const p of textOnlyPapers) {
        await Paper.create(p);
      }

      // Query with limit=2 (Total = 6 across 3 pages)
      // Page 1: 2 DOI papers
      const page1Res = await fetch(`${baseUrl}/api/papers/search?q=straddle&page=1&limit=2`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(page1Res.status, 200);
      const page1Data = await page1Res.json();
      assert.equal(page1Data.papers.length, 2);
      assert.deepEqual(page1Data.pagination, { page: 1, limit: 2, total: 6, totalPages: 3 });
      assert.ok(page1Data.papers[0].doi.includes('straddle-doi'));
      assert.ok(page1Data.papers[1].doi.includes('straddle-doi'));

      // Page 2: Straddles boundary! 1 DOI paper (3rd DOI paper) + 1 text paper (1st text paper)
      const page2Res = await fetch(`${baseUrl}/api/papers/search?q=straddle&page=2&limit=2`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(page2Res.status, 200);
      const page2Data = await page2Res.json();
      assert.equal(page2Data.papers.length, 2);
      assert.deepEqual(page2Data.pagination, { page: 2, limit: 2, total: 6, totalPages: 3 });
      assert.ok(page2Data.papers[0].doi.includes('straddle-doi')); // 3rd DOI paper
      assert.ok(page2Data.papers[1].title.includes('Straddle'));   // 1st text paper

      // Page 3: Remaining 2 text papers
      const page3Res = await fetch(`${baseUrl}/api/papers/search?q=straddle&page=3&limit=2`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(page3Res.status, 200);
      const page3Data = await page3Res.json();
      assert.equal(page3Data.papers.length, 2);
      assert.deepEqual(page3Data.pagination, { page: 3, limit: 2, total: 6, totalPages: 3 });
      assert.ok(page3Data.papers[0].title.includes('Straddle'));
      assert.ok(page3Data.papers[1].title.includes('Straddle'));

      // Verify all 6 returned papers across pages are unique
      const allIds = [
        ...page1Data.papers.map((p) => p.id),
        ...page2Data.papers.map((p) => p.id),
        ...page3Data.papers.map((p) => p.id),
      ];
      assert.equal(new Set(allIds).size, 6);
    });

    it('should deduplicate overlapping papers matching both DOI and text search without double counting', async () => {
      await Paper.deleteMany({});

      // Paper 1: Matches BOTH DOI and text search query "photon"
      const overlapPaper = await Paper.create({
        title: 'Photon Resonance Discovery',
        authors: ['Optical Scientist'],
        doi: '10.1000/photon-resonance',
        owner: testUser1._id,
      });

      // Paper 2: Matches DOI only
      const doiPaper = await Paper.create({
        title: 'Quantum Electrodynamics',
        authors: ['Field Theorist'],
        doi: '10.1000/photon-qed',
        owner: testUser1._id,
      });

      // Paper 3: Matches text only
      const textPaper = await Paper.create({
        title: 'Photon Entanglement Study',
        authors: ['Quantum Physicist'],
        doi: '10.1000/entanglement',
        owner: testUser1._id,
      });

      // Total distinct matches = 3 (overlapPaper must NOT be double counted)
      const res = await fetch(`${baseUrl}/api/papers/search?q=photon&page=1&limit=10`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.pagination.total, 3);
      assert.equal(data.pagination.totalPages, 1);
      assert.equal(data.papers.length, 3);

      // Overlap paper appears in the DOI matches portion
      const returnedIds = data.papers.map((p) => p.id);
      assert.equal(new Set(returnedIds).size, 3);
      assert.ok(returnedIds.includes(overlapPaper._id.toString()));
      assert.ok(returnedIds.includes(doiPaper._id.toString()));
      assert.ok(returnedIds.includes(textPaper._id.toString()));

      // The text-only paper should appear after the DOI-matching papers
      const textPaperIndex = returnedIds.indexOf(textPaper._id.toString());
      assert.equal(textPaperIndex, 2);
    });

    it('should return empty papers array when requested page exceeds totalPages', async () => {
      await Paper.deleteMany({});
      await Paper.create({
        title: 'Out of Bounds Paper',
        authors: ['Explorer'],
        doi: '10.1000/oob-1',
        owner: testUser1._id,
      });

      const res = await fetch(`${baseUrl}/api/papers/search?q=bounds&page=5&limit=10`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.papers.length, 0);
      assert.deepEqual(data.pagination, {
        page: 5,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it('should strictly isolate paginated search results and totals by owner across pages', async () => {
      await Paper.deleteMany({});

      // Create 5 papers for user 1
      for (let i = 1; i <= 5; i++) {
        await Paper.create({
          title: `Robotics Research User1 Part ${i}`,
          authors: [`User1 Author ${i}`],
          doi: `10.1000/robotics-u1-${i}`,
          owner: testUser1._id,
        });
      }

      // Create 5 identical-matching papers for user 2
      for (let i = 1; i <= 5; i++) {
        await Paper.create({
          title: `Robotics Research User2 Part ${i}`,
          authors: [`User2 Author ${i}`],
          doi: `10.1000/robotics-u2-${i}`,
          owner: testUser2._id,
        });
      }

      // Query as User 1 with limit=3
      const page1Res = await fetch(`${baseUrl}/api/papers/search?q=robotics&page=1&limit=3`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(page1Res.status, 200);
      const page1Data = await page1Res.json();
      assert.equal(page1Data.papers.length, 3);
      assert.deepEqual(page1Data.pagination, { page: 1, limit: 3, total: 5, totalPages: 2 });
      for (const paper of page1Data.papers) {
        assert.ok(paper.title.includes('User1'));
      }

      const page2Res = await fetch(`${baseUrl}/api/papers/search?q=robotics&page=2&limit=3`, {
        headers: { Cookie: authCookie1 },
      });
      assert.equal(page2Res.status, 200);
      const page2Data = await page2Res.json();
      assert.equal(page2Data.papers.length, 2);
      assert.deepEqual(page2Data.pagination, { page: 2, limit: 3, total: 5, totalPages: 2 });
      for (const paper of page2Data.papers) {
        assert.ok(paper.title.includes('User1'));
      }
    });
  });
});
