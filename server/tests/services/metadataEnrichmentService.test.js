import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichDoiLookup,
  computeMetadataSuggestions,
  getPaperEnrichmentSuggestions,
} from '../../src/services/metadataEnrichmentService.js';
import { CrossrefError } from '../../src/services/crossrefService.js';
import { OpenAlexError } from '../../src/services/openAlexService.js';

describe('Metadata Enrichment Service Unit Tests', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('enriches missing abstract from OpenAlex when Crossref abstract is empty', async () => {
    const crossrefMessage = {
      message: {
        title: ['Sample Research Paper'],
        author: [{ given: 'John', family: 'Doe' }],
        abstract: '', // Missing in Crossref
        DOI: '10.1038/nature12345',
        'published-print': { 'date-parts': [[2020, 5, 12]] },
        'container-title': ['Nature'],
        publisher: ['Springer Nature'],
      },
    };

    const openAlexWork = {
      id: 'https://openalex.org/W1',
      title: 'Sample Research Paper',
      publication_year: 2020,
      abstract_inverted_index: {
        This: [0],
        is: [1],
        the: [2],
        OpenAlex: [3],
        'abstract.': [4],
      },
    };

    globalThis.fetch = async (url) => {
      if (url.includes('api.crossref.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => crossrefMessage,
        };
      }
      if (url.includes('api.openalex.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => openAlexWork,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');

    assert.strictEqual(paper.title, 'Sample Research Paper');
    assert.deepStrictEqual(paper.authors, ['John Doe']);
    assert.strictEqual(paper.abstract, 'This is the OpenAlex abstract.');
    assert.strictEqual(paper.venue, 'Nature');
    assert.strictEqual(enrichment.provider, 'openalex');
    assert.strictEqual(enrichment.status, 'enriched');
    assert.deepStrictEqual(enrichment.supplementedFields, ['abstract']);
  });

  it('strictly preserves populated Crossref abstract even if OpenAlex supplies one (non-destructive)', async () => {
    const crossrefMessage = {
      message: {
        title: ['Original Title'],
        author: [{ given: 'Jane', family: 'Smith' }],
        abstract: '<jats:p>Original Crossref Abstract with JATS tags</jats:p>',
        DOI: '10.1038/nature12345',
        'published-print': { 'date-parts': [[2021, 1, 1]] },
        'container-title': ['Nature'],
        publisher: ['Springer Nature'],
      },
    };

    const openAlexWork = {
      id: 'https://openalex.org/W2',
      abstract_inverted_index: {
        Alternative: [0],
        abstract: [1],
      },
    };

    globalThis.fetch = async (url) => {
      if (url.includes('api.crossref.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => crossrefMessage,
        };
      }
      if (url.includes('api.openalex.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => openAlexWork,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');

    assert.strictEqual(paper.abstract, 'Original Crossref Abstract with JATS tags');
    // Abstract was not supplemented because Crossref already had it
    assert(!enrichment.supplementedFields.includes('abstract'));
  });

  it('preserves Crossref authors when Crossref has at least one valid author', async () => {
    const crossrefMessage = {
      message: {
        title: ['Paper Title'],
        author: [{ given: 'Author', family: 'One' }],
        abstract: '',
        DOI: '10.1038/nature12345',
      },
    };

    const openAlexWork = {
      authorships: [
        { author: { display_name: 'Completely Different Author' } },
        { author: { display_name: 'Second OpenAlex Author' } },
      ],
      abstract_inverted_index: {
        Test: [0],
      },
    };

    globalThis.fetch = async (url) => {
      if (url.includes('api.crossref.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => crossrefMessage,
        };
      }
      if (url.includes('api.openalex.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => openAlexWork,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');

    assert.deepStrictEqual(paper.authors, ['Author One']);
    assert(!enrichment.supplementedFields.includes('authors'));
  });

  it('uses OpenAlex authors ONLY when Crossref supplies zero valid authors', async () => {
    const crossrefMessage = {
      message: {
        title: ['Institutional Report'],
        author: [], // No authors in Crossref
        abstract: '',
        DOI: '10.1038/nature12345',
      },
    };

    const openAlexWork = {
      authorships: [
        { author: { display_name: 'Lead Researcher' } },
      ],
      abstract_inverted_index: {
        Test: [0],
      },
    };

    globalThis.fetch = async (url) => {
      if (url.includes('api.crossref.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => crossrefMessage,
        };
      }
      if (url.includes('api.openalex.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => openAlexWork,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');

    assert.deepStrictEqual(paper.authors, ['Lead Researcher']);
    assert(enrichment.supplementedFields.includes('authors'));
  });

  it('enriches multiple missing fields (year, venue, publisher, url)', async () => {
    const crossrefMessage = {
      message: {
        title: ['Minimal Paper'],
        author: [{ given: 'Alice', family: 'Bob' }],
        abstract: '',
        DOI: '10.1038/nature12345',
        // Missing year, date, venue, publisher
      },
    };

    const openAlexWork = {
      publication_year: 2022,
      publication_date: '2022-03-15',
      primary_location: {
        landing_page_url: 'https://example.com/paper/12345',
        source: {
          display_name: 'Science Advances',
          host_organization_name: 'AAAS',
        },
      },
      abstract_inverted_index: {
        Enriched: [0],
        text: [1],
      },
    };

    globalThis.fetch = async (url) => {
      if (url.includes('api.crossref.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => crossrefMessage,
        };
      }
      if (url.includes('api.openalex.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => openAlexWork,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');

    assert.strictEqual(paper.year, 2022);
    assert.strictEqual(paper.publicationDate, new Date('2022-03-15').toISOString());
    assert.strictEqual(paper.venue, 'Science Advances');
    assert.strictEqual(paper.publisher, 'AAAS');
    assert.strictEqual(paper.url, 'https://example.com/paper/12345');
    assert.strictEqual(paper.abstract, 'Enriched text');
    assert.strictEqual(enrichment.status, 'enriched');
    assert(enrichment.supplementedFields.includes('year'));
    assert(enrichment.supplementedFields.includes('venue'));
    assert(enrichment.supplementedFields.includes('publisher'));
    assert(enrichment.supplementedFields.includes('url'));
    assert(enrichment.supplementedFields.includes('abstract'));
  });

  it('skips OpenAlex query when Crossref provides complete metadata', async () => {
    let openAlexCalled = false;
    const crossrefMessage = {
      message: {
        title: ['Complete Paper'],
        author: [{ given: 'Full', family: 'Author' }],
        abstract: 'Complete abstract here',
        DOI: '10.1038/nature12345',
        'published-print': { 'date-parts': [[2021, 6, 1]] },
        'container-title': ['Nature'],
        publisher: 'Springer Nature',
        URL: 'https://custom-url.org/article',
      },
    };

    globalThis.fetch = async (url) => {
      if (url.includes('api.crossref.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => crossrefMessage,
        };
      }
      if (url.includes('api.openalex.org')) {
        openAlexCalled = true;
        return { ok: true, status: 200, json: async () => ({}) };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');

    assert.strictEqual(openAlexCalled, false);
    assert.strictEqual(paper.title, 'Complete Paper');
    assert.strictEqual(enrichment.status, 'skipped');
    assert.deepStrictEqual(enrichment.supplementedFields, []);
  });

  it('swallows OpenAlex 404 and returns pure Crossref metadata cleanly', async () => {
    const crossrefMessage = {
      message: {
        title: ['Crossref Only Paper'],
        author: [{ given: 'Only', family: 'Crossref' }],
        abstract: '',
        DOI: '10.1038/nature12345',
      },
    };

    globalThis.fetch = async (url) => {
      if (url.includes('api.crossref.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => crossrefMessage,
        };
      }
      if (url.includes('api.openalex.org')) {
        return {
          ok: false,
          status: 404,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');

    assert.strictEqual(paper.title, 'Crossref Only Paper');
    assert.strictEqual(paper.abstract, '');
    assert.strictEqual(enrichment.status, 'unavailable');
    assert.deepStrictEqual(enrichment.supplementedFields, []);
  });

  it('swallows OpenAlex timeout and returns pure Crossref metadata cleanly', async () => {
    const crossrefMessage = {
      message: {
        title: ['Crossref Paper'],
        author: [{ given: 'Jane', family: 'Doe' }],
        abstract: '',
        DOI: '10.1038/nature12345',
      },
    };

    globalThis.fetch = async (url) => {
      if (url.includes('api.crossref.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => crossrefMessage,
        };
      }
      if (url.includes('api.openalex.org')) {
        const timeoutErr = new Error('The operation was aborted');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');

    assert.strictEqual(paper.title, 'Crossref Paper');
    assert.strictEqual(enrichment.status, 'unavailable');
    assert.deepStrictEqual(enrichment.supplementedFields, []);
  });

  it('swallows OpenAlex 500 error and returns pure Crossref metadata cleanly', async () => {
    const crossrefMessage = {
      message: {
        title: ['Crossref Paper'],
        author: [{ given: 'Jane', family: 'Doe' }],
        abstract: '',
        DOI: '10.1038/nature12345',
      },
    };

    globalThis.fetch = async (url) => {
      if (url.includes('api.crossref.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => crossrefMessage,
        };
      }
      if (url.includes('api.openalex.org')) {
        return {
          ok: false,
          status: 500,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');

    assert.strictEqual(paper.title, 'Crossref Paper');
    assert.strictEqual(enrichment.status, 'unavailable');
  });

  it('propagates Crossref errors immediately without calling OpenAlex', async () => {
    let openAlexCalled = false;
    globalThis.fetch = async (url) => {
      if (url.includes('api.crossref.org')) {
        return {
          ok: false,
          status: 404,
        };
      }
      if (url.includes('api.openalex.org')) {
        openAlexCalled = true;
        return { ok: true, status: 200, json: async () => ({}) };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await assert.rejects(
      () => enrichDoiLookup('10.1038/crossrefnotfound'),
      (err) => err instanceof CrossrefError && err.statusCode === 404
    );

    assert.strictEqual(openAlexCalled, false);
  });

  describe('computeMetadataSuggestions', () => {
    it('returns empty array when paper or work is missing', () => {
      assert.deepStrictEqual(computeMetadataSuggestions(null, {}), []);
      assert.deepStrictEqual(computeMetadataSuggestions({}, null), []);
    });

    it('generates "add" suggestions when existing paper fields are empty/null', () => {
      const paper = {
        title: 'Quantum Computing',
        authors: ['Alice Smith'],
        abstract: '',
        venue: '',
        year: null,
        publicationDate: null,
        publisher: '',
        url: '',
        doi: undefined,
      };

      const openAlexWork = {
        abstract: 'A breakthrough in quantum supremacy.',
        venue: 'Physical Review Letters',
        year: 2023,
        publicationDate: '2023-11-01T00:00:00.000Z',
        publisher: 'APS',
        url: 'https://doi.org/10.1103/PhysRevLett.123',
        doi: '10.1103/physrevlett.123',
        authors: ['Alice Smith'],
      };

      const suggestions = computeMetadataSuggestions(paper, openAlexWork);
      assert.strictEqual(suggestions.length, 7);

      const findSuggestion = (field) => suggestions.find((s) => s.field === field);

      assert.deepStrictEqual(findSuggestion('abstract'), {
        field: 'abstract',
        currentValue: '',
        suggestedValue: 'A breakthrough in quantum supremacy.',
        type: 'add',
      });
      assert.deepStrictEqual(findSuggestion('venue'), {
        field: 'venue',
        currentValue: '',
        suggestedValue: 'Physical Review Letters',
        type: 'add',
      });
      assert.deepStrictEqual(findSuggestion('year'), {
        field: 'year',
        currentValue: null,
        suggestedValue: 2023,
        type: 'add',
      });
      assert.deepStrictEqual(findSuggestion('publicationDate'), {
        field: 'publicationDate',
        currentValue: null,
        suggestedValue: '2023-11-01T00:00:00.000Z',
        type: 'add',
      });
      assert.deepStrictEqual(findSuggestion('publisher'), {
        field: 'publisher',
        currentValue: '',
        suggestedValue: 'APS',
        type: 'add',
      });
      assert.deepStrictEqual(findSuggestion('url'), {
        field: 'url',
        currentValue: '',
        suggestedValue: 'https://doi.org/10.1103/PhysRevLett.123',
        type: 'add',
      });
      assert.deepStrictEqual(findSuggestion('doi'), {
        field: 'doi',
        currentValue: '',
        suggestedValue: '10.1103/physrevlett.123',
        type: 'add',
      });
    });

    it('generates "update" suggestions when fields already have values but differ', () => {
      const paper = {
        title: 'Deep Learning',
        authors: ['Yann LeCun'],
        abstract: 'Short draft abstract',
        venue: 'ArXiv',
        year: 2014,
        publicationDate: new Date('2014-01-01T00:00:00.000Z'),
        publisher: 'Cornell',
        url: 'https://arxiv.org/abs/1234',
        doi: '10.1038/nature14539',
      };

      const openAlexWork = {
        abstract: 'Comprehensive published abstract',
        venue: 'Nature',
        year: 2015,
        publicationDate: '2015-05-27T00:00:00.000Z',
        publisher: 'Nature Publishing Group',
        url: 'https://www.nature.com/articles/nature14539',
        doi: '10.1038/nature14539',
        authors: ['Yann LeCun', 'Yoshua Bengio', 'Geoffrey Hinton'],
      };

      const suggestions = computeMetadataSuggestions(paper, openAlexWork);
      const findSuggestion = (field) => suggestions.find((s) => s.field === field);

      // DOI should NOT be suggested because paper already has a DOI
      assert.strictEqual(findSuggestion('doi'), undefined);

      assert.strictEqual(findSuggestion('abstract').type, 'update');
      assert.strictEqual(findSuggestion('abstract').currentValue, 'Short draft abstract');
      assert.strictEqual(findSuggestion('abstract').suggestedValue, 'Comprehensive published abstract');

      assert.strictEqual(findSuggestion('venue').type, 'update');
      assert.strictEqual(findSuggestion('year').type, 'update');
      assert.strictEqual(findSuggestion('year').currentValue, 2014);
      assert.strictEqual(findSuggestion('year').suggestedValue, 2015);

      assert.strictEqual(findSuggestion('publicationDate').type, 'update');
      assert.strictEqual(findSuggestion('publisher').type, 'update');
      assert.strictEqual(findSuggestion('url').type, 'update');

      assert.strictEqual(findSuggestion('authors').type, 'update');
      assert.deepStrictEqual(findSuggestion('authors').currentValue, ['Yann LeCun']);
      assert.deepStrictEqual(findSuggestion('authors').suggestedValue, [
        'Yann LeCun',
        'Yoshua Bengio',
        'Geoffrey Hinton',
      ]);
    });

    it('generates no suggestions when all fields match identical values', () => {
      const paper = {
        title: 'Deep Learning',
        authors: ['Yann LeCun', 'Yoshua Bengio'],
        abstract: 'Exact same abstract text',
        venue: 'Nature',
        year: 2015,
        publicationDate: new Date('2015-05-27T00:00:00.000Z'),
        publisher: 'Nature Publishing Group',
        url: 'https://nature.com/123',
        doi: '10.1038/nature14539',
      };

      const openAlexWork = {
        abstract: 'Exact same abstract text',
        venue: 'nature', // case-insensitive match
        year: 2015,
        publicationDate: '2015-05-27T00:00:00.000Z',
        publisher: 'nature publishing group',
        url: 'https://nature.com/123',
        doi: '10.1038/nature14539',
        authors: ['Yann LeCun', 'Yoshua Bengio'],
      };

      const suggestions = computeMetadataSuggestions(paper, openAlexWork);
      assert.deepStrictEqual(suggestions, []);
    });
  });

  describe('getPaperEnrichmentSuggestions', () => {
    const mockPaper = {
      _id: '507f1f77bcf86cd799439011',
      title: 'Attention Is All You Need',
      authors: ['Ashish Vaswani'],
      abstract: '',
      doi: '10.48550/arxiv.1706.03762',
      year: 2017,
    };

    it('returns suggestions via exact DOI lookup when DOI matches in OpenAlex', async () => {
      const mockOpenAlexWork = {
        id: 'https://openalex.org/W2741809807',
        doi: 'https://doi.org/10.48550/arxiv.1706.03762',
        title: 'Attention Is All You Need',
        publication_year: 2017,
        abstract_inverted_index: {
          The: [0],
          dominant: [1],
          paradigm: [2],
        },
        primary_location: {
          source: { display_name: 'NeurIPS' },
        },
      };

      globalThis.fetch = async (url) => {
        assert.ok(url.includes('api.openalex.org/works/https://doi.org/'));
        return {
          ok: true,
          status: 200,
          json: async () => mockOpenAlexWork,
        };
      };

      const result = await getPaperEnrichmentSuggestions(mockPaper);
      assert.strictEqual(result.paperId, '507f1f77bcf86cd799439011');
      assert.strictEqual(result.status, 'ready');
      assert.strictEqual(result.matchedWork.openAlexId, 'W2741809807');
      assert.strictEqual(result.matchedWork.venue, 'NeurIPS');
      assert.ok(result.suggestions.some((s) => s.field === 'abstract' && s.type === 'add'));
    });

    it('falls back to title search when DOI returns 404 in OpenAlex', async () => {
      let searchCalled = false;
      const mockCandidates = {
        results: [
          {
            id: 'https://openalex.org/W2741809807',
            doi: 'https://doi.org/10.48550/arxiv.1706.03762',
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

      globalThis.fetch = async (url) => {
        if (url.includes('/works/https://doi.org/')) {
          return { ok: false, status: 404 };
        }
        if (url.includes('/works?')) {
          searchCalled = true;
          return { ok: true, status: 200, json: async () => mockCandidates };
        }
        if (url.includes('/works/W2741809807')) {
          return { ok: true, status: 200, json: async () => mockWork };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const result = await getPaperEnrichmentSuggestions(mockPaper);
      assert.strictEqual(searchCalled, true);
      assert.strictEqual(result.status, 'ready');
      assert.strictEqual(result.matchedWork.openAlexId, 'W2741809807');
    });

    it('rethrows 429 and 504 errors from DOI lookup without swallowing', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
      });

      await assert.rejects(
        () => getPaperEnrichmentSuggestions(mockPaper),
        (err) => err instanceof OpenAlexError && err.statusCode === 429
      );
    });

    it('returns "not_found" status when title search yields 0 candidates', async () => {
      const paperNoDoi = {
        _id: '507f1f77bcf86cd799439022',
        title: 'Completely Unique Unknown Paper 12345',
        authors: ['Unknown'],
      };

      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      });

      const result = await getPaperEnrichmentSuggestions(paperNoDoi);
      assert.strictEqual(result.paperId, '507f1f77bcf86cd799439022');
      assert.strictEqual(result.status, 'not_found');
      assert.strictEqual(result.message, 'No matching publication found in OpenAlex');
    });

    it('returns "ambiguous" status with candidates when multiple candidates match', async () => {
      const paperNoDoi = {
        _id: '507f1f77bcf86cd799439033',
        title: 'Deep Learning Review',
        authors: ['Smith'],
      };

      const mockCandidates = {
        results: [
          {
            id: 'https://openalex.org/W111',
            title: 'Deep Learning Review: Part 1',
            publication_year: 2020,
            authorships: [{ author: { display_name: 'Smith' } }],
          },
          {
            id: 'https://openalex.org/W222',
            title: 'Deep Learning Review: Part 2',
            publication_year: 2021,
            authorships: [{ author: { display_name: 'Smith' } }],
          },
        ],
      };

      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => mockCandidates,
      });

      const result = await getPaperEnrichmentSuggestions(paperNoDoi);
      assert.strictEqual(result.paperId, '507f1f77bcf86cd799439033');
      assert.strictEqual(result.status, 'ambiguous');
      assert.strictEqual(result.candidates.length, 2);
      assert.strictEqual(result.candidates[0].openAlexId, 'W111');
      assert.strictEqual(result.candidates[1].openAlexId, 'W222');
    });

    it('uses user-specified openAlexId directly when provided in options', async () => {
      const mockWork = {
        id: 'https://openalex.org/W999',
        title: 'User Selected Work',
        publication_year: 2022,
        abstract_inverted_index: {
          Explicit: [0],
          selection: [1],
        },
      };

      globalThis.fetch = async (url) => {
        assert.ok(url.includes('/works/W999'));
        return {
          ok: true,
          status: 200,
          json: async () => mockWork,
        };
      };

      const result = await getPaperEnrichmentSuggestions(mockPaper, { openAlexId: 'W999' });
      assert.strictEqual(result.status, 'ready');
      assert.strictEqual(result.matchedWork.openAlexId, 'W999');
      assert.strictEqual(result.matchedWork.title, 'User Selected Work');
    });

    it('throws 400 when invalid openAlexId is provided in options', async () => {
      await assert.rejects(
        () => getPaperEnrichmentSuggestions(mockPaper, { openAlexId: 'invalid-id-xyz' }),
        (err) => err instanceof OpenAlexError && err.statusCode === 400
      );
    });
  });

  describe('Edge Cases and Reliability (P7-05)', () => {
    describe('computeMetadataSuggestions edge cases', () => {
      it('never suggests modifying or adding DOI if paper already has a DOI', () => {
        const paper = {
          title: 'Existing Paper',
          authors: ['Author'],
          doi: '10.1038/original-doi',
        };

        const openAlexWork = {
          doi: '10.1038/completely-different-doi',
          abstract: 'Enriched abstract',
        };

        const suggestions = computeMetadataSuggestions(paper, openAlexWork);
        const doiSuggestion = suggestions.find((s) => s.field === 'doi');
        assert.strictEqual(doiSuggestion, undefined);
      });

      it('does not generate suggestions for null, undefined, or empty OpenAlex fields', () => {
        const paper = {
          title: 'Paper Title',
          authors: ['Author One'],
          abstract: '',
          venue: '',
          publisher: '',
          url: '',
        };

        const openAlexWork = {
          abstract: '',
          venue: null,
          publisher: undefined,
          url: '   ',
          year: null,
        };

        const suggestions = computeMetadataSuggestions(paper, openAlexWork);
        assert.deepStrictEqual(suggestions, []);
      });

      it('recognizes matching author names with different casing and whitespace as identical', () => {
        const paper = {
          title: 'Author Matching Paper',
          authors: ['  Yann LeCun  ', 'Yoshua Bengio'],
        };

        const openAlexWork = {
          authors: ['yann lecun', 'YOSHUA BENGIO'],
        };

        const suggestions = computeMetadataSuggestions(paper, openAlexWork);
        const authorSuggestion = suggestions.find((s) => s.field === 'authors');
        assert.strictEqual(authorSuggestion, undefined);
      });

      it('recognizes identical publication date between Date object and YYYY-MM-DD string without proposing update', () => {
        const paper = {
          title: 'Date Matching Paper',
          authors: ['Author'],
          publicationDate: new Date('2023-05-15T12:00:00.000Z'),
        };

        const openAlexWork = {
          publicationDate: '2023-05-15',
        };

        const suggestions = computeMetadataSuggestions(paper, openAlexWork);
        const dateSuggestion = suggestions.find((s) => s.field === 'publicationDate');
        assert.strictEqual(dateSuggestion, undefined);
      });

      it('marks authors as "add" type if existing paper has zero authors', () => {
        const paper = {
          title: 'No Author Paper',
          authors: [],
        };

        const openAlexWork = {
          authors: ['Discovered Author'],
        };

        const suggestions = computeMetadataSuggestions(paper, openAlexWork);
        const authorSuggestion = suggestions.find((s) => s.field === 'authors');
        assert.ok(authorSuggestion);
        assert.strictEqual(authorSuggestion.type, 'add');
        assert.deepStrictEqual(authorSuggestion.suggestedValue, ['Discovered Author']);
      });
    });

    describe('getPaperEnrichmentSuggestions edge cases', () => {
      it('exact DOI match takes precedence over candidate search when paper has both DOI and title', async () => {
        let candidateSearchCalled = false;
        let doiLookupCalled = false;

        const paper = {
          _id: '507f1f77bcf86cd799439099',
          title: 'Ambiguous Title With Valid DOI',
          authors: ['Researcher'],
          doi: '10.1038/valid-doi',
        };

        const mockWork = {
          id: 'https://openalex.org/W111',
          doi: 'https://doi.org/10.1038/valid-doi',
          title: 'Ambiguous Title With Valid DOI',
          abstract_inverted_index: { Abstract: [0] },
        };

        globalThis.fetch = async (url) => {
          if (url.includes('/works/https://doi.org/')) {
            doiLookupCalled = true;
            return { ok: true, status: 200, json: async () => mockWork };
          }
          if (url.includes('/works?search=')) {
            candidateSearchCalled = true;
            return { ok: true, status: 200, json: async () => ({ results: [] }) };
          }
          throw new Error(`Unexpected URL: ${url}`);
        };

        const result = await getPaperEnrichmentSuggestions(paper);
        assert.strictEqual(doiLookupCalled, true);
        assert.strictEqual(candidateSearchCalled, false);
        assert.strictEqual(result.status, 'ready');
      });

      it('handles incomplete paper metadata (no author, no year, short title) during candidate fallback search', async () => {
        const incompletePaper = {
          _id: '507f1f77bcf86cd799439088',
          title: 'BERT',
          authors: [],
          year: null,
        };

        let searchedUrl = '';
        const mockCandidates = {
          results: [
            {
              id: 'https://openalex.org/W888',
              title: 'BERT: Pre-training of Deep Bidirectional Transformers',
              publication_year: 2018,
              authorships: [{ author: { display_name: 'Jacob Devlin' } }],
            },
          ],
        };
        const mockWork = {
          id: 'https://openalex.org/W888',
          title: 'BERT: Pre-training of Deep Bidirectional Transformers',
          publication_year: 2018,
          abstract_inverted_index: { BERT: [0] },
        };

        globalThis.fetch = async (url) => {
          if (url.includes('/works?')) {
            searchedUrl = url;
            return { ok: true, status: 200, json: async () => mockCandidates };
          }
          if (url.includes('/works/W888')) {
            return { ok: true, status: 200, json: async () => mockWork };
          }
          throw new Error(`Unexpected URL: ${url}`);
        };

        const result = await getPaperEnrichmentSuggestions(incompletePaper);
        assert.strictEqual(result.status, 'ready');
        assert.strictEqual(result.matchedWork.openAlexId, 'W888');
        assert.ok(searchedUrl.includes('search=BERT'));
      });

      it('returns not_found status when paper title is empty or whitespace-only without DOI', async () => {
        const emptyTitlePaper = {
          _id: '507f1f77bcf86cd799439077',
          title: '   ',
          authors: [],
        };

        const result = await getPaperEnrichmentSuggestions(emptyTitlePaper);
        assert.strictEqual(result.status, 'not_found');
        assert.strictEqual(result.message, 'No matching publication found in OpenAlex');
      });

      it('propagates 502 Bad Gateway when candidate search fails with 502', async () => {
        const paper = {
          _id: '507f1f77bcf86cd799439066',
          title: 'Query Causing 502',
          authors: ['Author'],
        };

        globalThis.fetch = async () => ({
          ok: false,
          status: 502,
        });

        await assert.rejects(
          () => getPaperEnrichmentSuggestions(paper),
          (err) => err instanceof OpenAlexError && err.statusCode === 502
        );
      });
    });

    describe('enrichDoiLookup failure isolation (DOI import flow)', () => {
      const baseCrossref = {
        message: {
          title: ['Resilient Paper'],
          author: [{ given: 'Alice', family: 'Smith' }],
          abstract: '',
          DOI: '10.1038/nature12345',
        },
      };

      it('swallows OpenAlex 429 and returns pure Crossref data with unavailable status', async () => {
        globalThis.fetch = async (url) => {
          if (url.includes('api.crossref.org')) {
            return { ok: true, status: 200, json: async () => baseCrossref };
          }
          if (url.includes('api.openalex.org')) {
            return { ok: false, status: 429 };
          }
          throw new Error(`Unexpected URL: ${url}`);
        };

        const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');
        assert.strictEqual(paper.title, 'Resilient Paper');
        assert.strictEqual(enrichment.status, 'unavailable');
        assert.deepStrictEqual(enrichment.supplementedFields, []);
      });

      it('swallows OpenAlex network error and returns pure Crossref data cleanly', async () => {
        globalThis.fetch = async (url) => {
          if (url.includes('api.crossref.org')) {
            return { ok: true, status: 200, json: async () => baseCrossref };
          }
          if (url.includes('api.openalex.org')) {
            throw new Error('ECONNRESET');
          }
          throw new Error(`Unexpected URL: ${url}`);
        };

        const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');
        assert.strictEqual(paper.title, 'Resilient Paper');
        assert.strictEqual(enrichment.status, 'unavailable');
      });

      it('swallows OpenAlex malformed JSON error and returns pure Crossref data cleanly', async () => {
        globalThis.fetch = async (url) => {
          if (url.includes('api.crossref.org')) {
            return { ok: true, status: 200, json: async () => baseCrossref };
          }
          if (url.includes('api.openalex.org')) {
            return {
              ok: true,
              status: 200,
              json: async () => {
                throw new SyntaxError('Unexpected token < in JSON');
              },
            };
          }
          throw new Error(`Unexpected URL: ${url}`);
        };

        const { paper, enrichment } = await enrichDoiLookup('10.1038/nature12345');
        assert.strictEqual(paper.title, 'Resilient Paper');
        assert.strictEqual(enrichment.status, 'unavailable');
      });
    });
  });
});
