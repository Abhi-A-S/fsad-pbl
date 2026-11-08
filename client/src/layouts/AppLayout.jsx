import React from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { 
  BookOpen, 
  LayoutDashboard, 
  FolderKanban, 
  PlusCircle, 
  Search, 
  Sparkles,
  Library,
  GraduationCap
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext.jsx';

export default function AppLayout({ children }) {
  const { papers, collections } = useLibrary();
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Library', path: '/library', icon: BookOpen, count: papers.length },
    { name: 'Collections', path: '/collections', icon: FolderKanban, count: collections.length },
    { name: 'Import DOI', path: '/import', icon: PlusCircle },
  ];

  return (
    <div className="flex min-h-screen bg-[#fbfbf9] text-stone-800">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-stone-200 bg-[#f7f7f4] flex flex-col fixed inset-y-0 z-20">
        {/* Brand */}
        <div className="p-6 border-b border-stone-200/80 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-stone-900 text-stone-100 flex items-center justify-center font-serif text-lg font-semibold shadow-sm">
              RF
            </div>
            <div>
              <span className="font-serif text-lg font-semibold tracking-tight text-stone-900 block leading-tight">
                ResearchForge
              </span>
              <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500 font-medium">
                PBL Demo MVP
              </span>
            </div>
          </Link>
        </div>

        {/* Primary Navigation */}
        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          <div>
            <div className="px-3 pb-2 text-[11px] font-mono uppercase text-stone-400 font-semibold tracking-wider">
              Workspace
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || 
                  (item.path !== '/' && location.pathname.startsWith(item.path));

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-stone-200/80 text-stone-950 font-semibold shadow-xs'
                        : 'text-stone-600 hover:bg-stone-200/50 hover:text-stone-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 ${isActive ? 'text-stone-900' : 'text-stone-400'}`} />
                      <span>{item.name}</span>
                    </div>
                    {item.count !== undefined && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                        isActive ? 'bg-stone-300 text-stone-900 font-medium' : 'bg-stone-200/60 text-stone-500'
                      }`}>
                        {item.count}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Quick Collection List */}
          <div>
            <div className="px-3 pb-2 text-[11px] font-mono uppercase text-stone-400 font-semibold tracking-wider flex items-center justify-between">
              <span>Pinned Collections</span>
              <Link to="/collections" className="text-stone-400 hover:text-stone-600">
                <FolderKanban className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-1">
              {collections.slice(0, 4).map((col) => {
                const paperCount = papers.filter((p) => p.collections?.includes(col.id)).length;
                return (
                  <Link
                    key={col.id}
                    to={`/collections/${col.id}`}
                    className="flex items-center justify-between px-3 py-1.5 text-xs text-stone-600 rounded-md hover:bg-stone-200/50 hover:text-stone-900 transition-colors"
                  >
                    <span className="truncate pr-2">• {col.name}</span>
                    <span className="font-mono text-[10px] text-stone-400">
                      {paperCount}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mock Mode Indicator in Sidebar Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-100/60">
          <div className="flex items-start gap-2.5 p-2.5 rounded-md bg-stone-200/60 border border-stone-300/40 text-stone-700">
            <Sparkles className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-xs">
              <span className="font-medium text-stone-900 block">Frontend Mock Mode</span>
              <span className="text-[11px] text-stone-500 leading-normal block mt-0.5">
                Local in-memory state. Real Crossref and MongoDB connect in later phases.
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="pl-64 flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-stone-200/80 bg-white/70 backdrop-blur-sm sticky top-0 z-10 px-8 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-stone-500 font-mono">
            <span>ResearchForge Core</span>
            <span>/</span>
            <span className="text-stone-800 font-medium">Demo MVP Client</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/import"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-stone-900 text-stone-50 text-xs font-medium hover:bg-stone-800 transition-colors shadow-xs"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Import via DOI</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

