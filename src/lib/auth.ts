import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types/database";
import type { User, SupabaseClient } from "@supabase/supabase-js";

export interface AuthContext {
  supabase: SupabaseClient;
  user: User;
  profile: Profile;
}

/**
 * Resolves the currently authenticated Supabase user and their `profiles` record.
 * Automatically provisions a default `'user'` profile if one does not yet exist
 * (for example, if the user signed up before running schema.sql).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    return {
      supabase,
      user,
      profile: existingProfile as Profile,
    };
  }

  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;

  const { data: createdProfile, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? "",
      full_name: fullName,
      role: "user",
    })
    .select("*")
    .single();

  if (insertError || !createdProfile) {
    // Fallback minimal profile if schema is not yet applied or RLS blocks insert
    return {
      supabase,
      user,
      profile: {
        id: user.id,
        email: user.email ?? "",
        full_name: fullName,
        role: "user",
        avatar_url: null,
        created_at: user.created_at,
        updated_at: user.created_at,
      },
    };
  }

  return {
    supabase,
    user,
    profile: createdProfile as Profile,
  };
}

export function isAdminRole(role?: UserRole | null): boolean {
  return role === "admin";
}
