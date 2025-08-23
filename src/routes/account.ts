import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

// GET /api/account  -> { user: { id, email, name, role } }
router.get("/account", requireAuth, async (req: AuthedRequest, res) => {
  res.set("Cache-Control", "no-store");
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, email, name, role")
    .eq("id", req.user!.uid)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "User not found" });
  return res.json({ user: data });
});

// PUT /api/account  -> update profile (name only)
const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
});
router.put("/account", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { error, data } = await supabaseAdmin
    .from("app_users")
    .update({ name: parsed.data.name })
    .eq("id", req.user!.uid)
    .select("id, email, name, role")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ user: data });
});

// PUT /api/account/password  -> change password
const pwSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});
router.put("/account/password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = pwSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { data: user, error: selErr } = await supabaseAdmin
    .from("app_users")
    .select("id, password_hash")
    .eq("id", req.user!.uid)
    .single();
  if (selErr || !user) return res.status(500).json({ error: selErr?.message || "User missing" });

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.password_hash);
  if (!ok) return res.status(400).json({ error: "Current password is incorrect" });

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const { error: upErr } = await supabaseAdmin
    .from("app_users")
    .update({ password_hash: newHash })
    .eq("id", req.user!.uid);
  if (upErr) return res.status(500).json({ error: upErr.message });

  return res.json({ ok: true });
});

export default router;
