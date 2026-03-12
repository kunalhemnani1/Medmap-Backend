import express from "express";
import { getReviews, getReviewStats } from "../controllers/review.controller.js";
const router = express.Router();
router.get("/reviews", getReviews);
router.get("/reviews/stats", getReviewStats);
export default router;
