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

    setPlayers((playerData || []) as Player[]);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const validEvents = useMemo(
    () => events.filter((e) => !e.is_undone),
    [events]
  );

  const totalTeamStat = useMemo(() => calcPlayerStats(validEvents), [validEvents]);
  const playerStatMap = useMemo(() => groupPlayerStats(validEvents), [validEvents]);

  const teamGamesCount = useMemo(() => {
    return new Set(validEvents.map((e) => e.game_id)).size;
  }, [validEvents]);

  const avgTeamPts = useMemo(
    () => avg(totalTeamStat.pts, teamGamesCount),
    [totalTeamStat.pts, teamGamesCount]
  );

  const avgTeamReb = useMemo(
    () => avg(totalTeamStat.reb, teamGamesCount),
    [totalTeamStat.reb, teamGamesCount]
  );

  const avgTeamAst = useMemo(
    () => avg(totalTeamStat.ast, teamGamesCount),
    [totalTeamStat.ast, teamGamesCount]
  );

  const playerGameCountMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};

    for (const e of validEvents) {
      if (!e.player_id) continue;
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
  }, [validEvents]);

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

      <div className="pointer-events-none absolute right-[70px] top-[90px] h-[210px] w-[210px] animate-[floatBall1_8s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle_at_30%_30%,#ffb347_0%,#f48c06_38%,#d96a00_70%,#9a4d00_100%)] opacity-[0.12] shadow-[inset_-18px_-18px_40px_rgba(0,0,0,0.25),inset_10px_10px_20px_rgba(255,255,255,0.08),0_20px_50px_rgba(0,0,0,0.35)]" />
      <div className="pointer-events-none absolute bottom-[90px] left-[60px] h-[160px] w-[160px] animate-[floatBall2_10s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle_at_30%_30%,#ffb347_0%,#f48c06_38%,#d96a00_70%,#9a4d00_100%)] opacity-[0.12] shadow-[inset_-18px_-18px_40px_rgba(0,0,0,0.25),inset_10px_10px_20px_rgba(255,255,255,0.08),0_20px_50px_rgba(0,0,0,0.35)]" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <section className="relative mb-6 overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,140,0,0.08)] backdrop-blur md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,140,0,0.12),transparent_28%,transparent_70%,rgba(255,140,0,0.08)),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_18%)]" />
          <div className="pointer-events-none absolute bottom-[-10px] right-[24px] text-[clamp(54px,10vw,120px)] font-black tracking-[-0.06em] text-white/[0.04]">
            ANALYTICS
          </div>

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
                <HeroChip label="EVENTS" value={validEvents.length} />
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
                  made={totalTeamStat.fg2m}
                  attempt={totalTeamStat.fg2a}
                  accent="orange"
                />
                <RateCard
                  label="3分球"
                  made={totalTeamStat.fg3m}
                  attempt={totalTeamStat.fg3a}
                  accent="blue"
                />
                <RateCard
                  label="罰球"
                  made={totalTeamStat.ftm}
                  attempt={totalTeamStat.fta}
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
                {topThree.map((row, index) => (
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
                ))}
              </div>
            </section>

            <section className="mb-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,140,0,0.05)] backdrop-blur">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">球員場均數據列表</h2>
                  <p className="mt-1 text-sm text-zinc-400">完整排行與命中率表現</p>
                </div>

                <div className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black tracking-[0.12em] text-zinc-300 md:inline-flex">
                  SORTED BY AVG PTS
                </div>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-white/10 bg-black/20">
                <table className="min-w-[1400px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-zinc-400">
                      <th className="px-3 py-4 text-left">球員</th>
                      <th className="px-3 py-4 text-center">GP</th>
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
                    {sortedPlayerRows.map((row, index) => (
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
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <style jsx global>{`
              @keyframes floatBall1 {
                0%, 100% {
                  transform: translateY(0px) rotate(-16deg);
                }
                50% {
                  transform: translateY(-16px) rotate(-10deg);
                }
              }

              @keyframes floatBall2 {
                0%, 100% {
                  transform: translateY(0px) rotate(18deg);
                }
                50% {
                  transform: translateY(14px) rotate(24deg);
                }
              }
            `}</style>
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
  const accentMap: Record<string, string> = {
    orange:
      "from-orange-500/20 to-orange-300/5 text-orange-200 border-orange-400/20",
    blue:
      "from-blue-500/20 to-blue-300/5 text-blue-200 border-blue-400/20",
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
    <div
      className={`rounded-[28px] border bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.34)] backdrop-blur transition hover:-translate-y-1`}
    >
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
        className={`mt-4 h-2 w-full overflow-hidden rounded-full border ${accentClasses.glow}`}
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
          glow: "from-orange-500/20 to-orange-300/5",
          badge: "bg-orange-500/20 text-orange-100",
        }
      : rank === 2
      ? {
          ring: "border-sky-300/20",
          glow: "from-sky-500/20 to-sky-300/5",
          badge: "bg-sky-500/20 text-sky-100",
        }
      : {
          ring: "border-violet-300/20",
          glow: "from-violet-500/20 to-violet-300/5",
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