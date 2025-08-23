// src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";

export type Role = "EMPLOYER" | "FRONTDESK" | "ADMIN";

export interface AuthedRequest extends Request {
  user?: { uid: string; role: Role };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user?.uid) return res.status(401).json({ error: "Unauthorized" });
  next();
}

export function requireRole(...allow: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.role) return res.status(401).json({ error: "Unauthorized" });
    if (!allow.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
