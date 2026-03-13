"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";
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

function formatDateTime(dateStr?: string | null) {
  if (!dateStr) return "未設定日期";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;

  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getGameStatus(game: GameRow) {
  if (game.is_live || game.status === "live") return "直播中";
  if (game.status === "finished") return "已結束";
  if (game.status === "scheduled") return "尚未開始";
  return "未分類";
}

function getGameStatusStyle(game: GameRow) {
  if (game.is_live || game.status === "live") {
    return "bg-red-500/15 text-red-300 border border-red-500/30";
  }
  if (game.status === "finished") {
    return "bg-zinc-800 text-zinc-300 border border-zinc-700";
  }
  if (game.status === "scheduled") {
    return "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30";
  }
  return "bg-zinc-800 text-zinc-300 border border-zinc-700";
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

  const recentGames = useMemo(() => games.slice(0, 8), [games]);

  const finishedGamesCount = useMemo(
    () => games.filter((g) => g.status === "finished").length,
    [games]
  );

  const liveGamesCount = useMemo(
    () => games.filter((g) => g.is_live || g.status === "live").length,
    [games]
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-300">
              TEAM ANALYTICS
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
              數據中心
            </h1>
            <p className="mt-2 text-sm text-zinc-400 md:text-base">
              團隊總覽、球員場均、最近比賽與整體命中表現
            </p>
          </div>

          
        </div>

        {msg ? (
          <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300">
            {msg}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-6 text-zinc-400 shadow-2xl">
            載入中...
          </div>
        ) : (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="總得分" value={totalTeamStat.pts} accent="emerald" />
              <StatCard label="總籃板" value={totalTeamStat.reb} accent="blue" />
              <StatCard label="總助攻" value={totalTeamStat.ast} accent="violet" />
              <StatCard label="已結束比賽" value={finishedGamesCount} accent="amber" />
              <StatCard label="直播中場次" value={liveGamesCount} accent="red" />
            </section>

            <section className="mb-6">
              <h2 className="mb-4 text-2xl font-bold">團隊命中率</h2>

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

            <section className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-950/95 p-5 shadow-2xl">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">球員場均數據列表</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    依場均得分排序，若相同則依總 EFF 排序
                  </p>
                </div>
                <div className="text-sm text-zinc-500">
                  場均 = 總數據 ÷ 該球員有紀錄的比賽場次
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1500px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="px-3 py-3 text-left">球員</th>
                      <th className="px-3 py-3 text-center">GP</th>
                      <th className="px-3 py-3 text-center">PTS</th>
                      <th className="px-3 py-3 text-center">AVG PTS</th>
                      <th className="px-3 py-3 text-center">REB</th>
                      <th className="px-3 py-3 text-center">AVG REB</th>
                      <th className="px-3 py-3 text-center">AST</th>
                      <th className="px-3 py-3 text-center">AVG AST</th>
                      <th className="px-3 py-3 text-center">STL</th>
                      <th className="px-3 py-3 text-center">AVG STL</th>
                      <th className="px-3 py-3 text-center">BLK</th>
                      <th className="px-3 py-3 text-center">AVG BLK</th>
                      <th className="px-3 py-3 text-center">TOV</th>
                      <th className="px-3 py-3 text-center">AVG TOV</th>
                      <th className="px-3 py-3 text-center">PF</th>
                      <th className="px-3 py-3 text-center">AVG PF</th>
                      <th className="px-3 py-3 text-center">2PT</th>
                      <th className="px-3 py-3 text-center">2PT%</th>
                      <th className="px-3 py-3 text-center">3PT</th>
                      <th className="px-3 py-3 text-center">3PT%</th>
                      <th className="px-3 py-3 text-center">FT</th>
                      <th className="px-3 py-3 text-center">FT%</th>
                      <th className="px-3 py-3 text-center">EFF</th>
                      <th className="px-3 py-3 text-center">AVG EFF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayerRows.map((row, index) => (
                      <tr
                        key={row.id}
                        className="border-b border-zinc-900 hover:bg-zinc-900/60 transition"
                      >
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-semibold text-white">
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
                        <td className="px-3 py-4 text-center font-semibold text-emerald-300">
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
                        <td className="px-3 py-4 text-center font-semibold">
                          {row.eff}
                        </td>
                        <td className="px-3 py-4 text-center font-semibold text-cyan-300">
                          {row.avgEff}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950/95 p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-2xl font-bold">最近比賽</h2>
                <Link
                  href="/games/list"
                  className="text-sm font-medium text-emerald-400 hover:text-emerald-300"
                >
                  查看全部
                </Link>
              </div>

              {recentGames.length === 0 ? (
                <p className="text-zinc-500">目前沒有比賽資料</p>
              ) : (
                <div className="grid gap-4">
                  {recentGames.map((game) => (
                    <div
                      key={game.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 transition hover:border-zinc-700"
                    >
                      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-lg font-semibold md:text-xl">
                            {game.teamA || "隊伍A"} vs {game.teamB || "隊伍B"}
                          </div>
                          <div className="mt-1 text-sm text-zinc-400">
                            {formatDateTime(game.game_date || game.created_at)}
                          </div>
                        </div>

                        <div
                          className={`inline-flex w-fit rounded-full px-3 py-1 text-sm font-medium ${getGameStatusStyle(
                            game
                          )}`}
                        >
                          {getGameStatus(game)}
                        </div>
                      </div>

                      <div className="grid gap-2 md:grid-cols-3">
                        <Link
                          href={`/games/${game.id}`}
                          className="rounded-xl bg-emerald-500 px-4 py-3 text-center font-semibold text-black transition hover:bg-emerald-400"
                        >
                          進入紀錄
                        </Link>
                        <Link
                          href={`/games/${game.id}/board`}
                          className="rounded-xl bg-blue-500 px-4 py-3 text-center font-semibold text-white transition hover:bg-blue-400"
                        >
                          觀眾畫面
                        </Link>
                        <Link
                          href={`/games/${game.id}/box`}
                          className="rounded-xl bg-zinc-700 px-4 py-3 text-center font-semibold text-white transition hover:bg-zinc-600"
                        >
                          單場數據
                        </Link>
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
  accent = "emerald",
}: {
  label: string;
  value: number | string;
  accent?: "emerald" | "blue" | "violet" | "amber" | "red";
}) {
  const accentMap: Record<string, string> = {
    emerald: "from-emerald-500/20 to-emerald-400/5 text-emerald-300 border-emerald-500/20",
    blue: "from-blue-500/20 to-blue-400/5 text-blue-300 border-blue-500/20",
    violet: "from-violet-500/20 to-violet-400/5 text-violet-300 border-violet-500/20",
    amber: "from-amber-500/20 to-amber-400/5 text-amber-300 border-amber-500/20",
    red: "from-red-500/20 to-red-400/5 text-red-300 border-red-500/20",
  };

  return (
    <div
      className={`rounded-3xl border bg-gradient-to-br ${accentMap[accent]} p-5 shadow-xl backdrop-blur`}
    >
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-3 text-3xl font-black text-white">{value}</div>
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
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/95 p-5 shadow-xl">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{pct(made, attempt)}</div>
      <div className="mt-2 text-zinc-300">{madeAttempt(made, attempt)}</div>
    </div>
  );
}