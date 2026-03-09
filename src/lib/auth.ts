import { supabase } from "./supabaseClient";

export type Role = "viewer" | "recorder" | "admin";

export async function getMyRole(): Promise<Role | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error) return "viewer";
  return (data?.role as Role) ?? "viewer";
}

export async function requireRecorderOrAdmin() {
  const role = await getMyRole();
  if (!role) throw new Error("NOT_LOGGED_IN");
  if (role !== "recorder" && role !== "admin") throw new Error("NO_PERMISSION");
  return role;
}