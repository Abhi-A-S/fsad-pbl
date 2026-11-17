import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  FileText,
  Sparkles,
  Edit3,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';

export default function ImportDoiPage() {
  const navigate = useNavigate();
  const { lookupDoi, addPaper, checkDuplicateDoi, collections } = useLibrary();

  // Mode: 'doi' for DOI metadata lookup, 'manual' for direct manual entry
  const [entryMode, setEntryMode] = useState('doi');

  // DOI Lookup state
  const [doiInput, setDoiInput] = useState('10.1038/nature14539');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // Metadata form state
  const [metadata, setMetadata] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState([]);

  // Switch to Manual Entry mode
  const handleSwitchToManual = (initialDoi = '') => {
    setEntryMode('manual');
    setLookupError('');
    setSaveError('');
    setSavedSuccess(false);
    setMetadata({
      title: '',
      authors: [],
      abstract: '',
      doi: initialDoi || '',
      year: '',
      publicationDate: '',
      venue: '',
      publisher: '',
      url: '',
      tags: [],
    });
  };

  // Switch back to DOI Lookup mode
  const handleSwitchToDoi = () => {
    setEntryMode('doi');
    setSaveError('');
    setSavedSuccess(false);
    if (!metadata || !metadata.title) {
      setMetadata(null);
    }
  };

  // Perform DOI Lookup via backend GET /api/papers/lookup?doi=...
  const handleLookup = async (e) => {
    e.preventDefault();
    const cleanDoi = doiInput.trim();
    if (!cleanDoi) return;

    setLookupError('');
    setSaveError('');
    setSavedSuccess(false);

    // Immediate client hint if already in loaded library
    if (checkDuplicateDoi(cleanDoi)) {
      setLookupError(`Notice: DOI "${cleanDoi}" already exists in your library.`);
      return;
    }

    setLookupLoading(true);
    try {
      const res = await lookupDoi(cleanDoi);
      if (res.success && res.data) {
        setMetadata({
          title: res.data.title || '',
          authors: Array.isArray(res.data.authors) ? res.data.authors : [],
          abstract: res.data.abstract || '',
          doi: res.data.doi || cleanDoi,
          year: res.data.year || '',
          publicationDate: res.data.publicationDate || '',
          venue: res.data.venue || '',
          publisher: res.data.publisher || '',
          url: res.data.url || '',
          tags: Array.isArray(res.data.tags) ? res.data.tags : ['DOI-Import'],
        });
      } else {
        const errorMsg =
          res.status === 404
            ? 'DOI not found in Crossref. Please verify the DOI or enter the paper manually.'
            : res.status === 429
            ? 'Crossref rate limit exceeded. Please wait a moment and try again.'
            : res.error || 'Failed to resolve DOI metadata. Please verify or enter manually.';
        setLookupError(errorMsg);
      }
    } catch (err) {
      setLookupError(err.message || 'An error occurred during metadata resolution.');
    } finally {
      setLookupLoading(false);
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

  // Submit edited form to backend POST /api/papers
  const handleSave = async (e) => {
    e.preventDefault();
    if (saveLoading || savedSuccess) return;

    setSaveError('');

    // Client-side validations
    const title = metadata?.title?.trim();
    if (!title) {
      setSaveError('Publication title is required.');
      return;
    }

    const authors = Array.isArray(metadata?.authors)
      ? metadata.authors.map((a) => a.trim()).filter(Boolean)
      : [];
    if (authors.length === 0) {
      setSaveError('At least one author is required.');
      return;
    }

    // Build payload using EDITED metadata values only
    const payload = {
      title,
      authors,
    };

    if (metadata.abstract && typeof metadata.abstract === 'string' && metadata.abstract.trim()) {
      payload.abstract = metadata.abstract.trim();
    }

    if (metadata.doi && typeof metadata.doi === 'string' && metadata.doi.trim()) {
      payload.doi = metadata.doi.trim();
    }

    if (metadata.year !== '' && metadata.year !== null && metadata.year !== undefined) {
      const yearNum = parseInt(metadata.year, 10);
      if (!isNaN(yearNum)) {
        payload.year = yearNum;
      }
    }

    if (metadata.publicationDate && typeof metadata.publicationDate === 'string' && metadata.publicationDate.trim()) {
      payload.publicationDate = metadata.publicationDate.trim();
    }

    if (metadata.venue && typeof metadata.venue === 'string' && metadata.venue.trim()) {
      payload.venue = metadata.venue.trim();
    }

    if (metadata.publisher && typeof metadata.publisher === 'string' && metadata.publisher.trim()) {
      payload.publisher = metadata.publisher.trim();
    }

    if (metadata.url && typeof metadata.url === 'string' && metadata.url.trim()) {
      payload.url = metadata.url.trim();
    }

    if (Array.isArray(metadata.tags) && metadata.tags.length > 0) {
      payload.tags = metadata.tags.map((t) => t.trim()).filter(Boolean);
    }

    setSaveLoading(true);
    try {
      const createdPaper = await addPaper(payload);
      setSavedSuccess(true);
      setTimeout(() => {
        navigate(`/library/${createdPaper.id}`);
      }, 700);
    } catch (err) {
      if (err.status === 409) {
        setSaveError('A paper with this DOI already exists in your library.');
      } else {
        setSaveError(err.message || 'Failed to save paper to library.');
      }
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="border-b border-stone-200 pb-5">
        <h1 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight text-stone-900">
          Publication Ingestion & Cataloging
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Import scholarly literature via Crossref DOI lookup or enter bibliographic records manually.
        </p>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={handleSwitchToDoi}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              entryMode === 'doi'
                ? 'bg-stone-900 text-stone-50 shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>Lookup via DOI</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchToManual()}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              entryMode === 'manual'
                ? 'bg-stone-900 text-stone-50 shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Manual Entry</span>
          </button>
        </div>
      </div>

      {/* Mode A: DOI Lookup Form */}
      {entryMode === 'doi' && (
        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs space-y-4">
          <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-start gap-3 text-xs text-amber-900">
            <Sparkles className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Live Crossref Metadata Resolution</span>
              <span>
                Enter a published DOI (e.g.{' '}
                <code className="font-mono font-medium px-1 bg-amber-100/60 rounded">
                  10.1038/nature14539
                </code>{' '}
                or{' '}
                <code className="font-mono font-medium px-1 bg-amber-100/60 rounded">
                  10.1145/3065386
                </code>
                ) to fetch peer-reviewed metadata. You will be able to review and modify any field before saving to your library.
              </span>
            </div>
          </div>

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
                disabled={lookupLoading}
                className="px-4 py-2 bg-stone-900 text-stone-50 text-xs font-medium rounded-md hover:bg-stone-800 disabled:opacity-50 transition-colors inline-flex items-center gap-2 shrink-0 shadow-xs"
              >
                {lookupLoading ? (
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

          {lookupError && (
            <div className="p-3 bg-red-50 text-red-700 rounded-md text-xs flex items-center justify-between gap-2 border border-red-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{lookupError}</span>
              </div>
              <button
                type="button"
                onClick={() => handleSwitchToManual(doiInput)}
                className="underline hover:text-red-900 shrink-0 font-medium"
              >
                Enter manually instead
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mode B Notice: Manual Entry Banner */}
      {entryMode === 'manual' && (
        <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-lg flex items-start gap-3 text-xs text-stone-700">
          <FileText className="h-4 w-4 text-stone-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block text-stone-900">Manual Publication Entry</span>
            <span>
              Enter paper metadata directly into the bibliographic record. Title and authors are required; DOI, abstract, venue, and other metadata are optional.
            </span>
          </div>
        </div>
      )}

      {/* Metadata Review & Edit Form (Shared for DOI Import & Manual Entry) */}
      {metadata && (
        <form
          onSubmit={handleSave}
          className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs space-y-5"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h2 className="font-serif text-lg font-semibold text-stone-900">
                {entryMode === 'manual' ? 'Manual Paper Metadata' : 'Bibliographic Metadata Verification'}
              </h2>
              <p className="text-xs text-stone-500">
                {entryMode === 'manual'
                  ? 'Fill in publication fields and persist to your personal MongoDB library.'
                  : 'Review and modify resolved values prior to persistent cataloging.'}
              </p>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
              {entryMode === 'manual' ? 'Manual Record' : 'Ready for Review'}
            </span>
          </div>

          {saveError && (
            <div className="p-3 bg-red-50 text-red-700 rounded-md text-xs flex items-center gap-2 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

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
                placeholder="e.g. Attention Is All You Need"
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
                  placeholder="e.g. Yann LeCun, Yoshua Bengio, Geoffrey Hinton"
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Publication Year
                </label>
                <input
                  type="number"
                  value={metadata.year ?? ''}
                  onChange={(e) => handleFieldChange('year', e.target.value)}
                  placeholder="e.g. 2024"
                  className="w-full px-3 py-2 text-sm font-mono bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Digital Object Identifier (DOI) {entryMode === 'manual' ? '(Optional)' : ''}
                </label>
                <input
                  type="text"
                  value={metadata.doi || ''}
                  onChange={(e) => handleFieldChange('doi', e.target.value)}
                  placeholder="10.xxxx/xxxxx"
                  className="w-full px-3 py-2 text-sm font-mono bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Journal / Venue
                </label>
                <input
                  type="text"
                  value={metadata.venue || ''}
                  onChange={(e) => handleFieldChange('venue', e.target.value)}
                  placeholder="e.g. Nature, NeurIPS, IEEE Trans."
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono uppercase text-stone-500 font-semibold mb-1">
                  Publisher
                </label>
                <input
                  type="text"
                  value={metadata.publisher || ''}
                  onChange={(e) => handleFieldChange('publisher', e.target.value)}
                  placeholder="e.g. Springer, IEEE, ACM"
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
                  placeholder="https://..."
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

            {/* Collection assignment on import (preserved UI) */}
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
              {metadata.doi ? `DOI: ${metadata.doi}` : 'No DOI assigned'}
            </span>
            <button
              type="submit"
              disabled={saveLoading || savedSuccess}
              className="px-5 py-2.5 bg-stone-900 text-stone-50 text-xs font-medium rounded-md hover:bg-stone-800 disabled:opacity-50 transition-colors inline-flex items-center gap-2 shadow-xs"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Added to Library! Redirecting...</span>
                </>
              ) : saveLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving to MongoDB...</span>
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
