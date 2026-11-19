import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  lookupPaperByDoi,
  searchPapers,
  createPaper,
  listPapers,
  getPaperEnrichmentSuggestions,
  getPaperById,
  updatePaper,
  deletePaper,
} from '../controllers/paperController.js';

const router = Router();

/**
 * @route   GET /api/papers/lookup
 * @desc    Look up publication metadata by DOI via Crossref
 * @access  Private (Authenticated users only)
 */
router.get('/lookup', authenticate, lookupPaperByDoi);

/**
 * @route   GET /api/papers/search
 * @desc    Search authenticated user's papers by keyword (title, authors, DOI, tags, venue)
 * @access  Private (Authenticated users only)
 */
router.get('/search', authenticate, searchPapers);

/**
 * @route   GET /api/papers
 * @desc    List papers belonging to the authenticated user with pagination
 * @access  Private (Authenticated users only)
 */
router.get('/', authenticate, listPapers);

/**
 * @route   GET /api/papers/:id/enrich-suggestions
 * @desc    Get OpenAlex metadata enrichment suggestions for an existing paper
 * @access  Private (Authenticated users only)
 */
router.get('/:id/enrich-suggestions', authenticate, getPaperEnrichmentSuggestions);

/**
 * @route   GET /api/papers/:id
 * @desc    Retrieve a single paper by ID belonging to the authenticated user
 * @access  Private (Authenticated users only)
 */
router.get('/:id', authenticate, getPaperById);

/**
 * @route   PUT /api/papers/:id
 * @desc    Update metadata of an existing paper belonging to the authenticated user
 * @access  Private (Authenticated users only)
 */
router.put('/:id', authenticate, updatePaper);

/**
 * @route   DELETE /api/papers/:id
 * @desc    Delete a paper belonging to the authenticated user
 * @access  Private (Authenticated users only)
 */
router.delete('/:id', authenticate, deletePaper);

/**
 * @route   POST /api/papers
 * @desc    Create and save a new paper in the user's personal library
 * @access  Private (Authenticated users only)
 */
router.post('/', authenticate, createPaper);

export default router;
