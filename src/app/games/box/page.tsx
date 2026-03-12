"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  status?: string | null;
  game_date?: string | null;
  date?: string | null;
  created_at?: string | null;
};

type EventRow = {
  event_type: string;
  team_side?: "A" | "B" | null;
  is_undone?: boolean | null;
};

type GameCard = {
  id: string;
  teamA: string;
  teamB: string;
  status: string;
  gameDateText: string;
  createdAt: string | null;
  scoreA: number;
  scoreB: number;
};

function getScoreFromEvents(events: EventRow[]) {
  let scoreA = 0;
  let scoreB = 0;

  for (const e of events) {
    if (e.is_undone) continue;

    const side = e.team_side;
    if (!side) continue;

    if (e.event_type === "fg2_make") {
      if (side === "A") scoreA += 2;
      if (side === "B") scoreB += 2;
    }

    if (e.event_type === "fg3_make") {
      if (side === "A") scoreA += 3;
      if (side === "B") scoreB += 3;
    }

    if (e.event_type === "ft_make") {
      if (side === "A") scoreA += 1;
      if (side === "B") scoreB += 1;
    }
  }

  return { scoreA, scoreB };
}

function normalizeStatus(status?: string | null) {
  const s = (status ?? "").trim().toLowerCase();

  if (!s) return "未設定";
  if (["finished", "final", "ended", "done", "completed", "closed"].includes(s)) {
    return "已結束";
  }
  if (["live", "playing", "in_progress", "ongoing", "running"].includes(s)) {
    return "進行中";
  }
  if (["scheduled", "upcoming", "pending"].includes(s)) {
    return "未開始";
  }

  return status ?? "未設定";
}

function getStatusColor(status: string) {
  if (status === "已結束") {
    return {
      color: "#d1fae5",
      background: "rgba(16, 185, 129, 0.18)",
      border: "1px solid rgba(16, 185, 129, 0.35)",
    };
  }

  if (status === "進行中") {
    return {
      color: "#fde68a",
      background: "rgba(245, 158, 11, 0.18)",
      border: "1px solid rgba(245, 158, 11, 0.35)",
    };
  }

  return {
    color: "#cbd5e1",
    background: "rgba(148, 163, 184, 0.16)",
    border: "1px solid rgba(148, 163, 184, 0.28)",
  };
}

