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

type GameRow = {
  id: string;
  game_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  quarters?: number | null;
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

type PlayerGameStatRow = {
  player_id: string;
  game_id: string;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  fg2m?: number | null;
  fg2a?: number | null;
  fg3m?: number | null;
  fg3a?: number | null;
  ftm?: number | null;
  fta?: number | null;
  tov?: number | null;
};

type PreviewStat = {
  gp: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  tov: number;
  eff: number;
};

function emptyPreviewStat(): PreviewStat {
  return {
    gp: 0,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
    tov: 0,
    eff: 0,
  };
}

function avg(total: number, gp: number) {
  if (!gp) return "0.0";
  return (total / gp).toFixed(1);
}

function toSafeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeStatus(status?: string | null) {
  const s = String(status || "")
    .trim()
    .toLowerCase();

  if (["finished", "final", "ended", "done", "completed", "closed"].includes(s)) {
    return "已結束";
  }
  if (["live", "playing", "in_progress", "ongoing", "running"].includes(s)) {
    return "直播中";
  }
  if (["scheduled", "upcoming", "pending"].includes(s)) {
    return "未開始";
  }
  return status ?? "未設定";
}

function isOfficialFinishedGame(game: GameRow) {
  return normalizeStatus(game.status) === "已結束" && (game.quarters ?? 4) >= 4;
}

function calcEfficiency(stat: {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  tov: number;
}) {
  const missedFg =
    Math.max(0, stat.fg2a - stat.fg2m) + Math.max(0, stat.fg3a - stat.fg3m);
  const missedFt = Math.max(0, stat.fta - stat.ftm);

  return (
    stat.pts +
    stat.reb +
    stat.ast +
    stat.stl +
    stat.blk -
    missedFg -
    missedFt -
    stat.tov
  );
}

export default function PlayersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);
  const [playerGameStats, setPlayerGameStats] = useState<PlayerGameStatRow[]>(
    []
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const [
          { data: gamesData, error: gamesError },
          { data: playerData, error: playerError },
          { data: eventData, error: eventError },
          { data: gpData, error: gpError },
          { data: pgsData, error: pgsError },
        ] = await Promise.all([
          supabase
            .from("games")
            .select("id, game_date, created_at, status, quarters")
            .order("game_date", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true, nullsFirst: false }),

          supabase
            .from("players")
            .select("id, name, number, position, active")
            .order("number", { ascending: true, nullsFirst: false }),

          supabase
            .from("events")
            .select("id, game_id, player_id, event_type, is_undone"),

          supabase.from("game_players").select("player_id, game_id"),

          supabase
            .from("player_game_stats")
            .select(
              "player_id, game_id, pts, reb, ast, stl, blk, fg2m, fg2a, fg3m, fg3a, ftm, fta, tov"
            ),
        ]);

        if (gamesError) throw gamesError;
        if (playerError) throw playerError;
        if (eventError) throw eventError;
        if (gpError) throw gpError;
        if (pgsError) throw pgsError;

        const safeGames = ((gamesData || []) as GameRow[]).filter(isOfficialFinishedGame);
        const allowedGameIds = new Set(safeGames.map((g) => g.id));

        setGames(safeGames);
        setPlayers(((playerData || []) as PlayerRow[]).filter((p) => p.active !== false));
        setEvents(
          ((eventData || []) as EventRow[]).filter(
            (row) => row.game_id && allowedGameIds.has(row.game_id)
          )
        );
        setGamePlayers(
          ((gpData || []) as GamePlayerRow[]).filter(
            (row) => row.game_id && allowedGameIds.has(row.game_id)
          )
        );
        setPlayerGameStats(
          ((pgsData || []) as PlayerGameStatRow[]).filter(
            (row) => row.game_id && allowedGameIds.has(row.game_id)
          )
        );
      } catch (err: any) {
        console.error("PlayersPage load error:", err);
        setError(err?.message || "載入球員資料失敗");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const statMap = useMemo(() => {
    const map = new Map<string, PreviewStat>();

    for (const player of players) {
      map.set(player.id, emptyPreviewStat());
    }

    const ensureStat = (playerId: string) => {
      if (!map.has(playerId)) {
        map.set(playerId, emptyPreviewStat());
      }
      return map.get(playerId)!;
    };

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
      ensureStat(row.player_id);
    }

    const playerGameStatsMap = new Map<string, PlayerGameStatRow>();
    for (const row of playerGameStats) {
      if (!row.player_id || !row.game_id) continue;
      playerGameStatsMap.set(`${row.player_id}__${row.game_id}`, row);
    }

    const eventGroupMap = new Map<string, EventRow[]>();
    for (const ev of events) {
      if (!ev.player_id || !ev.game_id) continue;
      if (ev.is_undone) continue;

      const key = `${ev.player_id}__${ev.game_id}`;
      if (!eventGroupMap.has(key)) {
        eventGroupMap.set(key, []);
      }
      eventGroupMap.get(key)!.push(ev);

      ensurePlayedSet(ev.player_id).add(ev.game_id);
      ensureStat(ev.player_id);
    }

    const allPlayerGameKeys = new Set<string>();

    for (const row of gamePlayers) {
      if (!row.player_id || !row.game_id) continue;
      allPlayerGameKeys.add(`${row.player_id}__${row.game_id}`);
    }

    for (const row of playerGameStats) {
      if (!row.player_id || !row.game_id) continue;
      allPlayerGameKeys.add(`${row.player_id}__${row.game_id}`);
    }

    for (const ev of events) {
      if (!ev.player_id || !ev.game_id) continue;
      if (ev.is_undone) continue;
      allPlayerGameKeys.add(`${ev.player_id}__${ev.game_id}`);
    }

    for (const key of allPlayerGameKeys) {
      const [playerId, gameId] = key.split("__");
      if (!playerId || !gameId) continue;

      const stat = ensureStat(playerId);
      const pgs = playerGameStatsMap.get(key);

      if (pgs) {
        stat.pts += toSafeNumber(pgs.pts);
        stat.reb += toSafeNumber(pgs.reb);
        stat.ast += toSafeNumber(pgs.ast);
        stat.stl += toSafeNumber(pgs.stl);
        stat.blk += toSafeNumber(pgs.blk);
        stat.fg2m += toSafeNumber(pgs.fg2m);
        stat.fg2a += toSafeNumber(pgs.fg2a);
        stat.fg3m += toSafeNumber(pgs.fg3m);
        stat.fg3a += toSafeNumber(pgs.fg3a);
        stat.ftm += toSafeNumber(pgs.ftm);
        stat.fta += toSafeNumber(pgs.fta);
        stat.tov += toSafeNumber(pgs.tov);
        continue;
      }

      const evs = eventGroupMap.get(key) || [];
      for (const ev of evs) {
        switch (ev.event_type) {
          case "fg2_made":
            stat.pts += 2;
            stat.fg2m += 1;
            stat.fg2a += 1;
            break;
          case "fg2_miss":
            stat.fg2a += 1;
            break;
          case "fg3_made":
            stat.pts += 3;
            stat.fg3m += 1;
            stat.fg3a += 1;
            break;
          case "fg3_miss":
            stat.fg3a += 1;
            break;
          case "ft_made":
            stat.pts += 1;
            stat.ftm += 1;
            stat.fta += 1;
            break;
          case "ft_miss":
            stat.fta += 1;
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
          case "tov":
            stat.tov += 1;
            break;
          default:
            break;
        }
      }
    }

    for (const [playerId, gameSet] of playedGameSetMap.entries()) {
      const stat = ensureStat(playerId);
      stat.gp = gameSet.size;
      stat.eff = calcEfficiency(stat);
    }

    return map;
  }, [players, events, gamePlayers, playerGameStats]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const aStat = statMap.get(a.id) || emptyPreviewStat();
      const bStat = statMap.get(b.id) || emptyPreviewStat();

      if (bStat.eff !== aStat.eff) return bStat.eff - aStat.eff;
      if (bStat.pts !== aStat.pts) return bStat.pts - aStat.pts;
      if (bStat.ast !== aStat.ast) return bStat.ast - aStat.ast;
      if (bStat.reb !== aStat.reb) return bStat.reb - aStat.reb;

      const aNumber = a.number ?? 9999;
      const bNumber = b.number ?? 9999;
      if (aNumber !== bNumber) return aNumber - bNumber;

      return (a.name || "").localeCompare(b.name || "", "zh-Hant");
    });
  }, [players, statMap]);

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
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>
              球員數據
            </h1>
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
            {sortedPlayers.map((player) => {
              const stat = statMap.get(player.id) || emptyPreviewStat();

              return (
                <Link
                  key={player.id}
                  href={`/games/players/${player.id}`}
                  style={{ textDecoration: "none", color: "#fff" }}
                >
                  <article className="playerCard">
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
                            color: "rgba(255,255,255,0.65)",
                            fontWeight: 800,
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
                            {stat.gp} 場
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
                        效率值 {stat.eff}
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
                        { label: "場均得分", value: avg(stat.pts, stat.gp) },
                        { label: "場均助攻", value: avg(stat.ast, stat.gp) },
                        { label: "場均籃板", value: avg(stat.reb, stat.gp) },
                      ].map((item) => (
                        <div key={item.label} className="statBox">
                          <div
                            style={{
                              fontSize: 12,
                              color: "rgba(255,255,255,0.62)",
                              fontWeight: 800,
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 24,
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
                        justifyContent: "flex-end",
                        alignItems: "center",
                        paddingTop: 4,
                      }}
                    >
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
                        查看球員頁
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
          min-height: 86px;
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