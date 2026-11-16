import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Route guard for authenticated sections of the application.
 * - Displays a minimal academic loading screen while session restoration is pending.
 * - Redirects unauthenticated visitors to /login, preserving requested location in state.
 * - Renders nested route components via <Outlet /> when authenticated.
 */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fbfbf9] text-stone-800">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-stone-900 text-stone-100 flex items-center justify-center font-serif text-xl font-semibold shadow-sm animate-pulse">
            RF
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-stone-500 uppercase tracking-wider">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-stone-400 animate-ping" />
            <span>Verifying session...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
