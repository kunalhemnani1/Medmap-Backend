import { Router } from "express";
import {
    listMyHospitals, getPublicHospitals, getHospitalById, createHospital, updateHospital,
    listDoctors, addDoctor, removeDoctor,
    listPrices, addPrice, removePrice,
    createAppointment, listPatientAppointments, listHospitalAppointments, updateAppointmentStatus,
    createReview, listReviews,
    listDoctorAppointments,
    adminListHospitals, adminVerifyHospital, adminListAppointments,
    submitDoctorRequest, adminListDoctorRequests, adminDecideDoctorRequest,
    listMyDoctorInvites, acceptDoctorInvite,
    getReviewToken,
    adminListFlaggedReviews, adminDeleteReview, adminUnflagReview,
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
router.get("/review-token", getReviewToken);

// Doctor registration requests
router.post("/doctor-requests", submitDoctorRequest);

// Doctor invites (3-way handshake acceptance)
router.get("/doctor/invites", listMyDoctorInvites);
router.patch("/doctor/invites/:doctorId", acceptDoctorInvite);

// Admin routes
router.get("/admin/hospitals", adminListHospitals);
router.patch("/admin/hospitals/:id/verify", adminVerifyHospital);
router.get("/admin/appointments", adminListAppointments);
router.get("/admin/doctor-requests", adminListDoctorRequests);
router.patch("/admin/doctor-requests/:id", adminDecideDoctorRequest);
router.get("/admin/reviews/flagged", adminListFlaggedReviews);
router.delete("/admin/reviews/:id", adminDeleteReview);
router.patch("/admin/reviews/:id/unflag", adminUnflagReview);

export default router;
