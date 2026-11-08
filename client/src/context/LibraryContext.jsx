import React, { createContext, useContext, useState, useEffect } from 'react';
import { initialPapers, initialCollections, mockDoiLookupDatabase } from '../data/mockData.js';

const LibraryContext = createContext();

export function LibraryProvider({ children }) {
  // Load from localStorage or fallback to initial mocks
  const [papers, setPapers] = useState(() => {
    const saved = localStorage.getItem('rf_mock_papers');
    return saved ? JSON.parse(saved) : initialPapers;
  });

  const [collections, setCollections] = useState(() => {
    const saved = localStorage.getItem('rf_mock_collections');
    return saved ? JSON.parse(saved) : initialCollections;
  });

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    localStorage.setItem('rf_mock_papers', JSON.stringify(papers));
  }, [papers]);

  useEffect(() => {
    localStorage.setItem('rf_mock_collections', JSON.stringify(collections));
  }, [collections]);

  // Create Collection
  const createCollection = (name, description, color = 'stone') => {
    const newCol = {
      id: `col-${Date.now()}`,
      name,
      description: description || 'No description provided.',
      createdAt: new Date().toISOString(),
      color,
    };
    setCollections((prev) => [newCol, ...prev]);
    return newCol;
  };

  // Add paper to a collection
  const addPaperToCollection = (paperId, collectionId) => {
    setPapers((prev) =>
      prev.map((p) => {
        if (p.id === paperId) {
          const currentCols = p.collections || [];
          if (!currentCols.includes(collectionId)) {
            return { ...p, collections: [...currentCols, collectionId] };
          }
        }
        return p;
      })
    );
  };

  // Remove paper from a collection
  const removePaperFromCollection = (paperId, collectionId) => {
    setPapers((prev) =>
      prev.map((p) => {
        if (p.id === paperId) {
          return {
            ...p,
            collections: (p.collections || []).filter((c) => c !== collectionId),
          };
        }
        return p;
      })
    );
  };

  // Add newly imported or manual paper
  const addPaper = (paperData) => {
    const newPaper = {
      ...paperData,
      id: `rf-paper-${Date.now()}`,
      addedAt: new Date().toISOString(),
      collections: paperData.collections || [],
    };
    setPapers((prev) => [newPaper, ...prev]);
    return newPaper;
  };

  // Check duplicate DOI
  const checkDuplicateDoi = (doi) => {
    if (!doi) return false;
    const clean = doi.trim().toLowerCase();
    return papers.some((p) => p.doi && p.doi.trim().toLowerCase() === clean);
  };

  // Mock DOI Lookup Service
  const lookupDoi = async (doi) => {
    // Simulate network latency
    await new Promise((res) => setTimeout(res, 600));

    const cleanDoi = doi.trim();
    if (mockDoiLookupDatabase[cleanDoi]) {
      return {
        success: true,
        data: { ...mockDoiLookupDatabase[cleanDoi] },
      };
    }

    // Default fallback synthesis if not in static dict
    return {
      success: true,
      data: {
        title: `Research Investigation on Scholarly Artifact (${cleanDoi})`,
        authors: ["Lead Researcher", "Co-Investigator"],
        abstract: "This publication metadata was synthesized by the local mock DOI resolver to demonstrate the interactive review and verification interface before saving.",
        year: 2024,
        venue: "Journal of Open Research Systems",
        doi: cleanDoi,
        url: `https://doi.org/${cleanDoi}`,
        tags: ["Synthesized", "DOI-Import"],
      },
    };
  };

  return (
    <LibraryContext.Provider
      value={{
        papers,
        collections,
        searchQuery,
        setSearchQuery,
        createCollection,
        addPaperToCollection,
        removePaperFromCollection,
        addPaper,
        checkDuplicateDoi,
        lookupDoi,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
}

