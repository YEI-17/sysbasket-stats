"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

type PlayerRow = {
  id: string;
  name: string;
  number: number | null;
  position?: string | null;
  active?: boolean | null;
};

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  event_type: string;
  is_undone?: boolean | null;
};

type GamePlayerRow = {
  player_id: string;
  game_id: string;
};

type PreviewStat = {
  gp: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
};

function emptyPreviewStat(): PreviewStat {
  return {
    gp: 0,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
  };
}

function avg(total: number, gp: number) {
  if (!gp) return "0.0";
  return (total / gp).toFixed(1);
}

export default function PlayersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const [{ data: playerData, error: playerError }, { data: eventData, error: eventError }, { data: gpData, error: gpError }] =
          await Promise.all([
            supabase
              .from("players")
              .select("id, name, number, position, active")
              .order("number", { ascending: true, nullsFirst: false }),

            supabase
              .from("events")
              .select("id, game_id, player_id, event_type, is_undone"),

            supabase
              .from("game_players")
              .select("player_id, game_id"),
          ]);

        if (playerError) throw playerError;
        if (eventError) throw eventError;
        if (gpError) throw gpError;

        setPlayers((playerData || []) as PlayerRow[]);
        setEvents((eventData || []) as EventRow[]);
        setGamePlayers((gpData || []) as GamePlayerRow[]);
      } catch (err: any) {
        console.error("PlayersPage load error:", err);
        setError(err?.message || "載入球員資料失敗");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const statMap = useMemo(() => {
    const map = new Map<string, PreviewStat>();

    for (const player of players) {
      map.set(player.id, emptyPreviewStat());
    }

    const playedGameSetMap = new Map<string, Set<string>>();

    const ensurePlayedSet = (playerId: string) => {
      if (!playedGameSetMap.has(playerId)) {
        playedGameSetMap.set(playerId, new Set<string>());
      }
      return playedGameSetMap.get(playerId)!;
    };

    for (const row of gamePlayers) {
      if (!row.player_id || !row.game_id) continue;
      ensurePlayedSet(row.player_id).add(row.game_id);
    }

    for (const ev of events) {
      if (!ev.player_id || !ev.game_id) continue;
      if (ev.is_undone) continue;

      ensurePlayedSet(ev.player_id).add(ev.game_id);

      if (!map.has(ev.player_id)) {
        map.set(ev.player_id, emptyPreviewStat());
      }

      const stat = map.get(ev.player_id)!;

      switch (ev.event_type) {
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

    for (const [playerId, gameSet] of playedGameSetMap.entries()) {
      if (!map.has(playerId)) {
        map.set(playerId, emptyPreviewStat());
      }
      map.get(playerId)!.gp = gameSet.size;
    }

    return map;
  }, [players, events, gamePlayers]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(245,158,11,0.16) 0%, rgba(120,53,15,0.14) 14%, #050505 34%, #000 100%)",
        color: "#fff",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gap: 18,
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
          <div style={{ display: "grid", gap: 6 }}>
            <div
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.58)",
                fontWeight: 700,
                letterSpacing: 0.6,
              }}
            >
              TEAM ROSTER
            </div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>球員列表</h1>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 600 }}>
              預覽每位球員本季場均數據
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/games/box"
              style={{
                textDecoration: "none",
                color: "#f5f5f5",
                padding: "10px 14px",
                borderRadius: 999,
                background: "rgba(245,158,11,0.14)",
                border: "1px solid rgba(245,158,11,0.25)",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              前往數據中心
            </Link>
            <LogoutButton />
          </div>
        </div>

        {error ? (
          <div
            style={{
              color: "#fecaca",
              background: "rgba(127,29,29,0.35)",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 18,
              padding: "12px 14px",
              fontSize: 14,
            }}
          >
            錯誤：{error}
          </div>
        ) : null}

        {loading ? (
          <div
            style={{
              background: "rgba(12,12,12,0.96)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 24,
              padding: 24,
            }}
          >
            載入資料中...
          </div>
        ) : (
          <div className="gridWrap">
            {players.map((player) => {
              const stat = statMap.get(player.id) || emptyPreviewStat();

              return (
                <Link
                  key={player.id}
                  href={`/games/players/${player.id}`}
                  style={{ textDecoration: "none", color: "#fff" }}
                >
                  <article className="playerCard">
                    <div style={{ display: "grid", gap: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 16,
                              color: "rgba(255,255,255,0.55)",
                              fontWeight: 800,
                              letterSpacing: 0.3,
                            }}
                          >
                            #{player.number ?? "-"}
                          </div>

                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 22,
                              lineHeight: 1.15,
                              fontWeight: 900,
                              wordBreak: "break-word",
                            }}
                          >
                            {player.name}
                          </div>

                          <div
                            style={{
                              marginTop: 10,
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.07)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              {player.position || "未設定位置"}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            flexShrink: 0,
                            padding: "8px 12px",
                            borderRadius: 999,
                            background: "rgba(245,158,11,0.14)",
                            border: "1px solid rgba(245,158,11,0.22)",
                            color: "#fbbf24",
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          球員頁 →
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 10,
                      }}
                    >
                      {[
                        { label: "GP", value: String(stat.gp) },
                        { label: "AVG PTS", value: avg(stat.pts, stat.gp) },
                        { label: "AVG REB", value: avg(stat.reb, stat.gp) },
                        { label: "AVG AST", value: avg(stat.ast, stat.gp) },
                        { label: "AVG STL", value: avg(stat.stl, stat.gp) },
                        { label: "AVG BLK", value: avg(stat.blk, stat.gp) },
                      ].map((item) => (
                        <div key={item.label} className="statBox">
                          <div
                            style={{
                              fontSize: 11,
                              color: "rgba(255,255,255,0.56)",
                              fontWeight: 800,
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 22,
                              fontWeight: 900,
                              lineHeight: 1,
                            }}
                          >
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        paddingTop: 4,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          color: "rgba(255,255,255,0.62)",
                          fontWeight: 700,
                        }}
                      >
                        點擊查看完整球員頁
                      </div>

                      <div
                        style={{
                          borderRadius: 999,
                          padding: "8px 12px",
                          background: "#f59e0b",
                          color: "#111",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        查看 →
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .gridWrap {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .playerCard {
          height: 100%;
          border-radius: 28px;
          padding: 20px;
          background: linear-gradient(
            180deg,
            rgba(18, 18, 18, 0.98),
            rgba(10, 10, 10, 0.98)
          );
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
          display: grid;
          gap: 16px;
          transition: transform 0.18s ease, border-color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .playerCard:hover {
          transform: translateY(-4px);
          border-color: rgba(245, 158, 11, 0.28);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.42);
        }

        .statBox {
          border-radius: 16px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.06);
          min-height: 78px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        @media (max-width: 1100px) {
          .gridWrap {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 700px) {
          .gridWrap {
            grid-template-columns: 1fr;
          }

          .statBox {
            min-height: 72px;
          }
        }
      `}</style>
    </main>
  );
}