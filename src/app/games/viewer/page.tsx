"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getViewerName } from "@/lib/roles";

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
  if (
    ["finished", "final", "ended", "done", "completed", "closed"].includes(s)
  ) {
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

export default function ViewerGamesPage() {
  const router = useRouter();

  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const name = getViewerName();

    if (!name) {
      router.push("/");
      return;
    }

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

  function handleBack() {
    router.push("/viewer");
  }

  function handleOpenGame(gameId: string) {
    router.push(`/games/${gameId}/board`);
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
        background:
          "radial-gradient(circle at top, rgba(255,255,255,0.05) 0%, #000000 30%, #000000 100%)",
        color: "white",
        padding: 20,
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div
          style={{
            background: "rgba(10,10,10,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            padding: 24,
            boxShadow: "0 18px 40px rgba(0,0,0,0.4)",
            marginBottom: 20,
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
              <div style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 8 }}>
                MATCH LIST
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#ffffff" }}>
                比賽列表
              </div>
              <div style={{ marginTop: 8, color: "#a1a1aa" }}>
                觀看直播中的比賽，或查看歷史比賽資料
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={fetchGames} style={btnGray}>
                重新整理
              </button>
              <button onClick={handleBack} style={btnDark}>
                回觀眾首頁
              </button>
            </div>
          </div>
        </div>

        {loading && <div style={infoCardStyle}>讀取中...</div>}

        {!loading && msg && (
          <div
            style={{
              ...infoCardStyle,
              color: "#fecaca",
              border: "1px solid rgba(248, 113, 113, 0.28)",
              background: "rgba(127, 29, 29, 0.2)",
            }}
          >
            {msg}
          </div>
        )}

        {!loading && !msg && (
          <>
            <section style={{ marginBottom: 24 }}>
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
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: 900,
                              color: "#ffffff",
                            }}
                          >
                            {game.teamA || "主隊"} vs {game.teamB || "客隊"}
                          </div>
                          <div
                            style={{
                              marginTop: 8,
                              color: "#a1a1aa",
                              fontSize: 14,
                            }}
                          >
                            {formatGameDate(game)}
                          </div>
                        </div>

                        <div style={liveBadgeStyle}>直播中</div>
                      </div>

                      <div style={{ marginTop: 12, color: "#d4d4d8" }}>
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
                          <div
                            style={{
                              fontSize: 18,
                              fontWeight: 900,
                              color: "#ffffff",
                            }}
                          >
                            {game.teamA || "主隊"} vs {game.teamB || "客隊"}
                          </div>
                          <div
                            style={{
                              marginTop: 8,
                              color: "#a1a1aa",
                              fontSize: 14,
                            }}
                          >
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
  border: "1px solid rgba(255,255,255,0.08)",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 800,
};

const btnGray: React.CSSProperties = {
  ...btnBase,
  background: "#27272a",
  color: "white",
};

const btnDark: React.CSSProperties = {
  ...btnBase,
  background: "#09090b",
  color: "white",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: "#ffffff",
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
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(12,12,12,0.95)",
  boxShadow: "0 12px 28px rgba(0,0,0,0.3)",
};

const infoCardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 16,
  background: "rgba(12,12,12,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#d4d4d8",
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
      background: "rgba(34, 197, 94, 0.16)",
      border: "1px solid rgba(34, 197, 94, 0.28)",
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
      background: "rgba(161, 161, 170, 0.14)",
      border: "1px solid rgba(161, 161, 170, 0.22)",
      color: "#f4f4f5",
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