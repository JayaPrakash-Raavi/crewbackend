import { Router } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";

const router = Router();

type WorkerRow = {
  id: string;
  name: string;
  phone: string | null;
  status: "Unassigned" | "In-house" | "Upcoming" | "Checked-out";
  hotel: string | null;
  room_no: string | null;
  checkin_ts: string | null;
  checkout_ts: string | null;
  gov_id_type: string | null;
  gov_id_last4: string | null;
  notes: string | null;
};

// helper
const ymd = (d: Date) => d.toISOString().slice(0, 10);

router.get(
  "/workers",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    try {
      // filters
      const q = String(req.query.q || "").trim();
      const hotelId = String(req.query.hotel_id || "").trim();
      const status = String(req.query.status || "").trim(); // Unassigned|In-house|Upcoming|Checked-out
      const rangeStart = String(req.query.start || "").trim();
      const rangeEnd = String(req.query.end || "").trim();

      // who am I
      const { data: me, error: meErr } = await supabaseAdmin
        .from("app_users")
        .select("employer_id")
        .eq("id", req.user!.uid)
        .maybeSingle();
      if (meErr) return res.status(500).json({ error: meErr.message });

      const employer_id = me?.employer_id as string | null;
      if (!employer_id) {
        return res.json({
          hotels: [],
          buckets: { byHotel: [], unassigned: 0, upcoming: 0, checkedOut30d: 0 },
          workers: [],
        });
      }

      // base data
      const [{ data: workers, error: wErr }, { data: hotels, error: hErr }] =
        await Promise.all([
          supabaseAdmin
            .from("workers")
            .select("id, name, phone, notes, gov_id_type, gov_id_last4")
            .eq("employer_id", employer_id)
            .order("name", { ascending: true }),
          supabaseAdmin
            .from("hotels")
            .select("id, name")
            .order("name", { ascending: true }),
        ]);
      if (wErr) return res.status(500).json({ error: wErr.message });
      if (hErr) return res.status(500).json({ error: hErr.message });

      // reservations snapshot (we’ll derive current/upcoming/checked-out)
      const todayISO = new Date().toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

      const { data: resv, error: rErr } = await supabaseAdmin
        .from("reservations")
        .select("id, worker_name, room_no, hotel:hotels(name,id), checkin_ts, checkout_ts, employer_id")
        .eq("employer_id", employer_id)
        .order("checkin_ts", { ascending: false });
      if (rErr) return res.status(500).json({ error: rErr.message });

      // Build quick indexes by worker name (if you have worker_id on reservations, use that instead)
      const lastResvByWorkerName = new Map<string, any>();
      for (const r of resv || []) {
        const key = (r as any).worker_name?.trim?.() || "";
        if (!key) continue;
        const prev = lastResvByWorkerName.get(key);
        // keep most recent by checkin_ts
        if (!prev || (r.checkin_ts || "") > (prev.checkin_ts || "")) {
          lastResvByWorkerName.set(key, r);
        }
      }

      // derive hotel bucket counts
      const inHouseByHotel = new Map<string, number>();
      let upcomingCount = 0;
      let checkedOut30d = 0;

      for (const r of resv || []) {
        const checkin = r.checkin_ts ? new Date(r.checkin_ts) : null;
        const checkout = r.checkout_ts ? new Date(r.checkout_ts) : null;

        if (r.checkout_ts == null && r.checkin_ts && r.checkin_ts <= todayISO) {
          // in-house
          const hid = (r as any).hotel?.id as string | undefined;
          if (hid) inHouseByHotel.set(hid, (inHouseByHotel.get(hid) || 0) + 1);
        } else if (r.checkin_ts && r.checkin_ts > todayISO) {
          upcomingCount++;
        } else if (checkout && checkout.toISOString() >= thirtyDaysAgo) {
          checkedOut30d++;
        }
      }

      const byHotel = hotels!.map((h) => ({
        id: h.id,
        name: h.name,
        count: inHouseByHotel.get(h.id) || 0,
      }));

      // Build worker rows
      let rows: WorkerRow[] = (workers || []).map((w) => {
        const match = lastResvByWorkerName.get(w.name?.trim?.() || "");
        let status: WorkerRow["status"] = "Unassigned";
        let hotelName: string | null = null;
        let room_no: string | null = null;
        let checkin_ts: string | null = null;
        let checkout_ts: string | null = null;

        if (match) {
          hotelName = (match as any).hotel?.name || null;
          room_no = (match as any).room_no || null;
          checkin_ts = (match as any).checkin_ts || null;
          checkout_ts = (match as any).checkout_ts || null;

          if (match.checkout_ts == null && match.checkin_ts && match.checkin_ts <= todayISO) {
            status = "In-house";
          } else if (match.checkin_ts && match.checkin_ts > todayISO) {
            status = "Upcoming";
          } else if (match.checkout_ts) {
            status = "Checked-out";
          }
        }

        return {
          id: w.id,
          name: w.name,
          phone: w.phone,
          status,
          hotel: hotelName,
          room_no,
          checkin_ts,
          checkout_ts,
          gov_id_type: w.gov_id_type,
          gov_id_last4: w.gov_id_last4,
          notes: w.notes,
        };
      });

      // Apply filters
      if (q) {
        const ql = q.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.name.toLowerCase().includes(ql) ||
            (r.phone || "").toLowerCase().includes(ql)
        );
      }
      if (hotelId) {
        rows = rows.filter((r) => {
          const h = (hotels || []).find((x) => x.id === hotelId)?.name || null;
          return (r.hotel || null) === h;
        });
      }
      if (status) {
        rows = rows.filter((r) => r.status.toLowerCase() === status.toLowerCase());
      }
      if (rangeStart || rangeEnd) {
        const s = rangeStart || "0000-01-01";
        const e = rangeEnd || "9999-12-31";
        rows = rows.filter((r) => {
          const d = r.checkin_ts ? r.checkin_ts.slice(0, 10) : "";
          return d >= s && d <= e;
        });
      }

      return res.json({
        hotels: byHotel, // {id, name, count}
        buckets: {
          byHotel,
          unassigned: rows.filter((r) => r.status === "Unassigned").length,
          upcoming: upcomingCount,
          checkedOut30d,
        },
        workers: rows,
      });
    } catch (e: any) {
      console.error("[employer/workers] unexpected", e);
      return res.status(500).json({ error: e.message || "Failed to load workers" });
    }
  }
);

