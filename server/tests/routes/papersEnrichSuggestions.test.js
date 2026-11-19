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

const TEST_DB_PATH = '/tmp/rf-enrich-suggestions-test-suite-db';
const TEST_PORT = 27032;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_enrich_suggestions_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_enrich_suggestions_test';

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
      throw new Error('Unable to establish MongoDB connection for enrich-suggestions test suite.');
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

describe('GET /api/papers/:id/enrich-suggestions Integration Tests', () => {
  before(async () => {
    await setupDatabaseConnection();
    await User.syncIndexes();
    await Paper.syncIndexes();

    testUser1 = await User.create({
      email: 'owner@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'Owner User',
    });

    testUser2 = await User.create({
      email: 'other@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'Other User',
    });

    const token1 = generateToken({ id: testUser1._id.toString(), email: testUser1.email });
    authCookie1 = `${config.cookieName}=${token1}`;

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

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Authentication and Authorization', () => {
    it('returns 401 when request is unauthenticated', async () => {
      const res = await fetch(`${baseUrl}/api/papers/507f1f77bcf86cd799439011/enrich-suggestions`);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.ok(data.error?.message?.includes('Authentication required'));
    });

    it('returns 400 when paper ID format is invalid', async () => {
      const res = await fetch(`${baseUrl}/api/papers/invalid-id-format/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Invalid paper ID format');
    });

    it('returns 404 when paper does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const res = await fetch(`${baseUrl}/api/papers/${nonExistentId}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Paper not found');
    });

    it('returns 404 when paper belongs to another user (strict anti-enumeration)', async () => {
      const paperOtherUser = await Paper.create({
        title: 'Other User Paper',
        authors: ['Alice'],
        owner: testUser2._id,
      });

      const res = await fetch(`${baseUrl}/api/papers/${paperOtherUser._id}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 }, // User 1 accessing User 2's paper
      });

      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Paper not found');
    });
  });

  describe('Enrichment Suggestions Workflow', () => {
    it('returns ready status and suggestions using exact DOI lookup', async () => {
      const paper = await Paper.create({
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani'],
        doi: '10.48550/arxiv.1706.03762',
        owner: testUser1._id,
      });

      const mockOpenAlexWork = {
        id: 'https://openalex.org/W2741809807',
        doi: 'https://doi.org/10.48550/arxiv.1706.03762',
        title: 'Attention Is All You Need',
        publication_year: 2017,
        publication_date: '2017-06-12',
        abstract_inverted_index: {
          The: [0],
          dominant: [1],
          sequence: [2],
          transduction: [3],
          models: [4],
        },
        primary_location: {
          landing_page_url: 'https://arxiv.org/abs/1706.03762',
          source: {
            display_name: 'NeurIPS',
            host_organization_name: 'Curran Associates',
          },
        },
      };

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          assert.ok(url.includes('api.openalex.org/works/https://doi.org/10.48550/arxiv.1706.03762'));
          return {
            ok: true,
            status: 200,
            json: async () => mockOpenAlexWork,
          };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/${paper._id}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.paperId, paper._id.toString());
      assert.strictEqual(data.status, 'ready');
      assert.strictEqual(data.matchedWork.openAlexId, 'W2741809807');
      assert.strictEqual(data.matchedWork.venue, 'NeurIPS');

      const abstractSuggestion = data.suggestions.find((s) => s.field === 'abstract');
      assert.ok(abstractSuggestion);
      assert.strictEqual(abstractSuggestion.type, 'add');
      assert.strictEqual(abstractSuggestion.suggestedValue, 'The dominant sequence transduction models');

      const venueSuggestion = data.suggestions.find((s) => s.field === 'venue');
      assert.ok(venueSuggestion);
      assert.strictEqual(venueSuggestion.type, 'add');
      assert.strictEqual(venueSuggestion.suggestedValue, 'NeurIPS');
    });

    it('falls back to search when DOI returns 404 in OpenAlex', async () => {
      const paper = await Paper.create({
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani'],
        doi: '10.9999/nonexistent-in-openalex',
        owner: testUser1._id,
      });

      const mockCandidates = {
        results: [
          {
            id: 'https://openalex.org/W2741809807',
            title: 'Attention Is All You Need',
            publication_year: 2017,
            authorships: [{ author: { display_name: 'Ashish Vaswani' } }],
          },
        ],
      };

      const mockWork = {
        id: 'https://openalex.org/W2741809807',
        title: 'Attention Is All You Need',
        publication_year: 2017,
        abstract_inverted_index: {
          Recovered: [0],
          via: [1],
          search: [2],
        },
      };

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          if (url.includes('/works/https://doi.org/')) {
            return { ok: false, status: 404 };
          }
          if (url.includes('/works?')) {
            return { ok: true, status: 200, json: async () => mockCandidates };
          }
          if (url.includes('/works/W2741809807')) {
            return { ok: true, status: 200, json: async () => mockWork };
          }
          throw new Error(`Unexpected OpenAlex URL: ${url}`);
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/${paper._id}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ready');
      assert.strictEqual(data.matchedWork.openAlexId, 'W2741809807');
    });

    it('falls back to search when paper has no DOI and finds a single match', async () => {
      const paper = await Paper.create({
        title: 'BERT: Pre-training of Deep Bidirectional Transformers',
        authors: ['Jacob Devlin'],
        owner: testUser1._id,
      });

      const mockCandidates = {
        results: [
          {
            id: 'https://openalex.org/W2963403868',
            title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
            publication_year: 2018,
            authorships: [{ author: { display_name: 'Jacob Devlin' } }],
          },
        ],
      };

      const mockWork = {
        id: 'https://openalex.org/W2963403868',
        doi: 'https://doi.org/10.48550/arxiv.1810.04805',
        title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
        publication_year: 2018,
        abstract_inverted_index: {
          We: [0],
          introduce: [1],
          BERT: [2],
        },
      };

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          if (url.includes('/works?')) {
            return { ok: true, status: 200, json: async () => mockCandidates };
          }
          if (url.includes('/works/W2963403868')) {
            return { ok: true, status: 200, json: async () => mockWork };
          }
          throw new Error(`Unexpected OpenAlex URL: ${url}`);
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/${paper._id}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ready');
      assert.strictEqual(data.matchedWork.openAlexId, 'W2963403868');

      const doiSuggestion = data.suggestions.find((s) => s.field === 'doi');
      assert.ok(doiSuggestion);
      assert.strictEqual(doiSuggestion.type, 'add');
      assert.strictEqual(doiSuggestion.suggestedValue, '10.48550/arxiv.1810.04805');
    });

    it('returns "ambiguous" status with candidates when multiple plausible works are found', async () => {
      const paper = await Paper.create({
        title: 'Transformer Architecture Review',
        authors: ['John Smith'],
        owner: testUser1._id,
      });

      const mockCandidates = {
        results: [
          {
            id: 'https://openalex.org/W1111111111',
            title: 'Transformer Architecture Review 2021',
            publication_year: 2021,
            authorships: [{ author: { display_name: 'John Smith' } }],
          },
          {
            id: 'https://openalex.org/W2222222222',
            title: 'Transformer Architecture Review 2023',
            publication_year: 2023,
            authorships: [{ author: { display_name: 'John Smith' } }],
          },
        ],
      };

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          assert.ok(url.includes('/works?search='));
          return {
            ok: true,
            status: 200,
            json: async () => mockCandidates,
          };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/${paper._id}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ambiguous');
      assert.strictEqual(data.candidates.length, 2);
      assert.strictEqual(data.candidates[0].openAlexId, 'W1111111111');
      assert.strictEqual(data.candidates[1].openAlexId, 'W2222222222');
    });

    it('allows explicit openAlexId parameter selection to resolve candidate', async () => {
      const paper = await Paper.create({
        title: 'Transformer Architecture Review',
        authors: ['John Smith'],
        owner: testUser1._id,
      });

      const mockWork = {
        id: 'https://openalex.org/W2222222222',
        title: 'Transformer Architecture Review 2023',
        publication_year: 2023,
        abstract_inverted_index: {
          Survey: [0],
          of: [1],
          transformers: [2],
        },
      };

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          assert.ok(url.includes('/works/W2222222222'));
          return {
            ok: true,
            status: 200,
            json: async () => mockWork,
          };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(
        `${baseUrl}/api/papers/${paper._id}/enrich-suggestions?openAlexId=W2222222222`,
        { headers: { Cookie: authCookie1 } }
      );

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ready');
      assert.strictEqual(data.matchedWork.openAlexId, 'W2222222222');
      assert.strictEqual(data.matchedWork.title, 'Transformer Architecture Review 2023');
    });

    it('returns 400 when invalid openAlexId format is passed', async () => {
      const paper = await Paper.create({
        title: 'Paper Title',
        authors: ['John'],
        owner: testUser1._id,
      });

      const res = await fetch(
        `${baseUrl}/api/papers/${paper._id}/enrich-suggestions?openAlexId=invalid-format-id`,
        { headers: { Cookie: authCookie1 } }
      );

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'Invalid OpenAlex ID format');
    });

    it('returns "not_found" status when search returns 0 candidates', async () => {
      const paper = await Paper.create({
        title: 'Completely Unique Title With No Match Anywhere In OpenAlex',
        authors: ['Unknown Researcher'],
        owner: testUser1._id,
      });

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ results: [] }),
          };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/${paper._id}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'not_found');
      assert.strictEqual(data.message, 'No matching publication found in OpenAlex');
    });

    it('strictly preserves database state and NEVER mutates the paper document', async () => {
      const originalPaper = await Paper.create({
        title: 'Original Immutability Test Paper',
        authors: ['Immutable Author'],
        abstract: '',
        venue: '',
        owner: testUser1._id,
      });

      const originalUpdatedAt = originalPaper.updatedAt.toISOString();

      const mockWork = {
        id: 'https://openalex.org/W55555',
        title: 'Original Immutability Test Paper',
        abstract_inverted_index: {
          This: [0],
          should: [1],
          not: [2],
          be: [3],
          saved: [4],
        },
      };

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockWork,
          };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(
        `${baseUrl}/api/papers/${originalPaper._id}/enrich-suggestions?openAlexId=W55555`,
        { headers: { Cookie: authCookie1 } }
      );

      assert.strictEqual(res.status, 200);

      // Re-query MongoDB directly to verify paper was not altered
      const paperInDb = await Paper.findById(originalPaper._id);
      assert.strictEqual(paperInDb.abstract, '');
      assert.strictEqual(paperInDb.venue, '');
      assert.strictEqual(paperInDb.updatedAt.toISOString(), originalUpdatedAt);
    });

    it('propagates OpenAlex 429 rate limit errors to the client', async () => {
      const paper = await Paper.create({
        title: 'Rate Limit Paper',
        authors: ['Author'],
        doi: '10.1038/ratelimit',
        owner: testUser1._id,
      });

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          return {
            ok: false,
            status: 429,
          };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/${paper._id}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 429);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'OpenAlex rate limit exceeded. Please try again later.');
    });

    it('propagates OpenAlex timeout errors (504) to the client', async () => {
      const paper = await Paper.create({
        title: 'Timeout Paper',
        authors: ['Author'],
        doi: '10.1038/timeout',
        owner: testUser1._id,
      });

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          const timeoutErr = new Error('Request aborted');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/${paper._id}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 504);
      const data = await res.json();
      assert.strictEqual(data.error.message, 'OpenAlex request timed out while resolving the DOI');
    });
  });

  describe('Enrichment Edge Cases and Integration Reliability (P7-05)', () => {
    it('executes full end-to-end cycle: get suggestions -> apply selected field via PUT -> verify DB document', async () => {
      // 1. Create paper with missing abstract and venue
      const paper = await Paper.create({
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani'],
        doi: '10.48550/arxiv.1706.03762',
        abstract: '',
        venue: '',
        owner: testUser1._id,
      });

      const mockOpenAlexWork = {
        id: 'https://openalex.org/W2741809807',
        doi: 'https://doi.org/10.48550/arxiv.1706.03762',
        title: 'Attention Is All You Need',
        publication_year: 2017,
        abstract_inverted_index: {
          Transformer: [0],
          model: [1],
        },
        primary_location: {
          source: { display_name: 'NeurIPS' },
        },
      };

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockOpenAlexWork,
          };
        }
        return originalFetch(url, options);
      };

      // 2. Fetch suggestions
      const suggestionsRes = await fetch(`${baseUrl}/api/papers/${paper._id}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });
      assert.strictEqual(suggestionsRes.status, 200);
      const suggestionsData = await suggestionsRes.json();
      assert.strictEqual(suggestionsData.status, 'ready');

      const abstractSugg = suggestionsData.suggestions.find((s) => s.field === 'abstract');
      const venueSugg = suggestionsData.suggestions.find((s) => s.field === 'venue');
      assert.ok(abstractSugg);
      assert.ok(venueSugg);

      // 3. Apply ONLY abstract suggestion via PUT /api/papers/:id (leaving venue unselected)
      const putRes = await fetch(`${baseUrl}/api/papers/${paper._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: authCookie1,
        },
        body: JSON.stringify({
          abstract: abstractSugg.suggestedValue,
        }),
      });

      assert.strictEqual(putRes.status, 200);
      const putData = await putRes.json();
      assert.strictEqual(putData.paper.abstract, 'Transformer model');
      assert.strictEqual(putData.paper.venue, ''); // Unselected field remained empty

      // 4. Verify MongoDB directly
      const reloaded = await Paper.findById(paper._id);
      assert.strictEqual(reloaded.abstract, 'Transformer model');
      assert.strictEqual(reloaded.venue, '');
      assert.strictEqual(reloaded.title, 'Attention Is All You Need');
    });

    it('handles full OpenAlex URL passed in openAlexId query parameter', async () => {
      const paper = await Paper.create({
        title: 'Work Matching Paper',
        authors: ['Author'],
        owner: testUser1._id,
      });

      const mockWork = {
        id: 'https://openalex.org/W2741809807',
        title: 'Work Matching Paper',
        abstract_inverted_index: { Matched: [0] },
      };

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          assert.ok(url.includes('/works/W2741809807'));
          return {
            ok: true,
            status: 200,
            json: async () => mockWork,
          };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(
        `${baseUrl}/api/papers/${paper._id}/enrich-suggestions?openAlexId=${encodeURIComponent('https://openalex.org/W2741809807')}`,
        { headers: { Cookie: authCookie1 } }
      );

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ready');
      assert.strictEqual(data.matchedWork.openAlexId, 'W2741809807');
    });

    it('propagates upstream OpenAlex 500 / 502 errors as 502 to client', async () => {
      const paper = await Paper.create({
        title: 'Upstream Error Paper',
        authors: ['Author'],
        doi: '10.1038/upstream500',
        owner: testUser1._id,
      });

      globalThis.fetch = async (url, options) => {
        if (typeof url === 'string' && url.includes('api.openalex.org')) {
          return {
            ok: false,
            status: 500,
          };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/${paper._id}/enrich-suggestions`, {
        headers: { Cookie: authCookie1 },
      });

      assert.strictEqual(res.status, 502);
      const data = await res.json();
      assert.strictEqual(
        data.error.message,
        'OpenAlex service is temporarily unavailable. Please try again later.'
      );
    });
  });
});
