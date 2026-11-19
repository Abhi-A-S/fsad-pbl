import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportDoiPage from '../ImportDoiPage.jsx';
import { renderWithProviders } from '../../test/test-utils.jsx';
import { paperApi } from '../../services/paperApi.js';
import { collectionApi } from '../../services/collectionApi.js';
import { authApi } from '../../services/authApi.js';

vi.mock('../../services/paperApi.js', () => ({
  paperApi: {
    lookupDoi: vi.fn(),
    createPaper: vi.fn(),
    getPapers: vi.fn(),
    getPaper: vi.fn(),
    updatePaper: vi.fn(),
    deletePaper: vi.fn(),
    searchPapers: vi.fn(),
  },
}));

vi.mock('../../services/collectionApi.js', () => ({
  collectionApi: {
    getCollections: vi.fn().mockResolvedValue({ collections: [] }),
    createCollection: vi.fn(),
    addPaperToCollection: vi.fn(),
    removePaperFromCollection: vi.fn(),
  },
}));

vi.mock('../../services/authApi.js', () => ({
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({
      user: { id: 'u1', email: 'test@institution.edu', displayName: 'Test User' },
    }),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

describe('ImportDoiPage (DOI Import & Manual Entry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paperApi.getPapers.mockResolvedValue({ papers: [], pagination: { total: 0 } });
    collectionApi.getCollections.mockResolvedValue({ collections: [] });
  });

  it('renders DOI input and lookup button by default', async () => {
    renderWithProviders(<ImportDoiPage />);

    expect(screen.getByRole('heading', { name: /publication ingestion & cataloging/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('10.xxxx/xxxxx')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lookup metadata/i })).toBeInTheDocument();
  });

  it('performs successful DOI metadata resolution and populates the review form', async () => {
    const mockCrossrefPaper = {
      title: 'Attention Is All You Need',
      authors: ['Ashish Vaswani', 'Noam Shazeer'],
      abstract: 'The dominant sequence transduction models...',
      doi: '10.48550/arxiv.1706.03762',
      year: 2017,
      publicationDate: '2017-06-12T00:00:00.000Z',
      venue: 'NeurIPS',
      publisher: 'Curran Associates',
      url: 'https://doi.org/10.48550/arxiv.1706.03762',
      tags: ['transformer', 'nlp'],
    };

    paperApi.lookupDoi.mockResolvedValueOnce({ paper: mockCrossrefPaper });

    const user = userEvent.setup();
    renderWithProviders(<ImportDoiPage />);

    const doiInput = screen.getByPlaceholderText('10.xxxx/xxxxx');
    await user.clear(doiInput);
    await user.type(doiInput, '10.48550/arXiv.1706.03762');

    const lookupBtn = screen.getByRole('button', { name: /lookup metadata/i });
    await user.click(lookupBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /bibliographic metadata verification/i })).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Attention Is All You Need')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ashish Vaswani, Noam Shazeer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2017')).toBeInTheDocument();
    expect(screen.getByDisplayValue('The dominant sequence transduction models...')).toBeInTheDocument();
  });

  it('allows editing returned metadata before saving and submits edited values', async () => {
    const mockCrossrefPaper = {
      title: 'Original Title',
      authors: ['Original Author'],
      doi: '10.1234/test.doi',
      year: 2020,
    };

    paperApi.lookupDoi.mockResolvedValueOnce({ paper: mockCrossrefPaper });
    paperApi.createPaper.mockResolvedValueOnce({
      paper: {
        id: 'p123',
        title: 'Edited Title by Researcher',
        authors: ['Edited Author One', 'Edited Author Two'],
        year: 2021,
        doi: '10.1234/test.doi',
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<ImportDoiPage />);

    const doiInput = screen.getByPlaceholderText('10.xxxx/xxxxx');
    await user.clear(doiInput);
    await user.type(doiInput, '10.1234/test.doi');
    await user.click(screen.getByRole('button', { name: /lookup metadata/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Original Title')).toBeInTheDocument();
    });

    // Edit title
    const titleInput = screen.getByDisplayValue('Original Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Edited Title by Researcher');

    // Edit authors
    const authorsInput = screen.getByDisplayValue('Original Author');
    fireEvent.change(authorsInput, { target: { value: 'Edited Author One, Edited Author Two' } });

    // Edit year
    const yearInput = screen.getByDisplayValue('2020');
    await user.clear(yearInput);
    await user.type(yearInput, '2021');

    // Save paper
    const saveBtn = screen.getByRole('button', { name: /confirm & save to library/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(paperApi.createPaper).toHaveBeenCalledTimes(1);
    });

    const submittedPayload = paperApi.createPaper.mock.calls[0][0];
    expect(submittedPayload.title).toBe('Edited Title by Researcher');
    expect(submittedPayload.authors).toEqual(['Edited Author One', 'Edited Author Two']);
    expect(submittedPayload.year).toBe(2021);
    expect(submittedPayload.doi).toBe('10.1234/test.doi');
  });

  it('displays error banner when DOI is not found in Crossref (404)', async () => {
    const notFoundError = new Error('Publication not found in Crossref');
    notFoundError.status = 404;
    paperApi.lookupDoi.mockRejectedValueOnce(notFoundError);

    const user = userEvent.setup();
    renderWithProviders(<ImportDoiPage />);

    const doiInput = screen.getByPlaceholderText('10.xxxx/xxxxx');
    await user.clear(doiInput);
    await user.type(doiInput, '10.9999/notfound');
    await user.click(screen.getByRole('button', { name: /lookup metadata/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/doi not found in crossref\. please verify the doi or enter the paper manually\./i)
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /enter manually instead/i })).toBeInTheDocument();
  });

  it('switches to manual entry mode and allows saving without DOI', async () => {
    paperApi.createPaper.mockResolvedValueOnce({
      paper: {
        id: 'pmanual',
        title: 'Manual Research Note',
        authors: ['Ada Lovelace'],
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<ImportDoiPage />);

    // Click Manual Entry tab
    await user.click(screen.getByRole('button', { name: /manual entry/i }));

    expect(screen.getByRole('heading', { name: /manual paper metadata/i })).toBeInTheDocument();

    // Fill in required fields
    const titleInput = screen.getByPlaceholderText(/attention is all you need/i);
    await user.type(titleInput, 'Manual Research Note');

    const authorsInput = screen.getByPlaceholderText(/yann lecun/i);
    fireEvent.change(authorsInput, { target: { value: 'Ada Lovelace' } });

    // Save
    const saveBtn = screen.getByRole('button', { name: /confirm & save to library/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(paperApi.createPaper).toHaveBeenCalledTimes(1);
    });

    const payload = paperApi.createPaper.mock.calls[0][0];
    expect(payload.title).toBe('Manual Research Note');
    expect(payload.authors).toEqual(['Ada Lovelace']);
    expect(payload.doi).toBeUndefined();
  });

  it('displays error when attempting to save a duplicate DOI (409)', async () => {
    const mockPaper = {
      title: 'Duplicate DOI Paper',
      authors: ['Some Author'],
      doi: '10.1234/duplicate.doi',
    };

    paperApi.lookupDoi.mockResolvedValueOnce({ paper: mockPaper });
    const duplicateError = new Error('A paper with this DOI already exists in your library');
    duplicateError.status = 409;
    paperApi.createPaper.mockRejectedValueOnce(duplicateError);

    const user = userEvent.setup();
    renderWithProviders(<ImportDoiPage />);

    const doiInput = screen.getByPlaceholderText('10.xxxx/xxxxx');
    await user.clear(doiInput);
    await user.type(doiInput, '10.1234/duplicate.doi');
    await user.click(screen.getByRole('button', { name: /lookup metadata/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Duplicate DOI Paper')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /confirm & save to library/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/a paper with this doi already exists in your library/i)
      ).toBeInTheDocument();
    });
  });

  it('prevents saving when required fields are missing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImportDoiPage />);

    // Switch to manual mode
    await user.click(screen.getByRole('button', { name: /manual entry/i }));

    // Set title to whitespace to bypass HTML5 required attribute while triggering validation logic
    const titleInput = screen.getByPlaceholderText(/attention is all you need/i);
    fireEvent.change(titleInput, { target: { value: '   ' } });

    const authorsInput = screen.getByPlaceholderText(/yann lecun/i);
    fireEvent.change(authorsInput, { target: { value: 'Valid Author' } });

    const saveBtn = screen.getByRole('button', { name: /confirm & save to library/i });
    await user.click(saveBtn);

    expect(screen.getByText(/publication title is required\./i)).toBeInTheDocument();
    expect(paperApi.createPaper).not.toHaveBeenCalled();
  });
});
