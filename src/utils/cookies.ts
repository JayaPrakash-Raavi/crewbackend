import type { Response } from "express";

const COOKIE = process.env.COOKIE_NAME || "session";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || "";
const CROSS_SITE = process.env.CROSS_SITE === "true";
const sameSite = CROSS_SITE ? "none" : "lax";
const secure = CROSS_SITE || process.env.NODE_ENV === "production";

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: sameSite as "lax" | "none",
    secure,
    maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {})
  });
}

export function clearSessionCookie(res: Response) {
  res.cookie(COOKIE, "", {
    httpOnly: true,
    path: "/",
    sameSite: sameSite as "lax" | "none",
    secure,
    maxAge: 0,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {})
  });
}
