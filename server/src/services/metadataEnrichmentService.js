import { fetchCrossrefMetadata } from './crossrefService.js';
import {
  fetchOpenAlexByDoi,
  fetchOpenAlexById,
  searchOpenAlexCandidates,
  normalizeOpenAlexId,
  OpenAlexError,
} from './openAlexService.js';

/**
 * Service orchestrating multi-provider metadata resolution and non-destructive enrichment.
 */

/**
 * Checks whether an existing value is considered present/populated.
 *
 * @param {any} val
 * @returns {boolean}
 */
function isPopulated(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'number') return !isNaN(val);
  return true;
}

/**
 * Looks up publication metadata by DOI from Crossref (primary) and enriches
 * missing or empty fields using OpenAlex (secondary).
 *
 * Guarantees:
 * - Crossref is the primary authoritative provider.
 * - OpenAlex only supplements missing/empty fields: abstract, year, publicationDate, venue, publisher, url.
 * - Valid Crossref authors are strictly preserved if >=1 author is supplied.
 *   OpenAlex authors are used only if Crossref supplies zero valid authors.
 * - Populated Crossref values are never overwritten.
 * - OpenAlex failures (404, 429, 500, timeouts, network errors, malformed responses)
 *   are caught and swallowed so they never prevent an otherwise successful Crossref lookup.
 * - Does not persist anything to MongoDB (read-only resolution).
 *
 * @param {string} rawDoi - DOI input
 * @param {object} [options] - Options passed to underlying fetch services
 * @returns {Promise<{ paper: object, enrichment: { provider: string, status: string, supplementedFields: string[] } }>}
 */
export async function enrichDoiLookup(rawDoi, options = {}) {
  // 1. Primary lookup via Crossref.
  // Errors from Crossref are not caught here; they propagate to the caller.
  const crossrefPaper = await fetchCrossrefMetadata(rawDoi, options);

  // Check which fields are missing from Crossref
  const needsAbstract = !isPopulated(crossrefPaper.abstract);
  const needsYear = !isPopulated(crossrefPaper.year);
  const needsDate = !isPopulated(crossrefPaper.publicationDate);
  const needsVenue = !isPopulated(crossrefPaper.venue);
  const needsPublisher = !isPopulated(crossrefPaper.publisher);
  const canonicalDoiUrl = `https://doi.org/${crossrefPaper.doi}`;
  const needsUrl = !isPopulated(crossrefPaper.url) || crossrefPaper.url === canonicalDoiUrl;
  const needsAuthors = !Array.isArray(crossrefPaper.authors) || crossrefPaper.authors.length === 0;

  const anyFieldMissing =
    needsAbstract ||
    needsYear ||
    needsDate ||
    needsVenue ||
    needsPublisher ||
    needsUrl ||
    needsAuthors;

  // If Crossref returned completely full metadata, no enrichment is needed
  if (!anyFieldMissing) {
    return {
      paper: { ...crossrefPaper },
      enrichment: {
        provider: 'openalex',
        status: 'skipped',
        supplementedFields: [],
      },
    };
  }

  // 2. Query OpenAlex to supplement missing fields
  let openAlexPaper = null;
  let openAlexFailed = false;

  try {
    openAlexPaper = await fetchOpenAlexByDoi(rawDoi, options);
  } catch {
    // OpenAlex errors are caught and swallowed; Crossref metadata is preserved
    openAlexFailed = true;
    openAlexPaper = null;
  }

  const merged = { ...crossrefPaper };
  const supplementedFields = [];

  if (openAlexPaper && typeof openAlexPaper === 'object') {
    // Abstract: fill only if Crossref had none
    if (needsAbstract && isPopulated(openAlexPaper.abstract)) {
      merged.abstract = openAlexPaper.abstract;
      supplementedFields.push('abstract');
    }

    // Publication year: fill only if Crossref had none
    if (needsYear && Number.isInteger(openAlexPaper.year)) {
      merged.year = openAlexPaper.year;
      supplementedFields.push('year');
    }

    // Publication date: fill only if Crossref had none
    if (needsDate && isPopulated(openAlexPaper.publicationDate)) {
      merged.publicationDate = openAlexPaper.publicationDate;
      supplementedFields.push('publicationDate');
    }

    // Venue: fill only if Crossref had none
    if (needsVenue && isPopulated(openAlexPaper.venue)) {
      merged.venue = openAlexPaper.venue;
      supplementedFields.push('venue');
    }

    // Publisher: fill only if Crossref had none
    if (needsPublisher && isPopulated(openAlexPaper.publisher)) {
      merged.publisher = openAlexPaper.publisher;
      supplementedFields.push('publisher');
    }

    // Canonical landing URL: fill if Crossref had none or only the default doi.org link
    if (needsUrl && isPopulated(openAlexPaper.url) && openAlexPaper.url !== canonicalDoiUrl) {
      merged.url = openAlexPaper.url;
      supplementedFields.push('url');
    }

    // Authors: preserve Crossref authors if >= 1; use OpenAlex only if Crossref had none
    if (needsAuthors && Array.isArray(openAlexPaper.authors) && openAlexPaper.authors.length > 0) {
      merged.authors = [...openAlexPaper.authors];
      supplementedFields.push('authors');
    }
  }

  let status = 'skipped';
  if (supplementedFields.length > 0) {
    status = 'enriched';
  } else if (openAlexFailed || !openAlexPaper) {
    status = 'unavailable';
  }

  return {
    paper: merged,
    enrichment: {
      provider: 'openalex',
      status,
      supplementedFields,
    },
  };
}

