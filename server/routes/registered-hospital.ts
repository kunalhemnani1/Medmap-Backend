import { Router } from "express";
import {
    listMyHospitals, getPublicHospitals, getHospitalById, createHospital, updateHospital,
    listDoctors, addDoctor, removeDoctor,
    listPrices, addPrice, removePrice,
    createAppointment, listPatientAppointments, listHospitalAppointments, updateAppointmentStatus,
    createReview, listReviews,
    listDoctorAppointments,
    adminListHospitals, adminVerifyHospital, adminListAppointments,
} from "../controllers/registered-hospital.controller.js";

const router = Router();

// Public hospital listing / detail
router.get("/registered-hospitals", getPublicHospitals);
router.get("/registered-hospitals/mine", listMyHospitals);
router.get("/registered-hospitals/:id", getHospitalById);
router.post("/registered-hospitals", createHospital);
router.patch("/registered-hospitals/:id", updateHospital);

// Doctors
router.get("/registered-hospitals/:id/doctors", listDoctors);
router.post("/registered-hospitals/:id/doctors", addDoctor);
router.delete("/registered-hospitals/:id/doctors/:doctorId", removeDoctor);

// Prices
router.get("/registered-hospitals/:id/prices", listPrices);
router.post("/registered-hospitals/:id/prices", addPrice);
router.delete("/registered-hospitals/:id/prices/:priceId", removePrice);

// Hospital appointments view (owner)
router.get("/registered-hospitals/:id/appointments", listHospitalAppointments);

// Appointments
router.post("/appointments", createAppointment);
router.get("/appointments/mine", listPatientAppointments);
router.patch("/appointments/:appointmentId/status", updateAppointmentStatus);

// Doctor appointments across all their hospitals
router.get("/doctor/appointments", listDoctorAppointments);

// Reviews
router.get("/registered-hospitals/:id/reviews", listReviews);
router.post("/hospital-reviews", createReview);

// Admin routes
router.get("/admin/hospitals", adminListHospitals);
router.patch("/admin/hospitals/:id/verify", adminVerifyHospital);
router.get("/admin/appointments", adminListAppointments);

export default router;
