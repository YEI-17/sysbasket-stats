"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { clearRole, getViewerName } from "@/lib/roles";

type LiveGame = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  status?: string | null;
};

export default function ViewerPage() {
  const router = useRouter();

  const [viewerName, setViewerName] = useState("");
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const name = getViewerName();

    if (!name) {
      router.push("/");
      return;
    }

    setViewerName(name);
    fetchLiveGames();
  }, [router]);

  async function fetchLiveGames() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, status")
      .eq("status", "live")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setMsg("讀取直播中比賽失敗");
      setLoading(false);
      return;
    }

    setLiveGames((data as LiveGame[]) || []);
    setLoading(false);
  }

  function handleLogout() {
    clearRole();
    router.push("/");
  }

  function handleOpenGame(gameId: string) {
    router.push(`/games/${gameId}/board`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "white",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: "#0f0f0f",
          border: "1px solid #222",
          borderRadius: 18,
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>觀眾頁面</h1>
            <p style={{ marginTop: 8, color: "#aaa" }}>
              歡迎，{viewerName}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={fetchLiveGames} style={btnGray}>
              重新整理
            </button>
            <button onClick={handleLogout} style={btnRed}>
              登出
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 16, fontWeight: 700, color: "#bbb" }}>
          目前直播中的比賽
        </div>

        {loading && <p style={{ color: "#aaa" }}>讀取中...</p>}

        {!loading && liveGames.length === 0 && (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#151515",
              border: "1px solid #2a2a2a",
              color: "#aaa",
            }}
          >
            目前沒有進行中的比賽
          </div>
        )}

        {!loading && liveGames.length > 0 && (
          <div style={{ display: "grid", gap: 12 }}>
            {liveGames.map((game) => (
              <button
                key={game.id}
                onClick={() => handleOpenGame(game.id)}
                style={gameBtn}
              >
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  {game.teamA || "主隊"} vs {game.teamB || "客隊"}
                </div>
                <div style={{ color: "#aaa", marginTop: 6 }}>點擊進入觀看</div>
              </button>
            ))}
          </div>
        )}

        {msg && <p style={{ marginTop: 16, color: "#ddd" }}>{msg}</p>}
      </div>
    </main>
  );
}

const btnBase: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontSize: 16,
};

const btnGray: React.CSSProperties = {
  ...btnBase,
  background: "#333",
  color: "white",
};

const btnRed: React.CSSProperties = {
  ...btnBase,
  background: "#dc2626",
  color: "white",
  fontWeight: 700,
};

const gameBtn: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "16px 18px",
  borderRadius: 14,
  color: "white",
  cursor: "pointer",
  border: "1px solid #333",
  background: "#161616",
};