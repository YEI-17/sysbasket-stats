"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  calcPlayerStats,
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

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  status?: string | null;
  is_live?: boolean | null;
  game_date?: string | null;
  created_at?: string | null;
};

type EventDbRow = {
  game_id: string;
  player_id: string | null;
  event_type: EventRow["event_type"];
  team_side?: "A" | "B" | null;
  is_undone?: boolean | null;
};

type EventWithGame = EventRow & {
  game_id: string;
};

function madeAttempt(made: number, attempt: number) {
  return `${made}/${attempt}`;
}

function getGameStatus(game: GameRow) {
  if (game.is_live || game.status === "live") return "直播中";
  if (game.status === "finished") return "已結束";
  if (game.status === "scheduled") return "尚未開始";
  return "未分類";
}

function getGameStatusStyle(game: GameRow) {
  if (game.is_live || game.status === "live") {
    return "bg-red-500/15 text-red-200 border border-red-400/30";
  }
  if (game.status === "finished") {
    return "bg-emerald-500/15 text-emerald-200 border border-emerald-400/30";
  }
  if (game.status === "scheduled") {
    return "bg-yellow-500/15 text-yellow-100 border border-yellow-400/30";
  }
  return "bg-zinc-800/80 text-zinc-300 border border-zinc-700";
}

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
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  async function loadAll() {
    setLoading(true);
    setMsg("");

    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("id, name, number, active")
      .eq("active", true)
      .order("number", { ascending: true });

    if (playerError) {
      setMsg(`讀取球員失敗：${playerError.message}`);
      setLoading(false);
      return;
    }

    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("game_id, player_id, event_type, team_side, is_undone")
      .order("created_at", { ascending: true });

    if (eventError) {
      setMsg(`讀取事件失敗：${eventError.message}`);
      setLoading(false);
      return;
    }

    const { data: gameData, error: gameError } = await supabase
      .from("games")
      .select("id, teamA, teamB, status, is_live, game_date, created_at")
      .order("game_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (gameError) {
      setMsg(`讀取比賽失敗：${gameError.message}`);
      setLoading(false);
      return;
    }

    setPlayers((playerData || []) as Player[]);
    setGames((gameData || []) as GameRow[]);
    setEvents(
      ((eventData || []) as EventDbRow[]).map((e) => ({
        game_id: e.game_id,
        player_id: e.player_id,
        event_type: e.event_type,
        team_side: e.team_side ?? null,
        is_undone: !!e.is_undone,
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadAll();

    const channel = supabase
      .channel("box-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        () => loadAll()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalTeamStat = useMemo(() => calcPlayerStats(events), [events]);
  const playerStatMap = useMemo(() => groupPlayerStats(events), [events]);

  const playerGameCountMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};

    for (const e of events) {
      if (!e.player_id || e.is_undone) continue;
      if (!map[e.player_id]) {
        map[e.player_id] = new Set<string>();
      }
      map[e.player_id].add(e.game_id);
    }

    const result: Record<string, number> = {};
    for (const playerId of Object.keys(map)) {
      result[playerId] = map[playerId].size;
    }
    return result;
  }, [events]);

  const playerRows = useMemo(() => {
    return players.map((player) => {
      const stat: Stat = playerStatMap[player.id] || safeStat();
      const gamesPlayed = playerGameCountMap[player.id] || 0;
      const playerEff = eff(stat);

      return {
        ...player,
        stat,
        gamesPlayed,
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
  }, [players, playerStatMap, playerGameCountMap]);

  const sortedPlayerRows = useMemo(() => {
    return [...playerRows].sort((a, b) => {
      const aAvgPts = Number(a.avgPts);
      const bAvgPts = Number(b.avgPts);

      if (bAvgPts !== aAvgPts) return bAvgPts - aAvgPts;
      if (b.eff !== a.eff) return b.eff - a.eff;
      return (a.number ?? 999) - (b.number ?? 999);
    });
  }, [playerRows]);

  const finishedGamesCount = useMemo(
    () => games.filter((g) => g.status === "finished").length,
    [games]
  );

  const liveGamesCount = useMemo(
    () => games.filter((g) => g.is_live || g.status === "live").length,
    [games]
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(255,140,0,0.18),transparent_30%),radial-gradient(circle_at_0%_100%,rgba(255,98,0,0.12),transparent_30%),radial-gradient(circle_at_100%_100%,rgba(255,180,80,0.08),transparent_28%),linear-gradient(180deg,#0b0b0d_0%,#101014_55%,#060606_100%)] px-4 py-6 text-white md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_20%),radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.28)_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18]">
        <div className="absolute left-1/2 top-[8%] h-[72vw] max-h-[980px] w-[72vw] max-w-[980px] -translate-x-1/2 rounded-full border-2 border-white/10" />
        <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 border-l-2 border-white/10" />
      </div>
      <div className="pointer-events-none absolute left-[-60px] top-[120px] h-[320px] w-[320px] rounded-full bg-orange-500/20 blur-[90px]" />
      <div className="pointer-events-none absolute right-[-60px] bottom-[60px] h-[320px] w-[320px] rounded-full bg-amber-400/15 blur-[90px]" />
      <div className="pointer-events-none absolute right-[70px] top-[90px] h-[210px] w-[210px] rotate-[-16deg] rounded-full bg-[radial-gradient(circle_at_30%_30%,#ffb347_0%,#f48c06_38%,#d96a00_70%,#9a4d00_100%)] opacity-[0.12] shadow-[inset_-18px_-18px_40px_rgba(0,0,0,0.25),inset_10px_10px_20px_rgba(255,255,255,0.08),0_20px_50px_rgba(0,0,0,0.35)]" />
      <div className="pointer-events-none absolute bottom-[90px] left-[60px] h-[160px] w-[160px] rotate-[18deg] rounded-full bg-[radial-gradient(circle_at_30%_30%,#ffb347_0%,#f48c06_38%,#d96a00_70%,#9a4d00_100%)] opacity-[0.12] shadow-[inset_-18px_-18px_40px_rgba(0,0,0,0.25),inset_10px_10px_20px_rgba(255,255,255,0.08),0_20px_50px_rgba(0,0,0,0.35)]" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <section className="relative mb-6 overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,140,0,0.08)] backdrop-blur md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,140,0,0.12),transparent_28%,transparent_70%,rgba(255,140,0,0.08)),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_18%)]" />
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-black tracking-[0.14em] text-orange-100">
                TEAM ANALYTICS
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
                數據中心
              </h1>
              <p className="mt-3 text-sm leading-7 text-orange-50/70 md:text-base">
                團隊總覽、球員場均、整體命中表現與近期比賽狀態。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={loadAll}
                className="rounded-2xl bg-[linear-gradient(135deg,#ffb347_0%,#f48c06_55%,#d96a00_100%)] px-5 py-3 text-sm font-black tracking-[0.14em] text-white shadow-[0_18px_34px_rgba(244,140,6,0.28),inset_0_1px_0_rgba(255,255,255,0.24)] transition hover:-translate-y-0.5"
              >
                REFRESH
              </button>
            </div>
          </div>

          <div className="relative z-10 mt-6 flex items-center gap-3 border-t border-white/10 pt-4 text-xs font-extrabold tracking-[0.14em] text-orange-100/50">
            <div className="h-2.5 w-2.5 rounded-full bg-[linear-gradient(135deg,#ffb347_0%,#f48c06_100%)] shadow-[0_0_16px_rgba(244,140,6,0.4)]" />
            <span>COURTSIDE ANALYTICS DASHBOARD</span>
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
            <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="總得分" value={totalTeamStat.pts} accent="orange" />
              <StatCard label="總籃板" value={totalTeamStat.reb} accent="blue" />
              <StatCard label="總助攻" value={totalTeamStat.ast} accent="violet" />
              <StatCard label="已結束比賽" value={finishedGamesCount} accent="emerald" />
              <StatCard label="直播中場次" value={liveGamesCount} accent="red" />
            </section>

            <section className="mb-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black tracking-tight">團隊命中率</h2>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-extrabold tracking-[0.14em] text-orange-100/70">
                  SHOOTING EFFICIENCY
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <RateCard
                  label="2分球"
                  made={totalTeamStat.fg2m}
                  attempt={totalTeamStat.fg2a}
                />
                <RateCard
                  label="3分球"
                  made={totalTeamStat.fg3m}
                  attempt={totalTeamStat.fg3a}
                />
                <RateCard
                  label="罰球"
                  made={totalTeamStat.ftm}
                  attempt={totalTeamStat.fta}
                />
              </div>
            </section>

            <section className="mb-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,140,0,0.05)] backdrop-blur">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">
                    球員場均數據列表
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    依場均得分排序，若相同則依總 EFF 排序
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold tracking-[0.12em] text-zinc-300">
                  場均 = 總數據 ÷ 該球員有紀錄的比賽場次
                </div>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-white/10 bg-black/20">
                <table className="min-w-[1500px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-zinc-400">
                      <th className="px-3 py-4 text-left">球員</th>
                      <th className="px-3 py-4 text-center">GP</th>
                      <th className="px-3 py-4 text-center">PTS</th>
                      <th className="px-3 py-4 text-center">AVG PTS</th>
                      <th className="px-3 py-4 text-center">REB</th>
                      <th className="px-3 py-4 text-center">AVG REB</th>
                      <th className="px-3 py-4 text-center">AST</th>
                      <th className="px-3 py-4 text-center">AVG AST</th>
                      <th className="px-3 py-4 text-center">STL</th>
                      <th className="px-3 py-4 text-center">AVG STL</th>
                      <th className="px-3 py-4 text-center">BLK</th>
                      <th className="px-3 py-4 text-center">AVG BLK</th>
                      <th className="px-3 py-4 text-center">TOV</th>
                      <th className="px-3 py-4 text-center">AVG TOV</th>
                      <th className="px-3 py-4 text-center">PF</th>
                      <th className="px-3 py-4 text-center">AVG PF</th>
                      <th className="px-3 py-4 text-center">2PT</th>
                      <th className="px-3 py-4 text-center">2PT%</th>
                      <th className="px-3 py-4 text-center">3PT</th>
                      <th className="px-3 py-4 text-center">3PT%</th>
                      <th className="px-3 py-4 text-center">FT</th>
                      <th className="px-3 py-4 text-center">FT%</th>
                      <th className="px-3 py-4 text-center">EFF</th>
                      <th className="px-3 py-4 text-center">AVG EFF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayerRows.map((row, index) => (
                      <tr
                        key={row.id}
                        className="border-b border-white/5 transition hover:bg-white/[0.03]"
                      >
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-xs font-black text-orange-100 ring-1 ring-white/10">
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-bold text-white">
                                #{row.number ?? "-"} {row.name}
                              </div>
                              <div className="text-xs text-zinc-500">
                                背號 {row.number ?? "-"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-center font-semibold">{row.gamesPlayed}</td>
                        <td className="px-3 py-4 text-center">{row.stat.pts}</td>
                        <td className="px-3 py-4 text-center font-bold text-orange-300">
                          {row.avgPts}
                        </td>
                        <td className="px-3 py-4 text-center">{row.stat.reb}</td>
                        <td className="px-3 py-4 text-center">{row.avgReb}</td>
                        <td className="px-3 py-4 text-center">{row.stat.ast}</td>
                        <td className="px-3 py-4 text-center">{row.avgAst}</td>
                        <td className="px-3 py-4 text-center">{row.stat.stl}</td>
                        <td className="px-3 py-4 text-center">{row.avgStl}</td>
                        <td className="px-3 py-4 text-center">{row.stat.blk}</td>
                        <td className="px-3 py-4 text-center">{row.avgBlk}</td>
                        <td className="px-3 py-4 text-center">{row.stat.tov}</td>
                        <td className="px-3 py-4 text-center">{row.avgTov}</td>
                        <td className="px-3 py-4 text-center">{row.stat.pf}</td>
                        <td className="px-3 py-4 text-center">{row.avgPf}</td>
                        <td className="px-3 py-4 text-center">
                          {madeAttempt(row.stat.fg2m, row.stat.fg2a)}
                        </td>
                        <td className="px-3 py-4 text-center">
                          {pct(row.stat.fg2m, row.stat.fg2a)}
                        </td>
                        <td className="px-3 py-4 text-center">
                          {madeAttempt(row.stat.fg3m, row.stat.fg3a)}
                        </td>
                        <td className="px-3 py-4 text-center">
                          {pct(row.stat.fg3m, row.stat.fg3a)}
                        </td>
                        <td className="px-3 py-4 text-center">
                          {madeAttempt(row.stat.ftm, row.stat.fta)}
                        </td>
                        <td className="px-3 py-4 text-center">
                          {pct(row.stat.ftm, row.stat.fta)}
                        </td>
                        <td className="px-3 py-4 text-center font-bold">
                          {row.eff}
                        </td>
                        <td className="px-3 py-4 text-center font-bold text-cyan-300">
                          {row.avgEff}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,140,0,0.05)] backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black tracking-tight">比賽狀態總覽</h2>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-extrabold tracking-[0.14em] text-orange-100/70">
                  GAME STATUS
                </div>
              </div>

              {games.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-zinc-400">
                  目前沒有比賽資料
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {games.slice(0, 9).map((game) => (
                    <div
                      key={game.id}
                      className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-lg font-black tracking-tight text-white">
                            {game.teamA || "主隊"} <span className="text-orange-300">vs</span>{" "}
                            {game.teamB || "客隊"}
                          </div>
                          <div className="mt-1 text-sm text-zinc-400">
                            {game.game_date || game.created_at || "未設定日期"}
                          </div>
                        </div>

                        <div
                          className={`rounded-full px-3 py-1 text-xs font-extrabold tracking-[0.08em] ${getGameStatusStyle(
                            game
                          )}`}
                        >
                          {getGameStatus(game)}
                        </div>
                      </div>

                      <div className="text-xs font-bold tracking-[0.14em] text-zinc-500">
                        GAME ID
                      </div>
                      <div className="mt-1 truncate text-sm text-zinc-300">
                        {game.id}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent = "orange",
}: {
  label: string;
  value: number | string;
  accent?: "orange" | "blue" | "violet" | "emerald" | "red";
}) {
  const accentMap: Record<string, string> = {
    orange:
      "from-orange-500/20 to-orange-300/5 text-orange-200 border-orange-400/20",
    blue:
      "from-blue-500/20 to-blue-300/5 text-blue-200 border-blue-400/20",
    violet:
      "from-violet-500/20 to-violet-300/5 text-violet-200 border-violet-400/20",
    emerald:
      "from-emerald-500/20 to-emerald-300/5 text-emerald-200 border-emerald-400/20",
    red:
      "from-red-500/20 to-red-300/5 text-red-200 border-red-400/20",
  };

  return (
    <div
      className={`rounded-[28px] border bg-gradient-to-br ${accentMap[accent]} p-5 shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur`}
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
}: {
  label: string;
  made: number;
  attempt: number;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.34)] backdrop-blur">
      <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-black tracking-[0.12em] text-orange-100/80">
        {label}
      </div>
      <div className="mt-4 text-4xl font-black tracking-tight text-white">
        {pct(made, attempt)}
      </div>
      <div className="mt-2 text-sm text-zinc-400">命中 / 出手</div>
      <div className="mt-1 text-lg font-bold text-orange-200">
        {madeAttempt(made, attempt)}
      </div>
    </div>
  );
}