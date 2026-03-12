import express from "express";
import { searchMedications, getMedicationById, checkInteractions } from "../controllers/medication.controller.js";
const router = express.Router();
router.get("/medications", searchMedications);
router.get("/medications/interactions", checkInteractions);
router.get("/medications/:id", getMedicationById);
export default router;
