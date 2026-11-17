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

const TEST_DB_PATH = '/tmp/rf-lookup-test-suite-db';
const TEST_PORT = 27019;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_lookup_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_lookup_test';

let mongodProcess = null;
let serverInstance = null;
let baseUrl = '';
let testUser = null;
let authCookie = '';
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
      throw new Error('Unable to establish MongoDB connection for lookup test suite.');
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

describe('GET /api/papers/lookup Integration Tests', () => {
  before(async () => {
    await setupDatabaseConnection();
    await User.syncIndexes();
    await Paper.syncIndexes();

    // Create a real test user
    testUser = await User.create({
      email: 'researcher@researchforge.org',
      passwordHash: await User.hashPassword('Password123!'),
      displayName: 'Dr. Researcher',
    });

    const token = generateToken({ id: testUser._id.toString(), email: testUser.email });
    authCookie = `${config.cookieName}=${token}`;

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
    await Paper.deleteMany({});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Authentication Enforcement', () => {
    it('returns 401 Unauthorized when request lacks authentication cookie', async () => {
      const res = await fetch(`${baseUrl}/api/papers/lookup?doi=10.1038/nature14539`);
      assert.strictEqual(res.status, 401);

      const body = await res.json();
      assert.ok(body.error?.message?.includes('Authentication required'));
    });

    it('returns 401 Unauthorized when token is invalid or tampered', async () => {
      const res = await fetch(`${baseUrl}/api/papers/lookup?doi=10.1038/nature14539`, {
        headers: {
          Cookie: `${config.cookieName}=tampered-invalid-token`,
        },
      });
      assert.strictEqual(res.status, 401);
    });
  });

  describe('Input Validation', () => {
    it('returns 400 Bad Request when "doi" query parameter is missing', async () => {
      const res = await fetch(`${baseUrl}/api/papers/lookup`, {
        headers: { Cookie: authCookie },
      });
      assert.strictEqual(res.status, 400);

      const body = await res.json();
      assert.strictEqual(body.error?.message, 'The "doi" query parameter is required');
    });

    it('returns 400 Bad Request when "doi" parameter is whitespace only', async () => {
      const res = await fetch(`${baseUrl}/api/papers/lookup?doi=%20%20%20`, {
        headers: { Cookie: authCookie },
      });
      assert.strictEqual(res.status, 400);

      const body = await res.json();
      assert.strictEqual(body.error?.message, 'The "doi" query parameter is required');
    });

    it('returns 400 Bad Request when DOI format is invalid', async () => {
      const res = await fetch(`${baseUrl}/api/papers/lookup?doi=invalid-doi-string`, {
        headers: { Cookie: authCookie },
      });
      assert.strictEqual(res.status, 400);

      const body = await res.json();
      assert.ok(body.error?.message?.includes('Please provide a valid DOI'));
    });
  });

  describe('Successful Metadata Resolution & Database Non-Persistence', () => {
    it('resolves DOI, maps metadata, and does NOT save any Paper document', async () => {
      const mockCrossrefPayload = {
        status: 'ok',
        message: {
          title: ['Attention Is All You Need'],
          author: [
            { given: 'Ashish', family: 'Vaswani' },
            { given: 'Noam', family: 'Shazeer' },
          ],
          abstract: '<jats:p>The dominant sequence transduction models...</jats:p>',
          'container-title': ['Advances in Neural Information Processing Systems (NeurIPS 30)'],
          publisher: 'Curran Associates, Inc.',
          URL: 'http://dx.doi.org/10.48550/arXiv.1706.03762',
          issued: { 'date-parts': [[2017, 6, 12]] },
        },
      };

      globalThis.fetch = async (url, options) => {
        if (url.includes('api.crossref.org')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockCrossrefPayload,
          };
        }
        return originalFetch(url, options);
      };

      // Confirm 0 papers in database before lookup
      const countBefore = await Paper.countDocuments();
      assert.strictEqual(countBefore, 0);

      const res = await fetch(
        `${baseUrl}/api/papers/lookup?doi=https://doi.org/10.48550/arXiv.1706.03762`,
        { headers: { Cookie: authCookie } }
      );

      const body = await res.json();
      assert.strictEqual(res.status, 200);

      assert.ok(body.paper);
      assert.strictEqual(body.paper.title, 'Attention Is All You Need');
      assert.deepStrictEqual(body.paper.authors, ['Ashish Vaswani', 'Noam Shazeer']);
      assert.strictEqual(body.paper.abstract, 'The dominant sequence transduction models...');
      assert.strictEqual(body.paper.doi, '10.48550/arxiv.1706.03762');
      assert.strictEqual(body.paper.year, 2017);
      assert.strictEqual(body.paper.venue, 'Advances in Neural Information Processing Systems (NeurIPS 30)');
      assert.strictEqual(body.paper.publisher, 'Curran Associates, Inc.');
      assert.strictEqual(body.paper.url, 'http://dx.doi.org/10.48550/arXiv.1706.03762');

      // CRITICAL REQUIREMENT: Confirm 0 papers in database after lookup
      const countAfter = await Paper.countDocuments();
      assert.strictEqual(countAfter, 0, 'Lookup must be read-only and must not save Paper documents');
    });

    it('resolves DOIs with "doi:" prefix and complex punctuation', async () => {
      const mockPayload = {
        status: 'ok',
        message: {
          title: ['Complex Punctuation Work'],
          author: [{ family: 'Curie' }],
          DOI: '10.1002/(sici)1097-0142(19960515)77:10<2022::aid-cncr9>3.0.co;2-o',
        },
      };

      globalThis.fetch = async (url, options) => {
        if (url.includes('api.crossref.org')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockPayload,
          };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(
        `${baseUrl}/api/papers/lookup?doi=doi:10.1002/(SICI)1097-0142(19960515)77:10<2022::AID-CNCR9>3.0.CO;2-O`,
        { headers: { Cookie: authCookie } }
      );

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(
        body.paper.doi,
        '10.1002/(sici)1097-0142(19960515)77:10<2022::aid-cncr9>3.0.co;2-o'
      );
    });
  });

  describe('Crossref Upstream Error Handling', () => {
    it('returns 404 when Crossref returns 404 (DOI not found)', async () => {
      globalThis.fetch = async (url, options) => {
        if (url.includes('api.crossref.org')) {
          return { ok: false, status: 404 };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/lookup?doi=10.1234/nonexistent`, {
        headers: { Cookie: authCookie },
      });
      assert.strictEqual(res.status, 404);

      const body = await res.json();
      assert.ok(body.error?.message?.includes('Publication not found'));
    });

    it('returns 429 when Crossref rate limit is exceeded', async () => {
      globalThis.fetch = async (url, options) => {
        if (url.includes('api.crossref.org')) {
          return { ok: false, status: 429 };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/lookup?doi=10.1234/ratelimited`, {
        headers: { Cookie: authCookie },
      });
      assert.strictEqual(res.status, 429);

      const body = await res.json();
      assert.ok(body.error?.message?.includes('rate limit'));
    });

    it('returns 502 when Crossref servers return 500 or 503', async () => {
      globalThis.fetch = async (url, options) => {
        if (url.includes('api.crossref.org')) {
          return { ok: false, status: 503 };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/lookup?doi=10.1234/servererror`, {
        headers: { Cookie: authCookie },
      });
      assert.strictEqual(res.status, 502);

      const body = await res.json();
      assert.ok(body.error?.message?.includes('temporarily unavailable'));
    });

    it('returns 502 when Crossref network connection fails', async () => {
      globalThis.fetch = async (url, options) => {
        if (url.includes('api.crossref.org')) {
          throw new TypeError('fetch failed');
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/lookup?doi=10.1234/neterror`, {
        headers: { Cookie: authCookie },
      });
      assert.strictEqual(res.status, 502);

      const body = await res.json();
      assert.ok(body.error?.message?.includes('Unable to connect to Crossref service'));
    });

    it('returns 504 when Crossref request times out', async () => {
      globalThis.fetch = async (url, options) => {
        if (url.includes('api.crossref.org')) {
          const timeoutErr = new Error('The operation was aborted');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/lookup?doi=10.1234/timeout`, {
        headers: { Cookie: authCookie },
      });
      assert.strictEqual(res.status, 504);

      const body = await res.json();
      assert.ok(body.error?.message?.includes('timed out'));
    });

    it('returns 502 when Crossref response is malformed non-JSON', async () => {
      globalThis.fetch = async (url, options) => {
        if (url.includes('api.crossref.org')) {
          return {
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError('Unexpected token < in JSON');
            },
          };
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/papers/lookup?doi=10.1234/malformed`, {
        headers: { Cookie: authCookie },
      });
      assert.strictEqual(res.status, 502);

      const body = await res.json();
      assert.ok(body.error?.message?.includes('malformed'));
    });
  });
});