/**
 * Computes field-level metadata suggestions comparing an existing paper against OpenAlex metadata.
 * Generates suggestions for: abstract, venue, year, publicationDate, publisher, url, doi (if missing), authors.
 * Distinguishes between 'add' (field missing/empty on paper) and 'update' (field has value, but differs).
 *
 * @param {object} paper - Existing Paper document or object
 * @param {object} openAlexWork - Normalized OpenAlex work metadata
 * @returns {Array<{ field: string, currentValue: any, suggestedValue: any, type: 'add' | 'update' }>}
 */
export function computeMetadataSuggestions(paper, openAlexWork) {
  if (!paper || !openAlexWork) {
    return [];
  }

  const suggestions = [];

  // 1. Abstract
  if (isPopulated(openAlexWork.abstract)) {
    const suggestedAbstract = openAlexWork.abstract.trim();
    if (!isPopulated(paper.abstract)) {
      suggestions.push({
        field: 'abstract',
        currentValue: paper.abstract || '',
        suggestedValue: suggestedAbstract,
        type: 'add',
      });
    } else if (paper.abstract.trim() !== suggestedAbstract) {
      suggestions.push({
        field: 'abstract',
        currentValue: paper.abstract.trim(),
        suggestedValue: suggestedAbstract,
        type: 'update',
      });
    }
  }

  // 2. Venue
  if (isPopulated(openAlexWork.venue)) {
    const suggestedVenue = openAlexWork.venue.trim();
    if (!isPopulated(paper.venue)) {
      suggestions.push({
        field: 'venue',
        currentValue: paper.venue || '',
        suggestedValue: suggestedVenue,
        type: 'add',
      });
    } else if (paper.venue.trim().toLowerCase() !== suggestedVenue.toLowerCase()) {
      suggestions.push({
        field: 'venue',
        currentValue: paper.venue.trim(),
        suggestedValue: suggestedVenue,
        type: 'update',
      });
    }
  }

  // 3. Year
  if (Number.isInteger(openAlexWork.year)) {
    if (paper.year === null || paper.year === undefined) {
      suggestions.push({
        field: 'year',
        currentValue: null,
        suggestedValue: openAlexWork.year,
        type: 'add',
      });
    } else if (paper.year !== openAlexWork.year) {
      suggestions.push({
        field: 'year',
        currentValue: paper.year,
        suggestedValue: openAlexWork.year,
        type: 'update',
      });
    }
  }

  // 4. Publication Date
  if (isPopulated(openAlexWork.publicationDate)) {
    let paperDateIso = null;
    if (paper.publicationDate) {
      const d = new Date(paper.publicationDate);
      if (!isNaN(d.getTime())) {
        paperDateIso = d.toISOString();
      }
    }

    if (!paperDateIso) {
      suggestions.push({
        field: 'publicationDate',
        currentValue: null,
        suggestedValue: openAlexWork.publicationDate,
        type: 'add',
      });
    } else if (paperDateIso.slice(0, 10) !== openAlexWork.publicationDate.slice(0, 10)) {
      suggestions.push({
        field: 'publicationDate',
        currentValue: paperDateIso,
        suggestedValue: openAlexWork.publicationDate,
        type: 'update',
      });
    }
  }

  // 5. Publisher
  if (isPopulated(openAlexWork.publisher)) {
    const suggestedPublisher = openAlexWork.publisher.trim();
    if (!isPopulated(paper.publisher)) {
      suggestions.push({
        field: 'publisher',
        currentValue: paper.publisher || '',
        suggestedValue: suggestedPublisher,
        type: 'add',
      });
    } else if (paper.publisher.trim().toLowerCase() !== suggestedPublisher.toLowerCase()) {
      suggestions.push({
        field: 'publisher',
        currentValue: paper.publisher.trim(),
        suggestedValue: suggestedPublisher,
        type: 'update',
      });
    }
  }

  // 6. URL
  if (isPopulated(openAlexWork.url)) {
    const suggestedUrl = openAlexWork.url.trim();
    if (!isPopulated(paper.url)) {
      suggestions.push({
        field: 'url',
        currentValue: paper.url || '',
        suggestedValue: suggestedUrl,
        type: 'add',
      });
    } else if (paper.url.trim() !== suggestedUrl) {
      suggestions.push({
        field: 'url',
        currentValue: paper.url.trim(),
        suggestedValue: suggestedUrl,
        type: 'update',
      });
    }
  }

  // 7. DOI (suggested only if the existing paper has no DOI)
  if (!isPopulated(paper.doi) && isPopulated(openAlexWork.doi)) {
    suggestions.push({
      field: 'doi',
      currentValue: '',
      suggestedValue: openAlexWork.doi.trim().toLowerCase(),
      type: 'add',
    });
  }

  // 8. Authors
  if (Array.isArray(openAlexWork.authors) && openAlexWork.authors.length > 0) {
    const paperAuthors = Array.isArray(paper.authors)
      ? paper.authors.filter((a) => typeof a === 'string' && a.trim().length > 0)
      : [];
    const openAlexAuthors = openAlexWork.authors.filter((a) => typeof a === 'string' && a.trim().length > 0);

    if (paperAuthors.length === 0) {
      suggestions.push({
        field: 'authors',
        currentValue: [],
        suggestedValue: openAlexAuthors,
        type: 'add',
      });
    } else {
      const differs =
        paperAuthors.length !== openAlexAuthors.length ||
        paperAuthors.some((author, idx) => author.trim().toLowerCase() !== openAlexAuthors[idx]?.trim().toLowerCase());
      if (differs) {
        suggestions.push({
          field: 'authors',
          currentValue: [...paperAuthors],
          suggestedValue: [...openAlexAuthors],
          type: 'update',
        });
      }
    }
  }

  return suggestions;
}

