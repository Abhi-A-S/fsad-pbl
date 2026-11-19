import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  BookOpen,
  FolderPlus,
  Check,
  X,
  Loader2,
  AlertCircle,
  Trash2,
  Sparkles,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';
import { paperApi } from '../services/paperApi.js';

const FIELD_LABELS = {
  abstract: 'Abstract',
  venue: 'Venue / Journal',
  year: 'Publication Year',
  publicationDate: 'Publication Date',
  publisher: 'Publisher',
  url: 'Landing URL',
  doi: 'DOI',
  authors: 'Authors',
};

function formatFieldValue(val) {
  if (val === null || val === undefined || val === '') {
    return <span className="text-stone-400 italic font-sans">(Not recorded)</span>;
  }
  if (Array.isArray(val)) {
    return val.join(', ');
  }
  return String(val);
}

export default function PaperDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    collections,
    addPaperToCollection,
    removePaperFromCollection,
    deletePaper,
  } = useLibrary();

  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isNotFound, setIsNotFound] = useState(false);

  // Delete modal / state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Collection modal state
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [togglingColId, setTogglingColId] = useState(null);
  const [removingCollectionId, setRemovingCollectionId] = useState(null);
  const [collectionModalError, setCollectionModalError] = useState(null);
  const [collectionActionError, setCollectionActionError] = useState(null);

  // Metadata enrichment state
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState(null); // 'ready' | 'ambiguous' | 'not_found' | 'error' | null
  const [enrichError, setEnrichError] = useState(null);
  const [enrichSuccess, setEnrichSuccess] = useState(null);
  const [enrichMessage, setEnrichMessage] = useState(null);
  const [matchedWork, setMatchedWork] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedFields, setSelectedFields] = useState({});
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);

  // Request enrichment suggestions from OpenAlex (GET /api/papers/:id/enrich-suggestions)
  const handleStartEnrichment = async (openAlexId = null) => {
    if (!paper?.id || enrichLoading || isApplying) return;

    setEnrichOpen(true);
    setEnrichLoading(true);
    setEnrichError(null);
    setEnrichSuccess(null);
    setEnrichMessage(null);
    setApplyError(null);

    try {
      const data = await paperApi.getEnrichSuggestions(paper.id, openAlexId);
      setEnrichStatus(data.status);

      if (data.status === 'ready') {
        setMatchedWork(data.matchedWork || null);
        const suggList = Array.isArray(data.suggestions) ? data.suggestions : [];
        setSuggestions(suggList);

        // Pre-select 'add' items; strictly leave 'update' unchecked
        // (Ensures destructive overwrites and author alterations require explicit opt-in)
        const initialSelection = {};
        suggList.forEach((s) => {
          initialSelection[s.field] = s.type === 'add';
        });
        setSelectedFields(initialSelection);
      } else if (data.status === 'ambiguous') {
        setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
      } else if (data.status === 'not_found') {
        setEnrichMessage(data.message || 'No matching publication found in OpenAlex.');
      }
    } catch (err) {
      setEnrichStatus('error');
      setEnrichError(err.message || 'Failed to retrieve enrichment suggestions from OpenAlex.');
    } finally {
      setEnrichLoading(false);
    }
  };

  const handleSelectCandidate = (openAlexId) => {
    handleStartEnrichment(openAlexId);
  };

  const handleToggleField = (field) => {
    setSelectedFields((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleApplyChanges = async () => {
    if (!paper?.id || isApplying) return;

    const fieldsToApply = suggestions.filter((s) => selectedFields[s.field]);
    if (fieldsToApply.length === 0) return;

    setIsApplying(true);
    setApplyError(null);

    const updatePayload = {};
    for (const s of fieldsToApply) {
      updatePayload[s.field] = s.suggestedValue;
    }

    try {
      const res = await paperApi.updatePaper(paper.id, updatePayload);
      if (res?.paper) {
        setPaper(res.paper);
      }
      setEnrichSuccess('Metadata successfully enriched and saved to your library.');
      setEnrichOpen(false);
      setEnrichStatus(null);
      setSuggestions([]);
      setMatchedWork(null);
      setCandidates([]);
      setSelectedFields({});
    } catch (err) {
      setApplyError(err.message || 'Failed to apply metadata changes.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleCloseEnrichment = () => {
    setEnrichOpen(false);
    setEnrichStatus(null);
    setEnrichError(null);
    setEnrichMessage(null);
    setMatchedWork(null);
    setSuggestions([]);
    setCandidates([]);
    setSelectedFields({});
    setApplyError(null);
  };

  // Fetch paper details directly from MongoDB backend (GET /api/papers/:id)
  useEffect(() => {
    let isMounted = true;

    async function fetchPaperDetails() {
      if (!id) return;
      setLoading(true);
      setError(null);
      setIsNotFound(false);

      try {
        const result = await paperApi.getPaper(id);
        if (isMounted) {
          setPaper(result.paper);
        }
      } catch (err) {
        if (isMounted) {
          if (err.status === 404) {
            setIsNotFound(true);
          } else {
            setError(err.message || 'Failed to load publication record.');
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchPaperDetails();

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Handle Paper Deletion (DELETE /api/papers/:id)
  const handleDeletePaper = async () => {
    if (!paper?.id || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deletePaper(paper.id);
      navigate('/library', { replace: true });
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete publication from library.');
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center bg-white rounded-xl border border-stone-200">
        <Loader2 className="h-7 w-7 text-stone-400 animate-spin mx-auto mb-3" />
        <h2 className="font-serif text-lg font-semibold text-stone-800">
          Loading Publication Record
        </h2>
        <p className="text-xs text-stone-400 mt-1">Retrieving metadata from MongoDB...</p>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="p-12 text-center bg-white rounded-lg border border-stone-200 max-w-lg mx-auto">
        <BookOpen className="h-8 w-8 text-stone-300 mx-auto mb-3" />
        <h2 className="font-serif text-xl font-semibold text-stone-800">Publication Not Found</h2>
        <p className="text-sm text-stone-500 mt-2">
          The requested paper record does not exist in your library or was deleted.
        </p>
        <button
          onClick={() => navigate('/library')}
          className="mt-4 px-4 py-2 bg-stone-900 text-stone-100 rounded-md text-xs font-medium hover:bg-stone-800 transition-colors"
        >
          Return to Library
        </button>
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="p-8 text-center bg-white rounded-lg border border-red-200 max-w-lg mx-auto">
        <AlertCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
        <h2 className="font-serif text-lg font-semibold text-stone-800">Error Loading Publication</h2>
        <p className="text-xs text-red-600 mt-1">{error || 'An unexpected error occurred.'}</p>
        <button
          onClick={() => navigate('/library')}
          className="mt-4 px-4 py-2 bg-stone-900 text-stone-100 rounded-md text-xs font-medium hover:bg-stone-800 transition-colors"
        >
          Return to Library
        </button>
      </div>
    );
  }

  const assignedCollections = collections.filter(
    (col) =>
      Array.isArray(col.papers) &&
      col.papers.some((p) => {
        const pId = typeof p === 'string' ? p : p.id || p._id;
        return pId === paper?.id;
      })
  );

  const handleRemoveFromCollection = async (collectionId) => {
    if (!paper) return;
    setRemovingCollectionId(collectionId);
    setCollectionActionError(null);
    try {
      await removePaperFromCollection(collectionId, paper.id);
    } catch (err) {
      setCollectionActionError(err.message || 'Failed to remove from collection');
    } finally {
      setRemovingCollectionId(null);
    }
  };

  const handleToggleCollection = async (colId, isCurrentlyAssigned) => {
    if (!paper) return;
    setTogglingColId(colId);
    setCollectionModalError(null);
    try {
      if (isCurrentlyAssigned) {
        await removePaperFromCollection(colId, paper.id);
      } else {
        await addPaperToCollection(colId, paper.id);
      }
    } catch (err) {
      setCollectionModalError(err.message || 'Failed to update collection assignment');
    } finally {
      setTogglingColId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back link */}
      <div>
        <Link
          to="/library"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-stone-500 hover:text-stone-800 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Library</span>
        </Link>
      </div>

      {/* Main Paper Content Card */}
      <article className="bg-white p-8 rounded-xl border border-stone-200/90 shadow-xs space-y-6">
        {/* Title & Metadata Header */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {paper.year && (
              <span className="font-mono text-xs px-2 py-0.5 bg-stone-100 text-stone-700 rounded font-medium">
                {paper.year}
              </span>
            )}
            {paper.doi && (
              <span className="font-mono text-xs text-stone-500">
                DOI: {paper.doi}
              </span>
            )}
            {paper.publicationDate && (
              <span className="font-mono text-xs text-stone-400">
                Published: {new Date(paper.publicationDate).toLocaleDateString()}
              </span>
            )}
          </div>

          <h1 className="font-serif text-2xl md:text-3xl font-semibold text-stone-950 leading-tight">
            {paper.title}
          </h1>

          <div className="text-sm font-medium text-stone-700">
            {Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
            {paper.venue && (
              <span className="italic">
                Published in: {paper.venue}
              </span>
            )}
            {paper.publisher && (
              <span>
                Publisher: {paper.publisher}
              </span>
            )}
          </div>
        </div>

        {/* Enrichment Success Banner */}
        {enrichSuccess && (
          <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{enrichSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setEnrichSuccess(null)}
              className="text-emerald-700 hover:text-emerald-950 p-0.5"
              title="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Inline Metadata Enrichment Panel */}
        {enrichOpen && (
          <section aria-label="Metadata Enrichment Panel" className="p-5 bg-stone-50 rounded-xl border border-stone-200/90 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200/60 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-mono uppercase tracking-wider text-stone-700 font-semibold">
                  OpenAlex Metadata Enrichment
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCloseEnrichment}
                disabled={isApplying}
                className="text-stone-400 hover:text-stone-600 p-1 rounded"
                title="Close enrichment panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Loading State */}
            {enrichLoading && (
              <div className="py-8 text-center space-y-2">
                <Loader2 className="h-6 w-6 text-amber-600 animate-spin mx-auto" />
                <p className="text-xs font-medium text-stone-700">Connecting to OpenAlex...</p>
                <p className="text-[11px] text-stone-400">Searching and diffing publication metadata</p>
              </div>
            )}

            {/* Error State */}
            {!enrichLoading && enrichStatus === 'error' && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-red-900">Unable to retrieve enrichment suggestions</p>
                    <p className="text-xs text-red-700">{enrichError}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleStartEnrichment()}
                    className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-100 rounded text-xs font-medium transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseEnrichment}
                    className="px-3 py-1.5 border border-stone-300 hover:bg-stone-100 text-stone-700 rounded text-xs font-medium transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Not Found State */}
            {!enrichLoading && enrichStatus === 'not_found' && (
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg space-y-3">
                <div className="flex items-start gap-2.5">
                  <HelpCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-amber-900">No Matching Publication Found</p>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      {enrichMessage || 'OpenAlex did not return any records matching this paper’s title or DOI.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleStartEnrichment()}
                    className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-100 rounded text-xs font-medium transition-colors"
                  >
                    Retry Search
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseEnrichment}
                    className="px-3 py-1.5 border border-stone-300 hover:bg-stone-100 text-stone-700 rounded text-xs font-medium transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Ambiguous Candidates State */}
            {!enrichLoading && enrichStatus === 'ambiguous' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-stone-900">
                    Multiple Matching Publications Found
                  </h3>
                  <p className="text-xs text-stone-500">
                    Please select the OpenAlex publication that corresponds to your paper to review its suggestions:
                  </p>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {candidates.map((cand) => (
                    <div
                      key={cand.id || cand.openAlexId}
                      className="p-3 bg-white rounded-lg border border-stone-200 hover:border-amber-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 flex-1">
                        <h4 className="text-xs font-semibold text-stone-900 leading-snug">
                          {cand.title}
                        </h4>
                        <p className="text-xs text-stone-600">
                          {Array.isArray(cand.authors) ? cand.authors.join(', ') : cand.authors || 'Unknown authors'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-400 font-mono">
                          {cand.year && <span>{cand.year}</span>}
                          {cand.venue && <span>• {cand.venue}</span>}
                          {cand.openAlexId && <span>• {cand.openAlexId}</span>}
                          {cand.doi && <span>• DOI: {cand.doi}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectCandidate(cand.openAlexId)}
                        className="shrink-0 self-start md:self-center px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-100 rounded text-xs font-medium transition-colors"
                      >
                        Select Candidate
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ready Suggestions State */}
            {!enrichLoading && enrichStatus === 'ready' && (
              <div className="space-y-4">
                {/* Matched Work Summary */}
                {matchedWork && (
                  <div className="p-3 bg-white rounded-lg border border-stone-200/80 text-xs space-y-1">
                    <div className="flex items-center justify-between text-stone-500 text-[11px] font-mono">
                      <span>Matched Work: {matchedWork.openAlexId || matchedWork.id}</span>
                      {matchedWork.year && <span>{matchedWork.year}</span>}
                    </div>
                    <div className="font-medium text-stone-900">{matchedWork.title}</div>
                    {matchedWork.venue && <div className="text-stone-500 italic text-[11px]">{matchedWork.venue}</div>}
                  </div>
                )}

                {suggestions.length === 0 ? (
                  <div className="p-4 bg-white rounded-lg border border-stone-200 text-center space-y-2">
                    <p className="text-xs font-medium text-stone-800">
                      Your paper already contains all available metadata matching this publication.
                    </p>
                    <p className="text-xs text-stone-500">No new fields or alternative values to suggest.</p>
                    <button
                      type="button"
                      onClick={handleCloseEnrichment}
                      className="mt-2 px-3 py-1.5 border border-stone-200 hover:bg-stone-50 rounded text-xs font-medium text-stone-700"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-stone-900">
                          Proposed Metadata Changes ({suggestions.length})
                        </h3>
                        <span className="text-[11px] font-mono text-stone-400">
                          {Object.values(selectedFields).filter(Boolean).length} selected
                        </span>
                      </div>
                      <p className="text-xs text-stone-500">
                        Select which fields to apply. Existing metadata is never overwritten without your explicit selection.
                      </p>
                    </div>

                    {applyError && (
                      <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                        <span>{applyError}</span>
                      </div>
                    )}

                    <div className="space-y-2.5">
                      {suggestions.map((s) => {
                        const isSelected = Boolean(selectedFields[s.field]);
                        const isAdd = s.type === 'add';

                        return (
                          <label
                            key={s.field}
                            htmlFor={`enrich-field-${s.field}`}
                            className={`block p-3.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-white border-amber-400 shadow-xs ring-1 ring-amber-300'
                                : 'bg-white/70 border-stone-200 hover:border-stone-300'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                id={`enrich-field-${s.field}`}
                                checked={isSelected}
                                onChange={() => handleToggleField(s.field)}
                                disabled={isApplying}
                                className="mt-1 h-4 w-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300 cursor-pointer"
                              />
                              <div className="flex-1 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-stone-900">
                                    {FIELD_LABELS[s.field] || s.field}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                      isAdd
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                                    }`}
                                  >
                                    {isAdd ? 'New Addition' : 'Update / Alternative'}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-stone-100 text-xs">
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] uppercase font-mono text-stone-400 font-semibold block">
                                      Current Value
                                    </span>
                                    <div className="text-stone-600">
                                      {formatFieldValue(s.currentValue)}
                                    </div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] uppercase font-mono text-stone-400 font-semibold block">
                                      Proposed Value
                                    </span>
                                    <div className="text-stone-900 font-medium">
                                      {formatFieldValue(s.suggestedValue)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200/70">
                      <button
                        type="button"
                        onClick={handleCloseEnrichment}
                        disabled={isApplying}
                        className="px-3.5 py-1.5 border border-stone-200 bg-white hover:bg-stone-50 rounded-md text-xs font-medium text-stone-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyChanges}
                        disabled={isApplying || Object.values(selectedFields).filter(Boolean).length === 0}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-stone-100 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {isApplying ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Applying Changes...</span>
                          </>
                        ) : (
                          <span>
                            Apply {Object.values(selectedFields).filter(Boolean).length} Selected Change
                            {Object.values(selectedFields).filter(Boolean).length === 1 ? '' : 's'}
                          </span>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {/* Abstract */}
        <div className="pt-4 border-t border-stone-100">
          <h2 className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold mb-2">
            Abstract
          </h2>
          <p className="text-sm text-stone-800 font-serif leading-relaxed text-justify bg-stone-50/70 p-5 rounded-lg border border-stone-200/50">
            {paper.abstract || 'No abstract recorded for this publication.'}
          </p>
        </div>

        {/* Tags */}
        {paper.tags && paper.tags.length > 0 && (
          <div className="pt-2">
            <h3 className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold mb-2">
              Keywords & Tags
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {paper.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 bg-stone-100 text-stone-700 rounded-md text-xs font-mono"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Collections Assignment Section */}
        <div className="pt-4 border-t border-stone-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold">
              Assigned Collections
            </h3>
            <button
              onClick={() => {
                setCollectionActionError(null);
                setShowCollectionModal(true);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-stone-700 hover:text-stone-950 font-medium px-2.5 py-1 bg-stone-100 rounded-md hover:bg-stone-200 transition-colors"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>Manage Collections</span>
            </button>
          </div>

          {collectionActionError && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-md flex items-center justify-between text-xs text-red-700">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{collectionActionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setCollectionActionError(null)}
                className="text-red-500 hover:text-red-700 p-0.5"
                title="Dismiss error"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {assignedCollections.length === 0 ? (
              <span className="text-xs text-stone-400 italic">Not assigned to any collections yet.</span>
            ) : (
              assignedCollections.map((col) => {
                const colId = col.id || col._id;
                return (
                  <div
                    key={colId}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50/80 text-amber-900 border border-amber-200/80 rounded-md text-xs font-medium"
                  >
                    <span>{col.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCollection(colId)}
                      disabled={removingCollectionId === colId}
                      className="hover:text-amber-700 p-0.5 rounded transition-colors disabled:opacity-50"
                      title="Remove from collection"
                    >
                      {removingCollectionId === colId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Actions & Links */}
        <div className="pt-6 border-t border-stone-200/80 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs font-mono text-stone-400">
            Recorded in MongoDB: {new Date(paper.createdAt || paper.addedAt || Date.now()).toLocaleDateString()}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleStartEnrichment()}
              disabled={enrichLoading || isApplying}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-stone-700 hover:text-stone-900 border border-stone-200 hover:border-amber-300 hover:bg-amber-50/40 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
            >
              {enrichLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              )}
              <span>Enrich Metadata</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-stone-600 hover:text-red-700 border border-stone-200 hover:border-red-200 hover:bg-red-50/50 rounded-md text-xs font-medium transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Paper</span>
            </button>

            {paper.url && (
              <a
                href={paper.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-stone-100 rounded-md text-xs font-medium hover:bg-stone-800 transition-colors"
              >
                <span>View Original Source</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </article>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold text-stone-900">
                Delete Publication
              </h3>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to delete <strong className="font-medium text-stone-900">"{paper.title}"</strong> from your library? This will permanently remove the record from MongoDB.
            </p>

            {deleteError && (
              <div className="p-2.5 bg-red-50 text-red-700 rounded-md text-xs flex items-center gap-2 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-3 py-1.5 border border-stone-200 bg-white hover:bg-stone-50 rounded-md text-xs font-medium text-stone-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePaper}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collection Modal */}
      {showCollectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold text-stone-900">
                Organize Collections
              </h3>
              <button
                type="button"
                onClick={() => setShowCollectionModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-stone-500">
              Select the collections this publication belongs to:
            </p>

            {collectionModalError && (
              <div className="p-2.5 bg-red-50 text-red-700 rounded-md text-xs flex items-center gap-2 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{collectionModalError}</span>
              </div>
            )}

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {collections.length === 0 ? (
                <div className="p-6 text-center bg-stone-50 rounded-lg border border-dashed border-stone-200 text-xs text-stone-500">
                  <p>No research collections created yet.</p>
                  <Link
                    to="/collections"
                    className="mt-2 inline-block font-medium text-stone-900 underline hover:text-stone-700"
                  >
                    Go to Collections to create one
                  </Link>
                </div>
              ) : (
                collections.map((col) => {
                  const colId = col.id || col._id;
                  const isAssigned =
                    Array.isArray(col.papers) &&
                    col.papers.some((p) => {
                      const pId = typeof p === 'string' ? p : p.id || p._id;
                      return pId === paper?.id;
                    });
                  const isToggling = togglingColId === colId;

                  return (
                    <button
                      key={colId}
                      type="button"
                      disabled={isToggling}
                      onClick={() => handleToggleCollection(colId, isAssigned)}
                      className={`w-full text-left p-3 rounded-lg border text-xs flex items-center justify-between transition-colors disabled:opacity-60 ${
                        isAssigned
                          ? 'border-amber-300 bg-amber-50/60 text-amber-900 font-medium'
                          : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                      }`}
                    >
                      <div>
                        <span className="block font-medium">{col.name}</span>
                        <span className="text-[11px] text-stone-400 block mt-0.5 line-clamp-1">
                          {col.description || 'No description provided.'}
                        </span>
                      </div>
                      <div className="shrink-0 ml-3">
                        {isToggling ? (
                          <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
                        ) : isAssigned ? (
                          <Check className="h-4 w-4 text-amber-800" />
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowCollectionModal(false)}
                className="px-4 py-2 bg-stone-900 text-stone-100 rounded-md text-xs font-medium hover:bg-stone-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
