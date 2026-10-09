import { Router } from 'express';
import { CAMPUSES, publicCampus } from '../config/campuses.js';

const router = Router();

// GET /api/campuses → { campuses: [{ id, name, shortName, city }] }
// Public: the sign-up form needs it before anyone has a token.
router.get('/', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ campuses: CAMPUSES.map(publicCampus) });
});

export default router;
