import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";

import { attachUserFromCookie } from "./middleware/auth"; // ✅ correct path

// routes
import authRoutes from "./routes/auth";
import hotelsRoutes from "./routes/hotels";
import employerRequests from "./routes/roomRequests";
import employerRoutes from "./routes/employer";
import frontdeskRoutes from "./routes/frontdesk";
import adminRoutes from "./routes/admin";
import employerWorkers from "./routes/employerWorkers";
import employerAccount from "./routes/employerAccount";
import accountRoutes from "./routes/account";

const app = express();
const ORIGIN = process.env.FRONTEND_ORIGIN || "";

// Important for cookies behind Vercel proxy
app.set("trust proxy", 1);
// Avoid etag/304 on JSON
app.set("etag", false);

app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: ORIGIN || undefined, // exact FE origin in prod
    credentials: true,
  })
);

// No-store on all API responses (prevents 304 caching issues)
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Attach user from cookie BEFORE routes
app.use(attachUserFromCookie);

// Health first
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Mount routes
app.use("/api", authRoutes);                 // /signup, /login, /logout, /me
app.use("/api/hotels", hotelsRoutes);        // GET /
app.use("/api", employerRequests);           // /employer/requests ...
app.use("/api/employer", employerRoutes);
app.use("/api/frontdesk", frontdeskRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/employer", employerWorkers);
app.use("/api/employer", employerAccount);
app.use("/api", accountRoutes);

// Export app (NO app.listen() here)
export default app;
