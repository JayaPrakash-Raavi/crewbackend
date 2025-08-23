import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";
import { logEvent } from "../utils/eventlog";

const router = Router();

router.get("/summary", requireAuth, requireRole("FRONTDESK"), async (req, res) => {
  // ... (your existing summary code)
  res.json({ stats: { arrivalsToday: 0, pendingRequests: 0, inHouse: 0 }, arrivals: [], pending: [] });
});

/* Accept/Reject a submitted room request */
const decisionSchema = z.object({ decision: z.enum(["ACCEPT", "REJECT"]), note: z.string().optional() });

router.post("/requests/:id/decision", requireAuth, requireRole("FRONTDESK"), async (req: AuthedRequest, res) => {
  const id = req.params.id;
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const newStatus = parsed.data.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
  const { error } = await supabaseAdmin
    .from("room_requests")
    .update({ status: newStatus })
    .eq("id", id)
    .eq("status", "SUBMITTED"); // only if still pending

  if (error) return res.status(500).json({ error: error.message });

  logEvent({ type: "RoomRequest", id }, parsed.data.decision, { id: req.user!.uid, role: req.user!.role });
  res.json({ ok: true, status: newStatus });
});

export default router;
