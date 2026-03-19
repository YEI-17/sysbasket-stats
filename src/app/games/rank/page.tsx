"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type RankCategory = "pts" | "reb" | "ast" | "stl" | "blk";
type RankMode = "avg" | "total";

type PlayerRow = {
  id: string;
  name: string;
  number: number | null;
  position?: string | null;
  active?: boolean | null;
};

type GameRow = {
  id: string;
  status?: string | null;
  created_at?: string | null;
  game_date?: string | null;
};

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  event_type: string;
  is_undone?: boolean | null;
  team_side?: "A" | "B" | "teamA" | "teamB" | null;
};

type PlayerGameStatsRow = {
  game_id: string;
  player_id: string;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
};

type PlayerRank = {
  id: string;
  name: string;
  number: number;
  position: string;
  value: number;
  games: number;
};

type PlayerStat = {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
};

type CategoryConfig = {
  key: RankCategory;
  label: string;
  short: string;
  icon: string;
  unitAvg: string;
  unitTotal: string;
  accent: string;
};

const categoryList: CategoryConfig[] = [
  {
    key: "pts",
    label: "得分",
    short: "PTS",
    icon: "🏀",
    unitAvg: "AVG PTS",
    unitTotal: "TOTAL PTS",
    accent: "#ff6b4a",
  },
  {
    key: "reb",
    label: "籃板",
    short: "REB",
    icon: "🧱",
    unitAvg: "AVG REB",
    unitTotal: "TOTAL REB",
    accent: "#4ade80",
  },
  {
    key: "ast",
    label: "助攻",
    short: "AST",
    icon: "🎯",
    unitAvg: "AVG AST",
    unitTotal: "TOTAL AST",
    accent: "#60a5fa",
  },
  {
    key: "stl",
    label: "抄截",
    short: "STL",
    icon: "⚡",
    unitAvg: "AVG STL",
    unitTotal: "TOTAL STL",
    accent: "#a78bfa",
  },
  {
    key: "blk",
    label: "阻攻",
    short: "BLK",
    icon: "🛑",
    unitAvg: "AVG BLK",
    unitTotal: "TOTAL BLK",
    accent: "#f59e0b",
  },
];

function emptyStat(): PlayerStat {
  return {
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
  };
}

function normalizeStatus(status?: string | null) {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (["finished", "final", "ended", "done", "completed", "closed"].includes(s)) {
    return "finished";
  }
  if (["live", "playing", "in_progress", "ongoing", "running"].includes(s)) {
    return "live";
  }
  return s;
}

function applyEventToStat(stat: PlayerStat, eventType: string) {
  switch (eventType) {
    case "fg2_made":
      stat.pts += 2;
      break;
    case "fg3_made":
      stat.pts += 3;
      break;
    case "ft_made":
      stat.pts += 1;
      break;
    case "reb":
      stat.reb += 1;
      break;
    case "ast":
      stat.ast += 1;
      break;
    case "stl":
      stat.stl += 1;
      break;
    case "blk":
      stat.blk += 1;
      break;
    default:
      break;
  }
}

function medalLabel(index: number) {
  if (index === 0) return "TOP 1";
  if (index === 1) return "TOP 2";
  return "TOP 3";
}

function formatValue(value: number, mode: RankMode) {
  return mode === "avg" ? value.toFixed(1) : String(value);
}

function diffFromFirst(first: number, current: number, mode: RankMode) {
  const diff = first - current;
  if (diff <= 0) return "領先";
  return mode === "avg" ? `-${diff.toFixed(1)}` : `-${diff}`;
}

function rankGlow(index: number) {
  if (index === 0) {
    return "0 0 0 1px rgba(255,215,0,0.35), 0 18px 45px rgba(255,215,0,0.18)";
  }
  if (index === 1) {
    return "0 0 0 1px rgba(255,255,255,0.18), 0 16px 38px rgba(255,255,255,0.08)";
  }
  return "0 0 0 1px rgba(255,140,90,0.22), 0 16px 38px rgba(255,140,90,0.10)";
}

