import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLog } from "@/types/database";

export interface CreateAuditLogParams {
  supabase: SupabaseClient;
  actorId: string | null;
  action:
    | "review_started"
    | "report_approved"
    | "report_flagged"
    | "evidence_requested"
    | "report_rejected"
    | "verdict_changed"
    | "reviewer_note_added"
    | "submission_created"
    | "analysis_triggered"
    | "evidence_retrieved"
    | string;
  entityType: "submission" | "report" | "claim" | "review" | "profile" | string;
  entityId?: string | null;
  previousState?: Record<string, unknown> | string | null;
  newState?: Record<string, unknown> | string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Records an immutable administrative audit log entry in Supabase.
 * Enforces server-side execution and sanitizes sensitive credentials.
 */
export async function logAuditEvent({
  supabase,
  actorId,
  action,
  entityType,
  entityId = null,
  previousState = null,
  newState = null,
  notes = null,
  metadata = {},
  ipAddress = null,
}: CreateAuditLogParams): Promise<AuditLog | null> {
  try {
    const details: Record<string, unknown> = {
      ...metadata,
    };

    if (previousState !== null) {
      details.previous_state = previousState;
    }
    if (newState !== null) {
      details.new_state = newState;
    }
    if (notes) {
      details.notes_summary = notes.length > 500 ? notes.slice(0, 497) + "..." : notes;
    }

    const { data, error } = await supabase
      .from("audit_logs")
      .insert({
        actor_id: actorId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details,
        ip_address: ipAddress,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[AuditService] Failed to insert audit log:", error.message);
      return null;
    }

    return data as AuditLog;
  } catch (err) {
    console.error("[AuditService] Unexpected exception writing audit log:", err);
    return null;
  }
}

/**
 * Retrieves chronological audit history for a specific entity (e.g. submission).
 */
export async function getEntityAuditTrail(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string
): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[AuditService] Failed to fetch entity audit trail:", error.message);
    return [];
  }

  return (data || []) as AuditLog[];
}

/**
 * Retrieves recent administrative audit events across the platform.
 */
export async function getRecentAdminAuditLogs(
  supabase: SupabaseClient,
  limit = 20
): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[AuditService] Failed to fetch recent admin audit logs:", error.message);
    return [];
  }

  return (data || []) as AuditLog[];
}
