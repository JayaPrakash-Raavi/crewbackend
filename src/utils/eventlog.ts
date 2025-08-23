import { supabaseAdmin } from "../lib/supabase";

export async function logEvent(
  obj: { type: string; id?: string | number },
  action: string,
  actor: { id: string; role: "EMPLOYER" | "FRONTDESK" | "ADMIN" },
  payload: Record<string, any> = {}
) {
  try {
    await supabaseAdmin.from("event_log").insert({
      obj_type: obj.type,
      obj_id: obj.id ?? null,
      action,
      actor_id: actor.id,
      ts: new Date().toISOString(),
      payload,
    });
  } catch (e) {
    // non-fatal
    console.warn("[eventlog] failed:", e);
  }
}
