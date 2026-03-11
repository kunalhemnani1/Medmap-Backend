import express from "express";
import { getPlans, getPlanById, checkCoverage } from "../controllers/insurance.controller.js";

const router = express.Router();

router.get("/insurance/plans", getPlans);
router.get("/insurance/check", checkCoverage);
router.get("/insurance/plans/:id", getPlanById);

export default router;
