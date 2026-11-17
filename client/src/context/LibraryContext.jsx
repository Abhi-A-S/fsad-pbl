import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { initialCollections } from '../data/mockData.js';
import { paperApi, PaperApiError } from '../services/paperApi.js';
import { useAuth } from './AuthContext.jsx';

const LibraryContext = createContext();

export function LibraryProvider({ children }) {
  const { user } = useAuth();

  // Papers state (sourced exclusively from MongoDB backend)
  const [papers, setPapers] = useState([]);
  const [papersLoading, setPapersLoading] = useState(false);
  const [papersError, setPapersError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  // Collections state (mock/localStorage-backed until Phase 5B Batch 2)
  const [collections, setCollections] = useState(() => {
    const saved = localStorage.getItem('rf_mock_collections');
    return saved ? JSON.parse(saved) : initialCollections;
  });

  const [searchQuery, setSearchQuery] = useState('');

  // Clean up any legacy localStorage papers from Phase 1 mock
  useEffect(() => {
    localStorage.removeItem('rf_mock_papers');
  }, []);

  // Sync collections to localStorage until Phase 5B Batch 2
  useEffect(() => {
    localStorage.setItem('rf_mock_collections', JSON.stringify(collections));
  }, [collections]);

  /**
   * Fetches papers from the backend for the authenticated user.
   * Supports pagination and search queries.
   */
  const fetchPapers = useCallback(
    async ({ page = 1, limit = 10, search = '' } = {}) => {
      if (!user) {
        setPapers([]);
        setPagination({ page: 1, limit: 10, total: 0, totalPages: 0 });
        return;
      }

      setPapersLoading(true);
      setPapersError(null);

      try {
        let result;
        const trimmedSearch = typeof search === 'string' ? search.trim() : '';

        if (trimmedSearch) {
          result = await paperApi.searchPapers({ q: trimmedSearch, page, limit });
        } else {
          result = await paperApi.getPapers({ page, limit });
        }

        setPapers(result.papers || []);
        if (result.pagination) {
          setPagination(result.pagination);
        } else {
          setPagination({
            page: 1,
            limit: 10,
            total: (result.papers || []).length,
            totalPages: Math.ceil((result.papers || []).length / 10) || 0,
          });
        }
        return result;
      } catch (err) {
        const message = err.message || 'Failed to load papers from library';
        setPapersError(message);
        throw err;
      } finally {
        setPapersLoading(false);
      }
    },
    [user]
  );

  // Automatically fetch papers when user logs in; clear when user logs out
  useEffect(() => {
    if (user) {
      fetchPapers({ page: 1, limit: 10 });
    } else {
      setPapers([]);
      setPagination({ page: 1, limit: 10, total: 0, totalPages: 0 });
      setPapersError(null);
    }
  }, [user, fetchPapers]);

  /**
   * Look up publication metadata from Crossref by DOI.
   * Read-only: does not persist to MongoDB.
   */
  const lookupDoi = useCallback(async (doi) => {
    try {
      const result = await paperApi.lookupDoi(doi);
      return {
        success: true,
        data: result.paper,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Failed to resolve DOI metadata',
        status: err.status || 500,
      };
    }
  }, []);

  /**
   * Persists a paper to MongoDB via POST /api/papers.
   */
  const addPaper = useCallback(async (paperData) => {
    const result = await paperApi.createPaper(paperData);
    const createdPaper = result.paper;

    // Update in-memory library list so other views reflect the newly saved paper
    setPapers((prev) => [createdPaper, ...prev]);
    setPagination((prev) => ({
      ...prev,
      total: prev.total + 1,
      totalPages: Math.ceil((prev.total + 1) / (prev.limit || 10)),
    }));

    return createdPaper;
  }, []);

  /**
   * Retrieves a single paper by ID from MongoDB via GET /api/papers/:id.
   */
  const getPaper = useCallback(async (id) => {
    const result = await paperApi.getPaper(id);
    return result.paper;
  }, []);

  /**
   * Updates a paper in MongoDB via PUT /api/papers/:id.
   */
  const updatePaper = useCallback(async (id, updateData) => {
    const result = await paperApi.updatePaper(id, updateData);
    const updated = result.paper;

    setPapers((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  /**
   * Deletes a paper from MongoDB via DELETE /api/papers/:id.
   */
  const deletePaper = useCallback(async (id) => {
    const result = await paperApi.deletePaper(id);

    setPapers((prev) => prev.filter((p) => p.id !== id));
    setPagination((prev) => ({
      ...prev,
      total: Math.max(0, prev.total - 1),
      totalPages: Math.ceil(Math.max(0, prev.total - 1) / (prev.limit || 10)),
    }));

    return result;
  }, []);

  /**
   * Client-side duplicate DOI check against currently loaded papers.
   */
  const checkDuplicateDoi = useCallback(
    (doi) => {
      if (!doi || typeof doi !== 'string') return false;
      const clean = doi.trim().toLowerCase();
      return papers.some((p) => p.doi && p.doi.trim().toLowerCase() === clean);
    },
    [papers]
  );

  // --- Collection management (mock/localStorage until Phase 5B Batch 2) ---
  const createCollection = (name, description, color = 'stone') => {
    const newCol = {
      id: `col-${Date.now()}`,
      name,
      description: description || 'No description provided.',
      createdAt: new Date().toISOString(),
      color,
    };
    setCollections((prev) => [newCol, ...prev]);
    return newCol;
  };

  const addPaperToCollection = (paperId, collectionId) => {
    setPapers((prev) =>
      prev.map((p) => {
        if (p.id === paperId) {
          const currentCols = p.collections || [];
          if (!currentCols.includes(collectionId)) {
            return { ...p, collections: [...currentCols, collectionId] };
          }
        }
        return p;
      })
    );
  };

  const removePaperFromCollection = (paperId, collectionId) => {
    setPapers((prev) =>
      prev.map((p) => {
        if (p.id === paperId) {
          return {
            ...p,
            collections: (p.collections || []).filter((c) => c !== collectionId),
          };
        }
        return p;
      })
    );
  };

  return (
    <LibraryContext.Provider
      value={{
        papers,
        papersLoading,
        papersError,
        pagination,
        searchQuery,
        setSearchQuery,
        fetchPapers,
        lookupDoi,
        addPaper,
        getPaper,
        updatePaper,
        deletePaper,
        checkDuplicateDoi,
        collections,
        createCollection,
        addPaperToCollection,
        removePaperFromCollection,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
}
