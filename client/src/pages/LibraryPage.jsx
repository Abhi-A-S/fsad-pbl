import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  BookOpen,
  ExternalLink,
  PlusCircle,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';

export default function LibraryPage() {
  const { papers, papersLoading, papersError, pagination, fetchPapers, collections } = useLibrary();

  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTag, setSelectedTag] = useState('');
  const debounceTimerRef = useRef(null);

  // Load papers on mount or when page/activeSearch changes
  const loadData = useCallback(
    async (page, search) => {
      try {
        await fetchPapers({ page, limit: 10, search });
      } catch {
        // Error is set in LibraryContext
      }
    },
    [fetchPapers]
  );

  // Debounce search input (350ms)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== activeSearch) {
        setActiveSearch(trimmed);
        setCurrentPage(1);
        loadData(1, trimmed);
      }
    }, 350);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchInput, activeSearch, loadData]);

  // Handle page changes
  const handlePageChange = (newPage) => {
    if (newPage < 1 || (pagination.totalPages && newPage > pagination.totalPages)) return;
    setCurrentPage(newPage);
    loadData(newPage, activeSearch);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Clear search query
  const handleClearSearch = () => {
    setSearchInput('');
    setActiveSearch('');
    setSelectedTag('');
    setCurrentPage(1);
    loadData(1, '');
  };

  // Unique tags across currently loaded papers
  const allTags = Array.from(new Set(papers.flatMap((p) => p.tags || [])));

  // Client-side tag filtering on the currently returned page
  const displayedPapers = selectedTag
    ? papers.filter((p) => p.tags && p.tags.includes(selectedTag))
    : papers;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight text-stone-900">
            Personal Research Library
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Browse, search, and manage your personal catalog of academic publications.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/import"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-stone-900 text-stone-50 text-xs font-medium hover:bg-stone-800 transition-colors shadow-xs"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Add Paper</span>
          </Link>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-3 rounded-lg border border-stone-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by title, author, abstract, DOI, or tag..."
            className="w-full pl-9 pr-9 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 focus:bg-white transition-all text-stone-800 placeholder-stone-400 font-sans"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs font-mono text-stone-400 pl-2">Filter:</span>
            <button
              onClick={() => setSelectedTag('')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                !selectedTag
                  ? 'bg-stone-900 text-stone-100 font-medium'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              All
            </button>
            {allTags.slice(0, 5).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTag(selectedTag === t ? '' : t)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  selectedTag === t
                    ? 'bg-stone-900 text-stone-100 font-medium'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {papersError && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-xs flex items-center justify-between border border-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{papersError}</span>
          </div>
          <button
            onClick={() => loadData(currentPage, activeSearch)}
            className="underline font-medium hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results Count & Active Search Metadata */}
      <div className="flex items-center justify-between text-xs font-mono text-stone-500 px-1">
        <span>
          {papersLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Loading publications...</span>
            </span>
          ) : pagination.total > 0 ? (
            `Showing ${(pagination.page - 1) * pagination.limit + 1}–${Math.min(
              pagination.page * pagination.limit,
              pagination.total
            )} of ${pagination.total} publications`
          ) : (
            '0 publications'
          )}
        </span>
        {activeSearch && (
          <span className="text-amber-800">
            Filtered by query: "{activeSearch}"
          </span>
        )}
      </div>

      {/* Paper List Content */}
      <div className="space-y-3">
        {papersLoading ? (
          <div className="p-16 text-center bg-white rounded-lg border border-stone-200">
            <Loader2 className="h-7 w-7 text-stone-400 animate-spin mx-auto mb-3" />
            <p className="text-stone-600 font-medium text-sm">Querying research library...</p>
            <p className="text-stone-400 text-xs mt-1">Retrieving publications from MongoDB</p>
          </div>
        ) : displayedPapers.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-lg border border-dashed border-stone-300">
            <BookOpen className="h-8 w-8 text-stone-300 mx-auto mb-3" />
            {activeSearch ? (
              <>
                <p className="text-stone-700 font-medium text-sm">No publications match your search query.</p>
                <p className="text-stone-400 text-xs mt-1">Try refining search terms or clearing the filter.</p>
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="mt-3 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-md text-xs font-medium transition-colors"
                >
                  Clear Search
                </button>
              </>
            ) : (
              <>
                <p className="text-stone-700 font-medium text-sm">Your research library is empty.</p>
                <p className="text-stone-400 text-xs mt-1">
                  Ingest academic publications via Crossref DOI lookup or enter bibliographic records manually.
                </p>
                <Link
                  to="/import"
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-stone-50 rounded-md text-xs font-medium hover:bg-stone-800 transition-colors"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>Import Your First Paper</span>
                </Link>
              </>
            )}
          </div>
        ) : (
          displayedPapers.map((paper) => {
            const paperId = paper.id || paper._id;
            const paperCollections = collections.filter(
              (c) =>
                Array.isArray(c.papers) &&
                c.papers.some((p) => {
                  const pId = typeof p === 'string' ? p : p?.id || p?._id;
                  return pId === paperId;
                })
            );

            return (
              <article
                key={paperId}
                className="bg-white p-5 rounded-lg border border-stone-200/90 shadow-2xs hover:border-stone-300 hover:shadow-xs transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="font-serif text-lg font-semibold text-stone-900 group-hover:text-stone-700 leading-snug">
                      <Link to={`/library/${paperId}`} className="hover:underline">
                        {paper.title}
                      </Link>
                    </h2>
                    {paper.year && (
                      <span className="text-xs font-mono text-stone-400 shrink-0 mt-0.5">
                        {paper.year}
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-medium text-stone-600 mt-1.5">
                    {Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors}
                  </p>

                  {paper.venue && (
                    <p className="text-xs text-stone-400 italic mt-0.5">
                      {paper.venue}
                    </p>
                  )}

                  {paper.abstract && (
                    <p className="text-xs text-stone-600 leading-relaxed mt-2.5 line-clamp-2 text-justify">
                      {paper.abstract}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {paper.tags?.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                          selectedTag === tag
                            ? 'bg-stone-900 text-stone-50'
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                    {paperCollections.map((col) => (
                      <span
                        key={col.id || col._id}
                        className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/60 rounded text-[11px] font-medium"
                      >
                        {col.name}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    {paper.doi && (
                      <span className="font-mono text-[11px] text-stone-400">
                        DOI: {paper.doi}
                      </span>
                    )}
                    <Link
                      to={`/library/${paper.id}`}
                      className="text-stone-700 hover:text-stone-950 font-medium inline-flex items-center gap-1"
                    >
                      <span>Read Summary</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-stone-200 text-xs font-mono">
          <button
            type="button"
            disabled={pagination.page <= 1 || papersLoading}
            onClick={() => handlePageChange(pagination.page - 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-white text-stone-700 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Previous</span>
          </button>

          <span className="text-stone-500">
            Page {pagination.page} of {pagination.totalPages}
          </span>

          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages || papersLoading}
            onClick={() => handlePageChange(pagination.page + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-stone-200 bg-white hover:bg-stone-50 disabled:opacity-40 disabled:hover:bg-white text-stone-700 transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
