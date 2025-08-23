import type { Response } from "express";

const NAME = process.env.COOKIE_NAME || "session";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const IS_PROD = process.env.NODE_ENV === "production";

export function setSessionCookie(res: Response, token: string) {
  res.cookie(NAME, token, {
    httpOnly: true,
    path: "/",
    maxAge: WEEK,
    sameSite: IS_PROD ? "none" : "lax", // LAX in dev
    secure: IS_PROD,                    // false in dev
    // domain: process.env.COOKIE_DOMAIN, // leave undefined in dev
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(NAME, {
    httpOnly: true,
    path: "/",
    sameSite: IS_PROD ? "none" : "lax",
    secure: IS_PROD,
    // domain: process.env.COOKIE_DOMAIN,
  });
}
