import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { SignJWT } from "jose";
import { supabaseAdmin } from "../lib/supabase";
import { setSessionCookie, clearSessionCookie } from "../utils/cookies";
import { requireAuth } from "../middleware/auth";

const router = Router();
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");

async function signSession(payload: { uid: string; role: "EMPLOYER"|"FRONTDESK"|"ADMIN" }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("wlp").setAudience("user")
    .setExpirationTime("7d")
    .sign(secret);
}

const signupSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(6) });
router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { name, email, password } = parsed.data;

  const { data: existing, error: selErr } = await supabaseAdmin
    .from("app_users").select("id").ilike("email", email).maybeSingle();
  if (selErr) return res.status(500).json({ error: selErr.message });
  if (existing) return res.status(409).json({ error: "Email already in use" });

  const password_hash = await bcrypt.hash(password, 12);
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("app_users")
    .insert({ email, password_hash, name, role: "EMPLOYER" })
    .select("id, role")
    .single();
  if (insErr) return res.status(500).json({ error: insErr.message });

  const token = await signSession({ uid: inserted.id, role: inserted.role });
  setSessionCookie(res, token);
  res.json({ ok: true });
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { email, password } = parsed.data;
  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .select("id, password_hash, role")
    .ilike("email", email)
    .single();
  if (error || !user) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const token = await signSession({ uid: user.id, role: user.role });
  setSessionCookie(res, token);
  res.json({ ok: true });
});

router.post("/logout", async (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .select("id, email, role, name, employer_id, hotel_id, created_at")
    .eq("id", req.user!.uid)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ user });
});

export default router;
