import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenAlexError,
  reconstructAbstract,
  parseOpenAlexWork,
  getOpenAlexUserAgent,
  normalizeOpenAlexId,
  fetchOpenAlexByDoi,
  fetchOpenAlexById,
  searchOpenAlexCandidates,
} from '../../src/services/openAlexService.js';

describe('OpenAlex Service Unit Tests', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('reconstructAbstract', () => {
    it('reconstructs sequential plaintext from standard inverted index', () => {
      const invertedIndex = {
        The: [0],
        study: [1],
        presents: [2],
        an: [3],
        inverted: [4],
        index: [5],
      };
      assert.strictEqual(
        reconstructAbstract(invertedIndex),
        'The study presents an inverted index'
      );
    });

    it('handles repeated words appearing at multiple positions', () => {
      const invertedIndex = {
        to: [0, 2],
        be: [1, 3],
        or: [4],
        not: [5],
      };
      assert.strictEqual(
        reconstructAbstract(invertedIndex),
        'to be to be or not'
      );
    });

    it('handles sparse positions safely without shifting offsets or compacting', () => {
      // Word at index 0 and 3, but position 1 and 2 are empty/sparse
      const invertedIndex = {
        Start: [0],
        End: [3],
      };
      // Original positions: 0 -> Start, 1 -> '', 2 -> '', 3 -> End
      // "End" must remain at index 3 and not be compacted to index 1!
      assert.strictEqual(reconstructAbstract(invertedIndex), 'Start End');
    });

    it('returns empty string for null, undefined, empty, or non-object inputs', () => {
      assert.strictEqual(reconstructAbstract(null), '');
      assert.strictEqual(reconstructAbstract(undefined), '');
      assert.strictEqual(reconstructAbstract({}), '');
      assert.strictEqual(reconstructAbstract('not-an-object'), '');
      assert.strictEqual(reconstructAbstract([1, 2, 3]), '');
    });

    it('handles malformed indices with non-integer or negative positions safely', () => {
      const invertedIndex = {
        Valid: [0],
        Invalid1: ['one', null, undefined],
        Invalid2: [-5, 3.14],
        AnotherValid: [1],
      };
      assert.strictEqual(reconstructAbstract(invertedIndex), 'Valid AnotherValid');
    });

    it('returns empty string if all positions are invalid or negative', () => {
      const invertedIndex = {
        Bad: [-1, -2],
      };
      assert.strictEqual(reconstructAbstract(invertedIndex), '');
    });
  });

  describe('parseOpenAlexWork', () => {
    it('parses a complete OpenAlex work object into ResearchForge paper metadata shape', () => {
      const mockWork = {
        id: 'https://openalex.org/W2134567890',
        doi: 'https://doi.org/10.1038/nature14539',
        title: 'Deep Learning',
        publication_year: 2015,
        publication_date: '2015-05-27',
        authorships: [
          {
            author: { display_name: 'Yann LeCun' },
          },
          {
            author: { display_name: 'Yoshua Bengio' },
          },
          {
            raw_author_name: 'Geoffrey Hinton',
          },
        ],
        abstract_inverted_index: {
          Deep: [0],
          learning: [1],
          revolution: [2],
        },
        primary_location: {
          landing_page_url: 'https://www.nature.com/articles/nature14539',
          source: {
            display_name: 'Nature',
            host_organization_name: 'Springer Nature',
          },
        },
      };

      const result = parseOpenAlexWork(mockWork, '10.1038/nature14539');

      assert.strictEqual(result.title, 'Deep Learning');
      assert.deepStrictEqual(result.authors, ['Yann LeCun', 'Yoshua Bengio', 'Geoffrey Hinton']);
      assert.strictEqual(result.abstract, 'Deep learning revolution');
      assert.strictEqual(result.doi, '10.1038/nature14539');
      assert.strictEqual(result.year, 2015);
      assert.strictEqual(result.publicationDate, new Date('2015-05-27').toISOString());
      assert.strictEqual(result.venue, 'Nature');
      assert.strictEqual(result.publisher, 'Springer Nature');
      assert.strictEqual(result.url, 'https://www.nature.com/articles/nature14539');
    });

    it('falls back to display_name if title is absent', () => {
      const mockWork = {
        display_name: 'Fallback Display Name',
        authorships: [],
      };
      const result = parseOpenAlexWork(mockWork);
      assert.strictEqual(result.title, 'Fallback Display Name');
    });

    it('falls back to locations[0] for venue and publisher if primary_location source is missing', () => {
      const mockWork = {
        title: 'Sample',
        locations: [
          {
            source: {
              display_name: 'Journal of Fallbacks',
              host_organization_name: 'Fallback Publisher',
            },
          },
        ],
      };
      const result = parseOpenAlexWork(mockWork);
      assert.strictEqual(result.venue, 'Journal of Fallbacks');
      assert.strictEqual(result.publisher, 'Fallback Publisher');
    });

    it('defaults URL to https://doi.org/{doi} if landing_page_url is absent', () => {
      const mockWork = {
        title: 'Sample',
        doi: 'https://doi.org/10.1038/nature14539',
      };
      const result = parseOpenAlexWork(mockWork, '10.1038/nature14539');
      assert.strictEqual(result.url, 'https://doi.org/10.1038/nature14539');
    });

    it('throws OpenAlexError if work payload is missing or invalid', () => {
      assert.throws(
        () => parseOpenAlexWork(null),
        (err) => err instanceof OpenAlexError && err.statusCode === 502
      );
    });
  });

  describe('getOpenAlexUserAgent', () => {
    it('includes mailto contact when valid email is provided', () => {
      assert.strictEqual(
        getOpenAlexUserAgent('researcher@university.edu'),
        'ResearchForge/0.1.0 (mailto:researcher@university.edu)'
      );
    });

    it('returns default agent string when email is invalid or empty', () => {
      assert.strictEqual(getOpenAlexUserAgent(''), 'ResearchForge/0.1.0');
      assert.strictEqual(getOpenAlexUserAgent('not-an-email'), 'ResearchForge/0.1.0');
    });
  });

  describe('fetchOpenAlexByDoi', () => {
    it('validates and rejects invalid DOI input', async () => {
      await assert.rejects(
        () => fetchOpenAlexByDoi('invalid-doi'),
        (err) => err instanceof OpenAlexError && err.statusCode === 400
      );
    });

    it('successfully fetches and maps OpenAlex work by DOI', async () => {
      const mockWork = {
        id: 'https://openalex.org/W12345',
        title: 'Attention Is All You Need',
        authorships: [
          { author: { display_name: 'Ashish Vaswani' } },
        ],
        abstract_inverted_index: {
          Attention: [0],
          is: [1],
          all: [2],
          you: [3],
          need: [4],
        },
        publication_year: 2017,
      };

      globalThis.fetch = async (url, options) => {
        assert(url.includes('https://doi.org/10.48550/arxiv.1706.03762'));
        assert.strictEqual(options.method, 'GET');
        assert.strictEqual(options.headers.Accept, 'application/json');
        return {
          ok: true,
          status: 200,
          json: async () => mockWork,
        };
      };

      const result = await fetchOpenAlexByDoi('10.48550/arxiv.1706.03762');
      assert.strictEqual(result.title, 'Attention Is All You Need');
      assert.deepStrictEqual(result.authors, ['Ashish Vaswani']);
      assert.strictEqual(result.abstract, 'Attention is all you need');
      assert.strictEqual(result.year, 2017);
    });

    it('handles 404 publication not found', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 404,
      });

      await assert.rejects(
        () => fetchOpenAlexByDoi('10.1038/notfound123'),
        (err) => err instanceof OpenAlexError && err.statusCode === 404
      );
    });

    it('handles 429 rate limit exceeded', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
      });

      await assert.rejects(
        () => fetchOpenAlexByDoi('10.1038/ratelimit123'),
        (err) => err instanceof OpenAlexError && err.statusCode === 429
      );
    });

    it('handles 500 upstream server error', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
      });

      await assert.rejects(
        () => fetchOpenAlexByDoi('10.1038/servererror123'),
        (err) => err instanceof OpenAlexError && err.statusCode === 502
      );
    });

    it('handles network request timeout', async () => {
      globalThis.fetch = async () => {
        const timeoutErr = new Error('The operation was aborted');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      };

      await assert.rejects(
        () => fetchOpenAlexByDoi('10.1038/timeout123'),
        (err) => err instanceof OpenAlexError && err.statusCode === 504
      );
    });

    it('handles network connection failure', async () => {
      globalThis.fetch = async () => {
        throw new Error('Connection refused');
      };

      await assert.rejects(
        () => fetchOpenAlexByDoi('10.1038/networkerror123'),
        (err) => err instanceof OpenAlexError && err.statusCode === 502
      );
    });

    it('handles malformed JSON response', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Syntax error');
        },
      });

      await assert.rejects(
        () => fetchOpenAlexByDoi('10.1038/malformedjson123'),
        (err) => err instanceof OpenAlexError && err.statusCode === 502
      );
    });
  });

  describe('normalizeOpenAlexId', () => {
    it('normalizes full openalex.org work URLs to canonical uppercase ID', () => {
      assert.strictEqual(
        normalizeOpenAlexId('https://openalex.org/W2741809807'),
        'W2741809807'
      );
      assert.strictEqual(
        normalizeOpenAlexId('http://openalex.org/w2741809807'),
        'W2741809807'
      );
    });

    it('normalizes bare work IDs and works/ prefix', () => {
      assert.strictEqual(normalizeOpenAlexId('W2741809807'), 'W2741809807');
      assert.strictEqual(normalizeOpenAlexId('w2741809807'), 'W2741809807');
      assert.strictEqual(normalizeOpenAlexId('works/W2741809807'), 'W2741809807');
    });

    it('returns empty string for invalid, non-work, or malformed inputs', () => {
      assert.strictEqual(normalizeOpenAlexId(''), '');
      assert.strictEqual(normalizeOpenAlexId(null), '');
      assert.strictEqual(normalizeOpenAlexId(undefined), '');
      assert.strictEqual(normalizeOpenAlexId('A2741809807'), ''); // Author ID, not Work
      assert.strictEqual(normalizeOpenAlexId('Winvalid'), '');
      assert.strictEqual(normalizeOpenAlexId('1234567'), '');
    });
  });

  describe('fetchOpenAlexById', () => {
    it('throws 400 Bad Request if ID is invalid', async () => {
      await assert.rejects(
        () => fetchOpenAlexById('invalid-id'),
        (err) => err instanceof OpenAlexError && err.statusCode === 400
      );
    });

    it('successfully fetches and normalizes work by valid OpenAlex ID', async () => {
      const mockWork = {
        id: 'https://openalex.org/W2741809807',
        title: 'Attention Is All You Need',
        publication_year: 2017,
        publication_date: '2017-06-12',
        authorships: [
          { author: { display_name: 'Ashish Vaswani' } },
          { author: { display_name: 'Noam Shazeer' } },
        ],
        abstract_inverted_index: {
          Attention: [0],
          is: [1],
          all: [2],
          you: [3],
          need: [4],
        },
        primary_location: {
          landing_page_url: 'https://arxiv.org/abs/1706.03762',
          source: {
            display_name: 'NeurIPS',
            host_organization_name: 'Curran Associates',
          },
        },
      };

      globalThis.fetch = async (url) => {
        assert.ok(url.includes('/works/W2741809807'));
        return {
          ok: true,
          status: 200,
          json: async () => mockWork,
        };
      };

      const result = await fetchOpenAlexById('https://openalex.org/W2741809807');
      assert.strictEqual(result.title, 'Attention Is All You Need');
      assert.strictEqual(result.year, 2017);
      assert.strictEqual(result.venue, 'NeurIPS');
      assert.strictEqual(result.publisher, 'Curran Associates');
      assert.strictEqual(result.openAlexId, 'W2741809807');
      assert.strictEqual(result.openAlexUri, 'https://openalex.org/W2741809807');
      assert.strictEqual(result.abstract, 'Attention is all you need');
      assert.deepStrictEqual(result.authors, ['Ashish Vaswani', 'Noam Shazeer']);
    });

    it('handles 404 publication not found', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 404,
      });

      await assert.rejects(
        () => fetchOpenAlexById('W9999999999'),
        (err) => err instanceof OpenAlexError && err.statusCode === 404
      );
    });

    it('handles 429 rate limit exceeded', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
      });

      await assert.rejects(
        () => fetchOpenAlexById('W2741809807'),
        (err) => err instanceof OpenAlexError && err.statusCode === 429
      );
    });

    it('handles timeout error (504)', async () => {
      globalThis.fetch = async () => {
        const timeoutErr = new Error('Timeout');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      };

      await assert.rejects(
        () => fetchOpenAlexById('W2741809807'),
        (err) => err instanceof OpenAlexError && err.statusCode === 504
      );
    });
  });

  describe('searchOpenAlexCandidates', () => {
    it('returns empty array if title is empty or missing', async () => {
      const results = await searchOpenAlexCandidates({ title: '' });
      assert.deepStrictEqual(results, []);
    });

    it('successfully queries OpenAlex and maps candidate results', async () => {
      const mockResults = {
        results: [
          {
            id: 'https://openalex.org/W2741809807',
            doi: 'https://doi.org/10.48550/arxiv.1706.03762',
            title: 'Attention Is All You Need',
            publication_year: 2017,
            authorships: [
              { author: { display_name: 'Ashish Vaswani' } },
            ],
            primary_location: {
              source: { display_name: 'NeurIPS' },
            },
          },
          {
            id: 'https://openalex.org/W2963403868',
            title: 'Attention is All you Need (Extended)',
            publication_year: 2018,
            authorships: [
              { author: { display_name: 'Other Author' } },
            ],
          },
        ],
      };

      globalThis.fetch = async (url) => {
        assert.ok(url.includes('search=Attention'));
        return {
          ok: true,
          status: 200,
          json: async () => mockResults,
        };
      };

      const candidates = await searchOpenAlexCandidates({ title: 'Attention Is All You Need' });
      assert.strictEqual(candidates.length, 2);
      assert.strictEqual(candidates[0].openAlexId, 'W2741809807');
      assert.strictEqual(candidates[0].title, 'Attention Is All You Need');
      assert.strictEqual(candidates[0].doi, '10.48550/arxiv.1706.03762');
      assert.strictEqual(candidates[0].year, 2017);
      assert.strictEqual(candidates[0].venue, 'NeurIPS');
      assert.deepStrictEqual(candidates[0].authors, ['Ashish Vaswani']);

      assert.strictEqual(candidates[1].openAlexId, 'W2963403868');
      assert.strictEqual(candidates[1].year, 2018);
    });

    it('returns empty array when OpenAlex returns 404 or empty results', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 404,
      });

      const candidates = await searchOpenAlexCandidates({ title: 'Unknown Nonexistent Paper' });
      assert.deepStrictEqual(candidates, []);
    });

    it('handles 429 rate limit exceeded', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
      });

      await assert.rejects(
        () => searchOpenAlexCandidates({ title: 'Rate Limited Title' }),
        (err) => err instanceof OpenAlexError && err.statusCode === 429
      );
    });

    it('handles timeout error (504)', async () => {
      globalThis.fetch = async () => {
        const timeoutErr = new Error('Timeout');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      };

      await assert.rejects(
        () => searchOpenAlexCandidates({ title: 'Timeout Title' }),
        (err) => err instanceof OpenAlexError && err.statusCode === 504
      );
    });
  });

  describe('Edge Cases and Reliability (P7-05)', () => {
    it('handles inverted index with large position gaps safely without memory bloat', () => {
      const invertedIndex = {
        Beginning: [0],
        Later: [50],
      };
      const text = reconstructAbstract(invertedIndex);
      assert.strictEqual(text, 'Beginning Later');
    });

    it('handles inverted index with non-string keys and empty position arrays', () => {
      const invertedIndex = {
        123: [0],
        456: [1],
        EmptyWord: [],
      };
      const text = reconstructAbstract(invertedIndex);
      assert.strictEqual(text, '123 456');
    });

    it('handles inverted index with mixed type positions in array gracefully', () => {
      const invertedIndex = {
        Safe: [0, 'not-a-number', undefined, 2],
        Middle: [1, null, false],
      };
      const text = reconstructAbstract(invertedIndex);
      assert.strictEqual(text, 'Safe Middle Safe');
    });

    it('parses work where optional fields are null or invalid without crashing', () => {
      const nullishWork = {
        title: null,
        display_name: 'Graceful Fallback Title',
        publication_year: null,
        publication_date: 'not-a-valid-date-string',
        primary_location: null,
        locations: null,
        authorships: null,
        abstract_inverted_index: null,
      };

      const result = parseOpenAlexWork(nullishWork);
      assert.strictEqual(result.title, 'Graceful Fallback Title');
      assert.strictEqual(result.year, null);
      assert.strictEqual(result.publicationDate, null);
      assert.strictEqual(result.venue, '');
      assert.strictEqual(result.publisher, '');
      assert.strictEqual(result.abstract, '');
      assert.deepStrictEqual(result.authors, []);
    });

    it('parses work with primary_location lacking source object', () => {
      const workNoSource = {
        title: 'Title Without Source',
        primary_location: {
          landing_page_url: 'https://example.org/article',
          source: null,
        },
      };

      const result = parseOpenAlexWork(workNoSource);
      assert.strictEqual(result.title, 'Title Without Source');
      assert.strictEqual(result.url, 'https://example.org/article');
      assert.strictEqual(result.venue, '');
      assert.strictEqual(result.publisher, '');
    });

    it('extracts author names from raw_author_name when author object is missing', () => {
      const workRawAuthor = {
        title: 'Raw Author Paper',
        authorships: [
          { raw_author_name: 'Dr. Jane Roe' },
          { author: null, raw_author_name: 'Dr. John Doe' },
        ],
      };

      const result = parseOpenAlexWork(workRawAuthor);
      assert.deepStrictEqual(result.authors, ['Dr. Jane Roe', 'Dr. John Doe']);
    });

    it('handles exotic DOIs with complex punctuation and brackets in fetchOpenAlexByDoi', async () => {
      const exoticDoi = '10.1002/(sici)1097-0142(199605)77:9<1826::aid-cncr10>3.0.co;2-p';
      let fetchedUrl = '';

      globalThis.fetch = async (url) => {
        fetchedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'https://openalex.org/W99999',
            title: 'Exotic DOI Paper',
            doi: `https://doi.org/${exoticDoi}`,
          }),
        };
      };

      const result = await fetchOpenAlexByDoi(exoticDoi);
      assert.strictEqual(result.title, 'Exotic DOI Paper');
      assert.ok(fetchedUrl.includes('api.openalex.org/works/https://doi.org/'));
    });

    it('handles upstream 502 Bad Gateway in fetchOpenAlexByDoi', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 502,
      });

      await assert.rejects(
        () => fetchOpenAlexByDoi('10.1038/upstreamerror'),
        (err) => err instanceof OpenAlexError && err.statusCode === 502
      );
    });
  });
});
