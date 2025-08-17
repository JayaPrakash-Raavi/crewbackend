import type { Request } from "express";

export function parseJson<T = any>(req: Request): T | null {
  const ct = (req.headers["content-type"] || "").toString();
  if (!ct.includes("application/json")) return null;
  return req.body as T;
}
