import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { paperApi, PaperApiError } from '../services/paperApi.js';
import { collectionApi, CollectionApiError } from '../services/collectionApi.js';
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

  // Collections state (sourced exclusively from MongoDB backend)
  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');

  // Clean up any legacy localStorage mock datasets
  useEffect(() => {
    localStorage.removeItem('rf_mock_papers');
    localStorage.removeItem('rf_mock_collections');
  }, []);

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

  /**
   * Fetches collections from the backend for the authenticated user.
   */
  const fetchCollections = useCallback(async () => {
    if (!user) {
      setCollections([]);
      setCollectionsError(null);
      return [];
    }

    setCollectionsLoading(true);
    setCollectionsError(null);

    try {
      const result = await collectionApi.getCollections();
      const loaded = result.collections || [];
      setCollections(loaded);
      return loaded;
    } catch (err) {
      const message = err.message || 'Failed to load research collections';
      setCollectionsError(message);
      throw err;
    } finally {
      setCollectionsLoading(false);
    }
  }, [user]);

  // Automatically fetch papers and collections on login; clear on logout
  useEffect(() => {
    if (user) {
      fetchPapers({ page: 1, limit: 10 }).catch(() => {});
      fetchCollections().catch(() => {});
    } else {
      setPapers([]);
      setPagination({ page: 1, limit: 10, total: 0, totalPages: 0 });
      setPapersError(null);
      setCollections([]);
      setCollectionsError(null);
      setCollectionsLoading(false);
    }
  }, [user, fetchPapers, fetchCollections]);

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
   * Also cleans up any references in loaded collections for immediate consistency.
   */
  const deletePaper = useCallback(async (id) => {
    const result = await paperApi.deletePaper(id);

    // Remove deleted paper from papers list
    setPapers((prev) => prev.filter((p) => p.id !== id));
    setPagination((prev) => ({
      ...prev,
      total: Math.max(0, prev.total - 1),
      totalPages: Math.ceil(Math.max(0, prev.total - 1) / (prev.limit || 10)),
    }));

    // Cascade remove paper reference from loaded collections in memory
    setCollections((prev) =>
      prev.map((col) => ({
        ...col,
        papers: (col.papers || []).filter((p) => {
          const pId = typeof p === 'string' ? p : p.id || p._id;
          return pId !== id;
        }),
      }))
    );

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

  /**
   * Creates a new collection via POST /api/collections.
   */
  const createCollection = useCallback(async (name, description = '') => {
    const result = await collectionApi.createCollection({ name, description });
    const newCol = result.collection;
    setCollections((prev) => [newCol, ...prev]);
    return newCol;
  }, []);

  /**
   * Adds a paper to a collection via POST /api/collections/:id/papers.
   * Canonical argument order: (collectionId, paperId).
   */
  const addPaperToCollection = useCallback(async (collectionId, paperId) => {
    const result = await collectionApi.addPaperToCollection(collectionId, paperId);
    const updated = result.collection;

    setCollections((prev) =>
      prev.map((col) => ((col.id || col._id) === (updated.id || updated._id) ? updated : col))
    );
    return updated;
  }, []);

  /**
   * Removes a paper from a collection via DELETE /api/collections/:id/papers/:paperId.
   * Canonical argument order: (collectionId, paperId).
   */
  const removePaperFromCollection = useCallback(async (collectionId, paperId) => {
    const result = await collectionApi.removePaperFromCollection(collectionId, paperId);
    const updated = result.collection;

    setCollections((prev) =>
      prev.map((col) => ((col.id || col._id) === (updated.id || updated._id) ? updated : col))
    );
    return updated;
  }, []);

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
        collectionsLoading,
        collectionsError,
        fetchCollections,
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
export { PaperApiError, CollectionApiError };
