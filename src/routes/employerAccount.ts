import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth";

const router = Router();

const upsertSchema = z.object({
  name: z.string().min(1, "Company name is required").max(200),
  notes: z.string().max(1000).optional(),
});

/** GET /api/employer/account
 *  Returns the employer org for the logged-in EMPLOYER.
 *  { employer: { id, name, notes } | null }
 */
router.get(
  "/account",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    try {
      const { data: me, error: meErr } = await supabaseAdmin
        .from("app_users")
        .select("employer_id")
        .eq("id", req.user!.uid)
        .maybeSingle();
      if (meErr) return res.status(500).json({ error: meErr.message });

      const employer_id = me?.employer_id as string | null;
      if (!employer_id) {
        return res.json({ employer: null });
      }

      const { data: emp, error: eErr } = await supabaseAdmin
        .from("employers")
        .select("id, name, notes")
        .eq("id", employer_id)
        .maybeSingle();
      if (eErr) return res.status(500).json({ error: eErr.message });

      return res.json({ employer: emp ?? null });
    } catch (e: any) {
      console.error("[employer/account:get]", e);
      return res.status(500).json({ error: e.message || "Failed to load employer account" });
    }
  }
);

/** POST /api/employer/account
 *  Creates the employer org if the user has none, and links it.
 *  Body: { name, notes? }
 *  Returns { employer: { id, name, notes } }
 */
router.post(
  "/account",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { name, notes } = parsed.data;

    try {
      const { data: me, error: meErr } = await supabaseAdmin
        .from("app_users")
        .select("employer_id, email")
        .eq("id", req.user!.uid)
        .maybeSingle();
      if (meErr) return res.status(500).json({ error: meErr.message });

      if (me?.employer_id) {
        return res.status(409).json({ error: "Employer already exists for this user" });
      }

      const { data: created, error: cErr } = await supabaseAdmin
        .from("employers")
        .insert({ name, notes: notes ?? null })
        .select("id, name, notes")
        .single();
      if (cErr) return res.status(500).json({ error: cErr.message });

      const { error: linkErr } = await supabaseAdmin
        .from("app_users")
        .update({ employer_id: created.id })
        .eq("id", req.user!.uid);
      if (linkErr) return res.status(500).json({ error: linkErr.message });

      return res.status(201).json({ employer: created });
    } catch (e: any) {
      console.error("[employer/account:post]", e);
      return res.status(500).json({ error: e.message || "Failed to create employer" });
    }
  }
);

/** PUT /api/employer/account
 *  Updates the existing employer org.
 *  Body: { name, notes? }
 *  Returns { employer: { id, name, notes } }
 */
router.put(
  "/account",
  requireAuth,
  requireRole("EMPLOYER"),
  async (req: AuthedRequest, res) => {
    const parsed = upsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { name, notes } = parsed.data;

    try {
      const { data: me, error: meErr } = await supabaseAdmin
        .from("app_users")
        .select("employer_id")
        .eq("id", req.user!.uid)
        .maybeSingle();
      if (meErr) return res.status(500).json({ error: meErr.message });

      const employer_id = me?.employer_id as string | null;
      if (!employer_id) {
        return res.status(400).json({ error: "No employer linked to this user" });
      }

      const { data: updated, error: uErr } = await supabaseAdmin
        .from("employers")
        .update({ name, notes: notes ?? null })
        .eq("id", employer_id)
        .select("id, name, notes")
        .single();
      if (uErr) return res.status(500).json({ error: uErr.message });

      return res.json({ employer: updated });
    } catch (e: any) {
      console.error("[employer/account:put]", e);
      return res.status(500).json({ error: e.message || "Failed to update employer" });
    }
  }
);

export default router;
