import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LibraryProvider } from './context/LibraryContext.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import PaperDetailPage from './pages/PaperDetailPage.jsx';
import CollectionsPage from './pages/CollectionsPage.jsx';
import ImportDoiPage from './pages/ImportDoiPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <LibraryProvider>
        <AppLayout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/library/:id" element={<PaperDetailPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionsPage />} />
            <Route path="/import" element={<ImportDoiPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </LibraryProvider>
    </BrowserRouter>
  );
}

