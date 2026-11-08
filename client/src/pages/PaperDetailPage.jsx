import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Calendar, BookOpen, FolderPlus, Tag, Check, X } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';

export default function PaperDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { papers, collections, addPaperToCollection, removePaperFromCollection } = useLibrary();

  const paper = papers.find((p) => p.id === id);
  const [showCollectionModal, setShowCollectionModal] = useState(false);

  if (!paper) {
    return (
      <div className="p-12 text-center bg-white rounded-lg border border-stone-200">
        <h2 className="font-serif text-xl font-semibold text-stone-800">Publication Not Found</h2>
        <p className="text-sm text-stone-500 mt-2">The requested paper record does not exist in local state.</p>
        <button
          onClick={() => navigate('/library')}
          className="mt-4 px-4 py-2 bg-stone-900 text-stone-100 rounded-md text-xs font-medium"
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
          </div>

          <h1 className="font-serif text-2xl md:text-3xl font-semibold text-stone-950 leading-tight">
            {paper.title}
          </h1>

          <div className="text-sm font-medium text-stone-700">
            {paper.authors.join(', ')}
          </div>

          {paper.venue && (
            <div className="text-xs text-stone-500 italic">
              Published in: {paper.venue}
            </div>
          )}
        </div>

        {/* Abstract */}
        <div className="pt-4 border-t border-stone-100">
          <h2 className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold mb-2">
            Abstract
          </h2>
          <p className="text-sm text-stone-800 font-serif leading-relaxed text-justify bg-stone-50/70 p-5 rounded-lg border border-stone-200/50">
            {paper.abstract || "No abstract recorded for this publication."}
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
        <div className="pt-6 border-t border-stone-200/80 flex items-center justify-between">
          <div className="text-xs font-mono text-stone-400">
            Recorded in local mock state: {new Date(paper.addedAt).toLocaleDateString()}
          </div>
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
      </article>

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

