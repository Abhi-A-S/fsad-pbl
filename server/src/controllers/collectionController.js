import mongoose from 'mongoose';
import { Collection } from '../models/Collection.js';
import { Paper } from '../models/Paper.js';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Controller to create a new research collection.
 * POST /api/collections
 *
 * Scoped strictly to the authenticated user.
 * Rejects duplicate collection names for the same user with HTTP 409.
 */
export async function createCollection(req, res, next) {
  try {
    const rawName = req.body?.name;

    if (!rawName || typeof rawName !== 'string' || rawName.trim().length === 0) {
      return res.status(400).json({
        error: {
          message: 'Collection name is required',
        },
      });
    }

    const trimmedName = rawName.trim();

    if (trimmedName.length > 100) {
      return res.status(400).json({
        error: {
          message: 'Collection name cannot exceed 100 characters',
        },
      });
    }

    // Application-level pre-check for duplicate collection name within user's library
    const existing = await Collection.findOne({
      owner: req.user._id,
      name: trimmedName,
    });

    if (existing) {
      return res.status(409).json({
        error: {
          message: 'A collection with this name already exists in your library',
        },
      });
    }

    // Ignore client-supplied owner, strictly bind to req.user._id
    const collection = await Collection.create({
      name: trimmedName,
      description: typeof req.body.description === 'string' ? req.body.description.trim() : '',
      owner: req.user._id,
      papers: [],
    });

    return res.status(201).json({
      collection,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: {
          message: 'A collection with this name already exists in your library',
        },
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        error: {
          message: messages[0] || 'Validation failed',
          details: messages,
        },
      });
    }

    next(error);
  }
}

/**
 * Controller to list all collections belonging to the authenticated user.
 * GET /api/collections
 *
 * Populates paper references and sorts newest-first.
 */
export async function listCollections(req, res, next) {
  try {
    const collections = await Collection.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .populate({
        path: 'papers',
        match: { owner: req.user._id },
      });

    return res.status(200).json({
      collections,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to add a paper to a collection.
 * POST /api/collections/:id/papers
 *
 * Body: { paperId: string } or { id: string }
 *
 * Strictly verifies both collection and paper belong to the authenticated user.
 * Uses $addToSet to prevent duplicate references without modifying the Paper document.
 */
export async function addPaperToCollection(req, res, next) {
  try {
    const collectionId = req.params.id;
    const paperId = req.body?.paperId || req.body?.id;

    if (!collectionId || typeof collectionId !== 'string' || !OBJECT_ID_REGEX.test(collectionId) || !mongoose.Types.ObjectId.isValid(collectionId)) {
      return res.status(400).json({
        error: {
          message: 'Invalid collection ID format',
        },
      });
    }

    if (!paperId || typeof paperId !== 'string' || !OBJECT_ID_REGEX.test(paperId) || !mongoose.Types.ObjectId.isValid(paperId)) {
      return res.status(400).json({
        error: {
          message: 'Invalid paper ID format',
        },
      });
    }

    // Verify collection exists and belongs to the authenticated user
    const collection = await Collection.findOne({
      _id: collectionId,
      owner: req.user._id,
    });

    if (!collection) {
      return res.status(404).json({
        error: {
          message: 'Collection not found',
        },
      });
    }

    // Verify paper exists and belongs to the authenticated user
    const paper = await Paper.findOne({
      _id: paperId,
      owner: req.user._id,
    });

    if (!paper) {
      return res.status(404).json({
        error: {
          message: 'Paper not found',
        },
      });
    }

    // Atomically add paper to collection using $addToSet (prevents duplicates)
    const updatedCollection = await Collection.findOneAndUpdate(
      { _id: collectionId, owner: req.user._id },
      { $addToSet: { papers: paper._id } },
      { returnDocument: 'after' }
    ).populate({
      path: 'papers',
      match: { owner: req.user._id },
    });

    return res.status(200).json({
      collection: updatedCollection,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to remove a paper from a collection.
 * DELETE /api/collections/:id/papers/:paperId
 *
 * Strictly verifies collection belongs to the authenticated user.
 * Uses $pull to remove reference without deleting the Paper document.
 * Idempotent: succeeds and returns the collection even if the paper was not in the collection.
 */
export async function removePaperFromCollection(req, res, next) {
  try {
    const { id: collectionId, paperId } = req.params;

    if (!collectionId || typeof collectionId !== 'string' || !OBJECT_ID_REGEX.test(collectionId) || !mongoose.Types.ObjectId.isValid(collectionId)) {
      return res.status(400).json({
        error: {
          message: 'Invalid collection ID format',
        },
      });
    }

    if (!paperId || typeof paperId !== 'string' || !OBJECT_ID_REGEX.test(paperId) || !mongoose.Types.ObjectId.isValid(paperId)) {
      return res.status(400).json({
        error: {
          message: 'Invalid paper ID format',
        },
      });
    }

    // Verify collection exists and belongs to authenticated user
    const collection = await Collection.findOne({
      _id: collectionId,
      owner: req.user._id,
    });

    if (!collection) {
      return res.status(404).json({
        error: {
          message: 'Collection not found',
        },
      });
    }

    // Atomically remove paper reference from collection using $pull
    const updatedCollection = await Collection.findOneAndUpdate(
      { _id: collectionId, owner: req.user._id },
      { $pull: { papers: paperId } },
      { returnDocument: 'after' }
    ).populate({
      path: 'papers',
      match: { owner: req.user._id },
    });

    return res.status(200).json({
      message: 'Paper removed from collection',
      collection: updatedCollection,
    });
  } catch (error) {
    next(error);
  }
}
