import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { supabaseAdmin } from "../lib/supabase";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  const { data, error } = await supabaseAdmin.from("hotels").select("id,name").order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ hotels: data ?? [] });
});

export default router;
