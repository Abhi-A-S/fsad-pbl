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
    getEnrichSuggestions: vi.fn(),
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
    paperApi.getEnrichSuggestions.mockResolvedValue({
      paperId: 'paper-123',
      status: 'ready',
      matchedWork: {
        id: 'https://openalex.org/W2146529362',
        openAlexId: 'W2146529362',
        doi: '10.48550/arxiv.1406.2661',
        title: 'Generative Adversarial Nets',
        authors: ['Ian J. Goodfellow', 'Jean Pouget-Abadie'],
        year: 2014,
        venue: 'NeurIPS',
      },
      suggestions: [
        {
          field: 'publisher',
          currentValue: '',
          suggestedValue: 'Neural Information Processing Systems Foundation',
          type: 'add',
        },
      ],
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

  describe('Metadata Enrichment Workflow (P7-04B)', () => {
    const mockReadyResponse = {
      paperId: 'paper-123',
      status: 'ready',
      matchedWork: {
        id: 'https://openalex.org/W2146529362',
        openAlexId: 'W2146529362',
        doi: '10.48550/arxiv.1406.2661',
        title: 'Generative Adversarial Nets',
        authors: ['Ian J. Goodfellow', 'Jean Pouget-Abadie'],
        year: 2014,
        venue: 'Advances in Neural Information Processing Systems',
      },
      suggestions: [
        {
          field: 'publisher',
          currentValue: '',
          suggestedValue: 'Neural Information Processing Systems Foundation',
          type: 'add',
        },
        {
          field: 'venue',
          currentValue: 'NeurIPS',
          suggestedValue: 'Advances in Neural Information Processing Systems',
          type: 'update',
        },
      ],
    };

    it('renders "Enrich Metadata" button and shows loading state while fetching suggestions', async () => {
      let resolveSuggestions;
      paperApi.getEnrichSuggestions.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSuggestions = resolve;
        })
      );

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      const enrichBtn = screen.getByRole('button', { name: /enrich metadata/i });
      expect(enrichBtn).toBeInTheDocument();
      await user.click(enrichBtn);

      expect(paperApi.getEnrichSuggestions).toHaveBeenCalledWith('paper-123', null);
      expect(screen.getByText(/connecting to openalex\.\.\./i)).toBeInTheDocument();

      resolveSuggestions(mockReadyResponse);

      await waitFor(() => {
        expect(screen.getByText(/proposed metadata changes/i)).toBeInTheDocument();
      });
    });

    it('displays ready suggestions with matched work, pre-selecting only additions and leaving updates unchecked', async () => {
      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockReadyResponse);

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByText(/proposed metadata changes/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/matched work: w2146529362/i)).toBeInTheDocument();
      expect(screen.getByText('New Addition')).toBeInTheDocument();
      expect(screen.getByText('Update / Alternative')).toBeInTheDocument();

      // Checkbox for 'add' field (publisher) should be checked by default
      const publisherCheckbox = screen.getByRole('checkbox', { name: /publisher/i });
      expect(publisherCheckbox).toBeChecked();

      // Checkbox for 'update' field (venue) must NOT be checked by default (non-destructive)
      const venueCheckbox = screen.getByRole('checkbox', { name: /venue/i });
      expect(venueCheckbox).not.toBeChecked();

      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /apply 1 selected change/i })).toBeInTheDocument();
    });

    it('allows toggling field selection and updating selected count', async () => {
      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockReadyResponse);

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByText(/proposed metadata changes/i)).toBeInTheDocument();
      });

      const venueCheckbox = screen.getByRole('checkbox', { name: /venue/i });
      await user.click(venueCheckbox);

      expect(venueCheckbox).toBeChecked();
      expect(screen.getByText('2 selected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /apply 2 selected changes/i })).toBeInTheDocument();

      // Uncheck publisher
      const publisherCheckbox = screen.getByRole('checkbox', { name: /publisher/i });
      await user.click(publisherCheckbox);

      expect(publisherCheckbox).not.toBeChecked();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /apply 1 selected change/i })).toBeInTheDocument();
    });

    it('submits only selected changes through updatePaper and refreshes paper view', async () => {
      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockReadyResponse);
      const updatedPaper = {
        ...mockPaper,
        publisher: 'Neural Information Processing Systems Foundation',
      };
      paperApi.updatePaper.mockResolvedValueOnce({ paper: updatedPaper });

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /apply 1 selected change/i })).toBeInTheDocument();
      });

      // Click Apply (only publisher is checked by default)
      await user.click(screen.getByRole('button', { name: /apply 1 selected change/i }));

      await waitFor(() => {
        expect(paperApi.updatePaper).toHaveBeenCalledWith('paper-123', {
          publisher: 'Neural Information Processing Systems Foundation',
        });
      });

      // Panel closes and success message appears
      await waitFor(() => {
        expect(screen.getByText(/metadata successfully enriched and saved to your library/i)).toBeInTheDocument();
      });

      // Updated publisher is reflected in paper view
      expect(screen.getByText(/publisher: neural information processing systems foundation/i)).toBeInTheDocument();
    });

    it('does not mutate or save paper when suggestions are merely reviewed or cancelled', async () => {
      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockReadyResponse);

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      // Cancel without applying
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByLabelText(/metadata enrichment panel/i)).not.toBeInTheDocument();
      expect(paperApi.updatePaper).not.toHaveBeenCalled();
    });

    it('renders ambiguous candidates list and allows user to select a candidate', async () => {
      const mockAmbiguousResponse = {
        paperId: 'paper-123',
        status: 'ambiguous',
        candidates: [
          {
            id: 'https://openalex.org/W2146529362',
            openAlexId: 'W2146529362',
            doi: '10.48550/arxiv.1406.2661',
            title: 'Generative Adversarial Nets',
            authors: ['Ian Goodfellow'],
            year: 2014,
            venue: 'NeurIPS',
          },
          {
            id: 'https://openalex.org/W2963403868',
            openAlexId: 'W2963403868',
            title: 'Generative Adversarial Networks (Review)',
            authors: ['Other Author'],
            year: 2018,
            venue: 'IEEE Review',
          },
        ],
      };

      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockAmbiguousResponse);
      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockReadyResponse);

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByText(/multiple matching publications found/i)).toBeInTheDocument();
      });

      expect(screen.getByText('Generative Adversarial Networks (Review)')).toBeInTheDocument();

      // Click "Select Candidate" on first candidate
      const selectBtns = screen.getAllByRole('button', { name: /select candidate/i });
      await user.click(selectBtns[0]);

      // Should request suggestions for the selected candidate's OpenAlex ID
      await waitFor(() => {
        expect(paperApi.getEnrichSuggestions).toHaveBeenCalledWith('paper-123', 'W2146529362');
      });

      await waitFor(() => {
        expect(screen.getByText(/proposed metadata changes/i)).toBeInTheDocument();
      });
    });

    it('renders not_found state when no match is found and allows retry', async () => {
      const mockNotFoundResponse = {
        paperId: 'paper-123',
        status: 'not_found',
        message: 'No matching publication found in OpenAlex for this paper.',
      };

      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockNotFoundResponse);
      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockReadyResponse);

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByText('No Matching Publication Found')).toBeInTheDocument();
      });

      expect(screen.getByText('No matching publication found in OpenAlex for this paper.')).toBeInTheDocument();

      // Click Retry Search
      const retryBtn = screen.getByRole('button', { name: /retry search/i });
      await user.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText(/proposed metadata changes/i)).toBeInTheDocument();
      });
      expect(paperApi.getEnrichSuggestions).toHaveBeenCalledTimes(2);
    });

    it('displays error message when suggestions request fails and allows retry', async () => {
      paperApi.getEnrichSuggestions.mockRejectedValueOnce(
        new Error('OpenAlex rate limit exceeded. Please try again later.')
      );
      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockReadyResponse);

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByText(/unable to retrieve enrichment suggestions/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/openalex rate limit exceeded/i)).toBeInTheDocument();

      // Retry
      const tryAgainBtn = screen.getByRole('button', { name: /try again/i });
      await user.click(tryAgainBtn);

      await waitFor(() => {
        expect(screen.getByText(/proposed metadata changes/i)).toBeInTheDocument();
      });
    });

    it('displays error in enrichment panel when apply update fails', async () => {
      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockReadyResponse);
      paperApi.updatePaper.mockRejectedValueOnce(new Error('A paper with this DOI already exists'));

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /apply 1 selected change/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /apply 1 selected change/i }));

      await waitFor(() => {
        expect(screen.getByText(/a paper with this doi already exists/i)).toBeInTheDocument();
      });
    });

    it('displays message when status is ready but suggestions list is empty', async () => {
      const mockEmptySuggestionsResponse = {
        paperId: 'paper-123',
        status: 'ready',
        matchedWork: {
          openAlexId: 'W2146529362',
          title: 'Generative Adversarial Nets',
        },
        suggestions: [],
      };

      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockEmptySuggestionsResponse);

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Your paper already contains all available metadata matching this publication.')
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText('No new fields or alternative values to suggest.')
      ).toBeInTheDocument();

      const doneBtn = screen.getByRole('button', { name: /done/i });
      await user.click(doneBtn);

      expect(screen.queryByLabelText(/metadata enrichment panel/i)).not.toBeInTheDocument();
    });

    it('disables the apply button when all fields are deselected', async () => {
      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockReadyResponse);

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByText(/proposed metadata changes/i)).toBeInTheDocument();
      });

      // Initially 1 field (publisher) is checked
      const publisherCheckbox = screen.getByRole('checkbox', { name: /publisher/i });
      expect(publisherCheckbox).toBeChecked();
      const applyBtn = screen.getByRole('button', { name: /apply 1 selected change/i });
      expect(applyBtn).toBeEnabled();

      // Deselect publisher -> count reaches 0
      await user.click(publisherCheckbox);
      expect(publisherCheckbox).not.toBeChecked();

      expect(screen.getByText('0 selected')).toBeInTheDocument();
      const zeroApplyBtn = screen.getByRole('button', { name: /apply 0 selected changes/i });
      expect(zeroApplyBtn).toBeDisabled();
    });

    it('displays error in enrichment panel when candidate selection fails and allows retry', async () => {
      const mockAmbiguousResponse = {
        paperId: 'paper-123',
        status: 'ambiguous',
        candidates: [
          {
            id: 'https://openalex.org/W999',
            openAlexId: 'W999',
            title: 'Candidate Work Title',
            authors: ['Author'],
            year: 2021,
          },
        ],
      };

      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockAmbiguousResponse);
      paperApi.getEnrichSuggestions.mockRejectedValueOnce(
        new Error('Failed to fetch details for candidate work.')
      );

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByText('Candidate Work Title')).toBeInTheDocument();
      });

      const selectBtn = screen.getByRole('button', { name: /select candidate/i });
      await user.click(selectBtn);

      await waitFor(() => {
        expect(screen.getByText(/failed to fetch details for candidate work/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('renders long abstracts and multiple authors cleanly in review diff', async () => {
      const longAbstract = 'A'.repeat(300);
      const mockRichResponse = {
        paperId: 'paper-123',
        status: 'ready',
        matchedWork: {
          openAlexId: 'W12345',
          title: 'Paper With Rich Metadata',
        },
        suggestions: [
          {
            field: 'abstract',
            currentValue: 'Short abstract',
            suggestedValue: longAbstract,
            type: 'update',
          },
          {
            field: 'authors',
            currentValue: ['Author One'],
            suggestedValue: ['Author One', 'Author Two', 'Author Three'],
            type: 'update',
          },
        ],
      };

      paperApi.getEnrichSuggestions.mockResolvedValueOnce(mockRichResponse);

      const user = userEvent.setup();
      renderPaperDetail();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Generative Adversarial Nets' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /enrich metadata/i }));

      await waitFor(() => {
        expect(screen.getByText(/proposed metadata changes/i)).toBeInTheDocument();
      });

      expect(screen.getByText(longAbstract)).toBeInTheDocument();
      expect(screen.getByText('Author One, Author Two, Author Three')).toBeInTheDocument();
    });
  });
});
