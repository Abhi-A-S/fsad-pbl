import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Route guard for public-only routes (e.g. /login, /register).
 * - Displays a minimal academic loading screen while session restoration is pending.
 * - Redirects authenticated users to their originally intended destination or /.
 * - Renders nested public routes via <Outlet /> when unauthenticated.
 */
export default function PublicRoute() {
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

  if (user) {
    const destination = location.state?.from?.pathname || '/';
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}
