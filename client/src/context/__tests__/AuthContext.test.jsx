import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '../AuthContext.jsx';
import ProtectedRoute from '../../components/ProtectedRoute.jsx';
import PublicRoute from '../../components/PublicRoute.jsx';
import { authApi } from '../../services/authApi.js';

vi.mock('../../services/authApi.js', () => ({
  authApi: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

function AuthConsumerTestComponent() {
  const { user, loading, error, login, register, logout } = useAuth();

  return (
    <div>
      <div data-testid="auth-loading">{String(loading)}</div>
      <div data-testid="auth-user">{user ? user.email : 'null'}</div>
      <div data-testid="auth-error">{error || 'none'}</div>
      <button
        type="button"
        onClick={() => login({ email: 'test@example.com', password: 'password123' }).catch(() => {})}
      >
        Trigger Login
      </button>
      <button
        type="button"
        onClick={() => register({ email: 'new@example.com', password: 'password123', displayName: 'New User' }).catch(() => {})}
      >
        Trigger Register
      </button>
      <button type="button" onClick={() => logout().catch(() => {})}>
        Trigger Logout
      </button>
    </div>
  );
}

describe('AuthContext and Session Restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores authenticated user session on mount', async () => {
    const mockUser = { id: 'u1', email: 'scholar@institution.edu', displayName: 'Dr. Scholar' };
    authApi.getCurrentUser.mockResolvedValueOnce({ user: mockUser });

    render(
      <AuthProvider>
        <AuthConsumerTestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-loading')).toHaveTextContent('true');

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('auth-user')).toHaveTextContent('scholar@institution.edu');
    expect(authApi.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('handles unauthenticated session on mount (401 or network error)', async () => {
    authApi.getCurrentUser.mockRejectedValueOnce(new Error('Unauthorized'));

    render(
      <AuthProvider>
        <AuthConsumerTestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('auth-user')).toHaveTextContent('null');
    expect(screen.getByTestId('auth-error')).toHaveTextContent('none');
  });

  it('logs in successfully and updates user state', async () => {
    authApi.getCurrentUser.mockResolvedValueOnce({ user: null });
    const userToLogin = { id: 'u2', email: 'test@example.com', displayName: 'Test User' };
    authApi.login.mockResolvedValueOnce({ user: userToLogin });

    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthConsumerTestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('false');
    });

    await user.click(screen.getByRole('button', { name: /trigger login/i }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-user')).toHaveTextContent('test@example.com');
    });
    expect(screen.getByTestId('auth-error')).toHaveTextContent('none');
  });

  it('handles login failure and stores error message', async () => {
    authApi.getCurrentUser.mockResolvedValueOnce({ user: null });
    authApi.login.mockRejectedValueOnce(new Error('Invalid email or password'));

    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthConsumerTestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('false');
    });

    await user.click(screen.getByRole('button', { name: /trigger login/i }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-error')).toHaveTextContent('Invalid email or password');
    });
    expect(screen.getByTestId('auth-user')).toHaveTextContent('null');
  });

  it('registers successfully and updates user state', async () => {
    authApi.getCurrentUser.mockResolvedValueOnce({ user: null });
    const newUser = { id: 'u3', email: 'new@example.com', displayName: 'New User' };
    authApi.register.mockResolvedValueOnce({ user: newUser });

    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthConsumerTestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('false');
    });

    await user.click(screen.getByRole('button', { name: /trigger register/i }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-user')).toHaveTextContent('new@example.com');
    });
  });

  it('logs out and clears local user state even if backend throws', async () => {
    const mockUser = { id: 'u1', email: 'scholar@institution.edu' };
    authApi.getCurrentUser.mockResolvedValueOnce({ user: mockUser });
    authApi.logout.mockRejectedValueOnce(new Error('Server error on logout'));

    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthConsumerTestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-user')).toHaveTextContent('scholar@institution.edu');
    });

    await user.click(screen.getByRole('button', { name: /trigger logout/i }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-user')).toHaveTextContent('null');
    });
    expect(screen.getByTestId('auth-error')).toHaveTextContent('Server error on logout');
  });
});

describe('Route Guards: ProtectedRoute and PublicRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ProtectedRoute displays session verification loading screen while restoring', () => {
    // Hang get current user promise
    authApi.getCurrentUser.mockReturnValueOnce(new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<div>Protected Dashboard Content</div>} />
            </Route>
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/verifying session/i)).toBeInTheDocument();
    expect(screen.queryByText(/protected dashboard content/i)).not.toBeInTheDocument();
  });

  it('ProtectedRoute redirects unauthenticated visitors to /login', async () => {
    authApi.getCurrentUser.mockResolvedValueOnce({ user: null });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<div>Protected Dashboard Content</div>} />
            </Route>
            <Route path="/login" element={<div>Login Page Destination</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Login Page Destination')).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Dashboard Content')).not.toBeInTheDocument();
  });

  it('ProtectedRoute renders protected content when authenticated', async () => {
    authApi.getCurrentUser.mockResolvedValueOnce({
      user: { id: 'u1', email: 'authed@example.com' },
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<div>Protected Dashboard Content</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Dashboard Content')).toBeInTheDocument();
    });
  });

  it('PublicRoute redirects authenticated user to / or intended location', async () => {
    authApi.getCurrentUser.mockResolvedValueOnce({
      user: { id: 'u1', email: 'authed@example.com' },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<div>Public Login Page</div>} />
            </Route>
            <Route path="/" element={<div>Home / Dashboard</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Home / Dashboard')).toBeInTheDocument();
    });
    expect(screen.queryByText('Public Login Page')).not.toBeInTheDocument();
  });

  it('PublicRoute renders public page for unauthenticated visitors', async () => {
    authApi.getCurrentUser.mockResolvedValueOnce({ user: null });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<div>Public Login Page</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Public Login Page')).toBeInTheDocument();
    });
  });
});
