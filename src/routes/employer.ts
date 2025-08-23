import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";

const router = Router();

const ACTIVE_REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "ACCEPTED",
  "ASSIGNED",
  "CHECKED_IN",
  // keep CHECKED_OUT if you want to show until explicitly closed
  "CHECKED_OUT",
] as const;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

router.get(
  "/summary",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    try {
      // 1) which employer?
      const { data: me, error: meErr } = await supabaseAdmin
        .from("app_users")
        .select("employer_id")
        .eq("id", req.user!.uid)
        .maybeSingle();

      if (meErr) return res.status(500).json({ error: meErr.message });

      const employer_id = me?.employer_id as string | null;
      if (!employer_id) {
        return res.json({
          stats: { activeRequests: 0, workersInHouse: 0, extensionsDue: 0 },
          arrivals: [],
          requests: [],
        });
      }

      // 2) counts
      // 2a) active requests
      const { count: activeRequests, error: arErr } = await supabaseAdmin
        .from("room_requests")
        .select("id", { head: true, count: "exact" })
        .eq("employer_id", employer_id)
        .in("status", ACTIVE_REQUEST_STATUSES as unknown as string[]);
      if (arErr) return res.status(500).json({ error: arErr.message });

      // 2b) workers in-house
      const { count: workersInHouse, error: ihErr } = await supabaseAdmin
        .from("reservations")
        .select("id", { head: true, count: "exact" })
        .eq("employer_id", employer_id)
        .is("checkout_ts", null);
      if (ihErr) return res.status(500).json({ error: ihErr.message });

      // 2c) extensions due = SUBMITTED for any of employer's requests
      const { data: myReqIds, error: reqIdsErr } = await supabaseAdmin
        .from("room_requests")
        .select("id")
        .eq("employer_id", employer_id);
      if (reqIdsErr) return res.status(500).json({ error: reqIdsErr.message });

      let extensionsDue = 0;
      if ((myReqIds?.length ?? 0) > 0) {
        const ids = (myReqIds || []).map((r) => r.id);
        const { count: extCount, error: extErr } = await supabaseAdmin
          .from("extension_requests")
          .select("id", { head: true, count: "exact" })
          .in("room_request_id", ids)
          .eq("status", "SUBMITTED");
        if (extErr) return res.status(500).json({ error: extErr.message });
        extensionsDue = extCount || 0;
      }

      // 3) arrivals (next 7 days)
      const today = new Date();
      const next7 = new Date(today.getTime() + 7 * 24 * 3600 * 1000);

      // Prefer reservations with check-ins in the next 7 days
      const { data: resvArrivals, error: a1Err } = await supabaseAdmin
        .from("reservations")
        .select("worker_name, checkin_ts, hotel:hotels(name)")
        .eq("employer_id", employer_id)
        .gte("checkin_ts", new Date(today.setHours(0, 0, 0, 0)).toISOString())
        .lte("checkin_ts", new Date(next7.setHours(23, 59, 59, 999)).toISOString())
        .order("checkin_ts", { ascending: true })
        .limit(10);

      if (a1Err) return res.status(500).json({ error: a1Err.message });

      let arrivals =
        (resvArrivals || []).map((r: any) => ({
          worker: r.worker_name ?? "—",
          date: r.checkin_ts ?? "—",
          hotel: r.hotel?.name ?? "—",
        })) || [];

      // Fallback: upcoming room_requests by stay_start (if no reservations)
      if (arrivals.length === 0) {
        const { data: nextRequests, error: a2Err } = await supabaseAdmin
          .from("room_requests")
          .select("stay_start, headcount, hotel:hotels(name)")
          .eq("employer_id", employer_id)
          .gte("stay_start", ymd(new Date()))
          .lte("stay_start", ymd(new Date(Date.now() + 7 * 86400000)))
          .order("stay_start", { ascending: true })
          .limit(10);

        if (a2Err) return res.status(500).json({ error: a2Err.message });

        arrivals =
          (nextRequests || []).map((r: any) => ({
            worker: `${r.headcount} workers`,
            date: r.stay_start,
            hotel: r.hotel?.name ?? "—",
          })) || [];
      }

      // 4) latest active requests with hotel names
      const { data: reqs, error: listErr } = await supabaseAdmin
        .from("room_requests")
        .select("id, stay_start, stay_end, headcount, status, hotel:hotels(name)")
        .eq("employer_id", employer_id)
        .in("status", ACTIVE_REQUEST_STATUSES as unknown as string[])
        .order("created_at", { ascending: false })
        .limit(20);

      if (listErr) return res.status(500).json({ error: listErr.message });

      const requests =
        (reqs || []).map((r: any) => ({
          id: r.id,
          hotel: r.hotel?.name ?? "—",
          stay_start: r.stay_start,
          stay_end: r.stay_end,
          headcount: r.headcount,
          status: r.status,
        })) || [];

      return res.json({
        stats: {
          activeRequests: activeRequests ?? 0,
          workersInHouse: workersInHouse ?? 0,
          extensionsDue,
        },
        arrivals,
        requests,
      });
    } catch (e: any) {
      console.error("[employer/summary] unexpected", e);
      return res.status(500).json({ error: e.message || "Failed to load summary" });
    }
  }
);

export default router;
