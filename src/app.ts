
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth";
import hotelsRoutes from "./routes/hotels";
import employerRequests from "./routes/roomRequests";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import employerRoutes from "./routes/employer";
import frontdeskRoutes from "./routes/frontdesk";
import adminRoutes from "./routes/admin";
import { attachUserFromCookie } from "./utils/validate"; // whatever you use to read JWT into req.user



const app = express();
const ORIGIN = process.env.FRONTEND_ORIGIN || "";
const allowCredentials = true;

app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: ORIGIN || undefined, // set exact origin in env (no *)
  credentials: allowCredentials
}));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use(attachUserFromCookie);   // <-- ADD THIS (must be before routes)
app.use("/api", authRoutes);               // /signup, /login, /logout, /me
app.use("/api/hotels", hotelsRoutes);      // GET /
app.use("/api", employerRequests);
app.use("/api/employer", employerRoutes);
app.use("/api/frontdesk", frontdeskRoutes);
app.use("/api/admin", adminRoutes);

export default app;
