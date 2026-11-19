import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { LibraryProvider } from '../context/LibraryContext.jsx';

/**
 * Custom render helper that wraps UI in MemoryRouter, AuthProvider, and LibraryProvider.
 * @param {React.ReactElement} ui
 * @param {object} [options]
 * @param {string} [options.route]
 * @returns {object}
 */
export function renderWithProviders(ui, { route = '/', ...renderOptions } = {}) {
  function Wrapper({ children }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <LibraryProvider>
            {children}
          </LibraryProvider>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}