function getGameSortValue(game: GameRow) {
  const raw = game.game_date || game.created_at || "";
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function ensurePlayerMaps(
  totals: Map<string, PlayerStat>,
  gamesPlayedByPlayer: Map<string, Set<string>>,
  playerId: string
) {
  if (!totals.has(playerId)) {
    totals.set(playerId, emptyStat());
  }
  if (!gamesPlayedByPlayer.has(playerId)) {
    gamesPlayedByPlayer.set(playerId, new Set<string>());
  }
}

export default function RankingsPage() {
  const [mode, setMode] = useState<RankMode>("avg");
  const [activeCategory, setActiveCategory] = useState<RankCategory>("pts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [rankData, setRankData] = useState<Record<RankMode, Record<RankCategory, PlayerRank[]>>>({
    avg: {
      pts: [],
      reb: [],
      ast: [],
      stl: [],
      blk: [],
    },
    total: {
      pts: [],
      reb: [],
      ast: [],
      stl: [],
      blk: [],
    },
  });

  const [gameCount, setGameCount] = useState(0);

  useEffect(() => {
    let alive = true;

    async function loadRankings() {
      setLoading(true);
      setError("");

      try {
        const { data: gamesData, error: gamesError } = await supabase
          .from("games")
          .select("id, status, created_at, game_date")
          .order("created_at", { ascending: true });

        if (gamesError) throw gamesError;

        const finishedGames = ((gamesData ?? []) as GameRow[])
          .filter((g) => normalizeStatus(g.status) === "finished")
          .sort((a, b) => getGameSortValue(a) - getGameSortValue(b));

        const gameIds = finishedGames.map((g) => g.id);

        if (gameIds.length === 0) {
          if (!alive) return;
          setGameCount(0);
          setRankData({
            avg: { pts: [], reb: [], ast: [], stl: [], blk: [] },
            total: { pts: [], reb: [], ast: [], stl: [], blk: [] },
          });
          setLoading(false);
          return;
        }

        const legacyGameIds = finishedGames.slice(0, 2).map((g) => g.id);
        const modernGameIds = finishedGames.slice(2).map((g) => g.id);

        const [
          { data: playersData, error: playersError },
          legacyEventsResult,
          modernStatsResult,
        ] = await Promise.all([
          supabase
            .from("players")
            .select("id, name, number, position, active")
            .order("number", { ascending: true }),
          legacyGameIds.length > 0
            ? supabase
                .from("events")
                .select("id, game_id, player_id, event_type, is_undone, team_side")
                .in("game_id", legacyGameIds)
                .order("created_at", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          modernGameIds.length > 0
            ? supabase
                .from("player_game_stats")
                .select("game_id, player_id, pts, reb, ast, stl, blk")
                .in("game_id", modernGameIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (playersError) throw playersError;
        if (legacyEventsResult.error) throw legacyEventsResult.error;
        if (modernStatsResult.error) throw modernStatsResult.error;

        const players = (playersData ?? []) as PlayerRow[];
        const legacyEvents = (legacyEventsResult.data ?? []) as EventRow[];
        const modernStats = (modernStatsResult.data ?? []) as PlayerGameStatsRow[];

        const playerMap = new Map<string, PlayerRow>();
        for (const p of players) {
          playerMap.set(p.id, p);
        }

        const totals = new Map<string, PlayerStat>();
        const gamesPlayedByPlayer = new Map<string, Set<string>>();

        // 前 2 場：用 events 計算
        for (const ev of legacyEvents) {
          if (ev.is_undone) continue;
          if (!ev.player_id) continue;

          const playerId = ev.player_id;
          ensurePlayerMaps(totals, gamesPlayedByPlayer, playerId);

          gamesPlayedByPlayer.get(playerId)!.add(ev.game_id);

          const stat = totals.get(playerId)!;
          applyEventToStat(stat, ev.event_type);
        }

        // 第 3 場之後：用 player_game_stats 計算
        for (const row of modernStats) {
          if (!row.player_id || !row.game_id) continue;

          const playerId = row.player_id;
          ensurePlayerMaps(totals, gamesPlayedByPlayer, playerId);

          gamesPlayedByPlayer.get(playerId)!.add(row.game_id);

          const stat = totals.get(playerId)!;
          stat.pts += Number(row.pts ?? 0);
          stat.reb += Number(row.reb ?? 0);
          stat.ast += Number(row.ast ?? 0);
          stat.stl += Number(row.stl ?? 0);
          stat.blk += Number(row.blk ?? 0);
        }

        const totalRanks: Record<RankCategory, PlayerRank[]> = {
          pts: [],
          reb: [],
          ast: [],
          stl: [],
          blk: [],
        };

        const avgRanks: Record<RankCategory, PlayerRank[]> = {
          pts: [],
          reb: [],
          ast: [],
          stl: [],
          blk: [],
        };

        for (const [playerId, stat] of totals.entries()) {
          const player = playerMap.get(playerId);
          if (!player) continue;

          const gp = gamesPlayedByPlayer.get(playerId)?.size ?? 0;
          if (gp <= 0) continue;

          const baseInfo = {
            id: player.id,
            name: player.name ?? "未命名球員",
            number: player.number ?? 0,
            position: player.position ?? "-",
            games: gp,
          };

          totalRanks.pts.push({ ...baseInfo, value: stat.pts });
          totalRanks.reb.push({ ...baseInfo, value: stat.reb });
          totalRanks.ast.push({ ...baseInfo, value: stat.ast });
          totalRanks.stl.push({ ...baseInfo, value: stat.stl });
          totalRanks.blk.push({ ...baseInfo, value: stat.blk });

          avgRanks.pts.push({ ...baseInfo, value: stat.pts / gp });
          avgRanks.reb.push({ ...baseInfo, value: stat.reb / gp });
          avgRanks.ast.push({ ...baseInfo, value: stat.ast / gp });
          avgRanks.stl.push({ ...baseInfo, value: stat.stl / gp });
          avgRanks.blk.push({ ...baseInfo, value: stat.blk / gp });
        }

        const sortDesc = (a: PlayerRank, b: PlayerRank) => {
          if (b.value !== a.value) return b.value - a.value;
          if (b.games !== a.games) return b.games - a.games;
          return a.number - b.number;
        };

        for (const key of ["pts", "reb", "ast", "stl", "blk"] as RankCategory[]) {
          totalRanks[key].sort(sortDesc);
          avgRanks[key].sort(sortDesc);
        }

        if (!alive) return;

        setGameCount(gameIds.length);
        setRankData({
          avg: avgRanks,
          total: totalRanks,
        });
      } catch (err: any) {
        setError(err?.message || "載入排行榜失敗");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadRankings();

    return () => {
      alive = false;
    };
  }, []);

  const activeConfig = useMemo(
    () => categoryList.find((c) => c.key === activeCategory)!,
    [activeCategory]
  );

  const currentTop3 = useMemo(() => {
    return rankData[mode][activeCategory].slice(0, 3);
  }, [rankData, mode, activeCategory]);

  return (
    <main
      style={{
        minHeight: "100vh",
        color: "#fff",
        background:
          "radial-gradient(circle at top, rgba(255,120,60,0.18) 0%, rgba(16,16,16,0.98) 22%, #050505 100%)",
        padding: "20px 16px 40px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1240,
          margin: "0 auto",
          display: "grid",
          gap: 20,
        }}
      >
        <section
          style={{
            borderRadius: 28,
            padding: "24px 20px",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
            display: "grid",
            gap: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 8 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  width: "fit-content",
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                TEAM LEADERBOARD
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(28px, 5vw, 44px)",
                  lineHeight: 1.05,
                  fontWeight: 900,
                  letterSpacing: -1.2,
                }}
              >
                數據排行榜
              </h1>

              <p
                style={{
                  margin: 0,
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 14,
                  lineHeight: 1.7,
                  maxWidth: 700,
                }}
              >
                目前使用資料庫中已完成的 {gameCount} 場比賽數據，自動統計全隊五大數據前三名。
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <Link
                href="/"
                style={{
                  textDecoration: "none",
                  color: "#fff",
                  padding: "10px 14px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                回首頁
              </Link>
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              width: "fit-content",
              flexWrap: "wrap",
              gap: 8,
              padding: 6,
              borderRadius: 16,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {[
              { key: "avg" as RankMode, label: "場均" },
              { key: "total" as RankMode, label: "總數" },
            ].map((item) => {
              const active = mode === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMode(item.key)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 12,
                    padding: "10px 18px",
                    fontSize: 14,
                    fontWeight: 800,
                    color: active ? "#111" : "#fff",
                    background: active ? "#fff" : "transparent",
                    transition: "0.2s ease",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>

        <section
          style={{
            borderRadius: 24,
            padding: "14px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            overflowX: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              minWidth: "max-content",
            }}
          >
            {categoryList.map((item) => {
              const active = activeCategory === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveCategory(item.key)}
                  style={{
                    border: active
                      ? `1px solid ${item.accent}`
                      : "1px solid rgba(255,255,255,0.08)",
                    background: active
                      ? `linear-gradient(135deg, ${item.accent}, rgba(255,255,255,0.08))`
                      : "rgba(255,255,255,0.03)",
                    color: "#fff",
                    borderRadius: 16,
                    padding: "12px 16px",
                    minWidth: 118,
                    display: "grid",
                    gap: 4,
                    cursor: "pointer",
                    textAlign: "left",
                    boxShadow: active ? `0 12px 30px ${item.accent}33` : "none",
                  }}
                >
                  <div style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</div>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>{item.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.82 }}>{item.short} LEADER</div>
                </button>
              );
            })}
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "end",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.62)",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                }}
              >
                CURRENT CATEGORY
              </div>
              <div
                style={{
                  fontSize: "clamp(22px, 4vw, 30px)",
                  fontWeight: 900,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span>{activeConfig.icon}</span>
                <span>{activeConfig.label} 前三名</span>
              </div>
            </div>

            <div
              style={{
                padding: "10px 14px",
                borderRadius: 16,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 13,
                color: "rgba(255,255,255,0.78)",
                fontWeight: 700,
              }}
            >
              顯示模式：{mode === "avg" ? activeConfig.unitAvg : activeConfig.unitTotal}
            </div>
          </div>

          {loading ? (
            <div
              style={{
                borderRadius: 24,
                padding: 28,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.72)",
                fontWeight: 700,
              }}
            >
              載入排行榜中...
            </div>
          ) : error ? (
            <div
              style={{
                borderRadius: 24,
                padding: 28,
                background: "rgba(255,80,80,0.08)",
                border: "1px solid rgba(255,80,80,0.25)",
                color: "#ffd7d7",
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          ) : currentTop3.length === 0 ? (
            <div
              style={{
                borderRadius: 24,
                padding: 28,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.72)",
                fontWeight: 700,
              }}
            >
              目前沒有可顯示的排行榜資料。
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {currentTop3.map((player, index) => {
                const firstValue = currentTop3[0]?.value ?? 0;
                const isFirst = index === 0;

                return (
                  <div
                    key={player.id}
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      borderRadius: 28,
                      padding: isFirst ? "24px 22px" : "20px 18px",
                      background: isFirst
                        ? `linear-gradient(145deg, ${activeConfig.accent}33, rgba(255,255,255,0.06))`
                        : "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
                      border: isFirst
                        ? `1px solid ${activeConfig.accent}`
                        : "1px solid rgba(255,255,255,0.08)",
                      boxShadow: rankGlow(index),
                      minHeight: isFirst ? 260 : 230,
                      display: "grid",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: -28,
                        right: -20,
                        width: 120,
                        height: 120,
                        borderRadius: "50%",
                        background: `${activeConfig.accent}22`,
                        filter: "blur(8px)",
                      }}
                    />

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "7px 12px",
                          borderRadius: 999,
                          background: "rgba(0,0,0,0.28)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          fontSize: 12,
                          fontWeight: 900,
                          letterSpacing: 0.6,
                        }}
                      >
                        {index === 0 ? "👑" : index === 1 ? "🥈" : "🥉"} {medalLabel(index)}
                      </div>

                      <div
                        style={{
                          fontSize: 48,
                          fontWeight: 900,
                          lineHeight: 1,
                          opacity: 0.14,
                        }}
                      >
                        #{index + 1}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "72px 1fr",
                        gap: 14,
                        alignItems: "center",
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 22,
                          background: "rgba(255,255,255,0.12)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 24,
                          fontWeight: 900,
                        }}
                      >
                        {player.number}
                      </div>

                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: 22, fontWeight: 900 }}>{player.name}</div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "rgba(255,255,255,0.72)",
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <span>#{player.number}</span>
                          <span>{player.position}</span>
                          <span>GP {player.games}</span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          fontSize: isFirst ? 44 : 36,
                          fontWeight: 900,
                          lineHeight: 1,
                          letterSpacing: -1,
                        }}
                      >
                        {formatValue(player.value, mode)}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.72)",
                          letterSpacing: 0.7,
                        }}
                      >
                        {mode === "avg" ? activeConfig.unitAvg : activeConfig.unitTotal}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: "auto",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {index === 0
                          ? "目前榜首"
                          : `與第1差距 ${diffFromFirst(firstValue, player.value, mode)}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section
          style={{
            borderRadius: 28,
            padding: "20px 18px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
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
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900 }}>其他排行榜快速預覽</div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.65)",
                fontWeight: 700,
              }}
            >
              點上方分類可切換完整前三名卡片
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            {categoryList.map((cat) => {
              const top = rankData[mode][cat.key][0];
              const isActive = cat.key === activeCategory;

              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  style={{
                    textAlign: "left",
                    borderRadius: 22,
                    padding: "16px",
                    border: isActive
                      ? `1px solid ${cat.accent}`
                      : "1px solid rgba(255,255,255,0.08)",
                    background: isActive
                      ? `linear-gradient(145deg, ${cat.accent}20, rgba(255,255,255,0.04))`
                      : "rgba(255,255,255,0.03)",
                    color: "#fff",
                    cursor: "pointer",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 900 }}>
                      {cat.icon} {cat.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "rgba(255,255,255,0.62)",
                      }}
                    >
                      LEADER
                    </div>
                  </div>

                  <div style={{ fontSize: 20, fontWeight: 900 }}>
                    {top?.name ?? "-"}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "end",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
                      {top ? `#${top.number} · ${top.position}` : "尚無資料"}
                    </div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 900,
                        lineHeight: 1,
                      }}
                    >
                      {top ? formatValue(top.value, mode) : "-"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}