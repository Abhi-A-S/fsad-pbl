import { config } from '../config/env.js';
import { normalizeDoi, validateDoi } from './crossrefService.js';

/**
 * Custom error class representing OpenAlex service failures.
 */
export class OpenAlexError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   */
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'OpenAlexError';
    this.statusCode = statusCode;
  }
}

/**
 * Reconstructs a sequential plaintext abstract from OpenAlex's abstract_inverted_index.
 *
 * OpenAlex stores abstracts as an inverted index mapping each word to an array
 * of 0-based integer positions in the original text:
 * { "The": [0], "study": [1], "presents": [2] }
 *
 * This function reconstructs the original text by allocating an array of size
 * max(position) + 1 and placing words at their exact original offsets.
 * Sparse positions and malformed indices are handled safely without filtering
 * or compacting, which would corrupt positional alignments.
 *
 * @param {object} invertedIndex - OpenAlex abstract_inverted_index object
 * @returns {string} Reconstructed plaintext abstract, or empty string if absent/invalid
 */
export function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object' || Array.isArray(invertedIndex)) {
    return '';
  }

  const entries = Object.entries(invertedIndex);
  if (entries.length === 0) {
    return '';
  }

  let maxPosition = -1;
  for (const [, positions] of entries) {
    if (Array.isArray(positions)) {
      for (const pos of positions) {
        if (Number.isInteger(pos) && pos > maxPosition) {
          maxPosition = pos;
        }
      }
    }
  }

  if (maxPosition < 0) {
    return '';
  }

  const words = new Array(maxPosition + 1);
  for (const [word, positions] of entries) {
    if (typeof word === 'string' && Array.isArray(positions)) {
      for (const pos of positions) {
        if (Number.isInteger(pos) && pos >= 0 && pos <= maxPosition) {
          words[pos] = word;
        }
      }
    }
  }

  // Preserve original positional offsets: replace any sparse/empty slots with empty string
  // rather than using Array.prototype.filter, which would compact and shift indices.
  for (let i = 0; i <= maxPosition; i++) {
    if (typeof words[i] !== 'string') {
      words[i] = '';
    }
  }

  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parses an OpenAlex Work object into ResearchForge Paper metadata shape.
 *
 * @param {object} work - Raw OpenAlex Work object
 * @param {string} [normalizedDoi] - The normalized DOI
 * @returns {object} Normalized paper metadata
 */
export function parseOpenAlexWork(work, normalizedDoi = '') {
  if (!work || typeof work !== 'object') {
    throw new OpenAlexError('Malformed response from OpenAlex: missing work payload', 502);
  }

  // Title: prefer work.title, fallback to display_name
  let title = '';
  if (typeof work.title === 'string' && work.title.trim()) {
    title = work.title.trim();
  } else if (typeof work.display_name === 'string' && work.display_name.trim()) {
    title = work.display_name.trim();
  }

  // Authors: map from work.authorships array
  const authors = [];
  if (Array.isArray(work.authorships)) {
    for (const item of work.authorships) {
      if (!item || typeof item !== 'object') continue;
      const name = item.author?.display_name || item.raw_author_name;
      if (typeof name === 'string' && name.trim()) {
        authors.push(name.trim());
      }
    }
  }

  // Abstract: reconstruct from abstract_inverted_index
  const abstract = reconstructAbstract(work.abstract_inverted_index);

  // Year: publication_year
  const year = Number.isInteger(work.publication_year) ? work.publication_year : null;

  // Publication date: publication_date (YYYY-MM-DD string)
  let publicationDate = null;
  if (work.publication_date && typeof work.publication_date === 'string') {
    const d = new Date(work.publication_date);
    if (!isNaN(d.getTime())) {
      publicationDate = d.toISOString();
    }
  }

  // Venue: primary_location.source.display_name, fallback to locations[0].source.display_name
  let venue = '';
  const primarySource = work.primary_location?.source;
  if (primarySource && typeof primarySource.display_name === 'string' && primarySource.display_name.trim()) {
    venue = primarySource.display_name.trim();
  } else if (Array.isArray(work.locations) && work.locations.length > 0) {
    const fallbackSource = work.locations[0]?.source;
    if (fallbackSource && typeof fallbackSource.display_name === 'string' && fallbackSource.display_name.trim()) {
      venue = fallbackSource.display_name.trim();
    }
  }

  // Publisher: primary_location.source.host_organization_name
  let publisher = '';
  const primaryHostOrg = work.primary_location?.source?.host_organization_name;
  if (typeof primaryHostOrg === 'string' && primaryHostOrg.trim()) {
    publisher = primaryHostOrg.trim();
  } else if (Array.isArray(work.locations) && work.locations.length > 0) {
    const fallbackHostOrg = work.locations[0]?.source?.host_organization_name;
    if (typeof fallbackHostOrg === 'string' && fallbackHostOrg.trim()) {
      publisher = fallbackHostOrg.trim();
    }
  }

  // Resolved DOI
  const resolvedDoi = normalizedDoi || (work.doi ? normalizeDoi(work.doi) : '');

  // URL: primary_location.landing_page_url, fallback to work.doi or canonical doi.org URL
  let url = '';
  const candidateUrl = work.primary_location?.landing_page_url || work.doi;
  if (typeof candidateUrl === 'string' && /^https?:\/\/\S+$/i.test(candidateUrl.trim())) {
    url = candidateUrl.trim();
  } else if (resolvedDoi) {
    url = `https://doi.org/${resolvedDoi}`;
  }

  return {
    title,
    authors,
    abstract,
    doi: resolvedDoi,
    year,
    publicationDate,
    venue,
    publisher,
    url,
  };
}

