"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { clearRole, getViewerName } from "@/lib/roles";

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  status?: string | null;
  game_date?: string | null;
  created_at?: string | null;
};

function normalizeStatus(status?: string | null) {
  const s = (status ?? "").trim().toLowerCase();

  if (!s) return "未設定";
  if (["live", "playing", "in_progress", "ongoing", "running"].includes(s)) {
    return "直播中";
  }
  if (["finished", "final", "ended", "done", "completed", "closed"].includes(s)) {
    return "已結束";
  }
  if (["scheduled", "upcoming", "pending"].includes(s)) {
    return "未開始";
  }

  return status ?? "未設定";
}

function formatGameDate(game: GameRow) {
  const raw = game.game_date ?? game.created_at ?? null;
  if (!raw) return "未提供日期";

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);

  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: raw.includes("T") ? "2-digit" : undefined,
    minute: raw.includes("T") ? "2-digit" : undefined,
    hour12: false,
  });
}

export default function ViewerPage() {
  const router = useRouter();

  const [viewerName, setViewerName] = useState("");
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const name = getViewerName();

    if (!name) {
      router.push("/");
      return;
    }

    setViewerName(name);
    fetchGames();
  }, [router]);

  async function fetchGames() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, status, game_date, created_at")
      .order("game_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setMsg("讀取比賽資料失敗");
      setLoading(false);
      return;
    }

    setGames((data as GameRow[]) || []);
    setLoading(false);
  }

  function handleLogout() {
    clearRole();
    router.push("/");
  }

  function handleOpenGame(gameId: string) {
    router.push(`/games/${gameId}/board`);
  }

  function handleOpenStatsCenter() {
    router.push("/games/stats");
  }

  const liveGames = useMemo(() => {
    return games.filter((game) => normalizeStatus(game.status) === "直播中");
  }, [games]);

  const historyGames = useMemo(() => {
    return games.filter((game) => normalizeStatus(game.status) !== "直播中");
  }, [games]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #020617 0%, #0f172a 45%, #111827 100%)",
        color: "white",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            background: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: 24,
            padding: 24,
            boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 8 }}>
                觀眾入口
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#f8fafc" }}>
                歡迎，{viewerName}
              </div>
              <div style={{ marginTop: 8, color: "#cbd5e1" }}>
                可以查看比賽列表、歷史賽事與數據內容
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={fetchGames} style={btnGray}>
                重新整理
              </button>
              <button onClick={handleLogout} style={btnRed}>
                登出
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginBottom: 22,
          }}
        >
          <button
            onClick={() => {}}
            style={featureCardStyle}
          >
            <div style={featureTitleStyle}>比賽列表</div>
            <div style={featureDescStyle}>
              查看直播中的比賽、已結束比賽與歷史比賽資料
            </div>
          </button>

          <button
            onClick={handleOpenStatsCenter}
            style={featureCardStyle}
          >
            <div style={featureTitleStyle}>數據中心</div>
            <div style={featureDescStyle}>
              查看球隊數據、球員數據、排行榜與更多統計內容
            </div>
          </button>
        </div>

        {loading && (
          <div style={infoCardStyle}>讀取中...</div>
        )}

        {!loading && msg && (
          <div
            style={{
              ...infoCardStyle,
              color: "#fecaca",
              border: "1px solid rgba(248, 113, 113, 0.28)",
              background: "rgba(127, 29, 29, 0.22)",
            }}
          >
            {msg}
          </div>
        )}

        {!loading && !msg && (
          <>
            <section style={{ marginBottom: 22 }}>
              <div style={sectionTitleStyle}>直播中的比賽</div>

              {liveGames.length === 0 ? (
                <div style={infoCardStyle}>目前沒有進行中的比賽</div>
              ) : (
                <div style={gameListStyle}>
                  {liveGames.map((game) => (
                    <button
                      key={game.id}
                      onClick={() => handleOpenGame(game.id)}
                      style={gameCardStyle}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc" }}>
                            {game.teamA || "主隊"} vs {game.teamB || "客隊"}
                          </div>
                          <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 14 }}>
                            {formatGameDate(game)}
                          </div>
                        </div>

                        <div style={liveBadgeStyle}>直播中</div>
                      </div>

                      <div style={{ marginTop: 12, color: "#cbd5e1" }}>
                        點擊進入觀看
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div style={sectionTitleStyle}>歷史比賽</div>

              {historyGames.length === 0 ? (
                <div style={infoCardStyle}>目前還沒有歷史比賽資料</div>
              ) : (
                <div style={gameListStyle}>
                  {historyGames.map((game) => (
                    <button
                      key={game.id}
                      onClick={() => handleOpenGame(game.id)}
                      style={gameCardStyle}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>
                            {game.teamA || "主隊"} vs {game.teamB || "客隊"}
                          </div>
                          <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 14 }}>
                            {formatGameDate(game)}
                          </div>
                        </div>

                        <div style={statusBadgeStyle(normalizeStatus(game.status))}>
                          {normalizeStatus(game.status)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

const btnBase: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 700,
};

const btnGray: React.CSSProperties = {
  ...btnBase,
  background: "#334155",
  color: "white",
};

const btnRed: React.CSSProperties = {
  ...btnBase,
  background: "#dc2626",
  color: "white",
};

const featureCardStyle: React.CSSProperties = {
  textAlign: "left",
  width: "100%",
  padding: 20,
  borderRadius: 20,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(15, 23, 42, 0.88)",
  color: "white",
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
};

const featureTitleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#f8fafc",
  marginBottom: 10,
};

const featureDescStyle: React.CSSProperties = {
  color: "#cbd5e1",
  lineHeight: 1.6,
  fontSize: 14,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#f8fafc",
  marginBottom: 14,
};

const gameListStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
};

const gameCardStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "18px 20px",
  borderRadius: 18,
  color: "white",
  cursor: "pointer",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "rgba(15, 23, 42, 0.82)",
  boxShadow: "0 10px 24px rgba(0,0,0,0.16)",
};

const infoCardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 16,
  background: "rgba(15, 23, 42, 0.78)",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  color: "#cbd5e1",
};

const liveBadgeStyle: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: 999,
  background: "rgba(239, 68, 68, 0.18)",
  border: "1px solid rgba(239, 68, 68, 0.32)",
  color: "#fecaca",
  fontWeight: 800,
  fontSize: 13,
  whiteSpace: "nowrap",
};

function statusBadgeStyle(status: string): React.CSSProperties {
  if (status === "已結束") {
    return {
      padding: "7px 12px",
      borderRadius: 999,
      background: "rgba(34, 197, 94, 0.18)",
      border: "1px solid rgba(34, 197, 94, 0.32)",
      color: "#dcfce7",
      fontWeight: 800,
      fontSize: 13,
      whiteSpace: "nowrap",
    };
  }

  if (status === "未開始") {
    return {
      padding: "7px 12px",
      borderRadius: 999,
      background: "rgba(148, 163, 184, 0.16)",
      border: "1px solid rgba(148, 163, 184, 0.28)",
      color: "#e2e8f0",
      fontWeight: 800,
      fontSize: 13,
      whiteSpace: "nowrap",
    };
  }

  return {
    padding: "7px 12px",
    borderRadius: 999,
    background: "rgba(245, 158, 11, 0.18)",
    border: "1px solid rgba(245, 158, 11, 0.28)",
    color: "#fde68a",
    fontWeight: 800,
    fontSize: 13,
    whiteSpace: "nowrap",
  };
}