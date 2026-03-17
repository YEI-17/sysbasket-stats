"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

type TeamSide = "teamA" | "teamB";

type EventType =
  | "fg2_made"
  | "fg2_miss"
  | "fg3_made"
  | "fg3_miss"
  | "ft_made"
  | "ft_miss"
  | "reb"
  | "ast"
  | "stl"
  | "blk"
  | "tov"
  | "pf"
  | "sub_in"
  | "sub_out";

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: EventType | string;
  created_at: string;
  team_side?: TeamSide | null;
  is_undone?: boolean | null;
  undone_at?: string | null;
  clock_seconds_left?: number | null;
};

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  is_live?: boolean | null;
  ended_at?: string | null;
  status?: string | null;
  game_date?: string | null;
  created_at?: string | null;
};

type PlayerRow = {
  id: string;
  name: string;
  number: number | null;
  position?: string | null;
  active?: boolean | null;
};

type GamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: TeamSide;
  is_starter: boolean;
};

type PlayerShiftRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side?: TeamSide | null;
  quarter: number;
  in_at_seconds_left: number | null;
  out_at_seconds_left: number | null;
};

type Stat = {
  pts: number;
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
};

const QUARTER_SECONDS = 600;

function emptyStat(): Stat {
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

function cloneStat(stat: Stat): Stat {
  return { ...stat };
}

function addEventToStat(stat: Stat, eventType: string) {
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

function pct(made: number, att: number) {
  if (!att) return "0%";
  return `${((made / att) * 100).toFixed(1)}%`;
}

function formatMinutes(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function normalizeTeamSide(value: string | null | undefined): TeamSide | null {
  if (value === "teamA" || value === "teamB") return value;
  return null;
}

function sortPlayers(players: PlayerRow[]) {
  return [...players].sort((a, b) => {
    const an = a.number ?? 999;
    const bn = b.number ?? 999;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name, "zh-Hant");
  });
}

function buildCurrentOnCourtMap(
  gamePlayers: GamePlayerRow[],
  events: EventRow[]
): Record<TeamSide, string[]> {
  const startersA = gamePlayers
    .filter((p) => p.team_side === "teamA" && p.is_starter)
    .map((p) => p.player_id);
  const startersB = gamePlayers
    .filter((p) => p.team_side === "teamB" && p.is_starter)
    .map((p) => p.player_id);

  const onCourt: Record<TeamSide, string[]> = {
    teamA: [...startersA],
    teamB: [...startersB],
  };

  const validEvents = [...events]
    .filter((e) => !e.is_undone && !e.undone_at)
    .sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });

  for (const e of validEvents) {
    const side = normalizeTeamSide(e.team_side);
    if (!side || !e.player_id) continue;

    if (e.event_type === "sub_out") {
      onCourt[side] = onCourt[side].filter((id) => id !== e.player_id);
    } else if (e.event_type === "sub_in") {
      if (!onCourt[side].includes(e.player_id)) {
        onCourt[side] = [...onCourt[side], e.player_id];
      }
    }
  }

  return onCourt;
}

function buildPlayerStats(
  gamePlayers: GamePlayerRow[],
  events: EventRow[]
): Map<string, Stat> {
  const stats = new Map<string, Stat>();

  for (const gp of gamePlayers) {
    stats.set(gp.player_id, emptyStat());
  }

  for (const e of events) {
    if (e.is_undone || e.undone_at) continue;
    if (!e.player_id) continue;
    if (!stats.has(e.player_id)) stats.set(e.player_id, emptyStat());

    const stat = stats.get(e.player_id)!;
    addEventToStat(stat, e.event_type);
  }

  return stats;
}

