import mongoose from 'mongoose';
import { fetchCrossrefMetadata, CrossrefError } from '../services/crossrefService.js';
import { Paper } from '../models/Paper.js';
import { Collection } from '../models/Collection.js';

/**
 * Controller to look up paper metadata from Crossref by DOI.
 * This is a read-only metadata resolution endpoint; no Paper documents are saved.
 *
 * GET /api/papers/lookup?doi=...
 */
export async function lookupPaperByDoi(req, res, next) {
  try {
    const { doi } = req.query;

    if (!doi || typeof doi !== 'string' || !doi.trim()) {
      return res.status(400).json({
        error: {
          message: 'The "doi" query parameter is required',
        },
      });
    }

    const paperMetadata = await fetchCrossrefMetadata(doi);

    return res.status(200).json({
      paper: paperMetadata,
    });
  } catch (error) {
    if (error instanceof CrossrefError) {
      return res.status(error.statusCode).json({
        error: {
          message: error.message,
        },
      });
    }

    next(error);
  }
}

/**
 * Controller to list papers belonging to the authenticated user.
 * Supports pagination via "page" and "limit" query parameters.
 * Papers are sorted by createdAt descending (newest first).
 *
 * GET /api/papers?page=1&limit=10
 */
export async function listPapers(req, res, next) {
  try {
    let page = 1;
    let limit = 10;

    // Validate page parameter if provided
    if (req.query.page !== undefined) {
      const parsedPage = Number(req.query.page);
      if (!Number.isInteger(parsedPage) || parsedPage < 1) {
        return res.status(400).json({
          error: {
            message: 'Page parameter must be a positive integer greater than or equal to 1',
          },
        });
      }
      page = parsedPage;
    }

    // Validate limit parameter if provided
    if (req.query.limit !== undefined) {
      const parsedLimit = Number(req.query.limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({
          error: {
            message: 'Limit parameter must be a positive integer greater than or equal to 1',
          },
        });
      }
      if (parsedLimit > 50) {
        return res.status(400).json({
          error: {
            message: 'Limit parameter cannot exceed 50 items per page',
          },
        });
      }
      limit = parsedLimit;
    }

    const skip = (page - 1) * limit;

    // Strictly filter by authenticated owner; ignore any client-supplied owner query
    const ownerFilter = { owner: req.user._id };

    const [papers, total] = await Promise.all([
      Paper.find(ownerFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Paper.countDocuments(ownerFilter),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return res.status(200).json({
      papers,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to retrieve a single paper by ID belonging to the authenticated user.
 *
 * GET /api/papers/:id
 */
export async function getPaperById(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id) || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          message: 'Invalid paper ID format',
        },
      });
    }

    const paper = await Paper.findOne({
      _id: id,
      owner: req.user._id,
    });

    if (!paper) {
      return res.status(404).json({
        error: {
          message: 'Paper not found',
        },
      });
    }

    return res.status(200).json({
      paper,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to create and save a new paper in the authenticated user's library.
 *
 * POST /api/papers
 */
export async function createPaper(req, res, next) {
  try {
    const {
      title,
      authors,
      abstract,
      doi,
      year,
      publicationDate,
      venue,
      publisher,
      url,
      tags,
    } = req.body || {};

    // Pre-check for duplicate DOI within the authenticated user's library
    if (doi && typeof doi === 'string') {
      const normalizedDoi = doi
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
        .replace(/^doi:\s*/i, '');

      if (normalizedDoi) {
        const existing = await Paper.findOne({
          owner: req.user._id,
          doi: normalizedDoi,
        });

        if (existing) {
          return res.status(409).json({
            error: {
              message: 'A paper with this DOI already exists in your library',
            },
          });
        }
      }
    }

    // Explicitly enforce authenticated owner; client-supplied owner is never accepted
    const paper = new Paper({
      title,
      authors,
      abstract,
      doi,
      year,
      publicationDate,
      venue,
      publisher,
      url,
      tags,
      owner: req.user._id,
    });

    await paper.save();

    return res.status(201).json({
      paper,
    });
  } catch (error) {
    // Handle duplicate key error from partial unique compound index
    if (error.code === 11000) {
      return res.status(409).json({
        error: {
          message: 'A paper with this DOI already exists in your library',
        },
      });
    }

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        error: {
          message: messages[0] || 'Validation failed',
          details: messages,
        },
      });
    }

    // Handle Mongoose casting errors (e.g. malformed ObjectId, date, number)
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: {
          message: `Invalid format for field "${error.path}": ${error.value}`,
        },
      });
    }

    next(error);
  }
}

/**
 * Controller to update metadata of an existing paper belonging to the authenticated user.
 * PUT /api/papers/:id
 *
 * Partial metadata update: omitted fields retain their existing values.
 * Only editable metadata fields can be updated; owner, _id, and internal fields cannot be modified.
 */
