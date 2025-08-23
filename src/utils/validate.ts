import type { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";

const COOKIE_NAME = process.env.COOKIE_NAME || "session";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");

function parseCookie(header?: string) {
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [k, ...v] = part.split("=");
    if (k) acc[k.trim()] = decodeURIComponent(v.join("=").trim());
    return acc;
  }, {} as Record<string, string>);
}

export async function attachUserFromCookie(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = parseCookie(req.headers.cookie)[COOKIE_NAME];
    if (token) {
      const { payload } = await jwtVerify(token, secret, { issuer: "wlp", audience: "user" });
      (req as any).user = { uid: String(payload.uid), role: payload.role as any };
    } else {
      (req as any).user = undefined;
    }
  } catch {
    (req as any).user = undefined;
  } finally {
    next();
  }
}
