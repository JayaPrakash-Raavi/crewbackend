import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";

const router = Router();

/**
 * GET /api/employer/summary
 * Returns employer dashboard data for the logged-in user's employer_id.
 */
router.get("/summary", requireAuth, requireRole("EMPLOYER"), async (req: AuthedRequest, res) => {
  try {
    // Get this user's employer_id
    const { data: me, error: meErr } = await supabaseAdmin
      .from("app_users")
      .select("employer_id")
      .eq("id", req.user!.uid)
      .maybeSingle();
    if (meErr) return res.status(500).json({ error: meErr.message });

    const employer_id = me?.employer_id;
    if (!employer_id) {
      return res.json({
        stats: { activeRequests: 0, workersInHouse: 0, extensionsDue: 0 },
        arrivals: [],
        requests: [],
      });
    }

    // Active requests (simple example: not CLOSED/REJECTED)
    const { count: activeRequests } = await supabaseAdmin
      .from("room_requests")
      .select("*", { count: "exact", head: true })
      .eq("employer_id", employer_id)
      .not("status", "in", '("CLOSED","REJECTED")');

    // Workers in-house (if you have reservations/check-ins; stub to 0 if not)
    const { count: workersInHouse } = await supabaseAdmin
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("employer_id", employer_id)
      .is("checkout_ts", null);

    // Extensions due (stub: requests ending in next 7 days)
    const { count: extensionsDue } = await supabaseAdmin
      .from("room_requests")
      .select("*", { count: "exact", head: true })
      .eq("employer_id", employer_id)
      .gte("stay_end", new Date().toISOString().slice(0, 10))
      .lte(
        "stay_end",
        new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      );

    // Sample arrivals list (if you track ETA/arrivals elsewhere, adjust)
    const { data: arrivals } = await supabaseAdmin
      .from("reservations")
      .select("worker_name, checkin_ts, hotel_name")
      .eq("employer_id", employer_id)
      .order("checkin_ts", { ascending: true })
      .limit(10);

    // Active requests table
    const { data: requests } = await supabaseAdmin
      .from("room_requests")
      .select("id, hotel_id, stay_start, stay_end, headcount, status")
      .eq("employer_id", employer_id)
      .not("status", "in", '("CLOSED","REJECTED")')
      .order("stay_start", { ascending: true })
      .limit(20);

    res.json({
      stats: {
        activeRequests: activeRequests ?? 0,
        workersInHouse: workersInHouse ?? 0,
        extensionsDue: extensionsDue ?? 0,
      },
      arrivals:
        (arrivals ?? []).map((a: any) => ({
          worker: a.worker_name ?? "—",
          date: a.checkin_ts ?? "—",
          hotel: a.hotel_name ?? "—",
        })) ?? [],
      requests:
        (requests ?? []).map((r: any) => ({
          id: r.id,
          hotel: r.hotel_id ?? "—",
          stay_start: r.stay_start,
          stay_end: r.stay_end,
          headcount: r.headcount,
          status: r.status,
        })) ?? [],
    });
  } catch (e: any) {
    console.error("[employer.summary]", e);
    res.status(500).json({ error: e.message || "Failed to load summary" });
  }
});

export default router;
