import { config } from '../config/env.js';

/**
 * Service for querying and parsing metadata from Crossref's public REST API.
 */

export class CrossrefError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   */
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'CrossrefError';
    this.statusCode = statusCode;
  }
}

/**
 * Normalizes a DOI string:
 * - Trims whitespace
 * - Converts to lowercase
 * - Strips leading URL prefixes (https://doi.org/, http://dx.doi.org/, etc.)
 * - Strips leading "doi:" prefix
 *
 * @param {string} doi
 * @returns {string}
 */
export function normalizeDoi(doi) {
  if (!doi || typeof doi !== 'string') return '';
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');
}

/**
 * Validates a normalized DOI structure.
 * Standard syntax: 10.<prefix>/<suffix> where prefix is 4-9 digits and suffix is non-whitespace.
 *
 * @param {string} doi
 * @returns {boolean}
 */
export function validateDoi(doi) {
  if (!doi || typeof doi !== 'string') return false;
  return /^10\.\d{4,9}\/\S+$/i.test(doi);
}

/**
 * Strips JATS XML or HTML tags from an abstract string and normalizes whitespace.
 *
 * @param {string} xmlText
 * @returns {string}
 */
export function stripJatsXml(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return '';
  return xmlText
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts publication date and integer year from Crossref date-parts.
 * Prioritizes published-print, published-online, and issued.
 *
 * @param {object} message
 * @returns {{ year: number | null, publicationDate: string | null }}
 */
export function extractDateInfo(message) {
  if (!message || typeof message !== 'object') {
    return { year: null, publicationDate: null };
  }

  const datePartsContainer =
    message['published-print']?.['date-parts']?.[0] ||
    message['published-online']?.['date-parts']?.[0] ||
    message['issued']?.['date-parts']?.[0] ||
    message['created']?.['date-parts']?.[0];

  if (!Array.isArray(datePartsContainer) || datePartsContainer.length === 0) {
    return { year: null, publicationDate: null };
  }

  const rawYear = datePartsContainer[0];
  const year = Number.isInteger(rawYear) ? rawYear : null;

  let publicationDate = null;
  if (year !== null) {
    const rawMonth = datePartsContainer[1];
    const rawDay = datePartsContainer[2];

    const month = Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : 1;
    const day = Number.isInteger(rawDay) && rawDay >= 1 && rawDay <= 31 ? rawDay : 1;

    try {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!isNaN(d.getTime())) {
        publicationDate = d.toISOString();
      }
    } catch {
      publicationDate = null;
    }
  }

  return { year, publicationDate };
}

/**
 * Maps a Crossref API message object to ResearchForge Paper metadata.
 *
 * @param {object} data - Crossref JSON payload
 * @param {string} normalizedDoi - The normalized DOI
 * @returns {object} Normalized paper metadata
 */
export function parseCrossrefResponse(data, normalizedDoi) {
  if (!data || typeof data !== 'object' || !data.message || typeof data.message !== 'object') {
    throw new CrossrefError('Malformed response from Crossref: missing message payload', 502);
  }

  const message = data.message;

  // Title: Crossref returns title as an array of strings
  let title = '';
  if (Array.isArray(message.title) && message.title.length > 0) {
    title = typeof message.title[0] === 'string' ? message.title[0].trim() : '';
  } else if (typeof message.title === 'string') {
    title = message.title.trim();
  }

  // Authors: Crossref returns author array with given, family, name
  const authors = [];
  if (Array.isArray(message.author)) {
    for (const a of message.author) {
      if (!a || typeof a !== 'object') continue;
      if (a.given && a.family) {
        authors.push(`${String(a.given).trim()} ${String(a.family).trim()}`);
      } else if (a.family) {
        authors.push(String(a.family).trim());
      } else if (a.name) {
        authors.push(String(a.name).trim());
      } else if (a.given) {
        authors.push(String(a.given).trim());
      }
    }
  }

  // Abstract: often contains JATS XML tags
  const abstract = stripJatsXml(message.abstract || '');

  // Dates: year and publicationDate
  const { year, publicationDate } = extractDateInfo(message);

  // Venue: container-title or short-container-title
  let venue = '';
  if (Array.isArray(message['container-title']) && message['container-title'].length > 0) {
    venue = typeof message['container-title'][0] === 'string' ? message['container-title'][0].trim() : '';
  } else if (typeof message['container-title'] === 'string') {
    venue = message['container-title'].trim();
  } else if (Array.isArray(message['short-container-title']) && message['short-container-title'].length > 0) {
    venue = typeof message['short-container-title'][0] === 'string' ? message['short-container-title'][0].trim() : '';
  }

  // Publisher
  const publisher = typeof message.publisher === 'string' ? message.publisher.trim() : '';

  // Canonical URL: Prefer resource.primary.URL or URL, fallback to https://doi.org/{doi}
  let url = '';
  const candidateUrl = message.resource?.primary?.URL || message.URL;
  if (typeof candidateUrl === 'string' && /^https?:\/\/\S+$/i.test(candidateUrl.trim())) {
    url = candidateUrl.trim();
  } else {
    url = `https://doi.org/${normalizedDoi}`;
  }

  return {
    title,
    authors,
    abstract,
    doi: normalizedDoi,
    year,
    publicationDate,
    venue,
    publisher,
    url,
  };
}

/**
 * Constructs the User-Agent header string for Crossref queries.
 * Omits the mailto parameter if no valid email address is configured.
 *
 * @param {string} [contact] - Optional email contact
 * @returns {string}
 */
export function getCrossrefUserAgent(contact = config.crossrefMailto) {
  const email = typeof contact === 'string' ? contact.trim() : '';
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return `ResearchForge/0.1.0 (mailto:${email})`;
  }
  return 'ResearchForge/0.1.0';
}

/**
 * Queries Crossref's public REST API for a given DOI and returns mapped metadata.
 *
 * @param {string} rawDoi - DOI input
 * @param {object} [options]
 * @param {number} [options.timeoutMs=8000] - Request timeout in milliseconds
 * @param {string} [options.contact] - Optional contact email override for User-Agent
 * @returns {Promise<object>}
 */
export async function fetchCrossrefMetadata(rawDoi, options = {}) {
  const normalizedDoi = normalizeDoi(rawDoi);

  if (!normalizedDoi || !validateDoi(normalizedDoi)) {
    throw new CrossrefError('Please provide a valid DOI (e.g., 10.1038/nature14539)', 400);
  }

  const timeoutMs = options.timeoutMs || 8000;
  const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(normalizedDoi)}`;
  const userAgent = getCrossrefUserAgent(options.contact ?? config.crossrefMailto);

  let response;
  try {
    response = await fetch(crossrefUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new CrossrefError('Crossref request timed out while resolving the DOI', 504);
    }
    throw new CrossrefError('Unable to connect to Crossref service. Please check network connectivity.', 502);
  }

  if (response.status === 404) {
    throw new CrossrefError('Publication not found for the provided DOI in Crossref', 404);
  }

  if (response.status === 429) {
    throw new CrossrefError('Crossref rate limit exceeded. Please try again later.', 429);
  }

  if (response.status >= 500) {
    throw new CrossrefError('Crossref service is temporarily unavailable. Please try again later.', 502);
  }

  if (!response.ok) {
    throw new CrossrefError(`Crossref request failed with status ${response.status}`, 502);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new CrossrefError('Received malformed response from Crossref', 502);
  }

  return parseCrossrefResponse(data, normalizedDoi);
}
