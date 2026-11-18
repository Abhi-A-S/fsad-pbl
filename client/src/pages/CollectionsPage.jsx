import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  BookOpen,
  Trash2,
  ArrowRight,
  Loader2,
  AlertCircle,
  X,
  RefreshCw,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';

export default function CollectionsPage() {
  const {
    collections,
    collectionsLoading,
    collectionsError,
    fetchCollections,
    createCollection,
    removePaperFromCollection,
  } = useLibrary();
  const { id: activeColId } = useParams();

  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingPaperId, setRemovingPaperId] = useState(null);
  const [removeError, setRemoveError] = useState(null);

  const handleOpenCreateModal = () => {
    setNewColName('');
    setNewColDesc('');
    setCreateError(null);
    setShowCreateModal(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const trimmedName = newColName.trim();
    if (!trimmedName) {
      setCreateError('Collection name is required');
      return;
    }
    if (trimmedName.length > 100) {
      setCreateError('Collection name cannot exceed 100 characters');
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);

    try {
      await createCollection(trimmedName, newColDesc.trim());
      setNewColName('');
      setNewColDesc('');
      setShowCreateModal(false);
    } catch (err) {
      setCreateError(err.message || 'Failed to create collection');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCollection = collections.find(
    (c) => c.id === activeColId || c._id === activeColId
  );

  const handleRemovePaper = async (paperId) => {
    if (!selectedCollection) return;
    setRemovingPaperId(paperId);
    setRemoveError(null);
    try {
      await removePaperFromCollection(selectedCollection.id, paperId);
    } catch (err) {
      setRemoveError(err.message || 'Failed to remove paper from collection');
    } finally {
      setRemovingPaperId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight text-stone-900">
            Research Collections
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Group, curate, and structure your papers into thematic research dossiers.
          </p>
        </div>
        <div>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-stone-900 text-stone-50 text-xs font-medium hover:bg-stone-800 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>New Collection</span>
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {collectionsError && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-red-800">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Error Loading Collections</p>
              <p className="mt-0.5 text-red-700">{collectionsError}</p>
            </div>
          </div>
          <button
            onClick={() => fetchCollections()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-800 bg-red-100 hover:bg-red-200 rounded transition-colors shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading State */}
      {collectionsLoading && collections.length === 0 && (
        <div className="p-16 text-center bg-white rounded-xl border border-stone-200 shadow-2xs">
          <Loader2 className="h-7 w-7 text-stone-400 animate-spin mx-auto mb-3" />
          <h2 className="font-serif text-lg font-semibold text-stone-800">
            Loading Research Collections
          </h2>
          <p className="text-xs text-stone-400 mt-1">Retrieving dossiers from MongoDB...</p>
        </div>
      )}

      {/* Empty State */}
      {!collectionsLoading && !collectionsError && collections.length === 0 && (
        <div className="p-16 text-center bg-white rounded-xl border border-dashed border-stone-300 shadow-2xs max-w-lg mx-auto">
          <FolderKanban className="h-10 w-10 text-stone-400 mx-auto mb-3" />
          <h2 className="font-serif text-xl font-semibold text-stone-900">
            No Research Collections Yet
          </h2>
          <p className="text-xs text-stone-500 mt-2 leading-relaxed">
            Organize your papers into thematic dossiers such as "LLM Reasoning", "Quantum Error
            Correction", or "Survey Papers".
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 text-xs font-medium rounded-md hover:bg-stone-800 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>Create Your First Collection</span>
          </button>
        </div>
      )}

      {/* Collections Grid */}
      {collections.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {collections.map((col) => {
            const paperCount = Array.isArray(col.papers) ? col.papers.length : 0;
            const isActive = activeColId === col.id || activeColId === col._id;

            return (
              <div
                key={col.id || col._id}
                className={`p-5 rounded-xl border transition-all flex flex-col justify-between ${
                  isActive
                    ? 'border-amber-400 bg-amber-50/30 shadow-xs'
                    : 'border-stone-200 bg-white hover:border-stone-300 shadow-2xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="h-7 w-7 rounded-md bg-amber-100 text-amber-900 flex items-center justify-center">
                      <FolderKanban className="h-4 w-4" />
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 bg-stone-100 text-stone-600 rounded">
                      {paperCount} {paperCount === 1 ? 'paper' : 'papers'}
                    </span>
                  </div>

                  <h3 className="font-serif text-base font-semibold text-stone-900">
                    {col.name}
                  </h3>
                  <p className="text-xs text-stone-500 mt-1.5 leading-relaxed line-clamp-2">
                    {col.description || 'No description provided.'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                  <span className="font-mono text-[10px] text-stone-400">
                    Created {new Date(col.createdAt).toLocaleDateString()}
                  </span>
                  <Link
                    to={`/collections/${col.id || col._id}`}
                    className="font-medium text-stone-800 hover:text-stone-950 inline-flex items-center gap-1"
                  >
                    <span>Explore</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Collection View */}
      {selectedCollection && (
        <div className="mt-8 pt-6 border-t border-stone-200 space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="font-serif text-xl font-semibold text-stone-900">
                Collection: {selectedCollection.name}
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                {selectedCollection.description || 'No description provided.'}
              </p>
            </div>
            <Link
              to="/collections"
              className="text-xs font-mono text-stone-400 hover:text-stone-700"
            >
              Close Detail
            </Link>
          </div>

          {removeError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start justify-between gap-2 text-xs text-red-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span>{removeError}</span>
              </div>
              <button
                type="button"
                onClick={() => setRemoveError(null)}
                className="text-red-500 hover:text-red-700 p-0.5"
                title="Dismiss error"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="space-y-2">
            {!Array.isArray(selectedCollection.papers) || selectedCollection.papers.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-lg border border-dashed border-stone-200 text-xs text-stone-400">
                No publications currently added to this collection. Navigate to Library to assign papers.
              </div>
            ) : (
              selectedCollection.papers.map((p) => {
                const paperId = typeof p === 'string' ? p : p.id || p._id;
                const isObject = typeof p === 'object' && p !== null;
                const title = isObject ? p.title : `Paper ID: ${paperId}`;
                const authorsFormatted =
                  isObject && Array.isArray(p.authors)
                    ? p.authors.join(', ')
                    : isObject && p.authors
                    ? p.authors
                    : '';
                const yearFormatted = isObject && p.year ? ` (${p.year})` : '';

                return (
                  <div
                    key={paperId}
                    className="p-3 bg-white rounded-lg border border-stone-200 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/library/${paperId}`}
                        className="font-serif text-sm font-semibold text-stone-900 hover:underline block truncate"
                      >
                        {title}
                      </Link>
                      {authorsFormatted && (
                        <p className="text-xs text-stone-500 truncate mt-0.5">
                          {authorsFormatted}
                          {yearFormatted}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => handleRemovePaper(paperId)}
                        disabled={removingPaperId === paperId}
                        className="text-xs text-stone-400 hover:text-red-700 p-1 rounded transition-colors disabled:opacity-50"
                        title="Remove from this collection"
                      >
                        {removingPaperId === paperId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <Link
                        to={`/library/${paperId}`}
                        className="text-xs text-stone-600 hover:text-stone-900 font-medium"
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Collection Not Found Fallback */}
      {activeColId && !selectedCollection && !collectionsLoading && collections.length > 0 && (
        <div className="mt-8 p-8 text-center bg-white rounded-xl border border-stone-200 max-w-md mx-auto">
          <FolderKanban className="h-8 w-8 text-stone-300 mx-auto mb-3" />
          <h2 className="font-serif text-lg font-semibold text-stone-800">
            Collection Not Found
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            The requested research dossier does not exist in your account.
          </p>
          <Link
            to="/collections"
            className="mt-4 inline-block px-4 py-2 bg-stone-900 text-stone-100 rounded-md text-xs font-medium hover:bg-stone-800 transition-colors"
          >
            Return to Collections
          </Link>
        </div>
      )}

      {/* Create Collection Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold text-stone-900">
                Create New Research Collection
              </h3>
              <button
                type="button"
                onClick={() => !isSubmitting && setShowCreateModal(false)}
                disabled={isSubmitting}
                className="text-stone-400 hover:text-stone-600 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2 text-xs text-red-800">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Collection Name *
                </label>
                <input
                  type="text"
                  required
                  disabled={isSubmitting}
                  maxLength={100}
                  value={newColName}
                  onChange={(e) => {
                    setNewColName(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  placeholder="e.g. LLM Reasoning Benchmarks"
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  disabled={isSubmitting}
                  maxLength={1000}
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  placeholder="Thematic scope and objectives for this collection..."
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 disabled:opacity-60"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-stone-200 rounded-md text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newColName.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-stone-100 rounded-md text-xs font-medium hover:bg-stone-800 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Collection</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
