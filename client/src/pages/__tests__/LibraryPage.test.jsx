import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LibraryPage from '../LibraryPage.jsx';
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

const mockPapers = [
  {
    id: 'p1',
    title: 'Deep Residual Learning for Image Recognition',
    authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'],
    year: 2016,
    doi: '10.1109/cvpr.2016.90',
    venue: 'CVPR',
    abstract: 'Deeper neural networks are more difficult to train.',
    tags: ['deep-learning', 'computer-vision'],
  },
  {
    id: 'p2',
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer'],
    year: 2017,
    doi: '10.48550/arxiv.1706.03762',
    venue: 'NeurIPS',
    abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.',
    tags: ['transformer', 'nlp'],
  },
];

const mockCollections = [
  {
    id: 'c1',
    name: 'Computer Vision Classics',
    description: 'Foundational vision papers',
    papers: ['p1'],
  },
];

describe('LibraryPage (Catalog & Search)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.getCurrentUser.mockResolvedValue({
      user: { id: 'u1', email: 'scholar@institution.edu', displayName: 'Scholar One' },
    });
    paperApi.getPapers.mockResolvedValue({
      papers: mockPapers,
      pagination: { total: 2, page: 1, limit: 10, totalPages: 1 },
    });
    paperApi.searchPapers.mockResolvedValue({
      papers: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });
    collectionApi.getCollections.mockResolvedValue({ collections: mockCollections });
  });

  it('renders loading state initially while fetching library papers', async () => {
    let resolvePapers;
    const papersPromise = new Promise((resolve) => {
      resolvePapers = resolve;
    });
    paperApi.getPapers.mockReturnValueOnce(papersPromise);

    renderWithProviders(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText(/querying research library\.\.\./i)).toBeInTheDocument();
    });

    resolvePapers({
      papers: mockPapers,
      pagination: { total: 2, page: 1, limit: 10, totalPages: 1 },
    });
  });

  it('renders empty library state with import link when user library has no papers', async () => {
    paperApi.getPapers.mockResolvedValueOnce({
      papers: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });

    renderWithProviders(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText(/your research library is empty\./i)).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /import your first paper/i })).toBeInTheDocument();
    expect(screen.getByText(/0 publications/i)).toBeInTheDocument();
  });

  it('renders papers list with titles, authors, metadata, and collection badges', async () => {
    renderWithProviders(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Deep Residual Learning for Image Recognition')).toBeInTheDocument();
    });

    expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    expect(screen.getByText(/Kaiming He, Xiangyu Zhang, Shaoqing Ren, Jian Sun/i)).toBeInTheDocument();
    expect(screen.getByText('2016')).toBeInTheDocument();
    expect(screen.getByText('2017')).toBeInTheDocument();
    expect(screen.getByText('DOI: 10.1109/cvpr.2016.90')).toBeInTheDocument();
    expect(screen.getByText('Computer Vision Classics')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2 publications')).toBeInTheDocument();
  });

  it('executes debounced search when user types in search input', async () => {
    paperApi.searchPapers.mockResolvedValueOnce({
      papers: [mockPapers[1]],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    });

    const user = userEvent.setup();
    renderWithProviders(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Deep Residual Learning for Image Recognition')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search by title, author, abstract, doi, or tag\.\.\./i);
    await user.type(searchInput, 'transformer');

    // Debounce is 350ms
    await waitFor(
      () => {
        expect(paperApi.searchPapers).toHaveBeenCalledWith({
          q: 'transformer',
          page: 1,
          limit: 10,
        });
      },
      { timeout: 1500 }
    );

    await waitFor(() => {
      expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
      expect(screen.queryByText('Deep Residual Learning for Image Recognition')).not.toBeInTheDocument();
    });
  });

  it('renders empty search results state when search yields no matches and allows clearing', async () => {
    paperApi.searchPapers.mockResolvedValueOnce({
      papers: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
    });

    const user = userEvent.setup();
    renderWithProviders(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Deep Residual Learning for Image Recognition')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search by title, author, abstract, doi, or tag\.\.\./i);
    await user.type(searchInput, 'quantum gravity string theory');

    await waitFor(
      () => {
        expect(screen.getByText(/no publications match your search query\./i)).toBeInTheDocument();
      },
      { timeout: 1500 }
    );

    // Clear search using the button inside the empty search results state
    const clearButtons = screen.getAllByRole('button', { name: /clear search/i });
    await user.click(clearButtons[0]);

    await waitFor(() => {
      expect(paperApi.getPapers).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Deep Residual Learning for Image Recognition')).toBeInTheDocument();
    });
  });

  it('renders pagination controls and navigates between pages', async () => {
    paperApi.getPapers.mockResolvedValueOnce({
      papers: [mockPapers[0]],
      pagination: { total: 15, page: 1, limit: 10, totalPages: 2 },
    });

    paperApi.getPapers.mockResolvedValueOnce({
      papers: [mockPapers[1]],
      pagination: { total: 15, page: 2, limit: 10, totalPages: 2 },
    });

    const user = userEvent.setup();
    renderWithProviders(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });

    const prevBtn = screen.getByRole('button', { name: /previous/i });
    const nextBtn = screen.getByRole('button', { name: /next/i });

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Click Next
    await user.click(nextBtn);

    await waitFor(() => {
      expect(paperApi.getPapers).toHaveBeenCalledWith({ page: 2, limit: 10 });
    });
  });

  it('displays error banner with retry option when paper fetching fails', async () => {
    paperApi.getPapers.mockRejectedValueOnce(new Error('Network error querying MongoDB'));

    const user = userEvent.setup();
    renderWithProviders(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Network error querying MongoDB')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Deep Residual Learning for Image Recognition')).toBeInTheDocument();
    });
  });

  it('filters papers client-side when clicking a tag pill', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Deep Residual Learning for Image Recognition')).toBeInTheDocument();
    });

    // Find the #transformer tag filter button in the filter bar
    const tagButtons = screen.getAllByRole('button', { name: /#transformer/i });
    await user.click(tagButtons[0]);

    expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
    expect(screen.queryByText('Deep Residual Learning for Image Recognition')).not.toBeInTheDocument();
  });

  it('renders collection badges for papers referenced by collections (string IDs and populated objects) without paper.collections', async () => {
    const rawPapers = [
      {
        id: 'paper-alpha',
        title: 'AlphaFold: Accurate structure prediction',
        authors: ['John Jumper', 'Demis Hassabis'],
        year: 2021,
        doi: '10.1038/s41586-021-03819-2',
        tags: ['biology', 'deep-learning'],
      },
      {
        id: 'paper-beta',
        title: 'Generative Adversarial Nets',
        authors: ['Ian Goodfellow'],
        year: 2014,
        doi: '10.48550/arxiv.1406.2661',
        tags: ['gan', 'deep-learning'],
      },
    ];

    const rawCollections = [
      {
        id: 'col-bio',
        name: 'Computational Biology',
        description: 'Structural biology papers',
        // Referenced as string ID
        papers: ['paper-alpha'],
      },
      {
        id: 'col-gen',
        name: 'Generative Models',
        description: 'GANs and diffusion',
        // Referenced as populated object
        papers: [{ id: 'paper-beta', title: 'Generative Adversarial Nets' }],
      },
    ];

    paperApi.getPapers.mockResolvedValueOnce({
      papers: rawPapers,
      pagination: { total: 2, page: 1, limit: 10, totalPages: 1 },
    });
    collectionApi.getCollections.mockResolvedValueOnce({
      collections: rawCollections,
    });

    renderWithProviders(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('AlphaFold: Accurate structure prediction')).toBeInTheDocument();
      expect(screen.getByText('Generative Adversarial Nets')).toBeInTheDocument();
    });

    // Check that collection badges are displayed on their respective paper cards
    expect(screen.getByText('Computational Biology')).toBeInTheDocument();
    expect(screen.getByText('Generative Models')).toBeInTheDocument();
  });
});
