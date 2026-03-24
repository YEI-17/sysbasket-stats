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
  quarters?: number | null;
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

type TeamGameStatsRow = {
  game_id: string;
  team_side: "teamA" | "teamB";
  pts: number | null;
  opp_pts: number | null;
  fg2m: number | null;
  fg2a: number | null;
  fg3m: number | null;
  fg3a: number | null;
  ftm: number | null;
  fta: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  pf: number | null;
  result?: string | null;
  updated_at?: string | null;
};

type TeamGameSummaryRow = {
  game_id: string;
  team_side: "teamA" | "teamB";
  pts: number;
  opp_pts: number;
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  result: "W" | "L" | "D";
  updated_at?: string | null;
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
  result: "W" | "L" | "D";
  score: string;
  myScore: number;
  oppScore: number;
};

type TrendItem = {
  label: string;
  value: number;
};

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

function sortGamesDesc(list: GameRow[]) {
  return [...list].sort((a, b) => {
    const ta = new Date(a.game_date || a.created_at || 0).getTime();
    const tb = new Date(b.game_date || b.created_at || 0).getTime();
    return tb - ta;
  });
}

function isOfficialFinishedGame(game: GameRow) {
  return normalizeStatus(game.status) === "已結束" && (game.quarters ?? 4) >= 4;
}

function buildFallbackTeamStatsFromEvents(
  gameId: string,
  events: EventRow[],
  mySide: "teamA" | "teamB" = "teamA"
): TeamGameSummaryRow {
  let pts = 0;
  let oppPts = 0;
  let fg2m = 0;
  let fg2a = 0;
  let fg3m = 0;
  let fg3a = 0;
  let ftm = 0;
  let fta = 0;
  let reb = 0;
  let ast = 0;
  let stl = 0;
  let blk = 0;
  let tov = 0;
  let pf = 0;

  const validEvents = events
    .filter((e) => e.game_id === gameId && !e.is_undone)
    .sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return ta - tb;
    });

  for (const e of validEvents) {
    const side = normalizeTeamSide(e.team_side);
    if (!side) continue;

    const isMine = side === mySide;
    const isOpp = side !== mySide;

    switch (e.event_type) {
      case "fg2_made":
        if (isMine) {
          pts += 2;
          fg2m += 1;
          fg2a += 1;
        }
        if (isOpp) oppPts += 2;
        break;
      case "fg2_miss":
        if (isMine) fg2a += 1;
        break;
      case "fg3_made":
        if (isMine) {
          pts += 3;
          fg3m += 1;
          fg3a += 1;
        }
        if (isOpp) oppPts += 3;
        break;
      case "fg3_miss":
        if (isMine) fg3a += 1;
        break;
      case "ft_made":
        if (isMine) {
          pts += 1;
          ftm += 1;
          fta += 1;
        }
        if (isOpp) oppPts += 1;
        break;
      case "ft_miss":
        if (isMine) fta += 1;
        break;
      case "reb":
        if (isMine) reb += 1;
        break;
      case "ast":
        if (isMine) ast += 1;
        break;
      case "stl":
        if (isMine) stl += 1;
        break;
      case "blk":
        if (isMine) blk += 1;
        break;
      case "tov":
        if (isMine) tov += 1;
        break;
      case "pf":
        if (isMine) pf += 1;
        break;
      default:
        break;
    }
  }

  return {
    game_id: gameId,
    team_side: mySide,
    pts,
    opp_pts: oppPts,
    fg2m,
    fg2a,
    fg3m,
    fg3a,
    ftm,
    fta,
    reb,
    ast,
    stl,
    blk,
    tov,
    pf,
    result: pts > oppPts ? "W" : pts < oppPts ? "L" : "D",
  };
}

function buildTeamSummaryFromGameStats(
  games: GameRow[],
  gameStatsMap: Map<string, TeamGameSummaryRow>
) {
  const gamesSorted = sortGamesDesc(games);

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
  let countedGp = 0;

  for (const game of gamesSorted) {
    const stat = gameStatsMap.get(game.id);
    if (!stat) continue;

    countedGp += 1;

    totalPts += stat.pts;
    totalReb += stat.reb;
    totalAst += stat.ast;
    totalTov += stat.tov;
    totalFg2m += stat.fg2m;
    totalFg2a += stat.fg2a;
    totalFg3m += stat.fg3m;
    totalFg3a += stat.fg3a;
    totalFtm += stat.ftm;
    totalFta += stat.fta;
    totalOppPts += stat.opp_pts;

    recentGames.push({
      id: game.id,
      date: formatDate(game.game_date, game.created_at),
      opponent: game.teamB || "對手",
      result: stat.pts > stat.opp_pts ? "W" : stat.pts < stat.opp_pts ? "L" : "D",
      score: `${stat.pts} - ${stat.opp_pts}`,
      myScore: stat.pts,
      oppScore: stat.opp_pts,
    });
  }

  return {
    gp: countedGp,
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
    avgPts: avg(totalPts, countedGp),
    avgReb: avg(totalReb, countedGp),
    avgAst: avg(totalAst, countedGp),
    avgTov: avg(totalTov, countedGp),
    ftPct: pct(totalFtm, totalFta),
    fg2Pct: pct(totalFg2m, totalFg2a),
    fg3Pct: pct(totalFg3m, totalFg3a),
    oppAvgPts: avg(totalOppPts, countedGp),
    recentGames,
  };
}

