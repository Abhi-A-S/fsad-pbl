import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import PaperDetailPage from '../PaperDetailPage.jsx';
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

const mockPaper = {
  id: 'paper-123',
  title: 'Generative Adversarial Nets',
  authors: ['Ian Goodfellow', 'Jean Pouget-Abadie', 'Mehdi Mirza', 'Bing Xu'],
  abstract: 'We propose a new framework for estimating generative models via an adversarial process.',
  year: 2014,
  publicationDate: '2014-06-10T00:00:00.000Z',
  doi: '10.48550/arxiv.1406.2661',
  venue: 'NeurIPS',
  publisher: 'Curran Associates, Inc.',
  url: 'https://arxiv.org/abs/1406.2661',
  tags: ['generative-models', 'gan', 'deep-learning'],
  collections: ['col-1'],
  createdAt: '2024-01-15T10:00:00.000Z',
};

const mockCollections = [
  {
    id: 'col-1',
    name: 'Deep Learning Milestones',
    description: 'Landmark deep learning papers',
    papers: ['paper-123'],
  },
  {
    id: 'col-2',
    name: 'Unsupervised Learning',
    description: 'Generative and self-supervised methods',
    papers: [],
  },
];

function renderPaperDetail(paperId = 'paper-123') {
  return renderWithProviders(
    <Routes>
      <Route path="/library/:id" element={<PaperDetailPage />} />
      <Route path="/library" element={<div>Library Route Content</div>} />
    </Routes>,
    { route: `/library/${paperId}` }
  );
}

describe('PaperDetailPage (Publication Dossier)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.getCurrentUser.mockResolvedValue({
      user: { id: 'u1', email: 'scholar@institution.edu', displayName: 'Scholar One' },
    });
    paperApi.getPapers.mockResolvedValue({ papers: [mockPaper], pagination: { total: 1 } });
    collectionApi.getCollections.mockResolvedValue({ collections: mockCollections });
    paperApi.getPaper.mockResolvedValue({ paper: mockPaper });
    paperApi.deletePaper.mockResolvedValue({ success: true });
    collectionApi.addPaperToCollection.mockResolvedValue({
      collection: { ...mockCollections[1], papers: ['paper-123'] },
    });
    collectionApi.removePaperFromCollection.mockResolvedValue({
      collection: { ...mockCollections[0], papers: [] },
    });
  });

  it('renders loading state while retrieving publication metadata', async () => {
    let resolvePaper;
    paperApi.getPaper.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePaper = resolve;
      })
    );

    renderPaperDetail();

    expect(screen.getByText(/loading publication record/i)).toBeInTheDocument();
    expect(screen.getByText(/retrieving metadata from mongodb\.\.\./i)).toBeInTheDocument();

    resolvePaper({ paper: mockPaper });
  });

  it('renders 404 fallback when paper is not found', async () => {
    const err404 = new Error('Publication not found');
    err404.status = 404;
    paperApi.getPaper.mockRejectedValueOnce(err404);

    renderPaperDetail('missing-id');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /publication not found/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /return to library/i })).toBeInTheDocument();
  });

  it('renders error banner when server error occurs', async () => {
    paperApi.getPaper.mockRejectedValueOnce(new Error('MongoDB cluster unavailable'));

    renderPaperDetail();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /error loading publication/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/mongodb cluster unavailable/i)).toBeInTheDocument();
  });

  it('renders complete paper bibliographic metadata, abstract, and tags', async () => {
    renderPaperDetail();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
    });

    expect(screen.getByText(/Ian Goodfellow, Jean Pouget-Abadie, Mehdi Mirza, Bing Xu/i)).toBeInTheDocument();
    expect(screen.getByText('2014')).toBeInTheDocument();
    expect(screen.getByText('DOI: 10.48550/arxiv.1406.2661')).toBeInTheDocument();
    expect(screen.getByText(/Published in: NeurIPS/i)).toBeInTheDocument();
    expect(screen.getByText(/Publisher: Curran Associates, Inc\./i)).toBeInTheDocument();
    expect(screen.getByText(/We propose a new framework for estimating generative models/i)).toBeInTheDocument();
    expect(screen.getByText('#generative-models')).toBeInTheDocument();
    expect(screen.getByText('#gan')).toBeInTheDocument();
    expect(screen.getByText('#deep-learning')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view original source/i })).toHaveAttribute(
      'href',
      'https://arxiv.org/abs/1406.2661'
    );
  });

  it('renders assigned collection badge and allows one-click removal', async () => {
    const user = userEvent.setup();
    renderPaperDetail();

    await waitFor(() => {
      expect(screen.getByText('Deep Learning Milestones')).toBeInTheDocument();
    });

    const removeBtn = screen.getByRole('button', { name: /remove from collection/i });
    await user.click(removeBtn);

    await waitFor(() => {
      expect(collectionApi.removePaperFromCollection).toHaveBeenCalledWith('col-1', 'paper-123');
    });
  });

  it('opens collection management modal and toggles collection membership', async () => {
    const user = userEvent.setup();
    renderPaperDetail();

    await waitFor(() => {
      expect(screen.getByText('Deep Learning Milestones')).toBeInTheDocument();
    });

    // Open manage collections modal
    const manageBtn = screen.getByRole('button', { name: /manage collections/i });
    await user.click(manageBtn);

    expect(screen.getByRole('heading', { name: /organize collections/i })).toBeInTheDocument();
    expect(screen.getByText('Unsupervised Learning')).toBeInTheDocument();

    // Click on unassigned collection "Unsupervised Learning" to assign
    const unassignedColBtn = screen.getByRole('button', { name: /unsupervised learning/i });
    await user.click(unassignedColBtn);

    await waitFor(() => {
      expect(collectionApi.addPaperToCollection).toHaveBeenCalledWith('col-2', 'paper-123');
    });

    // Close modal
    const doneBtn = screen.getByRole('button', { name: /done/i });
    await user.click(doneBtn);

    expect(screen.queryByRole('heading', { name: /organize collections/i })).not.toBeInTheDocument();
  });

  it('opens delete confirmation modal, deletes paper, and navigates back to library', async () => {
    const user = userEvent.setup();
    renderPaperDetail();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
    });

    // Click Delete Paper button to open modal
    const deleteBtn = screen.getByRole('button', { name: /delete paper/i });
    await user.click(deleteBtn);

    expect(screen.getByRole('heading', { name: /delete publication/i })).toBeInTheDocument();
    expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
    expect(screen.getByText(/permanently remove the record from mongodb/i)).toBeInTheDocument();

    // Confirm deletion
    const confirmDeleteBtn = screen.getByRole('button', { name: /^delete$/i });
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(paperApi.deletePaper).toHaveBeenCalledWith('paper-123');
    });

    await waitFor(() => {
      expect(screen.getByText('Library Route Content')).toBeInTheDocument();
    });
  });

  it('displays error in delete modal when paper deletion fails', async () => {
    paperApi.deletePaper.mockRejectedValueOnce(new Error('Failed to delete paper due to write lock'));

    const user = userEvent.setup();
    renderPaperDetail();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: /delete paper/i });
    await user.click(deleteBtn);

    const confirmDeleteBtn = screen.getByRole('button', { name: /^delete$/i });
    await user.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(screen.getByText(/failed to delete paper due to write lock/i)).toBeInTheDocument();
    });
  });
});
