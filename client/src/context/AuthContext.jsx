import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/authApi.js';

const AuthContext = createContext(null);

/**
 * Authentication Provider component.
 * Manages global authentication state, session restoration on mount, and auth operations.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Restore session on mount
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const data = await authApi.getCurrentUser();
        if (isMounted) {
          setUser(data?.user || null);
          setError(null);
        }
      } catch {
        // 401 or network errors on boot mean no active session
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Logs in a user with email and password.
   * Updates shared user state and clears errors.
   * Propagates errors to the caller.
   */
  const login = useCallback(async ({ email, password }) => {
    try {
      setError(null);
      const data = await authApi.login({ email, password });
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message || 'Login failed');
      throw err;
    }
  }, []);

  /**
   * Registers a new user account.
   * Updates shared user state and clears errors.
   * Propagates errors to the caller.
   */
  const register = useCallback(async ({ email, password, displayName }) => {
    try {
      setError(null);
      const data = await authApi.register({ email, password, displayName });
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message || 'Registration failed');
      throw err;
    }
  }, []);

  /**
   * Logs out the current user session.
   * Always clears local user state, even if the backend request fails.
   */
  const logout = useCallback(async () => {
    try {
      setError(null);
      await authApi.logout();
    } catch (err) {
      // Propagate error if needed, but ensure local user state is wiped
      setError(err.message || 'Logout encountered an issue');
      throw err;
    } finally {
      setUser(null);
    }
  }, []);

  /**
   * Clears any active authentication error message.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Custom hook for accessing authentication context.
 * Throws a clear error if invoked outside of AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
