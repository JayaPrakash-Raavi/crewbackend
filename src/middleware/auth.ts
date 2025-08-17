import type { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";

export type Role = "EMPLOYER" | "FRONTDESK" | "ADMIN";
export type ReqUser = { uid: string; role: Role };

declare global {
  namespace Express { interface Request { user?: ReqUser } }
}

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[process.env.COOKIE_NAME || "session"];
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: "wlp", audience: "user" });
    req.user = payload as ReqUser;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
