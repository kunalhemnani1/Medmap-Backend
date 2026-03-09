import express from "express";
import { getHospitalById, getHospitalStats, compareHospitals } from "../controllers/hospital.controller.js";

const router = express.Router();

router.get("/hospitals/stats", getHospitalStats);
router.get("/hospitals/compare", compareHospitals);
router.get("/hospitals/:id", getHospitalById);

export default router;
