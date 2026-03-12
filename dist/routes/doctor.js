import express from "express";
import { getDoctors, getDoctorById, getSpecialties } from "../controllers/doctor.controller.js";
const router = express.Router();
router.get("/doctors", getDoctors);
router.get("/doctors/specialties", getSpecialties);
router.get("/doctors/:id", getDoctorById);
export default router;
