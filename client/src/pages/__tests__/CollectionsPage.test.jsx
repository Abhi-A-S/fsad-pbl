import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import CollectionsPage from '../CollectionsPage.jsx';
import { renderWithProviders } from '../../test/test-utils.jsx';
import { collectionApi } from '../../services/collectionApi.js';
import { paperApi } from '../../services/paperApi.js';
import { authApi } from '../../services/authApi.js';

vi.mock('../../services/collectionApi.js', () => ({
  collectionApi: {
    getCollections: vi.fn(),
    createCollection: vi.fn(),
    addPaperToCollection: vi.fn(),
    removePaperFromCollection: vi.fn(),
  },
}));

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

vi.mock('../../services/authApi.js', () => ({
  authApi: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

const mockCollections = [
  {
    id: 'col-1',
    name: 'Transformer Architectures',
    description: 'Attention mechanisms and transformer-based foundations',
    createdAt: '2024-02-01T12:00:00.000Z',
    papers: [
      {
        id: 'p1',
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani', 'Noam Shazeer'],
        year: 2017,
      },
      {
        id: 'p2',
        title: 'BERT: Pre-training of Deep Bidirectional Transformers',
        authors: ['Jacob Devlin', 'Ming-Wei Chang'],
        year: 2018,
      },
    ],
  },
  {
    id: 'col-2',
    name: 'Reinforcement Learning',
    description: 'Policy gradients and Q-learning milestones',
    createdAt: '2024-03-01T12:00:00.000Z',
    papers: [],
  },
];

function renderCollections(route = '/collections') {
  return renderWithProviders(
    <Routes>
      <Route path="/collections" element={<CollectionsPage />} />
      <Route path="/collections/:id" element={<CollectionsPage />} />
      <Route path="/library/:id" element={<div>Paper Target View</div>} />
    </Routes>,
    { route }
  );
}

describe('CollectionsPage (Dossiers & Management)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.getCurrentUser.mockResolvedValue({
      user: { id: 'u1', email: 'scholar@institution.edu', displayName: 'Scholar One' },
    });
    paperApi.getPapers.mockResolvedValue({ papers: [], pagination: { total: 0 } });
    collectionApi.getCollections.mockResolvedValue({ collections: mockCollections });
  });

  it('renders loading state while fetching collections on initial mount', async () => {
    let resolveCollections;
    collectionApi.getCollections.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCollections = resolve;
      })
    );

    renderCollections();

    await waitFor(() => {
      expect(screen.getByText(/loading research collections/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/retrieving dossiers from mongodb\.\.\./i)).toBeInTheDocument();

    resolveCollections({ collections: mockCollections });
  });

  it('renders empty collections state with create CTA when user has no collections', async () => {
    collectionApi.getCollections.mockResolvedValueOnce({ collections: [] });

    renderCollections();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /no research collections yet/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /create your first collection/i })).toBeInTheDocument();
  });

  it('renders collections grid with titles, descriptions, and paper counts', async () => {
    renderCollections();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Transformer Architectures' })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Reinforcement Learning' })).toBeInTheDocument();
    expect(
      screen.getByText('Attention mechanisms and transformer-based foundations')
    ).toBeInTheDocument();
    expect(screen.getByText('2 papers')).toBeInTheDocument();
    expect(screen.getByText('0 papers')).toBeInTheDocument();
  });

  it('opens create modal, submits new collection, and persists via collectionApi', async () => {
    const newlyCreated = {
      id: 'col-3',
      name: 'Diffusion Models',
      description: 'Generative score-based methods',
      papers: [],
      createdAt: new Date().toISOString(),
    };
    collectionApi.createCollection.mockResolvedValueOnce({ collection: newlyCreated });

    const user = userEvent.setup();
    renderCollections();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Transformer Architectures' })).toBeInTheDocument();
    });

    // Click New Collection button
    const newColBtn = screen.getByRole('button', { name: /new collection/i });
    await user.click(newColBtn);

    expect(
      screen.getByRole('heading', { name: /create new research collection/i })
    ).toBeInTheDocument();

    // Fill form
    const nameInput = screen.getByPlaceholderText(/e\.g\. llm reasoning benchmarks/i);
    await user.type(nameInput, 'Diffusion Models');

    const descInput = screen.getByPlaceholderText(/thematic scope and objectives/i);
    await user.type(descInput, 'Generative score-based methods');

    // Submit
    const submitBtn = screen.getByRole('button', { name: /create collection/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(collectionApi.createCollection).toHaveBeenCalledWith({
        name: 'Diffusion Models',
        description: 'Generative score-based methods',
      });
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /create new research collection/i })
      ).not.toBeInTheDocument();
    });
  });

  it('displays duplicate collection name error inside create modal', async () => {
    const duplicateErr = new Error('A collection with this name already exists');
    duplicateErr.status = 409;
    collectionApi.createCollection.mockRejectedValueOnce(duplicateErr);

    const user = userEvent.setup();
    renderCollections();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Transformer Architectures' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /new collection/i }));

    const nameInput = screen.getByPlaceholderText(/e\.g\. llm reasoning benchmarks/i);
    await user.type(nameInput, 'Transformer Architectures');

    const submitBtn = screen.getByRole('button', { name: /create collection/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/a collection with this name already exists/i)
      ).toBeInTheDocument();
    });
  });

  it('renders selected collection dossier view with its populated papers and allows paper removal', async () => {
    collectionApi.removePaperFromCollection.mockResolvedValueOnce({
      collection: {
        ...mockCollections[0],
        papers: [mockCollections[0].papers[1]],
      },
    });

    const user = userEvent.setup();
    renderCollections('/collections/col-1');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /collection: transformer architectures/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    expect(screen.getByText('BERT: Pre-training of Deep Bidirectional Transformers')).toBeInTheDocument();
    expect(screen.getByText(/Ashish Vaswani, Noam Shazeer/i)).toBeInTheDocument();

    // Remove first paper from collection
    const removeButtons = screen.getAllByRole('button', { name: /remove from this collection/i });
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(collectionApi.removePaperFromCollection).toHaveBeenCalledWith('col-1', 'p1');
    });
  });

  it('displays collection not found message when active collection id does not exist', async () => {
    renderCollections('/collections/non-existent-col');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /collection not found/i })
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/the requested research dossier does not exist in your account\./i)
    ).toBeInTheDocument();
  });

  it('displays global error banner with retry option when collection fetching fails', async () => {
    collectionApi.getCollections.mockRejectedValueOnce(new Error('Failed to load collections from server'));

    const user = userEvent.setup();
    renderCollections();

    await waitFor(() => {
      expect(screen.getByText('Error Loading Collections')).toBeInTheDocument();
    });

    expect(screen.getByText(/failed to load collections from server/i)).toBeInTheDocument();

    collectionApi.getCollections.mockResolvedValueOnce({ collections: mockCollections });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Transformer Architectures' })).toBeInTheDocument();
    });
  });
});
