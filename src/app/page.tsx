"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    async function checkGame() {
      const { data, error } = await supabase
        .from("games")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alive) return;

      if (!error && data?.id) {
        router.replace(`/games/${data.id}/live`);
        return;
      }

      setLoading(false);
    }

    checkGame();

    return () => {
      alive = false;
    };
  }, [router]);

  if (loading) {
    return <div style={{ padding: 20 }}>載入中...</div>;
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>系籃比賽記錄</h1>
      <p>只有工作人員可記錄，觀眾只能觀看。</p>

      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/login">登入</Link>
        <Link href="/games/new">建立比賽</Link>
      </div>
    </main>
  );
}