/**
 * Orchestrates retrieval of enrichment suggestions for an existing paper.
 * Read-only operation; does not mutate the paper in MongoDB.
 *
 * Matching logic:
 * 1. If options.openAlexId is provided, fetch directly by OpenAlex ID.
 * 2. If paper has a DOI, attempt exact DOI lookup via OpenAlex.
 * 3. Fallback: If paper has no DOI or DOI lookup returns 404, search OpenAlex by title/author/year.
 *    - 0 candidates: { paperId, status: 'not_found', message: 'No matching publication found in OpenAlex' }
 *    - 1 candidate: fetch work and compute suggestions -> { paperId, status: 'ready', ... }
 *    - >1 candidates: { paperId, status: 'ambiguous', candidates: [...] }
 *
 * @param {object} paper - Paper document or POJO
 * @param {object} [options]
 * @param {string} [options.openAlexId] - Optional user-selected OpenAlex ID
 * @returns {Promise<object>} Enrichment suggestions response payload
 */
export async function getPaperEnrichmentSuggestions(paper, options = {}) {
  const paperId = paper._id ? paper._id.toString() : '';

  // 1. Explicit OpenAlex ID selection
  if (options.openAlexId) {
    const normalizedId = normalizeOpenAlexId(options.openAlexId);
    if (!normalizedId) {
      throw new OpenAlexError('Invalid OpenAlex ID format', 400);
    }
    const work = await fetchOpenAlexById(normalizedId, options);
    const suggestions = computeMetadataSuggestions(paper, work);
    return {
      paperId,
      status: 'ready',
      matchedWork: {
        id: work.openAlexUri || `https://openalex.org/${normalizedId}`,
        openAlexId: normalizedId,
        doi: work.doi || '',
        title: work.title || '',
        authors: work.authors || [],
        year: work.year,
        venue: work.venue || '',
      },
      suggestions,
    };
  }

  // 2. Exact DOI matching if paper has DOI
  let openAlexWork = null;
  const hasDoi = typeof paper.doi === 'string' && paper.doi.trim().length > 0;

  if (hasDoi) {
    try {
      openAlexWork = await fetchOpenAlexByDoi(paper.doi, options);
    } catch (err) {
      if (err instanceof OpenAlexError && err.statusCode === 404) {
        // DOI was not found in OpenAlex; fall through to title-based search fallback
        openAlexWork = null;
      } else {
        // Other errors (rate limit 429, timeout 504, upstream 5xx, etc.) rethrow
        throw err;
      }
    }
  }

  if (openAlexWork) {
    const suggestions = computeMetadataSuggestions(paper, openAlexWork);
    return {
      paperId,
      status: 'ready',
      matchedWork: {
        id: openAlexWork.openAlexUri || (openAlexWork.openAlexId ? `https://openalex.org/${openAlexWork.openAlexId}` : ''),
        openAlexId: openAlexWork.openAlexId || normalizeOpenAlexId(openAlexWork.openAlexUri || ''),
        doi: openAlexWork.doi || '',
        title: openAlexWork.title || '',
        authors: openAlexWork.authors || [],
        year: openAlexWork.year,
        venue: openAlexWork.venue || '',
      },
      suggestions,
    };
  }

  // 3. Fallback search by metadata (title, author, year)
  const candidates = await searchOpenAlexCandidates(
    {
      title: paper.title,
      author: Array.isArray(paper.authors) && paper.authors.length > 0 ? paper.authors[0] : '',
      year: paper.year,
    },
    options
  );

  if (candidates.length === 0) {
    return {
      paperId,
      status: 'not_found',
      message: 'No matching publication found in OpenAlex',
    };
  }

  if (candidates.length === 1) {
    const targetId = candidates[0].openAlexId || candidates[0].id;
    const work = await fetchOpenAlexById(targetId, options);
    const suggestions = computeMetadataSuggestions(paper, work);
    return {
      paperId,
      status: 'ready',
      matchedWork: {
        id: work.openAlexUri || candidates[0].id,
        openAlexId: work.openAlexId || candidates[0].openAlexId,
        doi: work.doi || candidates[0].doi || '',
        title: work.title || candidates[0].title || '',
        authors: work.authors || candidates[0].authors || [],
        year: work.year ?? candidates[0].year,
        venue: work.venue || candidates[0].venue || '',
      },
      suggestions,
    };
  }

  // Multiple candidates found -> return ambiguous status
  return {
    paperId,
    status: 'ambiguous',
    candidates,
  };
}
