"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

type Stat = {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
};

function emptyStat(): Stat {
  return {
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
  };
}

function applyEventToStat(stat: Stat, eventType: string) {
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

function initials(name?: string | null) {
  if (!name) return "P";
  return name.trim().slice(0, 1).toUpperCase();
}

export default function PlayersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [keyword, setKeyword] = useState("");

  const load = useCallback(async () => {
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
        .select("id, game_id, player_id, event_type, is_undone")
        .not("player_id", "is", null);

      if (eventError) throw eventError;

      setPlayers((playerData || []) as PlayerRow[]);
      setEvents((eventData || []) as EventRow[]);
    } catch (err: any) {
      console.error("PlayersPage load error:", err);
      setError(err?.message || "載入球員資料失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const playerStatsMap = useMemo(() => {
    const map = new Map<string, Stat>();

    for (const player of players) {
      map.set(player.id, emptyStat());
    }

    for (const ev of events) {
      if (!ev.player_id) continue;
      if (ev.is_undone) continue;
      const stat = map.get(ev.player_id);
      if (!stat) continue;
      applyEventToStat(stat, ev.event_type);
    }

    return map;
  }, [players, events]);

  const filteredPlayers = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return players;

    return players.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const number = String(p.number ?? "");
      const position = (p.position || "").toLowerCase();
      return name.includes(k) || number.includes(k) || position.includes(k);
    });
  }, [players, keyword]);

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top, rgba(245,158,11,0.14) 0%, #050505 28%, #000 100%)",
          color: "#fff",
          padding: 20,
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div
            style={{
              background: "rgba(12,12,12,0.96)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 24,
              padding: 24,
            }}
          >
            載入球員資料中...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(245,158,11,0.18) 0%, rgba(120,53,15,0.16) 12%, #050505 30%, #000 100%)",
        color: "#fff",
        padding: 20,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/games/viewer"
              style={{
                textDecoration: "none",
                color: "#fff",
                padding: "10px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              ← 返回首頁
            </Link>

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
          </div>

          <LogoutButton />
        </div>

        <section
          style={{
            background: "linear-gradient(180deg, rgba(20,20,20,0.98), rgba(10,10,10,0.98))",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 28,
            padding: 24,
            boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
            display: "grid",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.58)", fontWeight: 700 }}>
              PLAYERS
            </div>
            <div style={{ marginTop: 4, fontSize: 32, fontWeight: 900, letterSpacing: "-0.02em" }}>
              球員列表
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: "rgba(255,255,255,0.65)" }}>
              點擊球員即可進入個人數據頁
            </div>
          </div>

          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜尋姓名 / 背號 / 位置"
            style={{
              width: "100%",
              height: 48,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: "#fff",
              padding: "0 14px",
              outline: "none",
              fontSize: 14,
            }}
          />
        </section>

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

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {filteredPlayers.map((player) => {
            const stat = playerStatsMap.get(player.id) || emptyStat();

            return (
              <Link
                key={player.id}
                href={`/games/players/${player.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "rgba(10,10,10,0.96)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 24,
                    padding: 18,
                    boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
                    display: "grid",
                    gap: 14,
                    transition: "transform 0.18s ease, border-color 0.18s ease",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <div
                      style={{
                        width: 62,
                        height: 62,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 24,
                        fontWeight: 900,
                        background:
                          "linear-gradient(135deg, rgba(245,158,11,0.95), rgba(234,88,12,0.95))",
                        color: "#111",
                        flexShrink: 0,
                      }}
                    >
                      {initials(player.name)}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>
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
                            background:
                              player.active === false
                                ? "rgba(120,120,120,0.15)"
                                : "rgba(34,197,94,0.14)",
                            border:
                              player.active === false
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
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 10,
                    }}
                  >
                    {[
                      { label: "PTS", value: stat.pts },
                      { label: "REB", value: stat.reb },
                      { label: "AST", value: stat.ast },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          borderRadius: 16,
                          padding: 12,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.56)", fontWeight: 800 }}>
                          {item.label}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#fbbf24",
                      fontWeight: 800,
                    }}
                  >
                    查看個人數據 →
                  </div>
                </div>
              </Link>
            );
          })}
        </section>

        {filteredPlayers.length === 0 ? (
          <div
            style={{
              background: "rgba(10,10,10,0.96)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 24,
              padding: 24,
              color: "rgba(255,255,255,0.72)",
            }}
          >
            找不到符合條件的球員
          </div>
        ) : null}
      </div>
    </main>
  );
}