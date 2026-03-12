import express from "express";
import { searchPricing, getCategories, estimatePrice, comparePrices } from "../controllers/pricing.controller.js";
const router = express.Router();
router.get("/pricing/search", searchPricing);
router.get("/pricing/categories", getCategories);
router.get("/pricing/estimate", estimatePrice);
router.get("/pricing/compare", comparePrices);
export default router;
