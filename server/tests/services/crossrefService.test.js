import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDoi,
  validateDoi,
  stripJatsXml,
  extractDateInfo,
  parseCrossrefResponse,
  fetchCrossrefMetadata,
  getCrossrefUserAgent,
  CrossrefError,
} from '../../src/services/crossrefService.js';

describe('Crossref Service Unit Tests', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('normalizeDoi', () => {
    it('normalizes various DOI URL prefixes and case variations', () => {
      assert.strictEqual(
        normalizeDoi('https://doi.org/10.1038/nature14539'),
        '10.1038/nature14539'
      );
      assert.strictEqual(
        normalizeDoi('http://dx.doi.org/10.1145/3065386'),
        '10.1145/3065386'
      );
      assert.strictEqual(
        normalizeDoi('doi:10.1109/CVPR.2016.90'),
        '10.1109/cvpr.2016.90'
      );
      assert.strictEqual(
        normalizeDoi('  10.48550/arXiv.1706.03762  '),
        '10.48550/arxiv.1706.03762'
      );
    });

    it('returns empty string for invalid or non-string inputs', () => {
      assert.strictEqual(normalizeDoi(''), '');
      assert.strictEqual(normalizeDoi(null), '');
      assert.strictEqual(normalizeDoi(undefined), '');
      assert.strictEqual(normalizeDoi(12345), '');
    });
  });

  describe('validateDoi', () => {
    it('validates standard DOI formats', () => {
      assert.strictEqual(validateDoi('10.1038/nature14539'), true);
      assert.strictEqual(validateDoi('10.1145/3065386'), true);
      assert.strictEqual(validateDoi('10.1002/(sici)1097-0142(19960515)77:10<2022::aid-cncr9>3.0.co;2-o'), true);
    });

    it('rejects invalid or non-DOI formats', () => {
      assert.strictEqual(validateDoi('not-a-doi'), false);
      assert.strictEqual(validateDoi('11.1234/test'), false);
      assert.strictEqual(validateDoi('10.12/test'), false); // prefix < 4 digits
      assert.strictEqual(validateDoi(''), false);
      assert.strictEqual(validateDoi(null), false);
    });
  });

  describe('stripJatsXml', () => {
    it('strips JATS XML / HTML tags and normalizes whitespace', () => {
      const xml = '<jats:p>Deep learning allows computational models with <jats:italic>multiple</jats:italic> processing layers.</jats:p>';
      assert.strictEqual(
        stripJatsXml(xml),
        'Deep learning allows computational models with multiple processing layers.'
      );
    });

    it('handles nested and multiple XML elements', () => {
      const xml = '<jats:sec><jats:title>Abstract</jats:title><p>First paragraph.</p><p>Second paragraph.</p></jats:sec>';
      assert.strictEqual(
        stripJatsXml(xml),
        'Abstract First paragraph. Second paragraph.'
      );
    });

    it('returns empty string for empty or non-string input', () => {
      assert.strictEqual(stripJatsXml(''), '');
      assert.strictEqual(stripJatsXml(null), '');
    });
  });

  describe('extractDateInfo', () => {
    it('extracts year and ISO publicationDate from published-print', () => {
      const msg = {
        'published-print': {
          'date-parts': [[2015, 5, 28]],
        },
      };
      const info = extractDateInfo(msg);
      assert.strictEqual(info.year, 2015);
      assert.strictEqual(info.publicationDate, new Date(Date.UTC(2015, 4, 28)).toISOString());
    });

    it('falls back to published-online when published-print is absent', () => {
      const msg = {
        'published-online': {
          'date-parts': [[2020, 11, 1]],
        },
      };
      const info = extractDateInfo(msg);
      assert.strictEqual(info.year, 2020);
      assert.strictEqual(info.publicationDate, new Date(Date.UTC(2020, 10, 1)).toISOString());
    });

    it('falls back to issued when published dates are absent', () => {
      const msg = {
        issued: {
          'date-parts': [[2017]],
        },
      };
      const info = extractDateInfo(msg);
      assert.strictEqual(info.year, 2017);
      assert.strictEqual(info.publicationDate, new Date(Date.UTC(2017, 0, 1)).toISOString());
    });

    it('returns nulls when date-parts are missing or malformed', () => {
      assert.deepStrictEqual(extractDateInfo({}), { year: null, publicationDate: null });
      assert.deepStrictEqual(extractDateInfo(null), { year: null, publicationDate: null });
    });
  });

  describe('parseCrossrefResponse', () => {
    it('maps complete Crossref payload into ResearchForge Paper metadata', () => {
      const payload = {
        status: 'ok',
        message: {
          title: ['Attention Is All You Need'],
          author: [
            { given: 'Ashish', family: 'Vaswani' },
            { given: 'Noam', family: 'Shazeer' },
            { name: 'Google Brain Research Group' },
          ],
          abstract: '<jats:p>The dominant sequence transduction models...</jats:p>',
          'container-title': ['Advances in Neural Information Processing Systems (NeurIPS 30)'],
          publisher: 'Curran Associates, Inc.',
          URL: 'http://dx.doi.org/10.48550/arXiv.1706.03762',
          issued: {
            'date-parts': [[2017, 6, 12]],
          },
        },
      };

      const result = parseCrossrefResponse(payload, '10.48550/arxiv.1706.03762');

      assert.strictEqual(result.title, 'Attention Is All You Need');
      assert.deepStrictEqual(result.authors, [
        'Ashish Vaswani',
        'Noam Shazeer',
        'Google Brain Research Group',
      ]);
      assert.strictEqual(result.abstract, 'The dominant sequence transduction models...');
      assert.strictEqual(result.doi, '10.48550/arxiv.1706.03762');
      assert.strictEqual(result.year, 2017);
      assert.strictEqual(result.publicationDate, new Date(Date.UTC(2017, 5, 12)).toISOString());
      assert.strictEqual(result.venue, 'Advances in Neural Information Processing Systems (NeurIPS 30)');
      assert.strictEqual(result.publisher, 'Curran Associates, Inc.');
      assert.strictEqual(result.url, 'http://dx.doi.org/10.48550/arXiv.1706.03762');
    });

    it('handles missing optional fields without inventing values', () => {
      const payload = {
        status: 'ok',
        message: {
          title: ['Minimal Crossref Record'],
          // Missing author, abstract, venue, publisher, date
        },
      };

      const result = parseCrossrefResponse(payload, '10.1234/minimal');

      assert.strictEqual(result.title, 'Minimal Crossref Record');
      assert.deepStrictEqual(result.authors, []);
      assert.strictEqual(result.abstract, '');
      assert.strictEqual(result.venue, '');
      assert.strictEqual(result.publisher, '');
      assert.strictEqual(result.year, null);
      assert.strictEqual(result.publicationDate, null);
      assert.strictEqual(result.url, 'https://doi.org/10.1234/minimal');
    });

    it('throws 502 error if payload is missing message object', () => {
      assert.throws(
        () => parseCrossrefResponse({}, '10.1234/test'),
        (err) => err instanceof CrossrefError && err.statusCode === 502
      );
    });
  });

  describe('fetchCrossrefMetadata', () => {
    it('fetches and returns mapped metadata on successful 200 response', async () => {
      const mockPayload = {
        status: 'ok',
        message: {
          title: ['Deep Residual Learning for Image Recognition'],
          author: [{ given: 'Kaiming', family: 'He' }],
          issued: { 'date-parts': [[2016]] },
          'container-title': ['CVPR'],
          publisher: 'IEEE',
        },
      };

      globalThis.fetch = async (url, options) => {
        assert.ok(url.includes('10.1109%2Fcvpr.2016.90'));
        assert.strictEqual(options.headers.Accept, 'application/json');
        return {
          ok: true,
          status: 200,
          json: async () => mockPayload,
        };
      };

      const result = await fetchCrossrefMetadata('https://doi.org/10.1109/CVPR.2016.90');
      assert.strictEqual(result.title, 'Deep Residual Learning for Image Recognition');
      assert.deepStrictEqual(result.authors, ['Kaiming He']);
      assert.strictEqual(result.year, 2016);
      assert.strictEqual(result.doi, '10.1109/cvpr.2016.90');
    });

    it('throws 400 for invalid DOI format without making HTTP request', async () => {
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
      };

      await assert.rejects(
        fetchCrossrefMetadata('invalid-doi'),
        (err) => err instanceof CrossrefError && err.statusCode === 400
      );
      assert.strictEqual(fetchCalled, false);
    });

    it('throws 404 when Crossref returns status 404', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 404,
      });

      await assert.rejects(
        fetchCrossrefMetadata('10.1234/notfound'),
        (err) =>
          err instanceof CrossrefError &&
          err.statusCode === 404 &&
          err.message.includes('Publication not found')
      );
    });

    it('throws 429 when Crossref rate limit is exceeded', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
      });

      await assert.rejects(
        fetchCrossrefMetadata('10.1234/ratelimited'),
        (err) =>
          err instanceof CrossrefError &&
          err.statusCode === 429 &&
          err.message.includes('rate limit exceeded')
      );
    });

    it('throws 502 when Crossref returns 500/503 server error', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 503,
      });

      await assert.rejects(
        fetchCrossrefMetadata('10.1234/servererror'),
        (err) =>
          err instanceof CrossrefError &&
          err.statusCode === 502 &&
          err.message.includes('temporarily unavailable')
      );
    });

    it('throws 504 on request timeout', async () => {
      globalThis.fetch = async () => {
        const timeoutErr = new Error('The operation was aborted');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      };

      await assert.rejects(
        fetchCrossrefMetadata('10.1234/timeout'),
        (err) =>
          err instanceof CrossrefError &&
          err.statusCode === 504 &&
          err.message.includes('timed out')
      );
    });

    it('throws 502 on network/connectivity failure', async () => {
      globalThis.fetch = async () => {
        const netErr = new TypeError('fetch failed');
        throw netErr;
      };

      await assert.rejects(
        fetchCrossrefMetadata('10.1234/neterror'),
        (err) =>
          err instanceof CrossrefError &&
          err.statusCode === 502 &&
          err.message.includes('Unable to connect to Crossref service')
      );
    });

    it('throws 502 when Crossref returns malformed non-JSON body', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      });

      await assert.rejects(
        fetchCrossrefMetadata('10.1234/malformed'),
        (err) =>
          err instanceof CrossrefError &&
          err.statusCode === 502 &&
          err.message.includes('malformed')
      );
    });

    it('transmits custom configured User-Agent in fetch headers', async () => {
      let sentHeaders = null;
      globalThis.fetch = async (_url, options) => {
        sentHeaders = options.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            message: { title: ['Test'], author: [{ family: 'Test' }] },
          }),
        };
      };

      await fetchCrossrefMetadata('10.1234/custom-ua', { contact: 'researcher@institution.edu' });
      assert.strictEqual(
        sentHeaders['User-Agent'],
        'ResearchForge/0.1.0 (mailto:researcher@institution.edu)'
      );
    });
  });

  describe('getCrossrefUserAgent', () => {
    it('returns formatted User-Agent with mailto when valid email is provided', () => {
      assert.strictEqual(
        getCrossrefUserAgent('dev@example.org'),
        'ResearchForge/0.1.0 (mailto:dev@example.org)'
      );
      assert.strictEqual(
        getCrossrefUserAgent('  researcher@uni.ac.uk  '),
        'ResearchForge/0.1.0 (mailto:researcher@uni.ac.uk)'
      );
    });

    it('omits mailto clause when contact email is empty, omitted, or invalid format', () => {
      assert.strictEqual(getCrossrefUserAgent(''), 'ResearchForge/0.1.0');
      assert.strictEqual(getCrossrefUserAgent(null), 'ResearchForge/0.1.0');
      assert.strictEqual(getCrossrefUserAgent(undefined), 'ResearchForge/0.1.0');
      assert.strictEqual(getCrossrefUserAgent('not-an-email'), 'ResearchForge/0.1.0');
      assert.strictEqual(getCrossrefUserAgent('@missingusername.com'), 'ResearchForge/0.1.0');
      assert.strictEqual(getCrossrefUserAgent('missingdomain@'), 'ResearchForge/0.1.0');
      assert.strictEqual(getCrossrefUserAgent('plainaddress'), 'ResearchForge/0.1.0');
    });
  });
});
