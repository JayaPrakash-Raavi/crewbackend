import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { SignJWT } from "jose";
import { supabaseAdmin } from "../lib/supabase";
import { setSessionCookie, clearSessionCookie } from "../utils/cookies";
import { requireAuth } from "../middleware/auth";
import type { AuthedRequest } from "../middleware/auth";

const router = Router();

type Role = "EMPLOYER" | "FRONTDESK" | "ADMIN";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");
const ADMIN_INVITE_CODE = (process.env.ADMIN_INVITE_CODE || "").trim();

async function signSession(payload: { uid: string; role: Role }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("wlp")
    .setAudience("user")
    .setExpirationTime("7d")
    .sign(secret);
}

/* ─────────────────────────  SIGNUP  ───────────────────────── */

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["EMPLOYER", "FRONTDESK", "ADMIN"]).optional(),
  adminCode: z.string().optional(),
});

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { name, email, password, role, adminCode } = parsed.data;

  try {
    // Decide final role (prevent privilege escalation)
    let finalRole: Role = "EMPLOYER";
    if (role === "FRONTDESK") finalRole = "FRONTDESK";
    if (role === "ADMIN") {
      if (ADMIN_INVITE_CODE && adminCode === ADMIN_INVITE_CODE) {
        finalRole = "ADMIN";
      } else {
        return res.status(403).json({ error: "Invalid admin invite code" });
      }
    }

    const password_hash = await bcrypt.hash(password, 12);

    // Insert directly; rely on DB unique(email) and catch 23505 for dupes
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("app_users")
      .insert({ email, password_hash, name, role: finalRole })
      .select("id, role")
      .single();

    if (insErr) {
      // Postgres duplicate key violation
      // supabase error objects often include .code but safe-guard anyway
      if ((insErr as any).code === "23505") {
        return res.status(409).json({ error: "Email already in use" });
      }
      console.error("[signup] insert error:", insErr);
      return res.status(500).json({ error: insErr.message || "Signup failed" });
    }

    const token = await signSession({ uid: inserted!.id, role: inserted!.role as Role });
    setSessionCookie(res, token);

    // You can return user basics if you prefer: { user: { id, role } }
    return res.status(201).json({ ok: true });
  } catch (e: any) {
    console.error("[signup] unexpected:", e);
    return res.status(500).json({ error: e.message || "Signup failed" });
  }
});

/* ─────────────────────────  LOGIN  ───────────────────────── */

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const { email, password } = parsed.data;

  try {
    const { data: user, error } = await supabaseAdmin
      .from("app_users")
      .select("id, password_hash, role")
      .ilike("email", email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = await signSession({ uid: user.id, role: user.role as Role });
    setSessionCookie(res, token);
    return res.json({ ok: true });
  } catch (e: any) {
    console.error("[login] unexpected:", e);
    return res.status(500).json({ error: e.message || "Login failed" });
  }
});

/* ────────────────────────  LOGOUT & ME  ───────────────────── */

router.post("/logout", async (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from("app_users")
      .select("id, email, role, name, employer_id, hotel_id, created_at")
      .eq("id", req.user!.uid)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ user });
  } catch (e: any) {
    console.error("[me] unexpected:", e);
    return res.status(500).json({ error: e.message || "Failed to load profile" });
  }
});

export default router;
