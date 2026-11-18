/**
 * Custom error class representing collection API failures.
 */
export class CollectionApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {any} [data]
   */
  constructor(message, status = 500, data = null) {
    super(message);
    this.name = 'CollectionApiError';
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
 * Internal helper for issuing authenticated JSON API requests to collections endpoints.
 * Always includes credentials for HttpOnly cookie exchange.
 * @param {string} endpoint - Relative path (e.g. '/api/collections')
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('/') ? endpoint : `/api/collections/${endpoint}`;

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
    throw new CollectionApiError(
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
    throw new CollectionApiError(message, response.status, data);
  }

  return data;
}

/**
 * ResearchForge Collections API Client.
 * Communicates with /api/collections endpoints using HttpOnly credentials.
 */
export const collectionApi = {
  /**
   * Fetches all research collections owned by the authenticated user.
   * GET /api/collections
   * @returns {Promise<{ collections: Array<object> }>}
   */
  async getCollections() {
    return request('/api/collections', {
      method: 'GET',
    });
  },

  /**
   * Creates a new research collection for the authenticated user.
   * POST /api/collections
   * @param {{ name: string, description?: string }} collectionData
   * @returns {Promise<{ collection: object }>}
   */
  async createCollection({ name, description = '' }) {
    return request('/api/collections', {
      method: 'POST',
      body: { name, description },
    });
  },

  /**
   * Adds an existing paper to a collection owned by the authenticated user.
   * POST /api/collections/:id/papers
   * @param {string} collectionId
   * @param {string} paperId
   * @returns {Promise<{ collection: object }>}
   */
  async addPaperToCollection(collectionId, paperId) {
    return request(`/api/collections/${collectionId}/papers`, {
      method: 'POST',
      body: { paperId },
    });
  },

  /**
   * Removes a paper from a collection owned by the authenticated user.
   * DELETE /api/collections/:id/papers/:paperId
   * @param {string} collectionId
   * @param {string} paperId
   * @returns {Promise<{ message: string, collection: object }>}
   */
  async removePaperFromCollection(collectionId, paperId) {
    return request(`/api/collections/${collectionId}/papers/${paperId}`, {
      method: 'DELETE',
    });
  },
};