export async function updatePaper(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id) || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          message: 'Invalid paper ID format',
        },
      });
    }

    const paper = await Paper.findOne({
      _id: id,
      owner: req.user._id,
    });

    if (!paper) {
      return res.status(404).json({
        error: {
          message: 'Paper not found',
        },
      });
    }

    // Pre-check for duplicate DOI within the authenticated user's library if DOI is being updated
    if (req.body && req.body.doi !== undefined) {
      const rawDoi = req.body.doi;
      if (rawDoi && typeof rawDoi === 'string') {
        const normalizedDoi = rawDoi
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
          .replace(/^doi:\s*/i, '');

        if (normalizedDoi) {
          const existing = await Paper.findOne({
            owner: req.user._id,
            doi: normalizedDoi,
            _id: { $ne: paper._id },
          });

          if (existing) {
            return res.status(409).json({
              error: {
                message: 'A paper with this DOI already exists in your library',
              },
            });
          }
        }
      }
    }

    // Editable metadata fields only (owner, _id, createdAt, updatedAt, etc. cannot be modified)
    const editableFields = [
      'title',
      'authors',
      'abstract',
      'doi',
      'year',
      'publicationDate',
      'venue',
      'publisher',
      'url',
      'tags',
    ];

    if (req.body && typeof req.body === 'object') {
      for (const field of editableFields) {
        if (req.body[field] !== undefined) {
          paper[field] = req.body[field];
        }
      }
    }

    await paper.save();

    return res.status(200).json({
      paper,
    });
  } catch (error) {
    // Handle duplicate key error from partial unique compound index (race condition)
    if (error.code === 11000) {
      return res.status(409).json({
        error: {
          message: 'A paper with this DOI already exists in your library',
        },
      });
    }

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        error: {
          message: messages[0] || 'Validation failed',
          details: messages,
        },
      });
    }

    // Handle Mongoose casting errors (e.g. malformed date, number)
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: {
          message: `Invalid format for field "${error.path}": ${error.value}`,
        },
      });
    }

    next(error);
  }
}

/**
 * Controller to delete a paper from the authenticated user's library.
 * DELETE /api/papers/:id
 *
 * Scoped strictly to the authenticated user (_id and owner: req.user._id).
 * Returns HTTP 404 if the paper does not exist or belongs to another user.
 */
export async function deletePaper(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id) || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: {
          message: 'Invalid paper ID format',
        },
      });
    }

    // 1. Verify paper exists and belongs to the authenticated user
    const paper = await Paper.findOne({
      _id: id,
      owner: req.user._id,
    });

    if (!paper) {
      return res.status(404).json({
        error: {
          message: 'Paper not found',
        },
      });
    }

    // 2. Clean up collection references before deleting the paper.
    // This ensures that if collection cleanup fails, we do not leave orphaned references
    // and the operation can be retried because the paper is not prematurely removed.
    const cleanupResult = await Collection.updateMany(
      { owner: req.user._id, papers: id },
      { $pull: { papers: id } }
    );

    if (cleanupResult && cleanupResult.acknowledged === false) {
      throw new Error('Collection cleanup was unacknowledged by the database');
    }

    // 3. Delete the paper document
    await Paper.deleteOne({
      _id: id,
      owner: req.user._id,
    });

    return res.status(200).json({
      message: 'Paper deleted successfully',
      id: paper._id.toString(),
    });
  } catch (error) {
    next(error);
  }
}

const MAX_SEARCH_QUERY_LENGTH = 500;

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Controller to search the authenticated user's papers by keyword.
 * Searches across title, authors, tags, venue (via compound text index) and DOI (via indexed regex).
 *
 * GET /api/papers/search?q=...
 */
export async function searchPapers(req, res, next) {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({
        error: {
          message: 'Search query parameter "q" is required',
        },
      });
    }

    const trimmedQuery = q.trim();

    if (trimmedQuery.length > MAX_SEARCH_QUERY_LENGTH) {
      return res.status(400).json({
        error: {
          message: `Search query cannot exceed ${MAX_SEARCH_QUERY_LENGTH} characters`,
        },
      });
    }

    // Normalize potential DOI input (strip URL prefixes and leading "doi:" prefix)
    const cleanedDoi = trimmedQuery
      .toLowerCase()
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
      .replace(/^doi:\s*/i, '')
      .trim();

    // Query text search and DOI match concurrently
    const [textResults, doiResults] = await Promise.all([
      Paper.find(
        {
          owner: req.user._id,
          $text: { $search: trimmedQuery },
        },
        { score: { $meta: 'textScore' } }
      ).sort({ score: { $meta: 'textScore' }, createdAt: -1 }),
      cleanedDoi.length > 0
        ? Paper.find({
            owner: req.user._id,
            doi: { $regex: escapeRegex(cleanedDoi), $options: 'i' },
          }).sort({ createdAt: -1 })
        : Promise.resolve([]),
    ]);

    // Merge and deduplicate results, prioritizing direct DOI matches for identifier queries
    // followed by text relevance matches
    const seenIds = new Set();
    const papers = [];

    for (const paper of doiResults) {
      const idStr = paper._id.toString();
      if (!seenIds.has(idStr)) {
        seenIds.add(idStr);
        papers.push(paper);
      }
    }

    for (const paper of textResults) {
      const idStr = paper._id.toString();
      if (!seenIds.has(idStr)) {
        seenIds.add(idStr);
        papers.push(paper);
      }
    }

    return res.status(200).json({
      papers,
    });
  } catch (error) {
    next(error);
  }
}
