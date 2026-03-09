"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { clearRole, getRole } from "@/lib/roles";

type Props = {
  label?: string;
};

export default function LogoutButton({ label = "登出" }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);

    try {
      const role = getRole();

      clearRole();

      if (role === "staff") {
        await supabase.auth.signOut();
      }

      router.replace("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
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