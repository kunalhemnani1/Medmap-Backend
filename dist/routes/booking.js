import express from "express";
import { getBookings, getBookingById } from "../controllers/booking.controller.js";
const router = express.Router();
router.get("/bookings", getBookings);
router.get("/bookings/:id", getBookingById);
export default router;
