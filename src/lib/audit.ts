import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

interface AuditEntry {
  supabase: SupabaseClient;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function recordAuditLog({
  supabase,
  actorId,
  action,
  entityType,
  entityId = null,
  details = {},
  ipAddress = null,
}: AuditEntry): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      ip_address: ipAddress,
    });
  } catch {
    // Non-blocking audit trail helper: avoid breaking primary user flow if logging fails
  }
}

export function getClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }
  return request.headers.get("x-real-ip");
}
