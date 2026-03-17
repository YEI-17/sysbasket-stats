"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  groupPlayerStats,
  pct,
  type EventRow,
  type Stat,
} from "@/lib/stats";

type Player = {
  id: string;
  name: string;
  number: number | null;
  active?: boolean;
};

type EventDbRow = {
  game_id: string;
  player_id: string | null;
  event_type: EventRow["event_type"];
  team_side?: "A" | "B" | null;
  is_undone?: boolean | null;
};

type EventWithGame = {
  game_id: string;
  player_id: string | null;
  event_type: EventRow["event_type"];
  team_side?: "A" | "B" | null;
  is_undone?: boolean;
};

type PlayerGameStatRow = {
  game_id: string;
  player_id: string;
  minutes: number | null;
};

type PlayerRow = Player & {
  stat: Stat;
  gamesPlayed: number;
  avgMin: string;
  eff: number;
  avgPts: string;
  avgReb: string;
  avgAst: string;
  avgStl: string;
  avgBlk: string;
  avgTov: string;
  avgPf: string;
  avgEff: string;
};

function eff(stat: Stat) {
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

function avg(value: number, gamesPlayed: number) {
  if (!gamesPlayed) return "0.0";
  return (value / gamesPlayed).toFixed(1);
}

function safeStat(): Stat {
  return {
    pts: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
  };
}

export default function BoxDashboardPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventWithGame[]>([]);
  const [playerGameStats, setPlayerGameStats] = useState<PlayerGameStatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMsg("");

    const [playersRes, eventsRes, playerGameStatsRes] = await Promise.all([
      supabase
        .from("players")
        .select("id, name, number, active")
        .eq("active", true)
        .order("number", { ascending: true }),

      supabase
        .from("events")
        .select("game_id, player_id, event_type, team_side, is_undone")
        .order("created_at", { ascending: true }),

      supabase
        .from("player_game_stats")
        .select("game_id, player_id, minutes"),
    ]);

    if (playersRes.error) {
      setMsg(`讀取球員失敗：${playersRes.error.message}`);
      setLoading(false);
      return;
    }

    if (eventsRes.error) {
      setMsg(`讀取事件失敗：${eventsRes.error.message}`);
      setLoading(false);
      return;
    }

    if (playerGameStatsRes.error) {
      setMsg(`讀取球員單場數據失敗：${playerGameStatsRes.error.message}`);
      setLoading(false);
      return;
    }

    const playerRows = (playersRes.data || []) as Player[];
    const eventRows = ((eventsRes.data || []) as EventDbRow[]).map(
      (event): EventWithGame => ({
        game_id: event.game_id,
        player_id: event.player_id,
        event_type: event.event_type,
        team_side: event.team_side ?? null,
        is_undone: !!event.is_undone,
      })
    );

    setPlayers(playerRows);
    setEvents(eventRows);
    setPlayerGameStats((playerGameStatsRes.data || []) as PlayerGameStatRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();

    const channel = supabase
      .channel("box-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_game_stats" },
        () => void loadAll()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAll]);

  const validEvents = useMemo(
    () => events.filter((event) => !event.is_undone),
    [events]
  );

  const activePlayerIdSet = useMemo(() => {
    return new Set(players.map((player) => player.id));
  }, [players]);

  const teamPlayerEvents = useMemo(() => {
    return validEvents.filter(
      (event) => !!event.player_id && activePlayerIdSet.has(event.player_id)
    );
  }, [validEvents, activePlayerIdSet]);

  const playerStatMap = useMemo(() => {
    return groupPlayerStats(teamPlayerEvents);
  }, [teamPlayerEvents]);

  const teamStatByGame = useMemo(() => {
    const map: Record<string, Stat> = {};

    for (const event of teamPlayerEvents) {
      if (!map[event.game_id]) {
        map[event.game_id] = safeStat();
      }

      const current = map[event.game_id];

      switch (event.event_type) {
        case "fg2_made":
          current.pts += 2;
          current.fg2m += 1;
          current.fg2a += 1;
          break;
        case "fg2_miss":
          current.fg2a += 1;
          break;
        case "fg3_made":
          current.pts += 3;
          current.fg3m += 1;
          current.fg3a += 1;
          break;
        case "fg3_miss":
          current.fg3a += 1;
          break;
        case "ft_made":
          current.pts += 1;
          current.ftm += 1;
          current.fta += 1;
          break;
        case "ft_miss":
          current.fta += 1;
          break;
        case "reb":
          current.reb += 1;
          break;
        case "ast":
          current.ast += 1;
          break;
        case "stl":
          current.stl += 1;
          break;
        case "blk":
          current.blk += 1;
          break;
        case "tov":
          current.tov += 1;
          break;
        case "pf":
          current.pf += 1;
          break;
        default:
          break;
      }
    }

    return map;
  }, [teamPlayerEvents]);

  const teamGamesCount = useMemo(() => {
    return Object.keys(teamStatByGame).length;
  }, [teamStatByGame]);

  const teamTotals = useMemo(() => {
    const total = safeStat();

    for (const stat of Object.values(teamStatByGame)) {
      total.pts += stat.pts;
      total.fg2m += stat.fg2m;
      total.fg2a += stat.fg2a;
      total.fg3m += stat.fg3m;
      total.fg3a += stat.fg3a;
      total.ftm += stat.ftm;
      total.fta += stat.fta;
      total.reb += stat.reb;
      total.ast += stat.ast;
      total.stl += stat.stl;
      total.blk += stat.blk;
      total.tov += stat.tov;
      total.pf += stat.pf;
    }

    return total;
  }, [teamStatByGame]);

  const avgTeamPts = useMemo(
    () => avg(teamTotals.pts, teamGamesCount),
    [teamTotals.pts, teamGamesCount]
  );

  const avgTeamReb = useMemo(
    () => avg(teamTotals.reb, teamGamesCount),
    [teamTotals.reb, teamGamesCount]
  );

  const avgTeamAst = useMemo(
    () => avg(teamTotals.ast, teamGamesCount),
    [teamTotals.ast, teamGamesCount]
  );

  const playerGameCountMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};

    for (const event of teamPlayerEvents) {
      if (!event.player_id) continue;

      if (!map[event.player_id]) {
        map[event.player_id] = new Set<string>();
      }

      map[event.player_id].add(event.game_id);
    }

    const result: Record<string, number> = {};
    for (const playerId of Object.keys(map)) {
      result[playerId] = map[playerId].size;
    }

    return result;
  }, [teamPlayerEvents]);

  const playerAvgMinutesMap = useMemo(() => {
    const totalMinutesMap: Record<string, number> = {};
    const gamesMap: Record<string, Set<string>> = {};

    for (const row of playerGameStats) {
      if (!activePlayerIdSet.has(row.player_id)) continue;

      if (!totalMinutesMap[row.player_id]) {
        totalMinutesMap[row.player_id] = 0;
      }
      totalMinutesMap[row.player_id] += Number(row.minutes || 0);

      if (!gamesMap[row.player_id]) {
        gamesMap[row.player_id] = new Set<string>();
      }
      gamesMap[row.player_id].add(row.game_id);
    }

    const result: Record<string, string> = {};

    for (const player of players) {
      const totalMinutes = totalMinutesMap[player.id] || 0;
      const gamesPlayed = gamesMap[player.id]?.size || 0;
      result[player.id] =
        gamesPlayed > 0 ? (totalMinutes / gamesPlayed).toFixed(1) : "0.0";
    }

    return result;
  }, [playerGameStats, players, activePlayerIdSet]);

  const playerRows = useMemo<PlayerRow[]>(() => {
    return players.map((player) => {
      const stat = playerStatMap[player.id] || safeStat();
      const gamesPlayed = playerGameCountMap[player.id] || 0;
      const playerEff = eff(stat);

      return {
        ...player,
        stat,
        gamesPlayed,
        avgMin: playerAvgMinutesMap[player.id] || "0.0",
        eff: playerEff,
        avgPts: avg(stat.pts, gamesPlayed),
        avgReb: avg(stat.reb, gamesPlayed),
        avgAst: avg(stat.ast, gamesPlayed),
        avgStl: avg(stat.stl, gamesPlayed),
        avgBlk: avg(stat.blk, gamesPlayed),
        avgTov: avg(stat.tov, gamesPlayed),
        avgPf: avg(stat.pf, gamesPlayed),
        avgEff: avg(playerEff, gamesPlayed),
      };
    });
  }, [players, playerStatMap, playerGameCountMap, playerAvgMinutesMap]);

  const sortedPlayerRows = useMemo(() => {
    return [...playerRows].sort((a, b) => {
      const bAvgPts = Number(b.avgPts);
      const aAvgPts = Number(a.avgPts);

      if (bAvgPts !== aAvgPts) return bAvgPts - aAvgPts;
      if (b.eff !== a.eff) return b.eff - a.eff;
      return (a.number ?? 999) - (b.number ?? 999);
    });
  }, [playerRows]);

  const topThree = useMemo(() => sortedPlayerRows.slice(0, 3), [sortedPlayerRows]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(255,140,0,0.18),transparent_30%),radial-gradient(circle_at_0%_100%,rgba(255,98,0,0.12),transparent_30%),radial-gradient(circle_at_100%_100%,rgba(96,165,250,0.08),transparent_28%),linear-gradient(180deg,#0b0b0d_0%,#101014_55%,#060606_100%)] px-4 py-6 text-white md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_20%),radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.28)_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18]">
        <div className="absolute left-1/2 top-[8%] h-[72vw] max-h-[980px] w-[72vw] max-w-[980px] -translate-x-1/2 rounded-full border-2 border-white/10" />
        <div className="absolute bottom-0 left-1/2 top-0 -translate-x-1/2 border-l-2 border-white/10" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:28px_28px] opacity-20 [mask-image:radial-gradient(circle_at_center,black_30%,transparent_85%)]" />
      <div className="pointer-events-none absolute left-[-60px] top-[120px] h-[320px] w-[320px] rounded-full bg-orange-500/20 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-[60px] right-[-60px] h-[320px] w-[320px] rounded-full bg-blue-400/15 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <section className="relative mb-6 overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,140,0,0.08)] backdrop-blur md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,140,0,0.12),transparent_28%,transparent_70%,rgba(255,140,0,0.08)),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_18%)]" />
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-black tracking-[0.14em] text-orange-100">
                TEAM ANALYTICS
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
                數據中心
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 md:text-[15px]">
                查看團隊整體表現、命中率與球員場均數據，快速掌握目前最有影響力的球員與比賽輸出。
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <HeroChip label="ACTIVE PLAYERS" value={players.length} />
                <HeroChip label="GAMES" value={teamGamesCount} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void loadAll()}
                className="rounded-2xl bg-[linear-gradient(135deg,#ffb347_0%,#f48c06_55%,#d96a00_100%)] px-5 py-3 text-sm font-black tracking-[0.14em] text-white shadow-[0_18px_34px_rgba(244,140,6,0.28),inset_0_1px_0_rgba(255,255,255,0.24)] transition hover:-translate-y-0.5"
              >
                REFRESH
              </button>
            </div>
          </div>
        </section>

        {msg ? (
          <div className="mb-6 rounded-3xl border border-red-400/25 bg-red-900/20 px-4 py-3 text-red-200 backdrop-blur">
            {msg}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-black/40 p-6 text-zinc-300 backdrop-blur">
            載入中...
          </div>
        ) : (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-3">
              <StatCard label="平均得分" value={avgTeamPts} accent="orange" />
              <StatCard label="平均籃板" value={avgTeamReb} accent="blue" />
              <StatCard label="平均助攻" value={avgTeamAst} accent="violet" />
            </section>

            <section className="mb-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">團隊命中率</h2>
                  <p className="mt-1 text-sm text-zinc-400">快速查看整體出手效率</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <RateCard
                  label="2分球"
                  made={teamTotals.fg2m}
                  attempt={teamTotals.fg2a}
                  accent="orange"
                />
                <RateCard
                  label="3分球"
                  made={teamTotals.fg3m}
                  attempt={teamTotals.fg3a}
                  accent="blue"
                />
                <RateCard
                  label="罰球"
                  made={teamTotals.ftm}
                  attempt={teamTotals.fta}
                  accent="violet"
                />
              </div>
            </section>

            <section className="mb-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">本季焦點球員</h2>
                  <p className="mt-1 text-sm text-zinc-400">依場均得分與效率排序的前三名</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {topThree.length > 0 ? (
                  topThree.map((row, index) => (
                    <TopPlayerCard
                      key={row.id}
                      rank={index + 1}
                      number={row.number}
                      name={row.name}
                      avgPts={row.avgPts}
                      avgReb={row.avgReb}
                      avgAst={row.avgAst}
                      avgEff={row.avgEff}
                    />
                  ))
                ) : (
                  <div className="col-span-full rounded-[28px] border border-white/10 bg-white/5 p-5 text-zinc-300">
                    尚無可顯示的球員資料
                  </div>
                )}
              </div>
            </section>

            <section className="mb-3 rounded-[24px] border border-cyan-400/15 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100">
              <span className="font-black">AVG EFF 算法：</span>
              (PTS + REB + AST + STL + BLK - TOV - 未進2分 - 未進3分 - 未進罰球) ÷ GP
            </section>

            <section className="mb-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,140,0,0.05)] backdrop-blur">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">球員場均數據列表</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    完整排行、命中率表現與效率值
                  </p>
                </div>

                <div className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black tracking-[0.12em] text-zinc-300 md:inline-flex">
                  SORTED BY AVG PTS
                </div>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-white/10 bg-black/20">
                <table className="min-w-[1480px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-zinc-400">
                      <th className="px-3 py-4 text-left">球員</th>
                      <th className="px-3 py-4 text-center">GP</th>
                      <th className="px-3 py-4 text-center">AVG MIN</th>
                      <th className="px-3 py-4 text-center">AVG PTS</th>
                      <th className="px-3 py-4 text-center">AVG REB</th>
                      <th className="px-3 py-4 text-center">AVG AST</th>
                      <th className="px-3 py-4 text-center">AVG STL</th>
                      <th className="px-3 py-4 text-center">AVG BLK</th>
                      <th className="px-3 py-4 text-center">AVG TOV</th>
                      <th className="px-3 py-4 text-center">AVG PF</th>
                      <th className="px-3 py-4 text-center">2PT%</th>
                      <th className="px-3 py-4 text-center">3PT%</th>
                      <th className="px-3 py-4 text-center">FT%</th>
                      <th className="px-3 py-4 text-center">AVG EFF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayerRows.length > 0 ? (
                      sortedPlayerRows.map((row, index) => (
                        <tr
                          key={row.id}
                          className="border-b border-white/5 transition hover:bg-white/[0.03]"
                        >
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black ring-1 ${
                                  index === 0
                                    ? "bg-orange-500/20 text-orange-100 ring-orange-300/20"
                                    : index === 1
                                    ? "bg-sky-500/20 text-sky-100 ring-sky-300/20"
                                    : index === 2
                                    ? "bg-violet-500/20 text-violet-100 ring-violet-300/20"
                                    : "bg-white/5 text-orange-100 ring-white/10"
                                }`}
                              >
                                {index + 1}
                              </div>

                              <div className="min-w-0">
                                <div className="whitespace-nowrap font-bold text-white">
                                  #{row.number ?? "-"} {row.name}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4 text-center font-semibold">
                            {row.gamesPlayed}
                          </td>
                          <td className="px-3 py-4 text-center">{row.avgMin}</td>
                          <td className="px-3 py-4 text-center font-bold text-orange-300">
                            {row.avgPts}
                          </td>
                          <td className="px-3 py-4 text-center">{row.avgReb}</td>
                          <td className="px-3 py-4 text-center">{row.avgAst}</td>
                          <td className="px-3 py-4 text-center">{row.avgStl}</td>
                          <td className="px-3 py-4 text-center">{row.avgBlk}</td>
                          <td className="px-3 py-4 text-center">{row.avgTov}</td>
                          <td className="px-3 py-4 text-center">{row.avgPf}</td>
                          <td className="px-3 py-4 text-center">
                            {pct(row.stat.fg2m, row.stat.fg2a)}
                          </td>
                          <td className="px-3 py-4 text-center">
                            {pct(row.stat.fg3m, row.stat.fg3a)}
                          </td>
                          <td className="px-3 py-4 text-center">
                            {pct(row.stat.ftm, row.stat.fta)}
                          </td>
                          <td className="px-3 py-4 text-center font-bold text-cyan-300">
                            {row.avgEff}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={14}
                          className="px-4 py-10 text-center text-zinc-400"
                        >
                          目前沒有球員數據
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function HeroChip({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
      <div className="text-[10px] font-black tracking-[0.14em] text-orange-100/60">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = "orange",
}: {
  label: string;
  value: number | string;
  accent?: "orange" | "blue" | "violet";
}) {
  const accentMap: Record<"orange" | "blue" | "violet", string> = {
    orange:
      "from-orange-500/20 to-orange-300/5 text-orange-200 border-orange-400/20",
    blue: "from-blue-500/20 to-blue-300/5 text-blue-200 border-blue-400/20",
    violet:
      "from-violet-500/20 to-violet-300/5 text-violet-200 border-violet-400/20",
  };

  return (
    <div
      className={`rounded-[28px] border bg-gradient-to-br ${accentMap[accent]} p-5 shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur transition hover:-translate-y-1`}
    >
      <div className="text-sm font-medium text-zinc-400">{label}</div>
      <div className="mt-3 text-4xl font-black tracking-tight text-white">
        {value}
      </div>
    </div>
  );
}

function RateCard({
  label,
  made,
  attempt,
  accent,
}: {
  label: string;
  made: number;
  attempt: number;
  accent: "orange" | "blue" | "violet";
}) {
  const accentClasses =
    accent === "orange"
      ? {
          pill: "text-orange-100/80",
          value: "text-orange-200",
          glow: "from-orange-500/20 to-orange-300/5 border-orange-400/15",
        }
      : accent === "blue"
      ? {
          pill: "text-sky-100/80",
          value: "text-sky-200",
          glow: "from-sky-500/20 to-sky-300/5 border-sky-400/15",
        }
      : {
          pill: "text-violet-100/80",
          value: "text-violet-200",
          glow: "from-violet-500/20 to-violet-300/5 border-violet-400/15",
        };

  return (
    <div className="rounded-[28px] border bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.34)] backdrop-blur transition hover:-translate-y-1">
      <div
        className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-black tracking-[0.12em] ${accentClasses.pill}`}
      >
        {label}
      </div>
      <div className="mt-4 text-4xl font-black tracking-tight text-white">
        {pct(made, attempt)}
      </div>
      <div className="mt-2 text-sm text-zinc-400">命中 / 出手</div>
      <div className={`mt-1 text-lg font-bold ${accentClasses.value}`}>
        {made}/{attempt}
      </div>
      <div
        className={`mt-4 h-2 w-full overflow-hidden rounded-full border bg-gradient-to-r ${accentClasses.glow}`}
      >
        <div
          className="h-full rounded-full bg-white/80"
          style={{
            width: attempt === 0 ? "0%" : `${(made / attempt) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

function TopPlayerCard({
  rank,
  number,
  name,
  avgPts,
  avgReb,
  avgAst,
  avgEff,
}: {
  rank: number;
  number: number | null;
  name: string;
  avgPts: string;
  avgReb: string;
  avgAst: string;
  avgEff: string;
}) {
  const theme =
    rank === 1
      ? {
          ring: "border-orange-300/20",
          badge: "bg-orange-500/20 text-orange-100",
        }
      : rank === 2
      ? {
          ring: "border-sky-300/20",
          badge: "bg-sky-500/20 text-sky-100",
        }
      : {
          ring: "border-violet-300/20",
          badge: "bg-violet-500/20 text-violet-100",
        };

  return (
    <div
      className={`rounded-[28px] border ${theme.ring} bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_20px_44px_rgba(0,0,0,0.34)] backdrop-blur`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={`inline-flex rounded-full px-3 py-1 text-xs font-black tracking-[0.12em] ${theme.badge}`}
          >
            TOP {rank}
          </div>
          <div className="mt-4 text-xl font-black text-white">
            #{number ?? "-"} {name}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[11px] font-black tracking-[0.14em] text-zinc-500">
            AVG PTS
          </div>
          <div className="mt-1 text-3xl font-black text-white">{avgPts}</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <MiniValue label="REB" value={avgReb} />
        <MiniValue label="AST" value={avgAst} />
        <MiniValue label="EFF" value={avgEff} />
      </div>
    </div>
  );
}

function MiniValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center">
      <div className="text-[10px] font-black tracking-[0.12em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}