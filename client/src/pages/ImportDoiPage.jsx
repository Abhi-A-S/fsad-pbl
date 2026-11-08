import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CheckCircle2, AlertCircle, Save, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';

export default function ImportDoiPage() {
  const navigate = useNavigate();
  const { lookupDoi, addPaper, checkDuplicateDoi, collections } = useLibrary();

  const [doiInput, setDoiInput] = useState('10.1038/nature14539');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleLookup = async (e) => {
    e.preventDefault();
    if (!doiInput.trim()) return;

    setError('');
    setSavedSuccess(false);

    if (checkDuplicateDoi(doiInput)) {
      setError(`Notice: DOI "${doiInput}" already exists in your library.`);
      return;
    }

    setLoading(true);
    try {
      const res = await lookupDoi(doiInput);
      if (res.success) {
        setMetadata(res.data);
      } else {
        setError('DOI lookup failed. Please verify the DOI or enter manually.');
      }
    } catch (err) {
      setError('An error occurred during metadata resolution.');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setMetadata((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAuthorsChange = (value) => {
    setMetadata((prev) => ({
      ...prev,
      authors: value.split(',').map((a) => a.trim()).filter(Boolean),
    }));
  };

  const handleTagsChange = (value) => {
    setMetadata((prev) => ({
      ...prev,
      tags: value.split(',').map((t) => t.trim()).filter(Boolean),
    }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!metadata || !metadata.title) return;

    if (checkDuplicateDoi(metadata.doi)) {
      setError('This DOI is already present in your library.');
      return;
    }

    const saved = addPaper({
      ...metadata,
      collections: selectedCollections,
    });

    setSavedSuccess(true);
    setTimeout(() => {
      navigate(`/library/${saved.id}`);
    }, 1000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="border-b border-stone-200 pb-5">
        <h1 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight text-stone-900">
          Publication Ingestion & DOI Import
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Resolve scholarly metadata automatically via DOI lookup, review extracted bibliographic fields, and catalog to your library.
        </p>
      </div>

      {/* Mock notice card */}
      <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-start gap-3 text-xs text-amber-900">
        <Sparkles className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block">Interactive DOI Resolution Preview</span>
          <span>
            In this Demo MVP frontend, try sample DOIs <code className="font-mono font-medium px-1 bg-amber-100/60 rounded">10.1038/nature14539</code> or <code className="font-mono font-medium px-1 bg-amber-100/60 rounded">10.1145/3065386</code> (or any arbitrary DOI) to test metadata parsing, live field editing, and duplicate validation.
          </span>
        </div>
      </div>

      {/* DOI Input Form */}
      <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs space-y-4">
        <form onSubmit={handleLookup} className="space-y-3">
          <label className="block text-xs font-mono uppercase text-stone-500 font-semibold">
            Digital Object Identifier (DOI)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                required
                value={doiInput}
                onChange={(e) => setDoiInput(e.target.value)}
                placeholder="10.xxxx/xxxxx"
                className="w-full px-3.5 py-2 text-sm font-mono bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 focus:bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-stone-900 text-stone-50 text-xs font-medium rounded-md hover:bg-stone-800 disabled:opacity-50 transition-colors inline-flex items-center gap-2 shrink-0 shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Resolving...</span>
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" />
                  <span>Lookup Metadata</span>
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md text-xs flex items-center gap-2 border border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Metadata Review & Edit Form */}
      {metadata && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h2 className="font-serif text-lg font-semibold text-stone-900">
                Bibliographic Metadata Verification
              </h2>
              <p className="text-xs text-stone-500">
                Review and modify resolved values prior to persistent cataloging.
              </p>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
              Ready for Review
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                Publication Title *
              </label>
              <input
                type="text"
                required
                value={metadata.title || ''}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 font-serif font-medium"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Authors (comma-separated) *
                </label>
                <input
                  type="text"
                  required
                  value={metadata.authors ? metadata.authors.join(', ') : ''}
                  onChange={(e) => handleAuthorsChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Publication Year
                </label>
                <input
                  type="number"
                  value={metadata.year || ''}
                  onChange={(e) => handleFieldChange('year', parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 text-sm font-mono bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Journal / Venue
                </label>
                <input
                  type="text"
                  value={metadata.venue || ''}
                  onChange={(e) => handleFieldChange('venue', e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Canonical URL
                </label>
                <input
                  type="url"
                  value={metadata.url || ''}
                  onChange={(e) => handleFieldChange('url', e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                Abstract
              </label>
              <textarea
                rows={4}
                value={metadata.abstract || ''}
                onChange={(e) => handleFieldChange('abstract', e.target.value)}
                placeholder="Enter or paste paper abstract..."
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 font-serif leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                Tags & Topic Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={metadata.tags ? metadata.tags.join(', ') : ''}
                onChange={(e) => handleTagsChange(e.target.value)}
                placeholder="Deep Learning, NLP, Architecture"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
            </div>

            {/* Collection assignment on import */}
            <div>
              <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                Assign to Initial Collection
              </label>
              <div className="flex flex-wrap gap-2">
                {collections.map((col) => {
                  const isChecked = selectedCollections.includes(col.id);
                  return (
                    <button
                      type="button"
                      key={col.id}
                      onClick={() => {
                        setSelectedCollections((prev) =>
                          isChecked ? prev.filter((id) => id !== col.id) : [...prev, col.id]
                        );
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                        isChecked
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {col.name} {isChecked && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
            <span className="text-xs text-stone-400 font-mono">
              DOI: {metadata.doi}
            </span>
            <button
              type="submit"
              disabled={savedSuccess}
              className="px-5 py-2.5 bg-stone-900 text-stone-50 text-xs font-medium rounded-md hover:bg-stone-800 transition-colors inline-flex items-center gap-2 shadow-xs"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Added to Library!</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Confirm & Save to Library</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

