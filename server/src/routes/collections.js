import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createCollection,
  listCollections,
  addPaperToCollection,
  removePaperFromCollection,
} from '../controllers/collectionController.js';

const router = Router();

// Protect all collection routes with authenticate middleware
router.use(authenticate);

// Collection endpoints
router.post('/', createCollection);
router.get('/', listCollections);
router.post('/:id/papers', addPaperToCollection);
router.delete('/:id/papers/:paperId', removePaperFromCollection);

export default router;
