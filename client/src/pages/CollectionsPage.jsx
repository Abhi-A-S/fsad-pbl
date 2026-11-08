import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FolderKanban, Plus, BookOpen, Trash2, ArrowRight } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';

export default function CollectionsPage() {
  const { collections, papers, createCollection } = useLibrary();
  const { id: activeColId } = useParams();

  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    createCollection(newColName.trim(), newColDesc.trim());
    setNewColName('');
    setNewColDesc('');
    setShowCreateModal(false);
  };

  const selectedCollection = collections.find((c) => c.id === activeColId);

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
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-stone-900 text-stone-50 text-xs font-medium hover:bg-stone-800 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>New Collection</span>
          </button>
        </div>
      </div>

      {/* Collections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {collections.map((col) => {
          const colPapers = papers.filter((p) => p.collections?.includes(col.id));
          const isActive = activeColId === col.id;

          return (
            <div
              key={col.id}
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
                    {colPapers.length} {colPapers.length === 1 ? 'paper' : 'papers'}
                  </span>
                </div>

                <h3 className="font-serif text-base font-semibold text-stone-900">
                  {col.name}
                </h3>
                <p className="text-xs text-stone-500 mt-1.5 leading-relaxed line-clamp-2">
                  {col.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                <span className="font-mono text-[10px] text-stone-400">
                  Created {new Date(col.createdAt).toLocaleDateString()}
                </span>
                <Link
                  to={`/collections/${col.id}`}
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

      {/* Selected Collection View */}
      {selectedCollection && (
        <div className="mt-8 pt-6 border-t border-stone-200 space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="font-serif text-xl font-semibold text-stone-900">
                Collection: {selectedCollection.name}
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">{selectedCollection.description}</p>
            </div>
            <Link
              to="/collections"
              className="text-xs font-mono text-stone-400 hover:text-stone-700"
            >
              Close Detail
            </Link>
          </div>

          <div className="space-y-2">
            {papers.filter((p) => p.collections?.includes(selectedCollection.id)).length === 0 ? (
              <div className="p-8 text-center bg-white rounded-lg border border-dashed border-stone-200 text-xs text-stone-400">
                No publications currently added to this collection. Navigate to Library to assign papers.
              </div>
            ) : (
              papers
                .filter((p) => p.collections?.includes(selectedCollection.id))
                .map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-white rounded-lg border border-stone-200 flex items-center justify-between gap-4"
                  >
                    <div>
                      <Link
                        to={`/library/${p.id}`}
                        className="font-serif text-sm font-semibold text-stone-900 hover:underline"
                      >
                        {p.title}
                      </Link>
                      <p className="text-xs text-stone-500">{p.authors.join(', ')} ({p.year})</p>
                    </div>
                    <Link
                      to={`/library/${p.id}`}
                      className="text-xs text-stone-600 hover:text-stone-900 font-medium shrink-0"
                    >
                      Open
                    </Link>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* Create Collection Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <h3 className="font-serif text-lg font-semibold text-stone-900">
              Create New Research Collection
            </h3>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Collection Name *
                </label>
                <input
                  type="text"
                  required
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="e.g. LLM Reasoning Benchmarks"
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  placeholder="Thematic scope and objectives for this collection..."
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-stone-200 rounded-md text-xs font-medium text-stone-600 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-900 text-stone-100 rounded-md text-xs font-medium hover:bg-stone-800"
                >
                  Create Collection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

