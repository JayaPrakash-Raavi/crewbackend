import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

const createSchema = z.object({
  hotel_id: z.string().uuid(),
  stay_start: z.string(),
  stay_end: z.string(),
  headcount: z.number().int().positive(),
  singleRooms: z.number().int().nonnegative(),
  doubleRooms: z.number().int().nonnegative(),
  notes: z.string().optional(),
}).refine(v => new Date(v.stay_end) > new Date(v.stay_start), { message: "End must be after start", path: ["stay_end"] })
  .refine(v => v.singleRooms + v.doubleRooms > 0, { message: "At least one room required", path: ["singleRooms"] });

router.get("/", requireAuth, requireRole("EMPLOYER"), async (req, res) => {
  const { data: me, error: meErr } = await supabaseAdmin
    .from("app_users").select("employer_id").eq("id", req.user!.uid).single();
  if (meErr) return res.status(500).json({ error: meErr.message });
  if (!me?.employer_id) return res.status(400).json({ error: "Your account is not linked to an employer_id" });

  const { data, error } = await supabaseAdmin
    .from("room_requests")
    .select("id, hotel_id, stay_start, stay_end, headcount, room_type_mix, status, created_at")
    .eq("employer_id", me.employer_id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ requests: data ?? [] });
});

router.post("/", requireAuth, requireRole("EMPLOYER"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { hotel_id, stay_start, stay_end, headcount, singleRooms, doubleRooms, notes } = parsed.data;

  const { data: me, error: meErr } = await supabaseAdmin
    .from("app_users").select("employer_id").eq("id", req.user!.uid).single();
  if (meErr) return res.status(500).json({ error: meErr.message });
  if (!me?.employer_id) return res.status(400).json({ error: "Your account is not linked to an employer_id" });

  const payload = {
    employer_id: me.employer_id,
    hotel_id,
    stay_start, stay_end,
    headcount,
    room_type_mix: { SINGLE: singleRooms, DOUBLE: doubleRooms },
    notes: notes ?? null,
    status: "SUBMITTED",
  };

  const { error } = await supabaseAdmin.from("room_requests").insert(payload);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.get("/:id", requireAuth, requireRole("EMPLOYER"), async (req, res) => {
  const { id } = req.params;

  const { data: me, error: meErr } = await supabaseAdmin
    .from("app_users").select("employer_id").eq("id", req.user!.uid).single();
  if (meErr) return res.status(500).json({ error: meErr.message });
  if (!me?.employer_id) return res.status(400).json({ error: "No employer_id" });

  const { data, error } = await supabaseAdmin
    .from("room_requests")
    .select("id, employer_id, hotel_id, stay_start, stay_end, headcount, room_type_mix, notes, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Not found" });
  if (data.employer_id !== me.employer_id) return res.status(403).json({ error: "Forbidden" });

  const { data: hotel, error: hErr } = await supabaseAdmin
    .from("hotels").select("name").eq("id", data.hotel_id).single();
  if (hErr) return res.status(500).json({ error: hErr.message });

  res.json({ request: { ...data, hotel_name: hotel?.name ?? "—" } });
});

router.patch("/:id/cancel", requireAuth, requireRole("EMPLOYER"), async (req, res) => {
  const { id } = req.params;

  const { data: me, error: meErr } = await supabaseAdmin
    .from("app_users").select("employer_id").eq("id", req.user!.uid).single();
  if (meErr) return res.status(500).json({ error: meErr.message });
  if (!me?.employer_id) return res.status(400).json({ error: "No employer_id" });

  const { data: row, error: selErr } = await supabaseAdmin
    .from("room_requests").select("id, employer_id, status").eq("id", id).maybeSingle();
  if (selErr) return res.status(500).json({ error: selErr.message });
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.employer_id !== me.employer_id) return res.status(403).json({ error: "Forbidden" });
  if (row.status !== "SUBMITTED") return res.status(400).json({ error: "Only SUBMITTED requests can be canceled" });

  const { error } = await supabaseAdmin.from("room_requests").update({ status: "CANCELED" }).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