/**
 * Normalizes an OpenAlex identifier into canonical 'W\d+' format.
 * Strips 'https://openalex.org/', 'works/', and whitespace.
 *
 * @param {string} rawId
 * @returns {string} Normalized uppercase OpenAlex ID (e.g., 'W2741809807') or empty string if invalid
 */
export function normalizeOpenAlexId(rawId) {
  if (!rawId || typeof rawId !== 'string') return '';
  const trimmed = rawId.trim();
  const cleaned = trimmed
    .replace(/^https?:\/\/openalex\.org\//i, '')
    .replace(/^works\//i, '')
    .trim();
  if (/^W\d+$/i.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  return '';
}

/**
 * Constructs the User-Agent header for OpenAlex queries.
 * Reuses existing email contact configuration for polite pool identification.
 *
 * @param {string} [contact] - Optional email contact
 * @returns {string}
 */
export function getOpenAlexUserAgent(contact = config.crossrefMailto) {
  const email = typeof contact === 'string' ? contact.trim() : '';
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return `ResearchForge/0.1.0 (mailto:${email})`;
  }
  return 'ResearchForge/0.1.0';
}

/**
 * Fetches and normalizes a single scholarly work from OpenAlex by exact normalized DOI.
 *
 * Endpoint: https://api.openalex.org/works/https://doi.org/{doi}
 *
 * @param {string} rawDoi - DOI input string
 * @param {object} [options]
 * @param {number} [options.timeoutMs=8000] - Request timeout in milliseconds
 * @param {string} [options.contact] - Optional contact email override for polite pool
 * @returns {Promise<object>} Normalized ResearchForge paper metadata
 */
export async function fetchOpenAlexByDoi(rawDoi, options = {}) {
  const normalizedDoi = normalizeDoi(rawDoi);

  if (!normalizedDoi || !validateDoi(normalizedDoi)) {
    throw new OpenAlexError('Please provide a valid DOI (e.g., 10.1038/nature14539)', 400);
  }

  const timeoutMs = options.timeoutMs || 8000;
  const contact = options.contact ?? config.crossrefMailto;
  const userAgent = getOpenAlexUserAgent(contact);

  const emailParam =
    contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim())
      ? `?mailto=${encodeURIComponent(contact.trim())}`
      : '';
  const openAlexUrl = `https://api.openalex.org/works/https://doi.org/${normalizedDoi}${emailParam}`;

  let response;
  try {
    response = await fetch(openAlexUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new OpenAlexError('OpenAlex request timed out while resolving the DOI', 504);
    }
    throw new OpenAlexError('Unable to connect to OpenAlex service. Please check network connectivity.', 502);
  }

  if (response.status === 404) {
    throw new OpenAlexError('Publication not found in OpenAlex for the provided DOI', 404);
  }

  if (response.status === 429) {
    throw new OpenAlexError('OpenAlex rate limit exceeded. Please try again later.', 429);
  }

  if (response.status >= 500) {
    throw new OpenAlexError('OpenAlex service is temporarily unavailable. Please try again later.', 502);
  }

  if (!response.ok) {
    throw new OpenAlexError(`OpenAlex request failed with status ${response.status}`, 502);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new OpenAlexError('Received malformed response from OpenAlex', 502);
  }

  const parsed = parseOpenAlexWork(data, normalizedDoi);
  if (data.id) {
    parsed.openAlexUri = data.id;
    parsed.openAlexId = normalizeOpenAlexId(data.id);
  }

  return parsed;
}

/**
 * Fetches and normalizes a single scholarly work from OpenAlex by OpenAlex ID.
 *
 * Endpoint: https://api.openalex.org/works/{openAlexId}
 *
 * @param {string} rawId - OpenAlex ID or URI (e.g., 'W2741809807', 'https://openalex.org/W2741809807')
 * @param {object} [options]
 * @param {number} [options.timeoutMs=8000] - Request timeout in milliseconds
 * @param {string} [options.contact] - Optional contact email override for polite pool
 * @returns {Promise<object>} Normalized ResearchForge paper metadata with openAlexId and openAlexUri
 */
export async function fetchOpenAlexById(rawId, options = {}) {
  const normalizedId = normalizeOpenAlexId(rawId);

  if (!normalizedId) {
    throw new OpenAlexError('Please provide a valid OpenAlex ID (e.g., W2741809807)', 400);
  }

  const timeoutMs = options.timeoutMs || 8000;
  const contact = options.contact ?? config.crossrefMailto;
  const userAgent = getOpenAlexUserAgent(contact);

  const emailParam =
    contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim())
      ? `?mailto=${encodeURIComponent(contact.trim())}`
      : '';
  const openAlexUrl = `https://api.openalex.org/works/${normalizedId}${emailParam}`;

  let response;
  try {
    response = await fetch(openAlexUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new OpenAlexError('OpenAlex request timed out while resolving the work ID', 504);
    }
    throw new OpenAlexError('Unable to connect to OpenAlex service. Please check network connectivity.', 502);
  }

  if (response.status === 404) {
    throw new OpenAlexError('Publication not found in OpenAlex for the provided ID', 404);
  }

  if (response.status === 429) {
    throw new OpenAlexError('OpenAlex rate limit exceeded. Please try again later.', 429);
  }

  if (response.status >= 500) {
    throw new OpenAlexError('OpenAlex service is temporarily unavailable. Please try again later.', 502);
  }

  if (!response.ok) {
    throw new OpenAlexError(`OpenAlex request failed with status ${response.status}`, 502);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new OpenAlexError('Received malformed response from OpenAlex', 502);
  }

  const parsed = parseOpenAlexWork(data);
  parsed.openAlexId = normalizedId;
  parsed.openAlexUri = data.id || `https://openalex.org/${normalizedId}`;

  return parsed;
}

