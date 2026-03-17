"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  status?: string | null;
  game_date?: string | null;
  created_at?: string | null;
};

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  team_side?: "A" | "B" | "teamA" | "teamB" | null;
  is_undone?: boolean | null;
};

type OverviewStat = {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
};

type GameItem = {
  id: string;
  date: string;
  opponent: string;
  result: "W" | "L";
  score: string;
  myScore: number;
  oppScore: number;
};

type TrendItem = {
  label: string;
  value: number;
};

function normalizeTeamSide(side?: string | null): "teamA" | "teamB" | null {
  if (!side) return null;
  const s = String(side).trim().toLowerCase();
  if (s === "a" || s === "teama") return "teamA";
  if (s === "b" || s === "teamb") return "teamB";
  return null;
}

function pct(made: number, att: number) {
  if (!att) return "0.0%";
  return `${((made / att) * 100).toFixed(1)}%`;
}

function avg(total: number, gp: number) {
  if (!gp) return "0.0";
  return (total / gp).toFixed(1);
}

function formatDate(dateStr?: string | null, createdAt?: string | null) {
  const raw = dateStr || createdAt;
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "-";
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${mm}/${dd}`;
}

function getPointsFromEventType(eventType: string) {
  switch (eventType) {
    case "fg2_made":
      return 2;
    case "fg3_made":
      return 3;
    case "ft_made":
      return 1;
    default:
      return 0;
  }
}

function calcGameScore(events: EventRow[], side: "teamA" | "teamB") {
  return events.reduce((sum, e) => {
    if (normalizeTeamSide(e.team_side) !== side) return sum;
    return sum + getPointsFromEventType(e.event_type);
  }, 0);
}

function buildTeamSummary(games: GameRow[], events: EventRow[]) {
  const gameIds = new Set(games.map((g) => g.id));
  const validEvents = events.filter(
    (e) => gameIds.has(e.game_id) && !e.is_undone
  );

  let totalPts = 0;
  let totalReb = 0;
  let totalAst = 0;
  let totalTov = 0;

  let totalFg2m = 0;
  let totalFg2a = 0;
  let totalFg3m = 0;
  let totalFg3a = 0;
  let totalFtm = 0;
  let totalFta = 0;

  let totalOppPts = 0;

  const recentGames: GameItem[] = [];

  const gamesSorted = [...games].sort((a, b) => {
    const ta = new Date(a.game_date || a.created_at || 0).getTime();
    const tb = new Date(b.game_date || b.created_at || 0).getTime();
    return tb - ta;
  });

  for (const game of gamesSorted) {
    const gameEvents = validEvents.filter((e) => e.game_id === game.id);

    let gamePts = 0;
    let gameReb = 0;
    let gameAst = 0;
    let gameTov = 0;

    let gameFg2m = 0;
    let gameFg2a = 0;
    let gameFg3m = 0;
    let gameFg3a = 0;
    let gameFtm = 0;
    let gameFta = 0;

    for (const e of gameEvents) {
      const side = normalizeTeamSide(e.team_side);

      if (side === "teamA") {
        switch (e.event_type) {
          case "fg2_made":
            gamePts += 2;
            gameFg2m += 1;
            gameFg2a += 1;
            break;
          case "fg2_miss":
            gameFg2a += 1;
            break;
          case "fg3_made":
            gamePts += 3;
            gameFg3m += 1;
            gameFg3a += 1;
            break;
          case "fg3_miss":
            gameFg3a += 1;
            break;
          case "ft_made":
            gamePts += 1;
            gameFtm += 1;
            gameFta += 1;
            break;
          case "ft_miss":
            gameFta += 1;
            break;
          case "reb":
            gameReb += 1;
            break;
          case "ast":
            gameAst += 1;
            break;
          case "tov":
            gameTov += 1;
            break;
          default:
            break;
        }
      }
    }

    const myScore = calcGameScore(gameEvents, "teamA");
    const oppScore = calcGameScore(gameEvents, "teamB");

    totalPts += gamePts;
    totalReb += gameReb;
    totalAst += gameAst;
    totalTov += gameTov;
    totalFg2m += gameFg2m;
    totalFg2a += gameFg2a;
    totalFg3m += gameFg3m;
    totalFg3a += gameFg3a;
    totalFtm += gameFtm;
    totalFta += gameFta;
    totalOppPts += oppScore;

    recentGames.push({
      id: game.id,
      date: formatDate(game.game_date, game.created_at),
      opponent: game.teamB || "對手",
      result: myScore >= oppScore ? "W" : "L",
      score: `${myScore} - ${oppScore}`,
      myScore,
      oppScore,
    });
  }

  const gp = games.length;

  return {
    gp,
    totalPts,
    totalReb,
    totalAst,
    totalTov,
    totalFg2m,
    totalFg2a,
    totalFg3m,
    totalFg3a,
    totalFtm,
    totalFta,
    totalOppPts,
    avgPts: avg(totalPts, gp),
    avgReb: avg(totalReb, gp),
    avgAst: avg(totalAst, gp),
    avgTov: avg(totalTov, gp),
    ftPct: pct(totalFtm, totalFta),
    fg2Pct: pct(totalFg2m, totalFg2a),
    fg3Pct: pct(totalFg3m, totalFg3a),
    oppAvgPts: avg(totalOppPts, gp),
    recentGames,
  };
}

export default function TeamStatsPage() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState("全部比賽");
  const [error, setError] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError("");

    const { data: gamesData, error: gamesError } = await supabase
      .from("games")
      .select("id, teamA, teamB, status, game_date, created_at")
      .order("game_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (gamesError) {
      console.error("load games error:", gamesError);
      setError("載入比賽資料失敗");
      setLoading(false);
      return;
    }

    const safeGames = (gamesData ?? []) as GameRow[];
    const gameIds = safeGames.map((g) => g.id);

    if (gameIds.length === 0) {
      setGames([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    const { data: eventsData, error: eventsError } = await supabase
      .from("events")
      .select(
        "id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone"
      )
      .in("game_id", gameIds)
      .order("created_at", { ascending: true });

    if (eventsError) {
      console.error("load events error:", eventsError);
      setError("載入事件資料失敗");
      setGames(safeGames);
      setEvents([]);
      setLoading(false);
      return;
    }

    setGames(safeGames);
    setEvents((eventsData ?? []) as EventRow[]);
    setLoading(false);
  }

  const filteredGames = useMemo(() => {
    if (selectedRange === "最近5場") return games.slice(0, 5);
    if (selectedRange === "最近10場") return games.slice(0, 10);
    return games;
  }, [games, selectedRange]);

  const summary = useMemo(() => {
    return buildTeamSummary(filteredGames, events);
  }, [filteredGames, events]);

  const overviewStats: OverviewStat[] = useMemo(
    () => [
      { label: "團隊場均得分", value: summary.avgPts, sub: "PPG", highlight: true },
      { label: "團隊場均籃板", value: summary.avgReb, sub: "RPG" },
      { label: "團隊場均助攻", value: summary.avgAst, sub: "APG" },
      { label: "團隊場均失誤", value: summary.avgTov, sub: "TOV" },
      { label: "罰球命中率", value: summary.ftPct, sub: "FT%" },
      { label: "2分命中率", value: summary.fg2Pct, sub: "2PT%" },
      { label: "3分命中率", value: summary.fg3Pct, sub: "3PT%" },
      { label: "團隊場均失分", value: summary.oppAvgPts, sub: "Opp PPG" },
    ],
    [summary]
  );

  const trendData: TrendItem[] = useMemo(() => {
    return [...summary.recentGames]
      .slice(0, 5)
      .reverse()
      .map((g, idx) => ({
        label: `G${idx + 1}`,
        value: g.myScore,
      }));
  }, [summary.recentGames]);

  const maxPts = useMemo(() => {
    if (!summary.recentGames.length) return 0;
    return Math.max(...summary.recentGames.map((g) => g.myScore));
  }, [summary.recentGames]);

  const minOppPts = useMemo(() => {
    if (!summary.recentGames.length) return 0;
    return Math.min(...summary.recentGames.map((g) => g.oppScore));
  }, [summary.recentGames]);

  const avgDiff = useMemo(() => {
    if (!summary.recentGames.length) return "0.0";
    const total = summary.recentGames.reduce(
      (acc, g) => acc + (g.myScore - g.oppScore),
      0
    );
    return (total / summary.recentGames.length).toFixed(1);
  }, [summary.recentGames]);

  return (
    <main
      style={{
        minHeight: "100vh",
        color: "#fff",
        background: `
          radial-gradient(circle at top, rgba(255,152,67,0.16) 0%, rgba(255,152,67,0.06) 18%, rgba(0,0,0,0) 36%),
          radial-gradient(circle at 20% 0%, rgba(255,120,40,0.10) 0%, rgba(0,0,0,0) 28%),
          linear-gradient(180deg, #090909 0%, #050505 100%)
        `,
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1420,
          margin: "0 auto",
          display: "grid",
          gap: 18,
        }}
      >
        <section
          style={{
            position: "relative",
            overflow: "hidden",
            background:
              "linear-gradient(180deg, rgba(20,14,10,0.96) 0%, rgba(10,8,7,0.98) 100%)",
            border: "1px solid rgba(255,170,90,0.14)",
            borderRadius: 30,
            padding: 24,
            boxShadow:
              "0 24px 60px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,200,140,0.06)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -60,
              top: -60,
              width: 240,
              height: 240,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,145,56,0.22) 0%, rgba(255,145,56,0) 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              position: "relative",
              zIndex: 1,
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div
                style={{
                  fontSize: 12,
                  letterSpacing: 1.8,
                  color: "rgba(255,189,125,0.72)",
                  fontWeight: 800,
                }}
              >
                TEAM PERFORMANCE
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(30px, 4vw, 46px)",
                  lineHeight: 1.02,
                  fontWeight: 950,
                  letterSpacing: -1.2,
                  color: "#fff7f0",
                  textShadow: "0 0 24px rgba(255,145,56,0.12)",
                }}
              >
                團隊數據
              </h1>
              <div
                style={{
                  fontSize: 14,
                  color: "rgba(255,232,214,0.64)",
                }}
              >
                檢視整體進攻、防守與命中率表現
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <select
                value={selectedRange}
                onChange={(e) => setSelectedRange(e.target.value)}
                style={{
                  height: 46,
                  borderRadius: 14,
                  padding: "0 15px",
                  background: "rgba(255,255,255,0.04)",
                  color: "#fff3ea",
                  border: "1px solid rgba(255,170,90,0.16)",
                  outline: "none",
                  fontSize: 14,
                  fontWeight: 700,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                }}
              >
                <option style={{ color: "#000" }}>全部比賽</option>
                <option style={{ color: "#000" }}>最近5場</option>
                <option style={{ color: "#000" }}>最近10場</option>
              </select>

              <Link
                href="/staff"
                style={{
                  height: 46,
                  padding: "0 18px",
                  borderRadius: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                  color: "#fff5ef",
                  background:
                    "linear-gradient(180deg, rgba(255,146,54,0.18) 0%, rgba(255,146,54,0.08) 100%)",
                  border: "1px solid rgba(255,170,90,0.18)",
                  fontWeight: 800,
                  boxShadow: "0 10px 24px rgba(255,120,40,0.12)",
                }}
              >
                返回
              </Link>

              <div
                style={{
                  transform: "scale(1.02)",
                  transformOrigin: "center",
                }}
              >
                <LogoutButton />
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <section
            style={{
              background: "rgba(120,20,20,0.22)",
              border: "1px solid rgba(255,120,120,0.28)",
              borderRadius: 20,
              padding: 16,
              color: "#ffd2d2",
              fontWeight: 700,
            }}
          >
            {error}
          </section>
        ) : null}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 14,
          }}
        >
          {overviewStats.map((item, idx) => (
            <div
              key={item.sub}
              style={{
                position: "relative",
                overflow: "hidden",
                background: item.highlight
                  ? "linear-gradient(180deg, rgba(255,150,64,0.22) 0%, rgba(26,15,10,0.98) 100%)"
                  : "linear-gradient(180deg, rgba(18,13,10,0.96) 0%, rgba(10,8,7,0.98) 100%)",
                border: item.highlight
                  ? "1px solid rgba(255,170,90,0.30)"
                  : "1px solid rgba(255,170,90,0.12)",
                borderRadius: 24,
                padding: 18,
                minHeight: 142,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow:
                  item.highlight
                    ? "0 18px 36px rgba(255,120,40,0.15), inset 0 1px 0 rgba(255,230,200,0.06)"
                    : "0 14px 30px rgba(0,0,0,0.28)",
              }}
            >
              {idx === 0 ? (
                <div
                  style={{
                    position: "absolute",
                    top: -24,
                    right: -24,
                    width: 88,
                    height: 88,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle, rgba(255,160,70,0.20) 0%, rgba(255,160,70,0) 72%)",
                  }}
                />
              ) : null}

              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,224,198,0.70)",
                  fontWeight: 700,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {item.label}
              </div>

              <div
                style={{
                  fontSize: "clamp(29px, 4vw, 40px)",
                  fontWeight: 950,
                  letterSpacing: -1.1,
                  lineHeight: 1,
                  color: item.highlight ? "#ffd6b2" : "#fff8f2",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {loading ? "..." : item.value}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color:
                    item.sub === "Opp PPG"
                      ? "rgba(255,170,170,0.96)"
                      : "rgba(255,190,135,0.62)",
                  fontWeight: 800,
                  letterSpacing: 1.1,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {item.sub}
              </div>
            </div>
          ))}
        </section>

        <section
          className="team-mid-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.06fr 0.94fr",
            gap: 18,
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(180deg, rgba(17,12,10,0.96) 0%, rgba(9,8,7,0.98) 100%)",
              border: "1px solid rgba(255,170,90,0.12)",
              borderRadius: 28,
              padding: 20,
              boxShadow:
                "0 20px 42px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,220,180,0.04)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,186,127,0.58)",
                letterSpacing: 1.2,
                marginBottom: 4,
                fontWeight: 800,
              }}
            >
              RECENT GAMES
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: -0.5,
                marginBottom: 16,
                color: "#fff7f0",
              }}
            >
              最近比賽
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {summary.recentGames.slice(0, 5).map((game) => (
                <div
                  key={game.id}
                  className="recent-row"
                  style={{
                    borderRadius: 18,
                    padding: 14,
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
                    border: "1px solid rgba(255,170,90,0.10)",
                    display: "grid",
                    gridTemplateColumns: "84px 1fr 90px 70px",
                    alignItems: "center",
                    gap: 10,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: "rgba(255,218,190,0.54)",
                      fontWeight: 700,
                    }}
                  >
                    {game.date}
                  </div>

                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#fff8f3",
                    }}
                  >
                    vs {game.opponent}
                  </div>

                  <div
                    style={{
                      textAlign: "center",
                      fontWeight: 900,
                      color: "#ffe7d3",
                    }}
                  >
                    {game.score}
                  </div>

                  <div
                    style={{
                      justifySelf: "end",
                      minWidth: 54,
                      height: 34,
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 900,
                      background:
                        game.result === "W"
                          ? "rgba(60, 210, 125, 0.16)"
                          : "rgba(255, 102, 102, 0.14)",
                      color:
                        game.result === "W"
                          ? "rgba(138,255,186,0.96)"
                          : "rgba(255,162,162,0.96)",
                      border:
                        game.result === "W"
                          ? "1px solid rgba(90,255,154,0.18)"
                          : "1px solid rgba(255,120,120,0.18)",
                    }}
                  >
                    {game.result}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              position: "relative",
              overflow: "hidden",
              background:
                "linear-gradient(180deg, rgba(17,12,10,0.96) 0%, rgba(9,8,7,0.98) 100%)",
              border: "1px solid rgba(255,170,90,0.12)",
              borderRadius: 28,
              padding: 20,
              boxShadow:
                "0 20px 42px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,220,180,0.04)",
              display: "grid",
              gap: 18,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: -30,
                bottom: -40,
                width: 180,
                height: 180,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(255,145,56,0.12) 0%, rgba(255,145,56,0) 72%)",
                pointerEvents: "none",
              }}
            />

            <div style={{ position: "relative", zIndex: 1 }}>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,186,127,0.58)",
                  letterSpacing: 1.2,
                  marginBottom: 4,
                  fontWeight: 800,
                }}
              >
                TREND
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: -0.5,
                  color: "#fff7f0",
                }}
              >
                團隊得分趨勢
              </div>
            </div>

            <div
              style={{
                position: "relative",
                zIndex: 1,
                height: 220,
                borderRadius: 22,
                padding: "18px 16px 14px",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)",
                border: "1px solid rgba(255,170,90,0.10)",
                display: "flex",
                alignItems: "end",
                gap: 14,
              }}
            >
              {trendData.map((item) => {
                const height = maxPts
                  ? Math.max(26, (item.value / maxPts) * 150)
                  : 26;

                return (
                  <div
                    key={item.label}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "end",
                      gap: 8,
                      height: "100%",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,232,214,0.82)",
                        fontWeight: 800,
                      }}
                    >
                      {item.value}
                    </div>

                    <div
                      style={{
                        width: "100%",
                        maxWidth: 58,
                        height,
                        minHeight: 26,
                        borderRadius: "16px 16px 8px 8px",
                        background:
                          "linear-gradient(180deg, rgba(255,182,92,0.98) 0%, rgba(255,126,38,0.92) 60%, rgba(191,79,18,0.92) 100%)",
                        boxShadow:
                          "0 12px 22px rgba(255,120,40,0.22), inset 0 1px 0 rgba(255,236,212,0.28)",
                      }}
                    />

                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,202,160,0.48)",
                        fontWeight: 800,
                      }}
                    >
                      {item.label}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              <MiniInfoCard title="最高得分" value={String(maxPts)} sub="MAX PTS" />
              <MiniInfoCard title="最低失分" value={String(minOppPts)} sub="BEST DEF" />
              <MiniInfoCard title="平均分差" value={avgDiff} sub="AVG DIFF" />
            </div>
          </div>
        </section>

        <section
          className="team-bottom-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr 0.9fr",
            gap: 18,
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(180deg, rgba(17,12,10,0.96) 0%, rgba(9,8,7,0.98) 100%)",
              border: "1px solid rgba(255,170,90,0.12)",
              borderRadius: 28,
              padding: 22,
              boxShadow:
                "0 20px 42px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,220,180,0.04)",
              display: "grid",
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,186,127,0.58)",
                  letterSpacing: 1.2,
                  marginBottom: 4,
                  fontWeight: 800,
                }}
              >
                TEAM IDENTITY
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: -0.5,
                  color: "#fff7f0",
                }}
              >
                團隊表現重點
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <InsightRow
                label="進攻輸出"
                value={`${summary.avgPts} PPG`}
                hint="整體得分能力"
              />
              <InsightRow
                label="防守表現"
                value={`${summary.oppAvgPts} Opp PPG`}
                hint="對手平均得分"
              />
              <InsightRow
                label="團隊連結"
                value={`${summary.avgAst} APG`}
                hint="助攻帶動進攻"
              />
              <InsightRow
                label="失誤控制"
                value={`${summary.avgTov} TOV`}
                hint="球權穩定度"
              />
            </div>
          </div>

          <div
            style={{
              background:
                "linear-gradient(180deg, rgba(17,12,10,0.96) 0%, rgba(9,8,7,0.98) 100%)",
              border: "1px solid rgba(255,170,90,0.12)",
              borderRadius: 28,
              padding: 22,
              boxShadow:
                "0 20px 42px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,220,180,0.04)",
              display: "grid",
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,186,127,0.58)",
                  letterSpacing: 1.2,
                  marginBottom: 4,
                  fontWeight: 800,
                }}
              >
                SHOOTING PROFILE
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: -0.5,
                  color: "#fff7f0",
                }}
              >
                命中率概況
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <RateCard
                title="2分命中率"
                value={summary.fg2Pct}
                sub={`${summary.totalFg2m}/${summary.totalFg2a}`}
              />
              <RateCard
                title="3分命中率"
                value={summary.fg3Pct}
                sub={`${summary.totalFg3m}/${summary.totalFg3a}`}
              />
              <RateCard
                title="罰球命中率"
                value={summary.ftPct}
                sub={`${summary.totalFtm}/${summary.totalFta}`}
              />
            </div>
          </div>

          <div
            style={{
              background:
                "linear-gradient(180deg, rgba(17,12,10,0.96) 0%, rgba(9,8,7,0.98) 100%)",
              border: "1px solid rgba(255,170,90,0.12)",
              borderRadius: 28,
              padding: 22,
              boxShadow:
                "0 20px 42px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,220,180,0.04)",
              display: "grid",
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,186,127,0.58)",
                  letterSpacing: 1.2,
                  marginBottom: 4,
                  fontWeight: 800,
                }}
              >
                FORM
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: -0.5,
                  color: "#fff7f0",
                }}
              >
                近期狀態
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 12,
              }}
            >
              <MiniHighlight title="出賽" value={String(summary.gp)} />
              <MiniHighlight title="最高得分" value={String(maxPts)} />
              <MiniHighlight title="最低失分" value={String(minOppPts)} />
              <MiniHighlight title="平均分差" value={avgDiff} />
            </div>

            <div
              style={{
                borderRadius: 18,
                padding: 14,
                background: "rgba(255,145,56,0.05)",
                border: "1px solid rgba(255,170,90,0.10)",
                color: "rgba(255,232,214,0.76)",
                fontSize: 14,
                lineHeight: 1.7,
              }}
            >
              {Number(summary.avgPts) >= Number(summary.oppAvgPts)
                ? "目前整體進攻輸出略高於失分，團隊表現偏正向。"
                : "目前整體失分略高於得分，建議優先改善防守與失誤控制。"}
            </div>
          </div>

          <div
            style={{
              gridColumn: "1 / -1",
              background:
                "linear-gradient(180deg, rgba(16,11,9,0.92) 0%, rgba(9,8,7,0.98) 100%)",
              border: "1px solid rgba(255,170,90,0.10)",
              borderRadius: 24,
              padding: 16,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              boxShadow:
                "0 18px 36px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,220,180,0.03)",
            }}
          >
            <StatChip label="GP" value={String(summary.gp)} />
            <StatChip label="PPG" value={summary.avgPts} />
            <StatChip label="RPG" value={summary.avgReb} />
            <StatChip label="APG" value={summary.avgAst} />
            <StatChip label="TOV" value={summary.avgTov} />
            <StatChip label="2PT%" value={summary.fg2Pct} />
            <StatChip label="3PT%" value={summary.fg3Pct} />
            <StatChip label="FT%" value={summary.ftPct} />
            <StatChip label="Opp PPG" value={summary.oppAvgPts} />
          </div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 1100px) {
          .team-bottom-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 980px) {
          .team-mid-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 720px) {
          .recent-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

function MiniInfoCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 14,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
        border: "1px solid rgba(255,170,90,0.10)",
        display: "grid",
        gap: 6,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,206,163,0.56)",
          fontWeight: 800,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 950,
          letterSpacing: -0.9,
          lineHeight: 1,
          color: "#fff3e8",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,186,127,0.44)",
          fontWeight: 800,
          letterSpacing: 0.9,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function InsightRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
        padding: 14,
        borderRadius: 18,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
        border: "1px solid rgba(255,170,90,0.10)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,210,170,0.56)",
            fontWeight: 800,
            marginBottom: 3,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,236,220,0.54)",
            fontWeight: 600,
          }}
        >
          {hint}
        </div>
      </div>

      <div
        style={{
          fontSize: 20,
          fontWeight: 950,
          color: "#ffe0c6",
          letterSpacing: -0.5,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RateCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        padding: 16,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
        border: "1px solid rgba(255,170,90,0.10)",
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "rgba(255,206,163,0.56)",
          fontWeight: 800,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 950,
          letterSpacing: -1,
          lineHeight: 1,
          color: "#fff3e8",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "rgba(255,186,127,0.46)",
          fontWeight: 800,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function MiniHighlight({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 14,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
        border: "1px solid rgba(255,170,90,0.10)",
        display: "grid",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,206,163,0.56)",
          fontWeight: 800,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 950,
          letterSpacing: -0.7,
          lineHeight: 1,
          color: "#fff3e8",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        height: 40,
        padding: "0 14px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(255,145,56,0.05)",
        border: "1px solid rgba(255,170,90,0.10)",
        color: "#ffe8d5",
        fontWeight: 800,
        fontSize: 13,
      }}
    >
      <span style={{ color: "rgba(255,195,145,0.70)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}