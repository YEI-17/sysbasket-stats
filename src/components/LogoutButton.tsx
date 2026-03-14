"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { clearRole, getRole } from "@/lib/roles";

type Props = {
  label?: string;
};

export default function LogoutButton({ label = "LOGOUT" }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function markSessionLogout() {
    if (typeof window === "undefined") return;

    const sessionId = localStorage.getItem("session_id");
    if (!sessionId) return;

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("user_sessions")
      .update({
        logout_at: now,
        last_seen_at: now,
        is_online: false,
      })
      .eq("id", sessionId);

    if (error) {
      throw new Error(error.message);
    }

    localStorage.removeItem("session_id");
  }

  async function handleLogout() {
    if (loading) return;
    setLoading(true);

    try {
      const role = getRole();

      await markSessionLogout();

      clearRole();

      if (role === "staff") {
        await supabase.auth.signOut();
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("登出失敗:", error);

      clearRole();
      localStorage.removeItem("session_id");

      router.replace("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={() => void handleLogout()}
      disabled={loading}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "none",
        background: "#ef4444",
        color: "white",
        fontWeight: 800,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? "登出中..." : label}
    </button>
  );
}