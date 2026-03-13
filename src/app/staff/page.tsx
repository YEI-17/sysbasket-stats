"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  status: string | null;
};

export default function StaffHomePage() {
  const router = useRouter();

  const [liveGames, setLiveGames] = useState<GameRow[]>([]);
  const [recentGames, setRecentGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    async function loadGames() {
      setLoading(true);
      setMsg("");

      const { data, error } = await supabase
        .from("games")
        .select("id, teamA, teamB, status")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error(error);
        setMsg("讀取比賽列表失敗");
        setLoading(false);
        return;
      }

      const rows = (data as GameRow[]) || [];
      setRecentGames(rows);
      setLiveGames(rows.filter((g) => g.status === "live"));
      setLoading(false);
    }

    loadGames();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>工作人員後台</h1>
            <p style={{ color: "#aaa", marginTop: 8 }}>
              選擇你要進行的功能
            </p>
          </div>
          <LogoutButton />
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <button style={btnGreen} onClick={() => router.push("/games/new")}>
            建立新比賽
          </button>

          <button style={btnGray} onClick={() => router.push("/games/list")}>
            進入比賽列表
          </button>

          <button style={btnGray} onClick={() => router.push("/games/box")}>
            完整數據頁面
          </button>
        </div>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>目前直播中的比賽</h2>

          {loading && <div style={{ color: "#888" }}>讀取中...</div>}

          {!loading && liveGames.length === 0 && (
            <div style={{ color: "#888" }}>目前沒有直播中的比賽</div>
          )}

          {!loading &&
            liveGames.map((game) => {
              const label = `${game.teamA || "未命名主隊"} vs ${game.teamB || "未命名客隊"}`;

              return (
                <button
                  key={game.id}
                  style={gameBtn}
                  onClick={() => router.push(`/games/${game.id}/live`)}
                >
                  <div style={{ fontWeight: 800 }}>{label}</div>
                  <div style={{ color: "#8f8f8f", fontSize: 12, marginTop: 4 }}>
                    點擊進入即時記錄
                  </div>
                </button>
              );
            })}
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>最近比賽</h2>

          {loading && <div style={{ color: "#888" }}>讀取中...</div>}

          {!loading && recentGames.length === 0 && (
            <div style={{ color: "#888" }}>目前沒有比賽資料</div>
          )}

          {!loading &&
            recentGames.map((game) => {
              const label = `${game.teamA || "未命名主隊"} vs ${game.teamB || "未命名客隊"}`;

              return (
                <div
                  key={game.id}
                  style={{
                    border: "1px solid #2a2a2a",
                    borderRadius: 12,
                    padding: 14,
                    background: "#141414",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{label}</div>
                  <div style={{ color: "#8f8f8f", fontSize: 13 }}>
                    狀態：{game.status || "unknown"}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={smallBtn}
                      onClick={() => router.push(`/games/${game.id}/live`)}
                    >
                      即時記錄
                    </button>

                    <button
                      style={smallBtn}
                      onClick={() => router.push(`/games/${game.id}/board`)}
                    >
                      觀眾頁
                    </button>

                    <button
                      style={smallBtn}
                      onClick={() => router.push(`/games/${game.id}/box`)}
                    >
                      數據頁
                    </button>
                  </div>
                </div>
              );
            })}
        </section>

        {msg && <p style={{ color: "#ddd" }}>{msg}</p>}
      </div>
    </main>
  );
}

const btnBase: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 800,
};

const btnGreen: React.CSSProperties = {
  ...btnBase,
  background: "#22c55e",
  color: "#052e12",
};

const btnGray: React.CSSProperties = {
  ...btnBase,
  background: "#333",
  color: "#fff",
};

const smallBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "#222",
  color: "#fff",
  cursor: "pointer",
};

const cardStyle: React.CSSProperties = {
  background: "#0f0f0f",
  border: "1px solid #222",
  borderRadius: 18,
  padding: 18,
  display: "grid",
  gap: 12,
};

const gameBtn: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "14px 16px",
  borderRadius: 12,
  color: "white",
  cursor: "pointer",
  border: "1px solid #333",
  background: "#161616",
};