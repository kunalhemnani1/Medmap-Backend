import express from 'express';
import { searchHospitals, getAutoSuggestions, getFacets } from '../controllers/search.controller.js';

const router = express.Router();

router.get('/search/hospitals', searchHospitals);
router.get('/search/suggest', getAutoSuggestions);
router.get('/search/facets', getFacets);

export default router;