/**
 * Searches OpenAlex works by publication metadata (title, author, year).
 *
 * Endpoint: https://api.openalex.org/works?search={title}&per-page=5
 *
 * @param {object} params
 * @param {string} params.title - Publication title
 * @param {string} [params.author] - Author name (optional)
 * @param {number} [params.year] - Publication year (optional)
 * @param {object} [options]
 * @param {number} [options.timeoutMs=8000] - Request timeout in milliseconds
 * @param {string} [options.contact] - Optional contact email override for polite pool
 * @returns {Promise<Array<object>>} Array of candidate summary objects
 */
export async function searchOpenAlexCandidates(params = {}, options = {}) {
  const title = typeof params.title === 'string' ? params.title.trim() : '';
  if (!title) {
    return [];
  }

  const timeoutMs = options.timeoutMs || 8000;
  const contact = options.contact ?? config.crossrefMailto;
  const userAgent = getOpenAlexUserAgent(contact);

  const queryParams = new URLSearchParams();
  queryParams.set('search', title);
  queryParams.set('per-page', '5');
  if (contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim())) {
    queryParams.set('mailto', contact.trim());
  }

  const url = `https://api.openalex.org/works?${queryParams.toString()}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new OpenAlexError('OpenAlex request timed out while searching for candidates', 504);
    }
    throw new OpenAlexError('Unable to connect to OpenAlex service. Please check network connectivity.', 502);
  }

  if (response.status === 404) {
    return [];
  }

  if (response.status === 429) {
    throw new OpenAlexError('OpenAlex rate limit exceeded. Please try again later.', 429);
  }

  if (response.status >= 500) {
    throw new OpenAlexError('OpenAlex service is temporarily unavailable. Please try again later.', 502);
  }

  if (!response.ok) {
    throw new OpenAlexError(`OpenAlex request failed with status ${response.status}`, 502);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new OpenAlexError('Received malformed response from OpenAlex', 502);
  }

  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((work) => {
    const rawId = work.id || '';
    const openAlexId = normalizeOpenAlexId(rawId);
    const doi = work.doi ? normalizeDoi(work.doi) : '';
    const candidateTitle = (work.title || work.display_name || '').trim();
    const authors = [];
    if (Array.isArray(work.authorships)) {
      for (const item of work.authorships) {
        if (!item || typeof item !== 'object') continue;
        const name = item.author?.display_name || item.raw_author_name;
        if (typeof name === 'string' && name.trim()) {
          authors.push(name.trim());
        }
      }
    }
    const year = Number.isInteger(work.publication_year) ? work.publication_year : null;
    let venue = '';
    const primarySource = work.primary_location?.source;
    if (primarySource && typeof primarySource.display_name === 'string') {
      venue = primarySource.display_name.trim();
    } else if (Array.isArray(work.locations) && work.locations.length > 0) {
      const fallbackSource = work.locations[0]?.source;
      if (fallbackSource && typeof fallbackSource.display_name === 'string') {
        venue = fallbackSource.display_name.trim();
      }
    }

    return {
      id: rawId,
      openAlexId,
      doi,
      title: candidateTitle,
      authors,
      year,
      venue,
    };
  });
}
