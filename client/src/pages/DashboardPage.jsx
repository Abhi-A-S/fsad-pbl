import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FolderKanban, PlusCircle, ArrowUpRight, Clock, Tag } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';

export default function DashboardPage() {
  const { papers, collections } = useLibrary();

  const recentPapers = [...papers].slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Welcome Hero */}
      <div className="bg-white p-7 rounded-xl border border-stone-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600 font-mono text-[11px] font-medium mb-3">
            <span>ResearchForge Scholar Environment</span>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight text-stone-950">
            Welcome to your research workspace.
          </h1>
          <p className="text-sm text-stone-500 mt-2 leading-relaxed">
            Curate literature, manage collections, inspect citation metadata, and build your structured academic knowledge base.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Link
            to="/import"
            className="px-4 py-2 bg-stone-900 text-stone-50 text-xs font-medium rounded-md hover:bg-stone-800 transition-colors inline-flex items-center gap-2 shadow-xs"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Import via DOI</span>
          </Link>
          <Link
            to="/library"
            className="px-4 py-2 border border-stone-200 bg-stone-50 text-stone-700 text-xs font-medium rounded-md hover:bg-stone-100 transition-colors inline-flex items-center gap-1.5"
          >
            <span>Open Library</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-stone-200/90 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold">
              Total Catalog
            </span>
            <BookOpen className="h-4 w-4 text-stone-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-serif text-3xl font-semibold text-stone-900">
              {papers.length}
            </span>
            <span className="text-xs text-stone-500">Publications</span>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-stone-200/90 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold">
              Dossiers & Collections
            </span>
            <FolderKanban className="h-4 w-4 text-stone-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-serif text-3xl font-semibold text-stone-900">
              {collections.length}
            </span>
            <span className="text-xs text-stone-500">Active dossiers</span>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-stone-200/90 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold">
              Keywords Indexed
            </span>
            <Tag className="h-4 w-4 text-stone-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-serif text-3xl font-semibold text-stone-900">
              {new Set(papers.flatMap((p) => p.tags || [])).size}
            </span>
            <span className="text-xs text-stone-500">Topics</span>
          </div>
        </div>
      </div>

      {/* Recent Publications Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-stone-400" />
            <h2 className="font-serif text-xl font-semibold text-stone-900">
              Recently Cataloged Publications
            </h2>
          </div>
          <Link
            to="/library"
            className="text-xs text-stone-600 hover:text-stone-950 font-medium inline-flex items-center gap-1"
          >
            <span>View all ({papers.length})</span>
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="space-y-3">
          {recentPapers.map((paper) => (
            <div
              key={paper.id}
              className="p-4 bg-white rounded-lg border border-stone-200 hover:border-stone-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="max-w-2xl">
                <Link
                  to={`/library/${paper.id}`}
                  className="font-serif text-base font-semibold text-stone-900 hover:underline leading-snug block"
                >
                  {paper.title}
                </Link>
                <p className="text-xs text-stone-500 mt-1">
                  {paper.authors.join(', ')} • <span className="font-mono">{paper.year}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {paper.tags?.slice(0, 2).map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-[11px] font-mono"
                  >
                    #{t}
                  </span>
                ))}
                <Link
                  to={`/library/${paper.id}`}
                  className="text-xs text-stone-700 hover:text-stone-950 font-medium ml-2"
                >
                  Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

