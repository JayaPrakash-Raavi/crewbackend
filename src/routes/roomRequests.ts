// src/routes/roomRequests.ts
import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { logEvent } from "../utils/eventlog";

const router = Router();

/* ---------- Validators ---------- */
const roomMixSchema = z.object({
  SINGLE: z.number().int().min(0),
  DOUBLE: z.number().int().min(0),
});
const createReqSchema = z.object({
  hotel_id: z.string().uuid(),
  stay_start: z.string(), // YYYY-MM-DD
  stay_end: z.string(),   // YYYY-MM-DD
  headcount: z.number().int().min(1),
  room_type_mix: roomMixSchema,
  notes: z.string().optional(),
});

function after(a: string, b: string) {
  return new Date(a).getTime() < new Date(b).getTime();
}

/* ---------- Create room request ---------- */
router.post(
  "/employer/requests",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    const parsed = createReqSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const { hotel_id, stay_start, stay_end, headcount, room_type_mix, notes } = parsed.data;
    if (!after(stay_start, stay_end)) return res.status(400).json({ error: "stay_end must be after stay_start" });

    // resolve employer_id of the current user
    const { data: me, error: meErr } = await supabaseAdmin
      .from("app_users").select("employer_id").eq("id", req.user!.uid).maybeSingle();
    if (meErr) return res.status(500).json({ error: meErr.message });
    if (!me?.employer_id) return res.status(400).json({ error: "User has no employer_id" });

    const { data, error } = await supabaseAdmin
      .from("room_requests")
      .insert({
        employer_id: me.employer_id,
        hotel_id,
        stay_start,
        stay_end,
        headcount,
        room_type_mix,
        notes: notes ?? null,
        status: "SUBMITTED",
      })
      .select("id")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    logEvent({ type: "RoomRequest", id: data.id }, "SUBMIT", { id: req.user!.uid, role: req.user!.role }, { headcount });

    return res.status(201).json({ id: data.id });
  }
);

/* ---------- List my employer requests ---------- */
router.get(
  "/employer/requests",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    const status = (req.query.status as string) || undefined;
    const { data: me } = await supabaseAdmin
      .from("app_users").select("employer_id").eq("id", req.user!.uid).maybeSingle();

    const q = supabaseAdmin
      .from("room_requests")
      .select("id, hotel_id, stay_start, stay_end, headcount, status, notes")
      .eq("employer_id", me?.employer_id ?? "00000000-0000-0000-0000-000000000000")
      .order("created_at", { ascending: false });

    if (status) q.eq("status", status);

    const { data, error } = await q.limit(50);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data ?? [] });
  }
);

/* ---------- Get one request ---------- */
router.get(
  "/employer/requests/:id",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    const id = req.params.id;
    const { data, error } = await supabaseAdmin
      .from("room_requests")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return res.status(404).json({ error: "Not found" });
    res.json({ request: data });
  }
);

/* ---------- Request extension (+7 days max, non-overlapping) ---------- */
const extendSchema = z.object({
  week_start: z.string(),
  week_end: z.string(),
  scope: z.string().optional(),
});
router.post(
  "/employer/requests/:id/extend",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    const id = req.params.id;
    const parsed = extendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const { week_start, week_end, scope } = parsed.data;

    // guard: <= 7 days
    const days = (new Date(week_end).getTime() - new Date(week_start).getTime()) / 86400000;
    if (days > 7.01 || days <= 0) return res.status(400).json({ error: "Extensions limited to +7 days" });

    const { data, error } = await supabaseAdmin
      .from("extension_requests")
      .insert({
        room_request_id: id,
        week_start,
        week_end,
        scope: scope ?? null,
        status: "SUBMITTED",
      })
      .select("id")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    logEvent({ type: "Extension", id: data.id }, "SUBMIT", { id: req.user!.uid, role: req.user!.role });
    res.status(201).json({ id: data.id });
  }
);

export default router;
