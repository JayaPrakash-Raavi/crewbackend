import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth";
import hotelsRoutes from "./routes/hotels";
import roomReqRoutes from "./routes/roomRequests";

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

app.use("/api", authRoutes);               // /signup, /login, /logout, /me
app.use("/api/hotels", hotelsRoutes);      // GET /
app.use("/api/room-requests", roomReqRoutes);

export default app;
