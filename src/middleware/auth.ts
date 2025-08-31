// src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";

export type Role = "EMPLOYER" | "FRONTDESK" | "ADMIN";

export interface AuthedRequest extends Request {
  user?: { uid: string; role: Role };
}

const COOKIE_NAME = process.env.COOKIE_NAME || "session";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");

/** Attach req.user from the signed session cookie (if present) */
export async function attachUserFromCookie(req: Request, _res: Response, next: NextFunction) {
  try {
    // cookie-parser populates req.cookies (any-typed)
    const token: string | undefined = (req as any).cookies?.[COOKIE_NAME];
    if (token) {
      const { payload } = await jwtVerify(token, secret, {
        issuer: "wlp",
        audience: "user",
      });
      (req as AuthedRequest).user = {
        uid: String(payload.uid),
        role: payload.role as Role,
      };
    } else {
      (req as AuthedRequest).user = undefined;
    }
  } catch {
    (req as AuthedRequest).user = undefined;
  } finally {
    next();
  }
}

/** Require any authenticated user */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user?.uid) return res.status(401).json({ error: "Unauthorized" });
  next();
}

/** Require one of the allowed roles */
export function requireRole(...allow: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.role) return res.status(401).json({ error: "Unauthorized" });
    if (!allow.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
