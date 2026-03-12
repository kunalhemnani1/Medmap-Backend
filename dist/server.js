import express from 'express';
import 'dotenv/config';
import morgan from 'morgan';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import searchRouter from './routes/search.js';
import hospitalRouter from './routes/hospital.js';
import pricingRouter from './routes/pricing.js';
import reviewRouter from './routes/review.js';
import doctorRouter from './routes/doctor.js';
import insuranceRouter from './routes/insurance.js';
import medicationRouter from './routes/medication.js';
import bookingRouter from './routes/booking.js';
import bookmarkRouter from './routes/bookmark.js';
import registeredHospitalRouter from './routes/registered-hospital.js';
const app = express();
const port = 8000;
// Rate limiters
const globalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
});
const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many auth attempts, please try again later." },
});
const searchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 min
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many search requests, please slow down." },
});
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(globalLimiter);
app.all("/api/auth/{*any}/", authLimiter, toNodeHandler(auth));
app.use("/api/search", searchLimiter);
app.use("/api", searchRouter);
app.use("/api", hospitalRouter);
app.use("/api", pricingRouter);
app.use("/api", reviewRouter);
app.use("/api", doctorRouter);
app.use("/api", insuranceRouter);
app.use("/api", medicationRouter);
app.use("/api", bookingRouter);
app.use("/api", bookmarkRouter);
app.use("/api", registeredHospitalRouter);
if (process.env.NODE_ENV !== "test") {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}
export default app;
