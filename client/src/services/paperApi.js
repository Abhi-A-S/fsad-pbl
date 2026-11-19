/**
 * Custom error class representing paper API failures.
 */
export class PaperApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {any} [data]
   */
  constructor(message, status = 500, data = null) {
    super(message);
    this.name = 'PaperApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Extracts a human-readable error message from backend error payloads.
 * Handles ResearchForge standard error shapes: { error: { message } }, { error: string }, etc.
 * @param {any} data
 * @param {string} fallbackMessage
 * @returns {string}
 */
function extractErrorMessage(data, fallbackMessage) {
  if (data && typeof data === 'object') {
    if (data.error && typeof data.error === 'object' && data.error.message) {
      return data.error.message;
    }
    if (typeof data.error === 'string') {
      return data.error;
    }
    if (typeof data.message === 'string') {
      return data.message;
    }
  }
  return fallbackMessage;
}

/**
 * Internal helper for issuing authenticated JSON API requests.
 * Always includes credentials for HttpOnly cookie exchange.
 * @param {string} endpoint - Relative path (e.g. '/api/papers')
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('/') ? endpoint : `/api/papers/${endpoint}`;

  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      body,
      credentials: 'include',
    });
  } catch {
    throw new PaperApiError(
      'Unable to connect to the server. Please check your network connection and try again.',
      0,
      null
    );
  }

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const text = await response.text();
      data = text ? { message: text } : null;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const fallbackMessage =
      response.status >= 500
        ? 'The server encountered an error. Please try again later.'
        : `Request failed with status ${response.status}`;
    const message = extractErrorMessage(data, fallbackMessage);
    throw new PaperApiError(message, response.status, data);
  }

  return data;
}

/**
 * Paper Library API Client.
 * Communicates with ResearchForge backend paper management endpoints.
 */
export const paperApi = {
  /**
   * Look up publication metadata from Crossref by DOI.
   * GET /api/papers/lookup?doi=...
   * @param {string} doi
   * @returns {Promise<{ paper: any }>}
   */
  async lookupDoi(doi) {
    return request(`/api/papers/lookup?doi=${encodeURIComponent(doi)}`, {
      method: 'GET',
    });
  },

  /**
   * Create a new paper document in the authenticated user's library.
   * POST /api/papers
   * @param {any} paperData
   * @returns {Promise<{ paper: any }>}
   */
  async createPaper(paperData) {
    return request('/api/papers', {
      method: 'POST',
      body: paperData,
    });
  },

  /**
   * List papers for the authenticated user with pagination.
   * GET /api/papers?page=...&limit=...
   * @param {{ page?: number, limit?: number }} [params]
   * @returns {Promise<{ papers: any[], pagination: { page: number, limit: number, total: number, totalPages: number } }>}
   */
  async getPapers({ page = 1, limit = 10 } = {}) {
    return request(`/api/papers?page=${page}&limit=${limit}`, {
      method: 'GET',
    });
  },

  /**
   * Search papers in the authenticated user's library by keyword across title, authors, DOI, and tags.
   * GET /api/papers/search?q=...&page=...&limit=...
   * @param {{ q: string, page?: number, limit?: number }} params
   * @returns {Promise<{ papers: any[], pagination: { page: number, limit: number, total: number, totalPages: number } }>}
   */
  async searchPapers({ q, page = 1, limit = 10 } = {}) {
    return request(`/api/papers/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`, {
      method: 'GET',
    });
  },

  /**
   * Retrieve metadata enrichment suggestions from OpenAlex for an existing paper.
   * GET /api/papers/:id/enrich-suggestions(?openAlexId=...)
   * @param {string} id - Paper MongoDB ObjectId
   * @param {string} [openAlexId] - Optional user-selected OpenAlex ID for candidate resolution
   * @returns {Promise<{ paperId: string, status: string, matchedWork?: any, suggestions?: any[], candidates?: any[], message?: string }>}
   */
  async getEnrichSuggestions(id, openAlexId) {
    const query = openAlexId ? `?openAlexId=${encodeURIComponent(openAlexId)}` : '';
    return request(`/api/papers/${encodeURIComponent(id)}/enrich-suggestions${query}`, {
      method: 'GET',
    });
  },

  /**
   * Retrieve a single paper by its MongoDB ObjectId.
   * GET /api/papers/:id
   * @param {string} id
   * @returns {Promise<{ paper: any }>}
   */
  async getPaper(id) {
    return request(`/api/papers/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  },

  /**
   * Update editable metadata fields of a paper.
   * PUT /api/papers/:id
   * @param {string} id
   * @param {any} updateData
   * @returns {Promise<{ paper: any }>}
   */
  async updatePaper(id, updateData) {
    return request(`/api/papers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: updateData,
    });
  },

  /**
   * Delete a paper from the authenticated user's library.
   * DELETE /api/papers/:id
   * @param {string} id
   * @returns {Promise<{ message: string, id: string }>}
   */
  async deletePaper(id) {
    return request(`/api/papers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
