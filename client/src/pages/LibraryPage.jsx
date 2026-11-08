import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, BookOpen, ExternalLink, Calendar, Tag, PlusCircle } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';

export default function LibraryPage() {
  const { papers, collections } = useLibrary();
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  // Collect all unique tags
  const allTags = Array.from(new Set(papers.flatMap((p) => p.tags || [])));

  // Filter papers by title, abstract, and tags
  const filteredPapers = papers.filter((paper) => {
    const q = query.toLowerCase().trim();
    const matchesSearch =
      !q ||
      paper.title.toLowerCase().includes(q) ||
      (paper.abstract && paper.abstract.toLowerCase().includes(q)) ||
      (paper.doi && paper.doi.toLowerCase().includes(q)) ||
      paper.authors.some((a) => a.toLowerCase().includes(q)) ||
      (paper.tags && paper.tags.some((t) => t.toLowerCase().includes(q)));

    const matchesTag = !selectedTag || (paper.tags && paper.tags.includes(selectedTag));

    return matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight text-stone-900">
            Personal Research Library
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Browse, search, and manage your catalog of ingested academic publications.
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, author, abstract, DOI, or tag..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 focus:bg-white transition-all text-stone-800 placeholder-stone-400 font-sans"
          />
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
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results Count & Active Filters */}
      <div className="flex items-center justify-between text-xs font-mono text-stone-500 px-1">
        <span>
          Showing {filteredPapers.length} of {papers.length} publications
        </span>
        {query && (
          <span className="text-amber-800">
            Filtered by keyword: "{query}"
          </span>
        )}
      </div>

      {/* Paper List */}
      <div className="space-y-3">
        {filteredPapers.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-lg border border-dashed border-stone-300">
            <BookOpen className="h-8 w-8 text-stone-300 mx-auto mb-3" />
            <p className="text-stone-700 font-medium text-sm">No publications match your search query.</p>
            <p className="text-stone-400 text-xs mt-1">Try refining search terms or importing new research.</p>
          </div>
        ) : (
          filteredPapers.map((paper) => {
            const paperCollections = collections.filter((c) =>
              paper.collections?.includes(c.id)
            );

            return (
              <article
                key={paper.id}
                className="bg-white p-5 rounded-lg border border-stone-200/90 shadow-2xs hover:border-stone-300 hover:shadow-xs transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="font-serif text-lg font-semibold text-stone-900 group-hover:text-stone-700 leading-snug">
                      <Link to={`/library/${paper.id}`} className="hover:underline">
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
                    {paper.authors.join(', ')}
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
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-[11px] font-mono"
                      >
                        #{tag}
                      </span>
                    ))}
                    {paperCollections.map((col) => (
                      <span
                        key={col.id}
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
    </div>
  );
}