function isValidTeamStatsRow(row: TeamGameSummaryRow) {
  return (
    row.pts > 0 ||
    row.opp_pts > 0 ||
    row.fg2a > 0 ||
    row.fg3a > 0 ||
    row.fta > 0 ||
    row.reb > 0 ||
    row.ast > 0 ||
    row.stl > 0 ||
    row.blk > 0 ||
    row.tov > 0 ||
    row.pf > 0
  );
}

export default function TeamStatsPage() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [teamGameStats, setTeamGameStats] = useState<TeamGameSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState("全部比賽");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError("");

    const { data: gamesData, error: gamesError } = await supabase
      .from("games")
      .select("id, teamA, teamB, status, game_date, created_at, quarters")
      .order("game_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (gamesError) {
      console.error("load games error:", gamesError);
      setError("載入比賽資料失敗");
      setLoading(false);
      return;
    }

    const safeGames = sortGamesDesc(((gamesData ?? []) as GameRow[]).filter(isOfficialFinishedGame));
    const gameIds = safeGames.map((g) => g.id);

    if (gameIds.length === 0) {
      setGames([]);
      setTeamGameStats([]);
      setLoading(false);
      return;
    }

    const { data: teamStatsData, error: teamStatsError } = await supabase
      .from("team_game_stats")
      .select(
        "game_id, team_side, pts, opp_pts, fg2m, fg2a, fg3m, fg3a, ftm, fta, reb, ast, stl, blk, tov, pf, result, updated_at"
      )
      .eq("team_side", "teamA")
      .in("game_id", gameIds);

    if (teamStatsError) {
      console.error("load team_game_stats error:", teamStatsError);
      setError("載入團隊統計資料失敗");
      setLoading(false);
      return;
    }

    const safeTeamStats = ((teamStatsData ?? []) as TeamGameStatsRow[]).map(
      (row): TeamGameSummaryRow => ({
        game_id: row.game_id,
        team_side: "teamA",
        pts: row.pts ?? 0,
        opp_pts: row.opp_pts ?? 0,
        fg2m: row.fg2m ?? 0,
        fg2a: row.fg2a ?? 0,
        fg3m: row.fg3m ?? 0,
        fg3a: row.fg3a ?? 0,
        ftm: row.ftm ?? 0,
        fta: row.fta ?? 0,
        reb: row.reb ?? 0,
        ast: row.ast ?? 0,
        stl: row.stl ?? 0,
        blk: row.blk ?? 0,
        tov: row.tov ?? 0,
        pf: row.pf ?? 0,
        result:
          row.result === "W" ? "W" : row.result === "L" ? "L" : row.pts === row.opp_pts ? "D" : "L",
        updated_at: row.updated_at ?? null,
      })
    );

    const statsMap = new Map<string, TeamGameSummaryRow>();

    for (const row of safeTeamStats) {
      const prev = statsMap.get(row.game_id);

      if (!prev) {
        statsMap.set(row.game_id, row);
        continue;
      }

      const prevValid = isValidTeamStatsRow(prev);
      const currValid = isValidTeamStatsRow(row);

      if (!prevValid && currValid) {
        statsMap.set(row.game_id, row);
        continue;
      }

      if (prevValid === currValid) {
        const prevTs = new Date(prev.updated_at || 0).getTime();
        const currTs = new Date(row.updated_at || 0).getTime();
        if (currTs > prevTs) {
          statsMap.set(row.game_id, row);
        }
      }
    }

    const missingOrInvalidGameIds = gameIds.filter((id) => {
      const row = statsMap.get(id);
      return !row || !isValidTeamStatsRow(row);
    });

    let fallbackStats: TeamGameSummaryRow[] = [];

    if (missingOrInvalidGameIds.length > 0) {
      const { data: fallbackEventsData, error: fallbackEventsError } = await supabase
        .from("events")
        .select("id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone")
        .in("game_id", missingOrInvalidGameIds)
        .order("created_at", { ascending: true });

      if (fallbackEventsError) {
        console.error("load fallback events error:", fallbackEventsError);
        setError("載入舊比賽事件資料失敗");
        setLoading(false);
        return;
      }

      const safeEvents = (fallbackEventsData ?? []) as EventRow[];

      fallbackStats = missingOrInvalidGameIds.map((gameId) =>
        buildFallbackTeamStatsFromEvents(gameId, safeEvents, "teamA")
      );
    }

    for (const row of fallbackStats) {
      statsMap.set(row.game_id, row);
    }

    const mergedStats = Array.from(statsMap.values());

    setGames(safeGames);
    setTeamGameStats(mergedStats);
    setLoading(false);
  }

  const sortedGames = useMemo(() => sortGamesDesc(games), [games]);

  const filteredGames = useMemo(() => {
    if (selectedRange === "最近5場") return sortedGames.slice(0, 5);
    if (selectedRange === "最近10場") return sortedGames.slice(0, 10);
    return sortedGames;
  }, [sortedGames, selectedRange]);

  const filteredGameStatsMap = useMemo(() => {
    const allowedIds = new Set(filteredGames.map((g) => g.id));
    const map = new Map<string, TeamGameSummaryRow>();

    for (const row of teamGameStats) {
      if (allowedIds.has(row.game_id)) {
        map.set(row.game_id, row);
      }
    }

    return map;
  }, [filteredGames, teamGameStats]);

  const summary = useMemo(() => {
    return buildTeamSummaryFromGameStats(filteredGames, filteredGameStatsMap);
  }, [filteredGames, filteredGameStatsMap]);

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

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-3xl font-black tracking-tight">團隊數據</div>
            <div className="mt-1 text-white/60">只統計正式賽（4節以上）</div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/viewer"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              返回首頁
            </Link>
            <LogoutButton />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {["全部比賽", "最近5場", "最近10場"].map((label) => (
            <button
              key={label}
              onClick={() => setSelectedRange(label)}
              className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
                selectedRange === label
                  ? "bg-orange-500 text-white"
                  : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-lg font-bold">
            讀取中...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-center text-lg font-bold text-red-200">
            {error}
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {overviewStats.map((item) => (
                <div
                  key={item.label}
                  className={`rounded-3xl border p-5 ${
                    item.highlight
                      ? "border-orange-500/30 bg-orange-500/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="text-sm font-semibold text-white/60">{item.label}</div>
                  <div className="mt-3 text-4xl font-black">{item.value}</div>
                  <div className="mt-1 text-sm font-semibold text-white/45">{item.sub}</div>
                </div>
              ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="mb-4 text-xl font-black">最近得分趨勢</div>

                {trendData.length === 0 ? (
                  <div className="py-8 text-center text-white/50">目前沒有資料</div>
                ) : (
                  <div className="flex h-72 items-end gap-3">
                    {trendData.map((item) => {
                      const barHeight =
                        maxPts > 0 ? Math.max(18, (item.value / maxPts) * 220) : 18;

                      return (
                        <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
                          <div className="text-sm font-bold text-white/70">{item.value}</div>
                          <div
                            className="w-full rounded-t-2xl bg-orange-500 transition-all"
                            style={{ height: `${barHeight}px` }}
                          />
                          <div className="text-xs font-bold text-white/45">{item.label}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="mb-4 text-xl font-black">整體概況</div>

                <div className="grid gap-3">
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white/55">統計場次</div>
                    <div className="mt-2 text-3xl font-black">{summary.gp}</div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white/55">總得分</div>
                    <div className="mt-2 text-3xl font-black">{summary.totalPts}</div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white/55">總失分</div>
                    <div className="mt-2 text-3xl font-black">{summary.totalOppPts}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="mb-4 text-xl font-black">近期比賽</div>

              {summary.recentGames.length === 0 ? (
                <div className="py-8 text-center text-white/50">目前沒有比賽資料</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-left text-sm text-white/45">
                        <th className="px-3 py-2">日期</th>
                        <th className="px-3 py-2">對手</th>
                        <th className="px-3 py-2">結果</th>
                        <th className="px-3 py-2">比分</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recentGames.map((game) => (
                        <tr key={game.id} className="rounded-2xl bg-white/5">
                          <td className="px-3 py-3 text-sm font-semibold">{game.date}</td>
                          <td className="px-3 py-3 font-bold">{game.opponent}</td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black ${
                                game.result === "W"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : game.result === "L"
                                  ? "bg-red-500/20 text-red-300"
                                  : "bg-white/10 text-white/70"
                              }`}
                            >
                              {game.result}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-lg font-black">{game.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}