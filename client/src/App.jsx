import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { LibraryProvider } from './context/LibraryContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PublicRoute from './components/PublicRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import PaperDetailPage from './pages/PaperDetailPage.jsx';
import CollectionsPage from './pages/CollectionsPage.jsx';
import ImportDoiPage from './pages/ImportDoiPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LibraryProvider>
          <Routes>
            {/* Public routes (unauthenticated only, outside AppLayout) */}
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Protected workspace routes (authenticated only, wrapped in AppLayout) */}
            <Route element={<ProtectedRoute />}>
              <Route
                element={
                  <AppLayout>
                    <Outlet />
                  </AppLayout>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/library/:id" element={<PaperDetailPage />} />
                <Route path="/collections" element={<CollectionsPage />} />
                <Route path="/collections/:id" element={<CollectionsPage />} />
                <Route path="/import" element={<ImportDoiPage />} />
              </Route>
            </Route>

            {/* Catch-all route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </LibraryProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

