/**
 * Custom error class representing authentication API failures.
 */
export class AuthApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {any} [data]
   */
  constructor(message, status = 500, data = null) {
    super(message);
    this.name = 'AuthApiError';
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
 * @param {string} endpoint - Relative path (e.g. '/api/auth/login')
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('/') ? endpoint : `/api/auth/${endpoint}`;

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
    throw new AuthApiError(
      'Unable to connect to the authentication server. Please check your network connection and try again.',
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
        ? 'The authentication server encountered an error. Please try again later.'
        : `Request failed with status ${response.status}`;
    const message = extractErrorMessage(data, fallbackMessage);
    throw new AuthApiError(message, response.status, data);
  }

  return data;
}

/**
 * Registers a new user account.
 * @param {{ email: string, password: string, displayName: string }} credentials
 * @returns {Promise<{ message: string, user: { id: string, email: string, displayName: string, createdAt: string } }>}
 */
export async function register({ email, password, displayName }) {
  return request('/api/auth/register', {
    method: 'POST',
    body: { email, password, displayName },
  });
}

/**
 * Logs in with user credentials.
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ message: string, user: { id: string, email: string, displayName: string, createdAt: string } }>}
 */
export async function login({ email, password }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

/**
 * Logs out the current user session.
 * Clears the server-side HttpOnly cookie.
 * @returns {Promise<{ message: string }>}
 */
export async function logout() {
  return request('/api/auth/logout', {
    method: 'POST',
  });
}

/**
 * Retrieves the currently authenticated user's session profile.
 * Validates the HttpOnly session cookie.
 * @returns {Promise<{ user: { id: string, email: string, displayName: string, createdAt: string } }>}
 */
export async function getCurrentUser() {
  return request('/api/auth/me', {
    method: 'GET',
  });
}

export const authApi = {
  register,
  login,
  logout,
  getCurrentUser,
};

export default authApi;
