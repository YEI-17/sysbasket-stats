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
  player_id: string | null;
  event_type: string;
  is_undone?: boolean | null;
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

function initials(name?: string | null) {
  if (!name) return "P";
  return name.trim().slice(0, 1).toUpperCase();
}

function hueFromString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export default function PlayersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<{ player_id: string; game_id: string }[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("id, name, number, position, active")
          .order("number", { ascending: true });

        if (playerError) throw playerError;

        const { data: eventData, error: eventError } = await supabase
          .from("events")
          .select("id, player_id, event_type, is_undone");

        if (eventError) throw eventError;

        const { data: gpData, error: gpError } = await supabase
          .from("game_players")
          .select("player_id, game_id");

        if (gpError) throw gpError;

        setPlayers((playerData || []) as PlayerRow[]);
        setEvents((eventData || []) as EventRow[]);
        setGamePlayers((gpData || []) as { player_id: string; game_id: string }[]);
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

    const gpBucket = new Map<string, Set<string>>();
    for (const row of gamePlayers) {
      if (!row.player_id) continue;
      if (!gpBucket.has(row.player_id)) gpBucket.set(row.player_id, new Set());
      gpBucket.get(row.player_id)!.add(row.game_id);
    }

    for (const [playerId, gameIdSet] of gpBucket.entries()) {
      if (!map.has(playerId)) map.set(playerId, emptyPreviewStat());
      map.get(playerId)!.gp = gameIdSet.size;
    }

    for (const ev of events) {
      if (!ev.player_id) continue;
      if (ev.is_undone) continue;
      if (!map.has(ev.player_id)) map.set(ev.player_id, emptyPreviewStat());

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

    return map;
  }, [players, events, gamePlayers]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(245,158,11,0.18) 0%, rgba(120,53,15,0.18) 12%, #050505 30%, #000 100%)",
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
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.58)", fontWeight: 700 }}>
              TEAM ROSTER
            </div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>球員列表</h1>
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
              const hue = hueFromString(player.id || player.name || "player");

              return (
                <Link
                  key={player.id}
                  href={`/games/players/${player.id}`}
                  style={{ textDecoration: "none", color: "#fff" }}
                >
                  <article
                    style={{
                      height: "100%",
                      borderRadius: 28,
                      padding: 20,
                      background: "linear-gradient(180deg, rgba(18,18,18,0.98), rgba(10,10,10,0.98))",
                      border: "1px solid rgba(255,255,255,0.08)",
                      boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
                      display: "grid",
                      gap: 16,
                      transition: "transform .18s ease, border-color .18s ease",
                    }}
                  >
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <div
                        style={{
                          position: "relative",
                          width: 72,
                          height: 72,
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 26,
                          fontWeight: 900,
                          background: `linear-gradient(135deg, hsla(${hue}, 90%, 56%, 1), hsla(${(hue + 35) % 360}, 92%, 48%, 1))`,
                          color: "#111",
                          boxShadow: `0 12px 30px hsla(${hue}, 90%, 50%, 0.22)`,
                          flexShrink: 0,
                        }}
                      >
                        {initials(player.name)}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 24,
                            lineHeight: 1.1,
                            fontWeight: 900,
                            wordBreak: "break-word",
                          }}
                        >
                          #{player.number ?? "-"} {player.name}
                        </div>

                        <div
                          style={{
                            marginTop: 8,
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

                          <span
                            style={{
                              padding: "6px 10px",
                              borderRadius: 999,
                              background: player.active === false
                                ? "rgba(120,120,120,0.15)"
                                : "rgba(34,197,94,0.14)",
                              border: player.active === false
                                ? "1px solid rgba(255,255,255,0.08)"
                                : "1px solid rgba(34,197,94,0.28)",
                              color: player.active === false ? "#d4d4d8" : "#bbf7d0",
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            {player.active === false ? "未啟用" : "現役"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: 10,
                      }}
                    >
                      {[
                        { label: "GP", value: String(stat.gp) },
                        { label: "AVG PTS", value: avg(stat.pts, stat.gp) },
                        { label: "AVG REB", value: avg(stat.reb, stat.gp) },
                        { label: "AVG AST", value: avg(stat.ast, stat.gp) },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            borderRadius: 16,
                            padding: 12,
                            background: "rgba(255,255,255,0.035)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.56)", fontWeight: 800 }}>
                            {item.label}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900 }}>
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
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", fontWeight: 700 }}>
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

        @media (max-width: 1100px) {
          .gridWrap {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 700px) {
          .gridWrap {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}