function sumStats(playerStats: Map<string, Stat>, playerIds: string[]): Stat {
  const total = emptyStat();
  for (const id of playerIds) {
    const stat = playerStats.get(id);
    if (!stat) continue;
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
}

function computeMinutesFromPlayerShifts(
  shifts: PlayerShiftRow[]
): Map<string, number> {
  const result = new Map<string, number>();

  for (const s of shifts) {
    const inSec = s.in_at_seconds_left ?? QUARTER_SECONDS;
    const outSec = s.out_at_seconds_left ?? 0;
    const played = Math.max(0, inSec - outSec);
    result.set(s.player_id, (result.get(s.player_id) ?? 0) + played);
  }

  return result;
}

function computeMinutesFromEvents(
  gamePlayers: GamePlayerRow[],
  events: EventRow[]
): Map<string, number> {
  const result = new Map<string, number>();

  const startersA = gamePlayers
    .filter((p) => p.team_side === "teamA" && p.is_starter)
    .map((p) => p.player_id);
  const startersB = gamePlayers
    .filter((p) => p.team_side === "teamB" && p.is_starter)
    .map((p) => p.player_id);

  let currentOnCourt: Record<TeamSide, Set<string>> = {
    teamA: new Set(startersA),
    teamB: new Set(startersB),
  };

  const validEvents = [...events]
    .filter((e) => !e.is_undone && !e.undone_at)
    .sort((a, b) => {
      if (a.quarter !== b.quarter) return a.quarter - b.quarter;

      const aClock =
        typeof a.clock_seconds_left === "number"
          ? a.clock_seconds_left
          : Number.NaN;
      const bClock =
        typeof b.clock_seconds_left === "number"
          ? b.clock_seconds_left
          : Number.NaN;

      if (!Number.isNaN(aClock) && !Number.isNaN(bClock) && aClock !== bClock) {
        return bClock - aClock;
      }

      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });

  const maxQuarter = Math.max(
    4,
    ...validEvents.map((e) => e.quarter || 1),
    1
  );

  for (let quarter = 1; quarter <= maxQuarter; quarter += 1) {
    const quarterEvents = validEvents.filter((e) => e.quarter === quarter);
    let lastClock = QUARTER_SECONDS;

    for (const e of quarterEvents) {
      const currentClock =
        typeof e.clock_seconds_left === "number"
          ? Math.max(0, Math.min(QUARTER_SECONDS, e.clock_seconds_left))
          : lastClock;

      const elapsed = Math.max(0, lastClock - currentClock);

      if (elapsed > 0) {
        for (const pid of currentOnCourt.teamA) {
          result.set(pid, (result.get(pid) ?? 0) + elapsed);
        }
        for (const pid of currentOnCourt.teamB) {
          result.set(pid, (result.get(pid) ?? 0) + elapsed);
        }
      }

      const side = normalizeTeamSide(e.team_side);
      if (side && e.player_id) {
        if (e.event_type === "sub_out") {
          currentOnCourt[side].delete(e.player_id);
        } else if (e.event_type === "sub_in") {
          currentOnCourt[side].add(e.player_id);
        }
      }

      lastClock = currentClock;
    }

    if (lastClock > 0) {
      for (const pid of currentOnCourt.teamA) {
        result.set(pid, (result.get(pid) ?? 0) + lastClock);
      }
      for (const pid of currentOnCourt.teamB) {
        result.set(pid, (result.get(pid) ?? 0) + lastClock);
      }
    }
  }

  return result;
}

export default function GameBoardPage() {
  const params = useParams();
  const gameId = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [playerShifts, setPlayerShifts] = useState<PlayerShiftRow[]>([]);
  const [hasPlayerShifts, setHasPlayerShifts] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    let isMounted = true;

    async function loadAll() {
      setLoading(true);
      setError("");

      try {
        const gameRes = await supabase
          .from("games")
          .select("id, teamA, teamB, is_live, ended_at, status, game_date, created_at")
          .eq("id", gameId)
          .single();

        if (gameRes.error) throw gameRes.error;

        const gamePlayersRes = await supabase
          .from("game_players")
          .select("id, game_id, player_id, team_side, is_starter")
          .eq("game_id", gameId);

        if (gamePlayersRes.error) throw gamePlayersRes.error;

        const playerIds = (gamePlayersRes.data ?? []).map((p) => p.player_id);

        const playersRes =
          playerIds.length > 0
            ? await supabase
                .from("players")
                .select("id, name, number, position, active")
                .in("id", playerIds)
            : { data: [], error: null as any };

        if (playersRes.error) throw playersRes.error;

        const eventsRes = await supabase
          .from("events")
          .select(
            "id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at, clock_seconds_left"
          )
          .eq("game_id", gameId)
          .order("quarter", { ascending: true })
          .order("created_at", { ascending: true });

        if (eventsRes.error) throw eventsRes.error;

        // player_shifts 可能不存在或此場沒有資料，所以用 try/catch 吃掉
        let shiftsData: PlayerShiftRow[] = [];
        let shiftsExists = false;
        try {
          const shiftsRes = await supabase
            .from("player_shifts")
            .select(
              "id, game_id, player_id, team_side, quarter, in_at_seconds_left, out_at_seconds_left"
            )
            .eq("game_id", gameId);

          if (!shiftsRes.error && shiftsRes.data) {
            shiftsData = shiftsRes.data;
            shiftsExists = shiftsData.length > 0;
          }
        } catch {
          shiftsData = [];
          shiftsExists = false;
        }

        if (!isMounted) return;

        setGame(gameRes.data);
        setGamePlayers((gamePlayersRes.data ?? []) as GamePlayerRow[]);
        setPlayers((playersRes.data ?? []) as PlayerRow[]);
        setEvents((eventsRes.data ?? []) as EventRow[]);
        setPlayerShifts(shiftsData);
        setHasPlayerShifts(shiftsExists);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.message || "載入失敗");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAll();

    return () => {
      isMounted = false;
    };
  }, [gameId]);

  const playerMap = useMemo(() => {
    const map = new Map<string, PlayerRow>();
    for (const p of players) map.set(p.id, p);
    return map;
  }, [players]);

  const validEvents = useMemo(
    () => events.filter((e) => !e.is_undone && !e.undone_at),
    [events]
  );

  const playerStats = useMemo(
    () => buildPlayerStats(gamePlayers, validEvents),
    [gamePlayers, validEvents]
  );

  const minutesMap = useMemo(() => {
    if (hasPlayerShifts && playerShifts.length > 0) {
      return computeMinutesFromPlayerShifts(playerShifts);
    }
    return computeMinutesFromEvents(gamePlayers, validEvents);
  }, [gamePlayers, validEvents, hasPlayerShifts, playerShifts]);

  const currentOnCourt = useMemo(
    () => buildCurrentOnCourtMap(gamePlayers, validEvents),
    [gamePlayers, validEvents]
  );

  const teamAIds = useMemo(
    () =>
      gamePlayers
        .filter((p) => p.team_side === "teamA")
        .map((p) => p.player_id),
    [gamePlayers]
  );

  const teamBIds = useMemo(
    () =>
      gamePlayers
        .filter((p) => p.team_side === "teamB")
        .map((p) => p.player_id),
    [gamePlayers]
  );

  const startersA = useMemo(() => {
    const ids = gamePlayers
      .filter((p) => p.team_side === "teamA" && p.is_starter)
      .map((p) => p.player_id);
    return sortPlayers(ids.map((id) => playerMap.get(id)).filter(Boolean) as PlayerRow[]);
  }, [gamePlayers, playerMap]);

  const startersB = useMemo(() => {
    const ids = gamePlayers
      .filter((p) => p.team_side === "teamB" && p.is_starter)
      .map((p) => p.player_id);
    return sortPlayers(ids.map((id) => playerMap.get(id)).filter(Boolean) as PlayerRow[]);
  }, [gamePlayers, playerMap]);

  const benchA = useMemo(() => {
    const ids = gamePlayers
      .filter((p) => p.team_side === "teamA" && !p.is_starter)
      .map((p) => p.player_id);
    return sortPlayers(ids.map((id) => playerMap.get(id)).filter(Boolean) as PlayerRow[]);
  }, [gamePlayers, playerMap]);

  const benchB = useMemo(() => {
    const ids = gamePlayers
      .filter((p) => p.team_side === "teamB" && !p.is_starter)
      .map((p) => p.player_id);
    return sortPlayers(ids.map((id) => playerMap.get(id)).filter(Boolean) as PlayerRow[]);
  }, [gamePlayers, playerMap]);

  const currentOnCourtPlayersA = useMemo(() => {
    return currentOnCourt.teamA
      .map((id) => playerMap.get(id))
      .filter(Boolean) as PlayerRow[];
  }, [currentOnCourt, playerMap]);

  const currentOnCourtPlayersB = useMemo(() => {
    return currentOnCourt.teamB
      .map((id) => playerMap.get(id))
      .filter(Boolean) as PlayerRow[];
  }, [currentOnCourt, playerMap]);

  const teamAStat = useMemo(() => sumStats(playerStats, teamAIds), [playerStats, teamAIds]);
  const teamBStat = useMemo(() => sumStats(playerStats, teamBIds), [playerStats, teamBIds]);

  const scoreA = teamAStat.pts;
  const scoreB = teamBStat.pts;

  function renderPlayerRow(player: PlayerRow) {
    const stat = playerStats.get(player.id) ?? emptyStat();
    const minutes = minutesMap.get(player.id) ?? 0;
    const isOnCourt =
      currentOnCourt.teamA.includes(player.id) || currentOnCourt.teamB.includes(player.id);

    return (
      <tr
        key={player.id}
        className="border-b border-white/10 text-sm text-white/90"
      >
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex min-w-8 justify-center rounded-full bg-orange-500/20 px-2 py-1 text-xs font-semibold text-orange-200">
              #{player.number ?? "-"}
            </span>
            <div className="flex flex-col">
              <span className="font-medium">{player.name}</span>
              <span className="text-xs text-white/45">
                {player.position || "—"}
              </span>
            </div>
            {isOnCourt && (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">
                場上
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-center">{formatMinutes(minutes)}</td>
        <td className="px-3 py-3 text-center">{stat.pts}</td>
        <td className="px-3 py-3 text-center">{stat.reb}</td>
        <td className="px-3 py-3 text-center">{stat.ast}</td>
        <td className="px-3 py-3 text-center">{stat.stl}</td>
        <td className="px-3 py-3 text-center">{stat.blk}</td>
        <td className="px-3 py-3 text-center">{stat.tov}</td>
        <td className="px-3 py-3 text-center">{stat.pf}</td>
        <td className="px-3 py-3 text-center">
          {stat.fg2m}/{stat.fg2a}
        </td>
        <td className="px-3 py-3 text-center">
          {stat.fg3m}/{stat.fg3a}
        </td>
        <td className="px-3 py-3 text-center">
          {stat.ftm}/{stat.fta}
        </td>
      </tr>
    );
  }

  function renderTeamSection(
    side: TeamSide,
    title: string,
    starters: PlayerRow[],
    bench: PlayerRow[],
    onCourtPlayers: PlayerRow[],
    teamStat: Stat
  ) {
    const allPlayers = [...starters, ...bench];

    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-orange-300/80">
              {side}
            </div>
            <h2 className="mt-1 text-2xl font-bold text-white">{title}</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="text-xs text-white/50">得分</div>
              <div className="mt-1 text-xl font-bold text-white">{teamStat.pts}</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="text-xs text-white/50">籃板</div>
              <div className="mt-1 text-xl font-bold text-white">{teamStat.reb}</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="text-xs text-white/50">助攻</div>
              <div className="mt-1 text-xl font-bold text-white">{teamStat.ast}</div>
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <div className="text-xs text-white/50">命中率</div>
              <div className="mt-1 text-xl font-bold text-white">
                {pct(teamStat.fg2m + teamStat.fg3m, teamStat.fg2a + teamStat.fg3a)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-orange-400/20 bg-orange-500/10 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-orange-200">目前場上</h3>
                <span className="text-xs text-orange-100/70">
                  {onCourtPlayers.length} 人
                </span>
              </div>
              <div className="space-y-2">
                {onCourtPlayers.length > 0 ? (
                  onCourtPlayers.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex min-w-8 justify-center rounded-full bg-orange-500/20 px-2 py-1 text-xs font-semibold text-orange-100">
                          #{p.number ?? "-"}
                        </span>
                        <span className="font-medium text-white">{p.name}</span>
                      </div>
                      <span className="text-xs text-white/45">{p.position || "—"}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-black/20 px-3 py-3 text-sm text-white/50">
                    尚無場上名單
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 text-sm font-semibold text-white">先發</h3>
              <div className="space-y-2">
                {starters.length > 0 ? (
                  starters.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex min-w-8 justify-center rounded-full bg-white/10 px-2 py-1 text-xs font-semibold text-white/80">
                          #{p.number ?? "-"}
                        </span>
                        <span className="text-white">{p.name}</span>
                      </div>
                      <span className="text-xs text-white/45">{p.position || "—"}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-black/20 px-3 py-3 text-sm text-white/50">
                    無先發資料
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-3 text-sm font-semibold text-white">板凳</h3>
              <div className="space-y-2">
                {bench.length > 0 ? (
                  bench.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex min-w-8 justify-center rounded-full bg-white/10 px-2 py-1 text-xs font-semibold text-white/80">
                          #{p.number ?? "-"}
                        </span>
                        <span className="text-white">{p.name}</span>
                      </div>
                      <span className="text-xs text-white/45">{p.position || "—"}</span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-black/20 px-3 py-3 text-sm text-white/50">
                    無板凳資料
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/50">
                  <tr>
                    <th className="px-3 py-3 text-left">球員</th>
                    <th className="px-3 py-3 text-center">MIN</th>
                    <th className="px-3 py-3 text-center">PTS</th>
                    <th className="px-3 py-3 text-center">REB</th>
                    <th className="px-3 py-3 text-center">AST</th>
                    <th className="px-3 py-3 text-center">STL</th>
                    <th className="px-3 py-3 text-center">BLK</th>
                    <th className="px-3 py-3 text-center">TOV</th>
                    <th className="px-3 py-3 text-center">PF</th>
                    <th className="px-3 py-3 text-center">2PT</th>
                    <th className="px-3 py-3 text-center">3PT</th>
                    <th className="px-3 py-3 text-center">FT</th>
                  </tr>
                </thead>
                <tbody>
                  {allPlayers.length > 0 ? (
                    allPlayers.map(renderPlayerRow)
                  ) : (
                    <tr>
                      <td
                        colSpan={12}
                        className="px-3 py-10 text-center text-sm text-white/45"
                      >
                        尚無球員資料
                      </td>
                    </tr>
                  )}

                  <tr className="bg-orange-500/10 text-sm font-semibold text-orange-100">
                    <td className="px-3 py-3">團隊總計</td>
                    <td className="px-3 py-3 text-center">—</td>
                    <td className="px-3 py-3 text-center">{teamStat.pts}</td>
                    <td className="px-3 py-3 text-center">{teamStat.reb}</td>
                    <td className="px-3 py-3 text-center">{teamStat.ast}</td>
                    <td className="px-3 py-3 text-center">{teamStat.stl}</td>
                    <td className="px-3 py-3 text-center">{teamStat.blk}</td>
                    <td className="px-3 py-3 text-center">{teamStat.tov}</td>
                    <td className="px-3 py-3 text-center">{teamStat.pf}</td>
                    <td className="px-3 py-3 text-center">
                      {teamStat.fg2m}/{teamStat.fg2a}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {teamStat.fg3m}/{teamStat.fg3a}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {teamStat.ftm}/{teamStat.fta}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="animate-pulse rounded-3xl border border-white/10 bg-white/5 p-8 text-white/60">
            載入資料中...
          </div>
        </div>
      </main>
    );
  }

  if (error || !game) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-8 text-red-200">
            {error || "找不到比賽資料"}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/games"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              ← 返回比賽列表
            </Link>
            <Link
              href={`/games/${gameId}/live`}
              className="rounded-full border border-orange-400/20 bg-orange-500/10 px-4 py-2 text-sm text-orange-200 transition hover:bg-orange-500/20"
            >
              進入直播紀錄
            </Link>
          </div>
          <LogoutButton />
        </div>

        <section className="mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-orange-500/20 via-white/5 to-black/30 backdrop-blur-xl">
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-orange-200/70">
                Home
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">
                {game.teamA || "Team A"}
              </h1>
            </div>

            <div className="text-center">
              <div className="text-xs uppercase tracking-[0.25em] text-white/45">
                Box Board
              </div>
              <div className="mt-2 flex items-end justify-center gap-4">
                <span className="text-5xl font-black text-white md:text-6xl">
                  {scoreA}
                </span>
                <span className="pb-2 text-xl font-bold text-white/35">:</span>
                <span className="text-5xl font-black text-white md:text-6xl">
                  {scoreB}
                </span>
              </div>
              <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/65">
                {game.status || "未設定狀態"}
              </div>
            </div>

            <div className="text-left lg:text-right">
              <div className="text-xs uppercase tracking-[0.22em] text-orange-200/70">
                Away
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">
                {game.teamB || "Team B"}
              </h1>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          {renderTeamSection(
            "teamA",
            game.teamA || "Team A",
            startersA,
            benchA,
            currentOnCourtPlayersA,
            teamAStat
          )}

          {renderTeamSection(
            "teamB",
            game.teamB || "Team B",
            startersB,
            benchB,
            currentOnCourtPlayersB,
            teamBStat
          )}
        </div>
      </div>
    </main>
  );
}