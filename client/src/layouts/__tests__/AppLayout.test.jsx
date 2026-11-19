import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import AppLayout from '../AppLayout.jsx';
import { renderWithProviders } from '../../test/test-utils.jsx';
import { paperApi } from '../../services/paperApi.js';
import { collectionApi } from '../../services/collectionApi.js';
import { authApi } from '../../services/authApi.js';

vi.mock('../../services/paperApi.js', () => ({
  paperApi: {
    getPapers: vi.fn(),
    searchPapers: vi.fn(),
    lookupDoi: vi.fn(),
    createPaper: vi.fn(),
    getPaper: vi.fn(),
    updatePaper: vi.fn(),
    deletePaper: vi.fn(),
  },
}));

vi.mock('../../services/collectionApi.js', () => ({
  collectionApi: {
    getCollections: vi.fn(),
    createCollection: vi.fn(),
    addPaperToCollection: vi.fn(),
    removePaperFromCollection: vi.fn(),
  },
}));

vi.mock('../../services/authApi.js', () => ({
  authApi: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

describe('AppLayout Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.getCurrentUser.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'scholar@institution.edu',
        displayName: 'Marie Curie',
      },
    });
    paperApi.getPapers.mockResolvedValue({
      papers: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });
    collectionApi.getCollections.mockResolvedValue({
      collections: [],
    });
  });

  it('renders sidebar navigation, user profile, and pinned collections with paper counts', async () => {
    const mockCollections = [
      {
        id: 'col-1',
        name: 'Radiology Classics',
        description: 'Historical papers on radiation',
        papers: ['p1', 'p2', 'p3'],
      },
      {
        id: 'col-2',
        name: 'Empty Collection',
        description: 'New topic folder',
        papers: [],
      },
    ];

    collectionApi.getCollections.mockResolvedValue({
      collections: mockCollections,
    });

    renderWithProviders(
      <AppLayout>
        <div data-testid="child-content">Main View Content</div>
      </AppLayout>
    );

    // Child content rendered
    expect(screen.getByTestId('child-content')).toBeInTheDocument();

    // User profile rendered
    await waitFor(() => {
      expect(screen.getByText('Marie Curie')).toBeInTheDocument();
      expect(screen.getByText('scholar@institution.edu')).toBeInTheDocument();
      expect(screen.getByText('MC')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(collectionApi.getCollections).toHaveBeenCalled();
    });

    // Pinned collections rendered with paper counts
    await waitFor(() => {
      const radiologyLink = screen.getByRole('link', { name: /Radiology Classics/i });
      expect(radiologyLink).toBeInTheDocument();
      expect(radiologyLink).toHaveTextContent('3');

      const emptyColLink = screen.getByRole('link', { name: /Empty Collection/i });
      expect(emptyColLink).toBeInTheDocument();
      expect(emptyColLink).toHaveTextContent('0');
    });

    // Navigation links
    expect(screen.getByRole('link', { name: /Library/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Collections/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Import DOI/i })).toBeInTheDocument();
  });

  it('does not render obsolete Frontend Mock Mode banner', async () => {
    collectionApi.getCollections.mockResolvedValueOnce({
      collections: [],
    });

    renderWithProviders(
      <AppLayout>
        <div>Content</div>
      </AppLayout>
    );

    await waitFor(() => {
      expect(screen.getByText('Marie Curie')).toBeInTheDocument();
    });

    expect(screen.queryByText(/frontend mock mode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/local in-memory state/i)).not.toBeInTheDocument();
  });
});