function formatDateText(game: GameRow) {
  const raw = game.game_date ?? game.date ?? game.created_at ?? null;
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

export default function GamesBoxListPage() {
  const router = useRouter();

  const [games, setGames] = useState<GameCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"全部" | "進行中" | "已結束" | "未開始">("全部");

  useEffect(() => {
    async function loadGames() {
      setLoading(true);
      setMsg("");

      try {
        const { data: gamesData, error: gamesError } = await supabase
          .from("games")
          .select("id, teamA, teamB, status, game_date, date, created_at")
          .order("created_at", { ascending: false });

        if (gamesError) {
          throw new Error(`讀取比賽列表失敗：${gamesError.message}`);
        }

        const rawGames = (gamesData ?? []) as GameRow[];

        if (rawGames.length === 0) {
          setGames([]);
          return;
        }

        const gameIds = rawGames.map((g) => g.id);

        const { data: eventData, error: eventError } = await supabase
          .from("events")
          .select("game_id, event_type, team_side, is_undone")
          .in("game_id", gameIds);

        if (eventError) {
          throw new Error(`讀取比賽事件失敗：${eventError.message}`);
        }

        const eventMap = new Map<string, EventRow[]>();

        for (const row of (eventData ?? []) as Array<EventRow & { game_id: string }>) {
          const arr = eventMap.get(row.game_id) ?? [];
          arr.push({
            event_type: row.event_type,
            team_side: row.team_side ?? null,
            is_undone: row.is_undone ?? false,
          });
          eventMap.set(row.game_id, arr);
        }

        const result: GameCard[] = rawGames.map((game) => {
          const events = eventMap.get(game.id) ?? [];
          const { scoreA, scoreB } = getScoreFromEvents(events);

          return {
            id: game.id,
            teamA: game.teamA?.trim() || "我方",
            teamB: game.teamB?.trim() || "對手",
            status: normalizeStatus(game.status),
            gameDateText: formatDateText(game),
            createdAt: game.created_at ?? null,
            scoreA,
            scoreB,
          };
        });

        result.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });

        setGames(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "讀取資料失敗";
        setMsg(message);
        setGames([]);
      } finally {
        setLoading(false);
      }
    }

    loadGames();
  }, []);

  const filteredGames = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return games.filter((game) => {
      const matchStatus = statusFilter === "全部" ? true : game.status === statusFilter;

      const matchKeyword =
        !keyword ||
        game.teamA.toLowerCase().includes(keyword) ||
        game.teamB.toLowerCase().includes(keyword) ||
        `${game.teamA} vs ${game.teamB}`.toLowerCase().includes(keyword);

      return matchStatus && matchKeyword;
    });
  }, [games, search, statusFilter]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #0f172a 0%, #111827 45%, #0b1120 100%)",
        color: "#e5e7eb",
        padding: "24px 16px 40px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            marginBottom: 20,
            padding: 20,
            borderRadius: 20,
            background: "rgba(15, 23, 42, 0.78)",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 30,
                  lineHeight: 1.2,
                  color: "#f8fafc",
                  fontWeight: 800,
                }}
              >
                比賽數據總覽
              </h1>
              <p
                style={{
                  margin: "10px 0 0",
                  color: "#94a3b8",
                  fontSize: 15,
                }}
              >
                觀眾可以先選擇想看的比賽，再進入該場的 Box Score 頁面。
              </p>
            </div>

            <div
              style={{
                padding: "10px 14px",
                borderRadius: 14,
                background: "rgba(59, 130, 246, 0.12)",
                border: "1px solid rgba(59, 130, 246, 0.24)",
                color: "#bfdbfe",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              共 {filteredGames.length} 場
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 18,
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋對戰，例如：資工、電機"
              style={{
                flex: "1 1 280px",
                minWidth: 220,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(148, 163, 184, 0.24)",
                background: "rgba(30, 41, 59, 0.9)",
                color: "#f8fafc",
                outline: "none",
                fontSize: 14,
              }}
            />

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "全部" | "進行中" | "已結束" | "未開始")
              }
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(148, 163, 184, 0.24)",
                background: "rgba(30, 41, 59, 0.9)",
                color: "#f8fafc",
                outline: "none",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              <option value="全部">全部狀態</option>
              <option value="進行中">進行中</option>
              <option value="已結束">已結束</option>
              <option value="未開始">未開始</option>
            </select>
          </div>
        </div>

        {loading && (
          <div
            style={{
              borderRadius: 18,
              padding: 24,
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.16)",
            }}
          >
            讀取中...
          </div>
        )}

        {!loading && msg && (
          <div
            style={{
              borderRadius: 18,
              padding: 18,
              background: "rgba(127, 29, 29, 0.22)",
              border: "1px solid rgba(248, 113, 113, 0.3)",
              color: "#fecaca",
            }}
          >
            {msg}
          </div>
        )}

        {!loading && !msg && filteredGames.length === 0 && (
          <div
            style={{
              borderRadius: 18,
              padding: 24,
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.16)",
              color: "#cbd5e1",
            }}
          >
            目前沒有符合條件的比賽資料。
          </div>
        )}

        {!loading && !msg && filteredGames.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 16,
            }}
          >
            {filteredGames.map((game) => {
              const statusStyle = getStatusColor(game.status);

              return (
                <div
                  key={game.id}
                  style={{
                    borderRadius: 20,
                    padding: 18,
                    background:
                      "linear-gradient(180deg, rgba(17,24,39,0.96) 0%, rgba(15,23,42,0.96) 100%)",
                    border: "1px solid rgba(148, 163, 184, 0.16)",
                    boxShadow: "0 12px 24px rgba(0,0,0,0.24)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#94a3b8",
                          marginBottom: 8,
                        }}
                      >
                        單場比賽
                      </div>

                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: "#f8fafc",
                          lineHeight: 1.25,
                          wordBreak: "break-word",
                        }}
                      >
                        {game.teamA}
                        <span style={{ color: "#64748b", margin: "0 8px" }}>VS</span>
                        {game.teamB}
                      </div>
                    </div>

                    <span
                      style={{
                        ...statusStyle,
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {game.status}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      marginBottom: 14,
                      padding: "14px 16px",
                      borderRadius: 16,
                      background: "rgba(2, 6, 23, 0.52)",
                      border: "1px solid rgba(148, 163, 184, 0.12)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#94a3b8",
                          marginBottom: 6,
                        }}
                      >
                        我方
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#e2e8f0",
                          wordBreak: "break-word",
                        }}
                      >
                        {game.teamA}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 900,
                        color: "#f8fafc",
                        letterSpacing: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {game.scoreA} : {game.scoreB}
                    </div>

                    <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#94a3b8",
                          marginBottom: 6,
                        }}
                      >
                        對手
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#e2e8f0",
                          wordBreak: "break-word",
                        }}
                      >
                        {game.teamB}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        fontSize: 14,
                      }}
                    >
                      <span style={{ color: "#94a3b8" }}>比賽日期</span>
                      <span style={{ color: "#e2e8f0", textAlign: "right" }}>
                        {game.gameDateText}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      onClick={() => router.push(`/games/${game.id}/box`)}
                      style={{
                        flex: 1,
                        minWidth: 120,
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "none",
                        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      查看數據
                    </button>

                    <button
                      onClick={() => router.push(`/games/${game.id}/view`)}
                      style={{
                        flex: 1,
                        minWidth: 120,
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(148, 163, 184, 0.24)",
                        background: "rgba(30, 41, 59, 0.9)",
                        color: "#e5e7eb",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      觀眾頁
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}