import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.get("/summary", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const { count: users } = await supabaseAdmin.from("app_users").select("*", { head: true, count: "exact" });
  const { count: hotels } = await supabaseAdmin.from("hotels").select("*", { head: true, count: "exact" });
  res.json({ stats: { users: users ?? 0, hotels: hotels ?? 0, occupancyPct: 0 }, recentEvents: [] });
});

router.get("/users", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, email, name, role, employer_id, hotel_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data ?? [] });
});

const roleSchema = z.object({ role: z.enum(["EMPLOYER", "FRONTDESK", "ADMIN"]) });
router.patch("/users/:id/role", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = req.params.id;
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid role" });
  const { error } = await supabaseAdmin.from("app_users").update({ role: parsed.data.role }).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
