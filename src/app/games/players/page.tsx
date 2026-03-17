"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  teamA: string | null;
  teamB: string | null;
  game_date?: string | null;
  created_at?: string | null;
  status?: string | null;
};

type GamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "teamA" | "teamB";
  is_starter: boolean;
};

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  team_side?: "teamA" | "teamB" | null;
  is_undone?: boolean | null;
  undone_at?: string | null;
};

type Stat = {
  gp: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
};

type PerGameStat = {
  gameId: string;
  dateLabel: string;
  opponent: string;
  teamSide: "teamA" | "teamB";
  isStarter: boolean;
  stat: Omit<Stat, "gp">;
};

function emptyStat(): Stat {
  return {
    gp: 0,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
  };
}

function emptyGameStat(): Omit<Stat, "gp"> {
  return {
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
  };
}

function pct(made: number, att: number) {
  if (!att) return "0.0";
  return ((made / att) * 100).toFixed(1);
}

function avg(total: number, gp: number) {
  if (!gp) return "0.0";
  return (total / gp).toFixed(1);
}

function eff(stat: Omit<Stat, "gp"> | Stat) {
  return (
    stat.pts +
    stat.reb +
    stat.ast +
    stat.stl +
    stat.blk -
    stat.tov -
    (stat.fg2a - stat.fg2m) -
    (stat.fg3a - stat.fg3m) -
    (stat.fta - stat.ftm)
  );
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function applyEventToStat(stat: Omit<Stat, "gp">, eventType: string) {
  switch (eventType) {
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
    case "pf":
      stat.pf += 1;
      break;
    default:
      break;
  }
}

function sumStats(list: PerGameStat[]) {
  const total = emptyStat();
  total.gp = list.length;

  for (const item of list) {
    total.pts += item.stat.pts;
    total.reb += item.stat.reb;
    total.ast += item.stat.ast;
    total.stl += item.stat.stl;
    total.blk += item.stat.blk;
    total.tov += item.stat.tov;
    total.pf += item.stat.pf;
    total.fg2m += item.stat.fg2m;
    total.fg2a += item.stat.fg2a;
    total.fg3m += item.stat.fg3m;
    total.fg3a += item.stat.fg3a;
    total.ftm += item.stat.ftm;
    total.fta += item.stat.fta;
  }

  return total;
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

export default function PlayerProfilePage() {
  const params = useParams<{ id: string }>();
  const playerId = String(params?.id || "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [games, setGames] = useState<GameRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  const load = useCallback(async () => {
    if (!playerId) {
      setError("抓不到 playerId，請確認路由是否為 /games/players/[id]");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("id, name, number, position, active")
        .eq("id", playerId)
        .single();

      if (playerError) throw playerError;
      setPlayer(playerData as PlayerRow);

      const { data: gpData, error: gpError } = await supabase
        .from("game_players")
        .select("id, game_id, player_id, team_side, is_starter")
        .eq("player_id", playerId);

      if (gpError) throw gpError;

      const safeGamePlayers = (gpData || []) as GamePlayerRow[];
      setGamePlayers(safeGamePlayers);

      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select(
          "id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at"
        )
        .eq("player_id", playerId)
        .order("created_at", { ascending: true });

      if (eventError) throw eventError;

      const safeEvents = (eventData || []) as EventRow[];
      setEvents(safeEvents);

      const gameIds = [
        ...new Set([
          ...safeGamePlayers.map((row) => row.game_id),
          ...safeEvents.map((row) => row.game_id),
        ]),
      ];

      if (gameIds.length === 0) {
        setGames([]);
        return;
      }

      const { data: gameData, error: gameError } = await supabase
        .from("games")
        .select("id, teamA, teamB, game_date, created_at, status")
        .in("id", gameIds);

      if (gameError) throw gameError;

      setGames((gameData || []) as GameRow[]);
    } catch (err: any) {
      console.error("PlayerProfilePage load error:", err);
      setError(err?.message || "載入資料失敗");
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    load();
  }, [load]);

  const perGameStats = useMemo(() => {
    const gameMap = new Map(games.map((g) => [g.id, g]));
    const gpMap = new Map(gamePlayers.map((gp) => [gp.game_id, gp]));
    const bucket = new Map<string, PerGameStat>();

    for (const ev of events) {
      if (!ev.player_id) continue;
      if (ev.is_undone) continue;

      const game = gameMap.get(ev.game_id);
      if (!game) continue;

      if (!bucket.has(ev.game_id)) {
        const gp = gpMap.get(ev.game_id);

        const teamSide =
          (gp?.team_side || ev.team_side || "teamA") as "teamA" | "teamB";

        const opponent =
          teamSide === "teamA"
            ? game.teamB || "對手未設定"
            : game.teamA || "對手未設定";

        bucket.set(ev.game_id, {
          gameId: ev.game_id,
          dateLabel: formatDate(game.game_date || game.created_at),
          opponent,
          teamSide,
          isStarter: !!gp?.is_starter,
          stat: emptyGameStat(),
        });
      }
    }

    for (const ev of events) {
      if (!ev.player_id) continue;
      if (ev.is_undone) continue;

      const item = bucket.get(ev.game_id);
      if (!item) continue;

      applyEventToStat(item.stat, ev.event_type);
    }

    return [...bucket.values()].sort((a, b) => {
      const ga = gameMap.get(a.gameId);
      const gb = gameMap.get(b.gameId);
      const ta = new Date(ga?.game_date || ga?.created_at || 0).getTime();
      const tb = new Date(gb?.game_date || gb?.created_at || 0).getTime();
      return tb - ta;
    });
  }, [games, gamePlayers, events]);

  const total = useMemo(() => sumStats(perGameStats), [perGameStats]);

  const summary = useMemo(() => {
    const gp = total.gp || 0;
    const totalEff = perGameStats.reduce((sum, item) => sum + eff(item.stat), 0);

    return {
      gp,
      avgPts: avg(total.pts, gp),
      avgReb: avg(total.reb, gp),
      avgAst: avg(total.ast, gp),
      avgStl: avg(total.stl, gp),
      avgBlk: avg(total.blk, gp),
      avgTov: avg(total.tov, gp),
      avgPf: avg(total.pf, gp),
      avgEff: gp ? (totalEff / gp).toFixed(1) : "0.0",
      fg2Pct: pct(total.fg2m, total.fg2a),
      fg3Pct: pct(total.fg3m, total.fg3a),
      ftPct: pct(total.ftm, total.fta),
      totalEff,
    };
  }, [perGameStats, total]);

  const hue = hueFromString(player?.id || player?.name || "player");

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top, rgba(245,158,11,0.16) 0%, #050505 28%, #000 100%)",
          color: "#fff",
          padding: 20,
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
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
        </div>
      </main>
    );
  }

  if (!player) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top, rgba(245,158,11,0.16) 0%, #050505 28%, #000 100%)",
          color: "#fff",
          padding: 20,
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 16 }}>
          <LogoutButton />
          <div
            style={{
              background: "rgba(12,12,12,0.96)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 24,
              padding: 24,
            }}
          >
            找不到球員資料
          </div>
          {error ? <div style={{ color: "#fca5a5" }}>錯誤：{error}</div> : null}
        </div>
      </main>
    );
  }

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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/games/players"
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
              ← 返回球員列表
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

        <section className="topSection">
          <div
            style={{
              background: "linear-gradient(180deg, rgba(20,20,20,0.98), rgba(10,10,10,0.98))",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 28,
              padding: 22,
              boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
              display: "grid",
              gap: 18,
            }}
          >
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div
                style={{
                  position: "relative",
                  width: 88,
                  height: 88,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 30,
                  fontWeight: 900,
                  background: `linear-gradient(135deg, hsla(${hue}, 90%, 56%, 1), hsla(${(hue + 35) % 360}, 92%, 48%, 1))`,
                  color: "#111",
                  boxShadow: `0 12px 30px hsla(${hue}, 90%, 50%, 0.22)`,
                  flexShrink: 0,
                }}
              >
                {initials(player.name)}
                <div
                  style={{
                    position: "absolute",
                    right: -6,
                    bottom: -4,
                    minWidth: 34,
                    height: 34,
                    padding: "0 10px",
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    background: "#111",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  #{player.number ?? "-"}
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.58)", fontWeight: 700 }}>
                  PLAYER PROFILE
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 32,
                    lineHeight: 1.05,
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
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
                      padding: "7px 10px",
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
                      padding: "7px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.72)",
                      fontWeight: 800,
                    }}
                  >
                    GP {summary.gp}
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                borderRadius: 22,
                padding: 18,
                background:
                  "linear-gradient(135deg, rgba(245,158,11,0.14), rgba(255,255,255,0.03))",
                border: "1px solid rgba(245,158,11,0.16)",
              }}
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", fontWeight: 700 }}>
                本季摘要
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 24,
                  lineHeight: 1.35,
                  fontWeight: 900,
                }}
              >
                場均 {summary.avgPts} 分 / {summary.avgReb} 籃板 / {summary.avgAst} 助攻
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.65)",
                }}
              >
                共出賽 {summary.gp} 場，AVG EFF {summary.avgEff}
              </div>
            </div>
          </div>

          <div className="statCards">
            {[
              { label: "AVG PTS", value: summary.avgPts },
              { label: "AVG REB", value: summary.avgReb },
              { label: "AVG AST", value: summary.avgAst },
              { label: "AVG STL", value: summary.avgStl },
              { label: "AVG BLK", value: summary.avgBlk },
              { label: "AVG EFF", value: summary.avgEff },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  minHeight: 132,
                  borderRadius: 24,
                  padding: 18,
                  background: "linear-gradient(180deg, rgba(18,18,18,0.98), rgba(10,10,10,0.98))",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)", fontWeight: 800 }}>
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 900,
                    letterSpacing: "-0.04em",
                    color: "#fff",
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="middleSection">
          <div
            style={{
              background: "rgba(10,10,10,0.96)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 28,
              padding: 20,
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>詳細數據</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.56)", marginTop: 4 }}>
                從 events 與 games 自動統計
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  minWidth: 900,
                }}
              >
                <thead>
                  <tr>
                    {[
                      "GP",
                      "PTS",
                      "REB",
                      "AST",
                      "STL",
                      "BLK",
                      "TOV",
                      "PF",
                      "2PM-A",
                      "2PT%",
                      "3PM-A",
                      "3PT%",
                      "FTM-A",
                      "FT%",
                      "EFF",
                    ].map((th) => (
                      <th
                        key={th}
                        style={{
                          textAlign: "center",
                          padding: "12px 10px",
                          fontSize: 12,
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.62)",
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.03)",
                        }}
                      >
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    {[
                      total.gp,
                      total.pts,
                      total.reb,
                      total.ast,
                      total.stl,
                      total.blk,
                      total.tov,
                      total.pf,
                      `${total.fg2m}-${total.fg2a}`,
                      `${summary.fg2Pct}%`,
                      `${total.fg3m}-${total.fg3a}`,
                      `${summary.fg3Pct}%`,
                      `${total.ftm}-${total.fta}`,
                      `${summary.ftPct}%`,
                      summary.totalEff,
                    ].map((td, idx) => (
                      <td
                        key={idx}
                        style={{
                          textAlign: "center",
                          padding: "16px 10px",
                          fontSize: 15,
                          fontWeight: 800,
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {td}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    {[
                      "AVG",
                      summary.avgPts,
                      summary.avgReb,
                      summary.avgAst,
                      summary.avgStl,
                      summary.avgBlk,
                      summary.avgTov,
                      summary.avgPf,
                      `${avg(total.fg2m, total.gp)}-${avg(total.fg2a, total.gp)}`,
                      `${summary.fg2Pct}%`,
                      `${avg(total.fg3m, total.gp)}-${avg(total.fg3a, total.gp)}`,
                      `${summary.fg3Pct}%`,
                      `${avg(total.ftm, total.gp)}-${avg(total.fta, total.gp)}`,
                      `${summary.ftPct}%`,
                      summary.avgEff,
                    ].map((td, idx) => (
                      <td
                        key={idx}
                        style={{
                          textAlign: "center",
                          padding: "16px 10px",
                          fontSize: 15,
                          fontWeight: 900,
                          color: idx === 0 ? "#fbbf24" : "#fff",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          background: "rgba(245,158,11,0.05)",
                        }}
                      >
                        {td}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <div
              style={{
                background: "rgba(10,10,10,0.96)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 900 }}>投籃命中率</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.56)", marginTop: 4 }}>
                依照資料庫命中 / 出手計算
              </div>

              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                {[
                  {
                    label: "2PT%",
                    value: `${summary.fg2Pct}%`,
                    sub: `${total.fg2m}/${total.fg2a}`,
                  },
                  {
                    label: "3PT%",
                    value: `${summary.fg3Pct}%`,
                    sub: `${total.fg3m}/${total.fg3a}`,
                  },
                  {
                    label: "FT%",
                    value: `${summary.ftPct}%`,
                    sub: `${total.ftm}/${total.fta}`,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      borderRadius: 18,
                      padding: "14px 16px",
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.56)", fontWeight: 800 }}>
                        {item.label}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
                        {item.sub}
                      </div>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 900 }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                background: "rgba(10,10,10,0.96)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 900 }}>總覽</div>

              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                {[
                  { label: "出賽場次", value: String(summary.gp) },
                  { label: "總得分", value: String(total.pts) },
                  { label: "總籃板", value: String(total.reb) },
                  { label: "總助攻", value: String(total.ast) },
                  { label: "總抄截", value: String(total.stl) },
                  { label: "總阻攻", value: String(total.blk) },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      paddingBottom: 10,
                    }}
                  >
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 700 }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 900 }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            background: "rgba(10,10,10,0.96)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 28,
            padding: 20,
            boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>比賽紀錄</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.56)", marginTop: 4 }}>
              每場比賽從資料庫事件自動統計
            </div>
          </div>

          {perGameStats.length === 0 ? (
            <div
              style={{
                borderRadius: 18,
                padding: 18,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.72)",
              }}
            >
              目前沒有比賽紀錄
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  minWidth: 980,
                }}
              >
                <thead>
                  <tr>
                    {[
                      "日期",
                      "對手",
                      "身份",
                      "PTS",
                      "REB",
                      "AST",
                      "STL",
                      "BLK",
                      "TOV",
                      "PF",
                      "2PT",
                      "3PT",
                      "FT",
                      "EFF",
                      "BOX",
                    ].map((th) => (
                      <th
                        key={th}
                        style={{
                          textAlign: "center",
                          padding: "12px 10px",
                          fontSize: 12,
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.62)",
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.03)",
                        }}
                      >
                        {th}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {perGameStats.map((item) => (
                    <tr key={item.gameId}>
                      <td
                        style={{
                          textAlign: "center",
                          padding: "15px 10px",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          fontWeight: 700,
                        }}
                      >
                        {item.dateLabel}
                      </td>

                      <td
                        style={{
                          textAlign: "center",
                          padding: "15px 10px",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          fontWeight: 800,
                        }}
                      >
                        {item.opponent}
                      </td>

                      <td
                        style={{
                          textAlign: "center",
                          padding: "15px 10px",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                            background: item.isStarter
                              ? "rgba(245,158,11,0.14)"
                              : "rgba(255,255,255,0.06)",
                            border: item.isStarter
                              ? "1px solid rgba(245,158,11,0.25)"
                              : "1px solid rgba(255,255,255,0.08)",
                            color: item.isStarter ? "#fbbf24" : "#e5e7eb",
                          }}
                        >
                          {item.isStarter ? "先發" : "替補"}
                        </span>
                      </td>

                      {[
                        item.stat.pts,
                        item.stat.reb,
                        item.stat.ast,
                        item.stat.stl,
                        item.stat.blk,
                        item.stat.tov,
                        item.stat.pf,
                        `${item.stat.fg2m}-${item.stat.fg2a}`,
                        `${item.stat.fg3m}-${item.stat.fg3a}`,
                        `${item.stat.ftm}-${item.stat.fta}`,
                        eff(item.stat),
                      ].map((td, idx) => (
                        <td
                          key={idx}
                          style={{
                            textAlign: "center",
                            padding: "15px 10px",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                            fontWeight: 700,
                          }}
                        >
                          {td}
                        </td>
                      ))}

                      <td
                        style={{
                          textAlign: "center",
                          padding: "15px 10px",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <Link
                          href={`/games/${item.gameId}/board`}
                          style={{
                            textDecoration: "none",
                            color: "#111",
                            background: "#f59e0b",
                            borderRadius: 999,
                            padding: "8px 12px",
                            fontSize: 12,
                            fontWeight: 900,
                            display: "inline-block",
                          }}
                        >
                          查看
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        .topSection {
          display: grid;
          grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
          gap: 18px;
        }

        .statCards {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 14px;
        }

        .middleSection {
          display: grid;
          grid-template-columns: 1.35fr 1fr;
          gap: 18px;
          align-items: start;
        }

        @media (max-width: 1100px) {
          .topSection {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 980px) {
          .middleSection {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 900px) {
          .statCards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
}