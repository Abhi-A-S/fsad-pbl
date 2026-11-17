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
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';
import { paperApi } from '../services/paperApi.js';

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

  const assignedCollections = collections.filter((c) => paper.collections?.includes(c.id));

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
              onClick={() => setShowCollectionModal(true)}
              className="inline-flex items-center gap-1.5 text-xs text-stone-700 hover:text-stone-950 font-medium px-2.5 py-1 bg-stone-100 rounded-md hover:bg-stone-200 transition-colors"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>Manage Collections</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {assignedCollections.length === 0 ? (
              <span className="text-xs text-stone-400 italic">Not assigned to any collections yet.</span>
            ) : (
              assignedCollections.map((col) => (
                <div
                  key={col.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50/80 text-amber-900 border border-amber-200/80 rounded-md text-xs font-medium"
                >
                  <span>{col.name}</span>
                  <button
                    onClick={() => removePaperFromCollection(paper.id, col.id)}
                    className="hover:text-amber-700 p-0.5 rounded"
                    title="Remove from collection"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
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
                onClick={() => setShowCollectionModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-stone-500">
              Select the collections this publication belongs to:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {collections.map((col) => {
                const isAssigned = paper.collections?.includes(col.id);
                return (
                  <button
                    key={col.id}
                    onClick={() => {
                      if (isAssigned) {
                        removePaperFromCollection(paper.id, col.id);
                      } else {
                        addPaperToCollection(paper.id, col.id);
                      }
                    }}
                    className={`w-full text-left p-3 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                      isAssigned
                        ? 'border-amber-300 bg-amber-50/60 text-amber-900 font-medium'
                        : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                    }`}
                  >
                    <div>
                      <span className="block font-medium">{col.name}</span>
                      <span className="text-[11px] text-stone-400 block mt-0.5 line-clamp-1">
                        {col.description}
                      </span>
                    </div>
                    {isAssigned && <Check className="h-4 w-4 text-amber-800 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-3 border-t border-stone-100">
              <button
                onClick={() => setShowCollectionModal(false)}
                className="px-4 py-2 bg-stone-900 text-stone-100 rounded-md text-xs font-medium"
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