// Bulk upsert workers (for CSV import)
router.post(
  "/workers/bulk",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    try {
      const items = (req.body?.workers || []) as Array<{
        name: string;
        phone?: string | null;
        notes?: string | null;
        gov_id_type?: string | null;
        gov_id_last4?: string | null;
      }>;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "No workers provided" });
      }

      const { data: me, error: meErr } = await supabaseAdmin
        .from("app_users")
        .select("employer_id")
        .eq("id", req.user!.uid)
        .maybeSingle();
      if (meErr) return res.status(500).json({ error: meErr.message });
      const employer_id = me?.employer_id as string | null;
      if (!employer_id) return res.status(400).json({ error: "No employer" });

      // Upsert on (employer_id, phone) if you added that unique index; otherwise insert-ignore by name.
      const payload = items.map((it) => ({
        employer_id,
        name: it.name?.trim(),
        phone: it.phone || null,
        notes: it.notes || null,
        gov_id_type: it.gov_id_type || null,
        gov_id_last4: it.gov_id_last4 || null,
      }));

      const { error } = await supabaseAdmin.from("workers").upsert(payload, {
        onConflict: "employer_id,phone",
        ignoreDuplicates: false,
      });

      if (error) return res.status(500).json({ error: error.message });

      return res.json({ ok: true, count: payload.length });
    } catch (e: any) {
      console.error("[employer/workers/bulk]", e);
      return res.status(500).json({ error: e.message || "Bulk import failed" });
    }
  }
);

export default router;
