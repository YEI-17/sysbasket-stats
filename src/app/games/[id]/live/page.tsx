"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

type TeamSideValue = "teamA" | "teamB" | "A" | "B" | null;

type Player = {
  id: string;
  name: string;
  number: number | null;
  position?: string | null;
  active?: boolean;
};

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  status?: string | null;
  is_live?: boolean | null;
};

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  team_side?: TeamSideValue;
  is_undone?: boolean;
  undone_at?: string | null;
};

type ClockRow = {
  game_id: string;
  quarter: number;
  seconds_left: number;
  is_running: boolean;
  updated_at?: string;
};

type GamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "teamA" | "teamB";
  is_starter: boolean;
};

type StatLine = {
  gp: number;
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
  plusMinus: number;
};

type PlayerShiftRow = {
  id: string;
  game_id: string;
  player_id: string;
  quarter: number;
  team_side: "teamA" | "teamB";
  in_seconds_left: number;
  out_seconds_left: number | null;
};

const REGULAR_SECONDS = 600;
const OT_SECONDS = 300;

function emptyStat(): StatLine {
  return {
    gp: 0,
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
    plusMinus: 0,
  };
}

function normalizeTeamSide(value?: string | null): "teamA" | "teamB" | null {
  if (!value) return null;
  if (value === "teamA" || value === "A") return "teamA";
  if (value === "teamB" || value === "B") return "teamB";
  return null;
}

function applyEventToStat(stat: StatLine, eventType: string) {
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

function formatTime(total: number) {
  const s = Math.max(0, total || 0);
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function getPoints(eventType: string) {
  if (eventType === "fg2_made") return 2;
  if (eventType === "fg3_made") return 3;
  if (eventType === "ft_made") return 1;
  return 0;
}

function isScoringEvent(eventType: string) {
  return (
    eventType === "fg2_made" ||
    eventType === "fg3_made" ||
    eventType === "ft_made"
  );
}

function getQuarterLabel(quarter: number) {
  if (quarter <= 4) return `Q${quarter}`;
  return `OT${quarter - 4}`;
}

function getQuarterSeconds(quarter: number) {
  return quarter <= 4 ? REGULAR_SECONDS : OT_SECONDS;
}

function buildQuarterRange(maxQuarter: number) {
  return Array.from({ length: Math.max(1, maxQuarter) }, (_, i) => i + 1);
}

function sortByNumber(players: Player[]) {
  return [...players].sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
}

function shortName(name: string) {
  if (!name) return "";
  return name.length <= 3 ? name : name.slice(-2);
}

function actionBtnClass(tone: "score" | "miss" | "def" | "warn" | "ghost") {
  const base =
    "rounded-2xl px-2 py-2.5 text-center text-[13px] font-black text-white transition active:scale-[0.985] disabled:opacity-50";

  if (tone === "score") {
    return `${base} border border-emerald-400/20 bg-emerald-600/90 hover:bg-emerald-500 shadow-[0_8px_20px_rgba(16,185,129,0.20)]`;
  }

  if (tone === "miss") {
    return `${base} border border-white/10 bg-slate-700/90 hover:bg-slate-600`;
  }

  if (tone === "def") {
    return `${base} border border-sky-400/20 bg-sky-700/90 hover:bg-sky-600 shadow-[0_8px_20px_rgba(14,165,233,0.16)]`;
  }

  if (tone === "warn") {
    return `${base} border border-rose-400/20 bg-rose-700/90 hover:bg-rose-600 shadow-[0_8px_20px_rgba(225,29,72,0.16)]`;
  }

  return `${base} border border-white/10 bg-white/10 hover:bg-white/15`;
}

function getTimestampMs(value?: string | null) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function sortEventsStable(events: EventRow[]) {
  return [...events].sort((a, b) => {
    if (a.quarter !== b.quarter) return a.quarter - b.quarter;

    const timeDiff = getTimestampMs(a.created_at) - getTimestampMs(b.created_at);
    if (timeDiff !== 0) return timeDiff;

    const getPriority = (eventType: string) => {
      if (eventType === "sub_out") return 0;
      if (eventType === "sub_in") return 1;
      return 2;
    };

    const priorityDiff = getPriority(a.event_type) - getPriority(b.event_type);
    if (priorityDiff !== 0) return priorityDiff;

    return a.id.localeCompare(b.id);
  });
}

function getStarterIdsFallback(params: {
  gamePlayers: GamePlayerRow[];
  validEvents: EventRow[];
}) {
  const { gamePlayers, validEvents } = params;

  const starterFromDb = gamePlayers
    .filter((gp) => normalizeTeamSide(gp.team_side) === "teamA" && gp.is_starter)
    .map((gp) => gp.player_id)
    .slice(0, 5);

  if (starterFromDb.length > 0) return starterFromDb;

  const q1TeamAEvents = sortEventsStable(
    validEvents.filter(
      (e) => normalizeTeamSide(e.team_side) === "teamA" && e.quarter === 1 && !!e.player_id
    )
  );

  const subInIds: string[] = [];
  for (const e of q1TeamAEvents) {
    if (
      e.event_type === "sub_in" &&
      e.player_id &&
      !subInIds.includes(e.player_id)
    ) {
      subInIds.push(e.player_id);
    }
    if (subInIds.length >= 5) break;
  }

  if (subInIds.length > 0) return subInIds.slice(0, 5);

  const seenIds: string[] = [];
  for (const e of q1TeamAEvents) {
    if (e.player_id && !seenIds.includes(e.player_id)) {
      seenIds.push(e.player_id);
    }
    if (seenIds.length >= 5) break;
  }

  return seenIds.slice(0, 5);
}

function computePlusMinusMap(params: {
  teamAIds: string[];
  starterIds: string[];
  validEvents: EventRow[];
}) {
  const { teamAIds, starterIds, validEvents } = params;

  const teamAIdSet = new Set(teamAIds);
  const plusMinusMap: Record<string, number> = {};

  for (const id of teamAIds) {
    plusMinusMap[id] = 0;
  }

  const lineup = new Set(starterIds.filter((id) => teamAIdSet.has(id)));
  const sorted = sortEventsStable(validEvents);

  for (const e of sorted) {
    const normalizedSide = normalizeTeamSide(e.team_side);

    if (isScoringEvent(e.event_type)) {
      const pts = getPoints(e.event_type);

      if (pts > 0) {
        if (normalizedSide === "teamA") {
          for (const playerId of lineup) {
            plusMinusMap[playerId] = (plusMinusMap[playerId] ?? 0) + pts;
          }
        } else if (normalizedSide === "teamB") {
          for (const playerId of lineup) {
            plusMinusMap[playerId] = (plusMinusMap[playerId] ?? 0) - pts;
          }
        }
      }
    }

    if (normalizedSide !== "teamA") continue;
    if (!e.player_id) continue;
    if (!teamAIdSet.has(e.player_id)) continue;

    if (e.event_type === "sub_out") {
      lineup.delete(e.player_id);
    } else if (e.event_type === "sub_in") {
      lineup.add(e.player_id);
    }
  }

  return plusMinusMap;
}

function didPlayerAppear(stat: StatLine, plusMinus: number, hasShift: boolean) {
  return (
    stat.pts > 0 ||
    stat.fg2m > 0 ||
    stat.fg2a > 0 ||
    stat.fg3m > 0 ||
    stat.fg3a > 0 ||
    stat.ftm > 0 ||
    stat.fta > 0 ||
    stat.reb > 0 ||
    stat.ast > 0 ||
    stat.stl > 0 ||
    stat.blk > 0 ||
    stat.tov > 0 ||
    stat.pf > 0 ||
    plusMinus !== 0 ||
    hasShift
  );
}

function logSyncDebug(label: string, payload?: unknown) {
  console.log(`[syncAggregateStats] ${label}`, payload ?? "");
}

export default function LiveGamePage() {
  const params = useParams();
  const gameId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clock, setClock] = useState<ClockRow | null>(null);
  const [playerShifts, setPlayerShifts] = useState<PlayerShiftRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);

  const [viewerCount, setViewerCount] = useState(1);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  const [editingTeamA, setEditingTeamA] = useState("");
  const [savingTeamA, setSavingTeamA] = useState(false);
  const [endingGame, setEndingGame] = useState(false);

  const [subOutPlayerIds, setSubOutPlayerIds] = useState<string[]>([]);
  const [subInPlayerIds, setSubInPlayerIds] = useState<string[]>([]);
  const [submittingSub, setSubmittingSub] = useState(false);

  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceKeyRef = useRef(`viewer-${Math.random().toString(36).slice(2)}`);
  const autoQuarterAdvanceLockRef = useRef(false);
  const syncingStatsRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const aggregateSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cooldownRef = useRef<Record<string, number>>({});
  const eventsReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gamePlayersReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerShiftsReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function inCooldown(key: string, ms: number) {
    const now = Date.now();
    const last = cooldownRef.current[key] ?? 0;
    if (now - last < ms) return true;
    cooldownRef.current[key] = now;
    return false;
  }

  function scheduleReload(
    ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    fn: () => Promise<void>,
    delay = 80
  ) {
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => {
      void fn();
    }, delay);
  }

  function scheduleAggregateSync(delay = 180) {
    if (!game?.id) return;

    if (aggregateSyncTimerRef.current) {
      clearTimeout(aggregateSyncTimerRef.current);
    }

    aggregateSyncTimerRef.current = setTimeout(() => {
      void syncAggregateStats();
    }, delay);
  }

  async function loadCurrentGame() {
    if (!gameId) return null;

    setError("");

    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, status, is_live")
      .eq("id", gameId)
      .single();

    if (error) {
      setError(`讀取目前比賽失敗：${error.message}`);
      return null;
    }

    setGame(data);
    setEditingTeamA(data.teamA ?? "");
    return data;
  }

  async function loadPlayerShifts(targetGameId: string) {
    const { data, error } = await supabase
      .from("player_shifts")
      .select(
        "id, game_id, player_id, quarter, team_side, in_seconds_left, out_seconds_left"
      )
      .eq("game_id", targetGameId)
      .order("quarter", { ascending: true });

    if (error) {
      setError((prev) => prev || `讀取上場時間失敗：${error.message}`);
      return;
    }

    setPlayerShifts((data ?? []) as PlayerShiftRow[]);
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, number, position, active")
      .eq("active", true)
      .order("number", { ascending: true });

    if (error) {
      setError((prev) => prev || `讀取球員失敗：${error.message}`);
      return;
    }

    const list = data ?? [];
    setPlayers(list);

    if (list.length > 0 && !selectedPlayerId) {
      setSelectedPlayerId(list[0].id);
    }
  }

  async function loadGamePlayers(targetGameId: string) {
    const { data, error } = await supabase
      .from("game_players")
      .select("id, game_id, player_id, team_side, is_starter")
      .eq("game_id", targetGameId);

    if (error) {
      setError((prev) => prev || `讀取上場名單失敗：${error.message}`);
      return;
    }

    setGamePlayers((data ?? []) as GamePlayerRow[]);
  }

  async function loadEvents(targetGameId: string) {
    const { data, error } = await supabase
      .from("events")
      .select(
        "id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at"
      )
      .eq("game_id", targetGameId)
      .order("created_at", { ascending: true });

    if (error) {
      setError((prev) => prev || `讀取事件失敗：${error.message}`);
      return;
    }

    setEvents((data ?? []) as EventRow[]);
  }

  async function loadClock(targetGameId: string) {
    const { data, error } = await supabase
      .from("game_clock")
      .select("game_id, quarter, seconds_left, is_running, updated_at")
      .eq("game_id", targetGameId)
      .order("quarter", { ascending: false })
      .limit(1);

    if (error) {
      setError((prev) => prev || `讀取比賽時間失敗：${error.message}`);
      return;
    }

    let currentClock = data?.[0] ?? null;

    if (!currentClock) {
      const { data: inserted, error: insertError } = await supabase
        .from("game_clock")
        .insert({
          game_id: targetGameId,
          quarter: 1,
          seconds_left: REGULAR_SECONDS,
          is_running: false,
        })
        .select("game_id, quarter, seconds_left, is_running, updated_at")
        .single();

      if (insertError) {
        setError((prev) => prev || `建立比賽時間失敗：${insertError.message}`);
        return;
      }

      currentClock = inserted;
    }

    setClock(currentClock);
  }

  async function ensureStarterShiftsForCurrentQuarter(
    targetGameId: string,
    targetQuarter: number,
    starterPlayerIds: string[]
  ) {
    if (!starterPlayerIds.length) return;

    const { data: existing, error: existingError } = await supabase
      .from("player_shifts")
      .select("player_id")
      .eq("game_id", targetGameId)
      .eq("team_side", "teamA")
      .eq("quarter", targetQuarter)
      .in("player_id", starterPlayerIds);

    if (existingError) {
      setError((prev) => prev || `檢查先發上場時間失敗：${existingError.message}`);
      return;
    }

    const existingIds = new Set(
      (existing ?? []).map((row: { player_id: string }) => row.player_id)
    );
    const missingIds = starterPlayerIds.filter((id) => !existingIds.has(id));

    if (!missingIds.length) return;

    const rows = missingIds.map((playerId) => ({
      game_id: targetGameId,
      player_id: playerId,
      team_side: "teamA",
      quarter: targetQuarter,
      in_seconds_left: getQuarterSeconds(targetQuarter),
      out_seconds_left: null,
    }));

    const { error: insertError } = await supabase.from("player_shifts").insert(rows);

    if (insertError) {
      setError((prev) => prev || `建立先發上場時間失敗：${insertError.message}`);
    }
  }

  async function init() {
    if (!gameId) return;

    setLoading(true);
    setError("");

    await loadPlayers();
    const g = await loadCurrentGame();

    if (g) {
      await Promise.all([
        loadEvents(g.id),
        loadClock(g.id),
        loadGamePlayers(g.id),
        loadPlayerShifts(g.id),
      ]);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!gameId) return;
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    const channel = supabase.channel(`live-room-${gameId}`, {
      config: {
        presence: { key: presenceKeyRef.current },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        setViewerCount(count || 1);
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          scheduleReload(eventsReloadTimerRef, async () => {
            await loadEvents(gameId);
            scheduleAggregateSync(220);
          }, 80);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_clock",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          scheduleReload(clockReloadTimerRef, () => loadClock(gameId), 80);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        async () => {
          scheduleReload(gameReloadTimerRef, async () => {
            await loadCurrentGame();
          }, 80);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_players",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          scheduleReload(gamePlayersReloadTimerRef, async () => {
            await loadGamePlayers(gameId);
            scheduleAggregateSync(220);
          }, 80);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_shifts",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          scheduleReload(playerShiftsReloadTimerRef, async () => {
            await loadPlayerShifts(gameId);
            scheduleAggregateSync(220);
          }, 80);
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            online_at: new Date().toISOString(),
            page: "live",
            gameId,
          });
        }
      });

    return () => {
      if (eventsReloadTimerRef.current) clearTimeout(eventsReloadTimerRef.current);
      if (clockReloadTimerRef.current) clearTimeout(clockReloadTimerRef.current);
      if (gameReloadTimerRef.current) clearTimeout(gameReloadTimerRef.current);
      if (gamePlayersReloadTimerRef.current) clearTimeout(gamePlayersReloadTimerRef.current);
      if (playerShiftsReloadTimerRef.current) clearTimeout(playerShiftsReloadTimerRef.current);
      if (aggregateSyncTimerRef.current) clearTimeout(aggregateSyncTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [gameId, game?.id]);

  useEffect(() => {
    if (!clock?.is_running || !game) {
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
      return;
    }

    if (tickerRef.current) clearInterval(tickerRef.current);

    tickerRef.current = setInterval(() => {
      setClock((prev) => {
        if (!prev) return prev;

        const nextSeconds = Math.max(0, prev.seconds_left - 1);
        const nextClock: ClockRow = {
          ...prev,
          seconds_left: nextSeconds,
          is_running: nextSeconds > 0,
        };

        void persistClock(nextClock);
        return nextClock;
      });
    }, 1000);

    return () => {
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    };
  }, [clock?.is_running, game]);

  async function persistClock(next: ClockRow) {
    const { error } = await supabase.from("game_clock").upsert(
      {
        game_id: next.game_id,
        quarter: next.quarter,
        seconds_left: next.seconds_left,
        is_running: next.is_running,
      },
      { onConflict: "game_id,quarter" }
    );

    if (error) {
      setError(`更新比賽時間失敗：${error.message}`);
    }
  }

  const validEvents = useMemo(() => {
    return sortEventsStable(events.filter((e) => !e.is_undone));
  }, [events]);

  const teamScore = useMemo(() => {
    let scoreA = 0;
    let scoreB = 0;

    for (const e of validEvents) {
      const pts = getPoints(e.event_type);
      const normalizedSide = normalizeTeamSide(e.team_side);
      if (normalizedSide === "teamA") scoreA += pts;
      if (normalizedSide === "teamB") scoreB += pts;
    }

    return { scoreA, scoreB };
  }, [validEvents]);

  const teamAPlayerIds = useMemo(() => {
    return gamePlayers
      .filter((gp) => normalizeTeamSide(gp.team_side) === "teamA")
      .map((gp) => gp.player_id);
  }, [gamePlayers]);

  const teamAPlayers = useMemo(() => {
    return sortByNumber(players.filter((p) => teamAPlayerIds.includes(p.id)));
  }, [players, teamAPlayerIds]);

  const starterIds = useMemo(() => {
    return getStarterIdsFallback({
      gamePlayers,
      validEvents,
    });
  }, [gamePlayers, validEvents]);

  const currentOnCourtIds = useMemo(() => {
    const lineup = new Set<string>(starterIds.slice(0, 5));
    const sortedEvents = sortEventsStable(validEvents);

    for (const e of sortedEvents) {
      if (normalizeTeamSide(e.team_side) !== "teamA") continue;
      if (!e.player_id) continue;

      if (e.event_type === "sub_out") {
        lineup.delete(e.player_id);
        continue;
      }

      if (e.event_type === "sub_in") {
        if (lineup.size < 5) {
          lineup.add(e.player_id);
        }
      }
    }

    return Array.from(lineup).slice(0, 5);
  }, [starterIds, validEvents]);

  async function syncAggregateStats() {
    if (!game?.id) return;

    if (syncingStatsRef.current) {
      pendingSyncRef.current = true;
      return;
    }

    syncingStatsRef.current = true;

    try {
      do {
        pendingSyncRef.current = false;

        const currentGameId = game.id;

        logSyncDebug("start", {
          gameId: currentGameId,
        });

        const [
          { data: latestEvents, error: eventsError },
          { data: latestGamePlayers, error: gamePlayersError },
          { data: latestPlayerShifts, error: playerShiftsError },
        ] = await Promise.all([
          supabase
            .from("events")
            .select(
              "id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at"
            )
            .eq("game_id", currentGameId)
            .order("created_at", { ascending: true }),
          supabase
            .from("game_players")
            .select("id, game_id, player_id, team_side, is_starter")
            .eq("game_id", currentGameId),
          supabase
            .from("player_shifts")
            .select(
              "id, game_id, player_id, quarter, team_side, in_seconds_left, out_seconds_left"
            )
            .eq("game_id", currentGameId),
        ]);

        if (eventsError) {
          logSyncDebug("read events failed", eventsError);
          setError(`同步球員數據失敗：讀取 events 失敗：${eventsError.message}`);
          return;
        }

        if (gamePlayersError) {
          logSyncDebug("read game_players failed", gamePlayersError);
          setError(`同步球員數據失敗：讀取 game_players 失敗：${gamePlayersError.message}`);
          return;
        }

        if (playerShiftsError) {
          logSyncDebug("read player_shifts failed", playerShiftsError);
          setError(`同步球員數據失敗：讀取 player_shifts 失敗：${playerShiftsError.message}`);
          return;
        }

        const valid = sortEventsStable((latestEvents ?? []).filter((e) => !e.is_undone));
        const currentGamePlayers = (latestGamePlayers ?? []) as GamePlayerRow[];
        const currentPlayerShifts = (latestPlayerShifts ?? []) as PlayerShiftRow[];

        const normalizedGamePlayers = currentGamePlayers.map((gp) => ({
          ...gp,
          team_side: normalizeTeamSide(gp.team_side) ?? "teamA",
        })) as GamePlayerRow[];

        const teamAIds = normalizedGamePlayers
          .filter((gp) => gp.team_side === "teamA")
          .map((gp) => gp.player_id);

        logSyncDebug("snapshot", {
          totalEvents: latestEvents?.length ?? 0,
          validEvents: valid.length,
          totalGamePlayers: currentGamePlayers.length,
          teamAIds,
          totalPlayerShifts: currentPlayerShifts.length,
        });

        if (currentGamePlayers.length === 0) {
          logSyncDebug("skip because game_players empty");
          scheduleAggregateSync(350);
          return;
        }

        if (teamAIds.length === 0) {
          logSyncDebug("skip because teamAIds empty", currentGamePlayers);
          scheduleAggregateSync(350);
          return;
        }

        const starters = getStarterIdsFallback({
          gamePlayers: normalizedGamePlayers,
          validEvents: valid.map((e) => ({
            ...e,
            team_side: normalizeTeamSide(e.team_side),
          })),
        });

        const plusMinusMap = computePlusMinusMap({
          teamAIds,
          starterIds: starters,
          validEvents: valid.map((e) => ({
            ...e,
            team_side: normalizeTeamSide(e.team_side),
          })),
        });

        const playerStatMap = new Map<string, StatLine>();

        for (const playerId of teamAIds) {
          playerStatMap.set(playerId, emptyStat());
        }

        const teamStat = emptyStat();
        let oppPts = 0;

        for (const rawEvent of valid) {
          const e = {
            ...rawEvent,
            team_side: normalizeTeamSide(rawEvent.team_side),
          };

          if (e.team_side === "teamA") {
            applyEventToStat(teamStat, e.event_type);

            if (!e.player_id) continue;

            if (!playerStatMap.has(e.player_id)) {
              logSyncDebug("event player_id not in roster", {
                eventId: e.id,
                eventType: e.event_type,
                playerId: e.player_id,
              });
              continue;
            }

            const stat = playerStatMap.get(e.player_id)!;
            applyEventToStat(stat, e.event_type);
            continue;
          }

          if (e.team_side === "teamB") {
            oppPts += getPoints(e.event_type);
          }
        }

        const playerRows = teamAIds.map((playerId) => {
          const stat = playerStatMap.get(playerId) ?? emptyStat();
          const plusMinus = plusMinusMap[playerId] ?? 0;
          const hasShift = currentPlayerShifts.some(
            (s) => s.player_id === playerId && s.game_id === currentGameId
          );

          return {
            game_id: currentGameId,
            player_id: playerId,
            team_side: "teamA",
            gp: didPlayerAppear(stat, plusMinus, hasShift) ? 1 : 0,
            pts: stat.pts,
            fg2m: stat.fg2m,
            fg2a: stat.fg2a,
            fg3m: stat.fg3m,
            fg3a: stat.fg3a,
            ftm: stat.ftm,
            fta: stat.fta,
            reb: stat.reb,
            ast: stat.ast,
            stl: stat.stl,
            blk: stat.blk,
            tov: stat.tov,
            pf: stat.pf,
            plus_minus: plusMinus,
          };
        });

        const teamRow = {
          game_id: currentGameId,
          team_side: "teamA",
          pts: teamStat.pts,
          fg2m: teamStat.fg2m,
          fg2a: teamStat.fg2a,
          fg3m: teamStat.fg3m,
          fg3a: teamStat.fg3a,
          ftm: teamStat.ftm,
          fta: teamStat.fta,
          reb: teamStat.reb,
          ast: teamStat.ast,
          stl: teamStat.stl,
          blk: teamStat.blk,
          tov: teamStat.tov,
          pf: teamStat.pf,
          opp_pts: oppPts,
        };

        logSyncDebug("rows ready", {
          playerRowsCount: playerRows.length,
          teamRow,
        });

        const { error: playerStatError } = await supabase
          .from("player_game_stats")
          .upsert(playerRows, { onConflict: "game_id,player_id" });

        if (playerStatError) {
          logSyncDebug("player_game_stats upsert failed", playerStatError);
          setError(`同步球員數據失敗：${playerStatError.message}`);
          return;
        }

        const { error: teamStatError } = await supabase
          .from("team_game_stats")
          .upsert(teamRow, { onConflict: "game_id,team_side" });

        if (teamStatError) {
          logSyncDebug("team_game_stats upsert failed", teamStatError);
          setError(`同步團隊數據失敗：${teamStatError.message}`);
          return;
        }

        logSyncDebug("success", {
          gameId: currentGameId,
          teamPts: teamStat.pts,
          oppPts,
        });
      } while (pendingSyncRef.current);
    } finally {
      syncingStatsRef.current = false;
    }
  }

  async function startClock() {
    if (!clock || game?.status === "finished") return;
    if (inCooldown("clock:start", 120)) return;

    const next = { ...clock, is_running: true };
    setClock(next);
    await persistClock(next);
  }

  async function pauseClock() {
    if (!clock) return;
    if (inCooldown("clock:pause", 120)) return;

    const next = { ...clock, is_running: false };
    setClock(next);
    await persistClock(next);
  }

  async function resetClock() {
    if (!clock) return;
    if (inCooldown("clock:reset", 150)) return;

    const nextSeconds = getQuarterSeconds(clock.quarter);
    const next = { ...clock, seconds_left: nextSeconds, is_running: false };
    setClock(next);
    await persistClock(next);
  }

  async function adjustClock(delta: number) {
    if (!clock) return;
    if (inCooldown(`clock:adjust:${delta}`, 80)) return;

    const maxSeconds = getQuarterSeconds(clock.quarter);
    const next = {
      ...clock,
      seconds_left: Math.max(0, Math.min(maxSeconds, clock.seconds_left + delta)),
    };
    setClock(next);
    await persistClock(next);
  }

  async function advanceQuarter(fromClock: ClockRow, onCourtIds: string[]) {
    if (!game) return false;

    if (onCourtIds.length > 0) {
      const { error: closeShiftError } = await supabase
        .from("player_shifts")
        .update({ out_seconds_left: 0 })
        .eq("game_id", game.id)
        .eq("team_side", "teamA")
        .eq("quarter", fromClock.quarter)
        .is("out_seconds_left", null)
        .in("player_id", onCourtIds);

      if (closeShiftError) {
        setError(`換節收尾失敗：${closeShiftError.message}`);
        return false;
      }
    }

    const nextQuarterNum = fromClock.quarter + 1;
    const nextQuarterSeconds = getQuarterSeconds(nextQuarterNum);

    if (onCourtIds.length > 0) {
      const { data: existingOpen, error: existingOpenError } = await supabase
        .from("player_shifts")
        .select("player_id")
        .eq("game_id", game.id)
        .eq("team_side", "teamA")
        .eq("quarter", nextQuarterNum)
        .is("out_seconds_left", null)
        .in("player_id", onCourtIds);

      if (existingOpenError) {
        setError(`檢查下一節上場時間失敗：${existingOpenError.message}`);
        return false;
      }

      const existingIds = new Set(
        (existingOpen ?? []).map((row: { player_id: string }) => row.player_id)
      );

      const rows = onCourtIds
        .filter((playerId) => !existingIds.has(playerId))
        .map((playerId) => ({
          game_id: game.id,
          player_id: playerId,
          team_side: "teamA",
          quarter: nextQuarterNum,
          in_seconds_left: nextQuarterSeconds,
          out_seconds_left: null,
        }));

      if (rows.length > 0) {
        const { error: createShiftError } = await supabase
          .from("player_shifts")
          .insert(rows);

        if (createShiftError) {
          setError(`建立下一節上場時間失敗：${createShiftError.message}`);
          return false;
        }
      }
    }

    const next: ClockRow = {
      game_id: game.id,
      quarter: nextQuarterNum,
      seconds_left: nextQuarterSeconds,
      is_running: false,
    };

    setClock(next);
    await persistClock(next);
    return true;
  }

  async function nextQuarter() {
    if (!clock || !game) return;
    if (inCooldown("clock:nextQuarter", 180)) return;
    if (game.status === "finished") return;

    await advanceQuarter(clock, currentOnCourtIds);
  }

  async function endGame() {
    if (!game || endingGame) return;
    if (inCooldown("game:end", 300)) return;

    setEndingGame(true);
    setError("");

    try {
      if (clock) {
        const pausedClock = { ...clock, is_running: false };
        setClock(pausedClock);
        await persistClock(pausedClock);

        if (currentOnCourtIds.length > 0) {
          const { error: closeShiftError } = await supabase
            .from("player_shifts")
            .update({
              out_seconds_left: pausedClock.seconds_left,
            })
            .eq("game_id", game.id)
            .eq("team_side", "teamA")
            .eq("quarter", pausedClock.quarter)
            .is("out_seconds_left", null)
            .in("player_id", currentOnCourtIds);

          if (closeShiftError) {
            setError(`結束比賽收尾失敗：${closeShiftError.message}`);
            return;
          }
        }
      }

      const { error } = await supabase
        .from("games")
        .update({
          status: "finished",
          is_live: false,
        })
        .eq("id", game.id);

      if (error) {
        setError(`結束比賽失敗：${error.message}`);
        return;
      }

      setGame((prev) =>
        prev
          ? {
              ...prev,
              status: "finished",
              is_live: false,
            }
          : prev
      );

      scheduleAggregateSync(250);
    } finally {
      setEndingGame(false);
    }
  }

  async function saveTeamAName() {
    if (!game) return;
    if (inCooldown("teamA:save", 250)) return;

    const trimmed = editingTeamA.trim();
    if (!trimmed) {
      setError("我方隊名不能是空白");
      return;
    }

    setSavingTeamA(true);
    setError("");

    const { error } = await supabase
      .from("games")
      .update({ teamA: trimmed })
      .eq("id", game.id);

    setSavingTeamA(false);

    if (error) {
      setError(`更新隊名失敗：${error.message}`);
      return;
    }

    setGame((prev) => (prev ? { ...prev, teamA: trimmed } : prev));
  }

  async function addEvent(eventType: string, teamSide: "teamA" | "teamB" = "teamA") {
    if (!game || !clock) return;
    if (inCooldown(`event:${eventType}:${teamSide}`, 120)) return;

    if (game.status === "finished") {
      setError("比賽已結束，不能再新增紀錄");
      return;
    }

    const payload: {
      game_id: string;
      player_id?: string | null;
      quarter: number;
      event_type: string;
      team_side: "teamA" | "teamB";
    } = {
      game_id: game.id,
      quarter: clock.quarter,
      event_type:eventType,
      team_side: teamSide,
    };

    if (teamSide === "teamA") {
      if (!selectedPlayerId) {
        setError("請先點選場上球員");
        return;
      }
      payload.player_id = selectedPlayerId;
    } else {
      payload.player_id = null;
    }

    setError("");

    const { data, error } = await supabase
      .from("events")
      .insert(payload)
      .select(
        "id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at"
      )
      .single();

    if (error) {
      setError(`新增事件失敗：${error.message}`);
      return;
    }

    if (data) {
      const nextEvents = sortEventsStable([
        ...events.filter((e) => e.id !== data.id),
        data,
      ]);

      setEvents(nextEvents);
      scheduleAggregateSync(220);
    }
  }

  async function undoLastEvent() {
    if (!game) return;
    if (inCooldown("undo", 180)) return;

    const validEventsDesc = [...events]
      .filter((e) => !e.is_undone)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

    const last = validEventsDesc[0];
    if (!last) return;

    const undoneAt = new Date().toISOString();

    const { error } = await supabase
      .from("events")
      .update({
        is_undone: true,
        undone_at: undoneAt,
      })
      .eq("id", last.id);

    if (error) {
      setError(`復原失敗：${error.message}`);
      return;
    }

    const nextEvents = events.map((e) =>
      e.id === last.id
        ? {
            ...e,
            is_undone: true,
            undone_at: undoneAt,
          }
        : e
    );

    setEvents(nextEvents);
    scheduleAggregateSync(220);
  }

  useEffect(() => {
    async function handleQuarterEndAuto() {
      if (!clock || !game || game.status === "finished") return;

      const isEndOfRegularQ1toQ3 = clock.quarter < 4;
      const isTieGame = teamScore.scoreA === teamScore.scoreB;
      const shouldAdvance = isEndOfRegularQ1toQ3 || isTieGame;

      if (!shouldAdvance) {
        const pausedClock = {
          ...clock,
          seconds_left: 0,
          is_running: false,
        };
        setClock(pausedClock);
        await persistClock(pausedClock);
        return;
      }

      await advanceQuarter(
        {
          ...clock,
          seconds_left: 0,
          is_running: false,
        },
        currentOnCourtIds
      );
    }

    if (!clock || !game || game.status === "finished") return;

    if (clock.seconds_left === 0 && !clock.is_running) {
      if (autoQuarterAdvanceLockRef.current) return;
      autoQuarterAdvanceLockRef.current = true;
      void handleQuarterEndAuto();
      return;
    }

    autoQuarterAdvanceLockRef.current = false;
  }, [clock, game, teamScore, currentOnCourtIds]);

  const onCourtPlayers = useMemo(() => {
    return sortByNumber(
      teamAPlayers.filter((p) => currentOnCourtIds.includes(p.id))
    ).slice(0, 5);
  }, [teamAPlayers, currentOnCourtIds]);

  const benchPlayers = useMemo(() => {
    return sortByNumber(teamAPlayers.filter((p) => !currentOnCourtIds.includes(p.id)));
  }, [teamAPlayers, currentOnCourtIds]);

  useEffect(() => {
    if (!selectedPlayerId && onCourtPlayers.length > 0) {
      setSelectedPlayerId(onCourtPlayers[0].id);
      return;
    }

    if (
      selectedPlayerId &&
      !onCourtPlayers.some((p) => p.id === selectedPlayerId) &&
      onCourtPlayers.length > 0
    ) {
      setSelectedPlayerId(onCourtPlayers[0].id);
    }
  }, [selectedPlayerId, onCourtPlayers]);

  useEffect(() => {
    setSubOutPlayerIds((prev) =>
      prev.filter((id) => onCourtPlayers.some((p) => p.id === id))
    );
  }, [onCourtPlayers]);

  useEffect(() => {
    setSubInPlayerIds((prev) => {
      const validBenchIds = prev.filter((id) => benchPlayers.some((p) => p.id === id));
      return validBenchIds.slice(0, subOutPlayerIds.length);
    });
  }, [benchPlayers, subOutPlayerIds.length]);

  useEffect(() => {
    if (!gameId || !gamePlayers.length || !starterIds.length) return;
    if (!clock) return;

    void ensureStarterShiftsForCurrentQuarter(gameId, 1, starterIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, starterIds.join(","), clock?.quarter]);

  useEffect(() => {
    if (!game || !gamePlayers.length) return;
    scheduleAggregateSync(260);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, game?.id, gamePlayers, playerShifts]);

  const selectedPlayer = useMemo(
    () => players.find((p) => p.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId]
  );

  function toggleSubOut(playerId: string) {
    setSubOutPlayerIds((prev) => {
      const exists = prev.includes(playerId);
      const next = exists ? prev.filter((id) => id !== playerId) : [...prev, playerId];

      setSubInPlayerIds((prevIn) => prevIn.slice(0, next.length));
      return next;
    });
  }

  function toggleSubIn(playerId: string) {
    setSubInPlayerIds((prev) => {
      const exists = prev.includes(playerId);

      if (exists) return prev.filter((id) => id !== playerId);

      if (subOutPlayerIds.length === 0) {
        setError("請先選擇下場球員");
        return prev;
      }

      if (prev.length >= subOutPlayerIds.length) {
        return prev;
      }

      return [...prev, playerId];
    });
  }

  function clearSubSelection() {
    setSubOutPlayerIds([]);
    setSubInPlayerIds([]);
  }

  async function makeSubstitution() {
    if (!game || !clock) return;
    if (inCooldown("substitution", 180)) return;

    if (game.status === "finished") {
      setError("比賽已結束，不能換人");
      return;
    }

    if (subOutPlayerIds.length === 0) {
      setError("請先選擇下場球員");
      return;
    }

    if (subOutPlayerIds.length !== subInPlayerIds.length) {
      setError(`已選 ${subOutPlayerIds.length} 名下場，需選 ${subOutPlayerIds.length} 名上場`);
      return;
    }

    const duplicated = subInPlayerIds.some((id) => subOutPlayerIds.includes(id));
    if (duplicated) {
      setError("上場與下場名單不可重複");
      return;
    }

    setSubmittingSub(true);
    setError("");

    try {
      const payload = [
        ...subOutPlayerIds.map((playerId) => ({
          game_id: game.id,
          player_id: playerId,
          quarter: clock.quarter,
          event_type: "sub_out",
          team_side: "teamA" as const,
        })),
        ...subInPlayerIds.map((playerId) => ({
          game_id: game.id,
          player_id: playerId,
          quarter: clock.quarter,
          event_type: "sub_in",
          team_side: "teamA" as const,
        })),
      ];

      const { data, error } = await supabase
        .from("events")
        .insert(payload)
        .select(
          "id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at"
        );

      if (error) {
        setError(`換人失敗：${error.message}`);
        return;
      }

      for (const playerId of subOutPlayerIds) {
        const { error: shiftOutError } = await supabase
          .from("player_shifts")
          .update({
            out_seconds_left: clock.seconds_left,
          })
          .eq("game_id", game.id)
          .eq("player_id", playerId)
          .eq("quarter", clock.quarter)
          .eq("team_side", "teamA")
          .is("out_seconds_left", null);

        if (shiftOutError) {
          setError(`更新下場時間失敗：${shiftOutError.message}`);
          return;
        }
      }

      if (subInPlayerIds.length > 0) {
        const { data: existingOpen, error: existingOpenError } = await supabase
          .from("player_shifts")
          .select("player_id")
          .eq("game_id", game.id)
          .eq("quarter", clock.quarter)
          .eq("team_side", "teamA")
          .is("out_seconds_left", null)
          .in("player_id", subInPlayerIds);

        if (existingOpenError) {
          setError(`檢查上場時間失敗：${existingOpenError.message}`);
          return;
        }

        const existingIds = new Set(
          (existingOpen ?? []).map((row: { player_id: string }) => row.player_id)
        );

        const shiftInRows = subInPlayerIds
          .filter((playerId) => !existingIds.has(playerId))
          .map((playerId) => ({
            game_id: game.id,
            player_id: playerId,
            team_side: "teamA",
            quarter: clock.quarter,
            in_seconds_left: clock.seconds_left,
            out_seconds_left: null,
          }));

        if (shiftInRows.length > 0) {
          const { error: shiftInError } = await supabase
            .from("player_shifts")
            .insert(shiftInRows);

          if (shiftInError) {
            setError(`新增上場時間失敗：${shiftInError.message}`);
            return;
          }
        }
      }

      if (subOutPlayerIds.includes(selectedPlayerId)) {
        setSelectedPlayerId(subInPlayerIds[0] || "");
      }

      clearSubSelection();

      if (data?.length) {
        const existingIds = new Set(events.map((e) => e.id));
        const nextItems = data.filter((e) => !existingIds.has(e.id));
        const nextEvents = sortEventsStable([...events, ...nextItems]);

        setEvents(nextEvents);
        scheduleAggregateSync(220);
      }
    } finally {
      setSubmittingSub(false);
    }
  }

  const quarterScores = useMemo(() => {
    const maxQuarter = Math.max(clock?.quarter ?? 1, ...validEvents.map((e) => e.quarter), 1);
    const result: Record<number, { home: number; away: number }> = {};

    for (const q of buildQuarterRange(maxQuarter)) {
      result[q] = { home: 0, away: 0 };
    }

    for (const e of validEvents) {
      if (!result[e.quarter]) result[e.quarter] = { home: 0, away: 0 };
      const pts = getPoints(e.event_type);
      const normalizedSide = normalizeTeamSide(e.team_side);
      if (normalizedSide === "teamA") result[e.quarter].home += pts;
      if (normalizedSide === "teamB") result[e.quarter].away += pts;
    }

    return result;
  }, [validEvents, clock?.quarter]);

  const needSubInCount = Math.max(0, subOutPlayerIds.length - subInPlayerIds.length);
  const recentQuarterScore = quarterScores[clock?.quarter ?? 1];

  if (loading) {
    return <div className="p-6 text-white">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-[#030303] text-white">
      <div className="mx-auto max-w-[1800px] p-2 md:p-3">
        <div className="flex min-h-[calc(100vh-16px)] flex-col gap-2 md:gap-3">
          <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(255,255,255,0.03)_42%,rgba(255,255,255,0.02)_100%)] px-3 py-2.5 shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-black md:text-2xl">
                  {game?.teamA || "我方"} <span className="text-white/50">vs</span>{" "}
                  {game?.teamB || "對手"}
                </div>

                <div className="mt-1 flex flex-wrap gap-1.5">
                  <div
                    className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                      game?.status === "finished"
                        ? "bg-red-500/15 text-red-300"
                        : clock?.is_running
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-yellow-500/15 text-yellow-300"
                    }`}
                  >
                    {game?.status === "finished"
                      ? "比賽已結束"
                      : clock?.is_running
                      ? "計時中"
                      : "暫停中"}
                  </div>

                  <div className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-black text-white/80">
                    {getQuarterLabel(clock?.quarter ?? 1)}
                  </div>

                  <div className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-black text-white/80">
                    觀看 {viewerCount}
                  </div>

                  {recentQuarterScore && (
                    <div className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-black text-white/80">
                      本節 {recentQuarterScore.home}:{recentQuarterScore.away}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/games/${gameId}/board`}
                  className="rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-black transition hover:bg-indigo-500"
                >
                  數據頁
                </Link>
                <LogoutButton />
              </div>
            </div>

            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[20px] border border-white/10 bg-black/35 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm text-white/55">主隊</div>
                <div className="truncate text-lg font-black md:text-2xl">
                  {game?.teamA || "我方"}
                </div>
              </div>

              <div className="text-center">
                <div className="text-[10px] font-black text-white/60">
                  {getQuarterLabel(clock?.quarter ?? 1)}
                </div>
                <div className="mt-0.5 text-[38px] font-black leading-none tracking-[0.06em] md:text-[52px]">
                  {formatTime(clock?.seconds_left ?? REGULAR_SECONDS)}
                </div>
                <div className="mt-1 text-[11px] text-white/55">
                  {teamScore.scoreA} : {teamScore.scoreB}
                </div>
              </div>

              <div className="min-w-0 text-right">
                <div className="truncate text-sm text-white/55">客隊</div>
                <div className="truncate text-lg font-black md:text-2xl">
                  {game?.teamB || "對手"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid flex-1 gap-2 md:gap-3 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="flex flex-col gap-2 md:gap-3">
              <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.07),rgba(255,255,255,0.03)_42%,rgba(255,255,255,0.02)_100%)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-black">快速紀錄</div>
                    <div className="text-[11px] text-white/45">常用事件集中在主區</div>
                  </div>

                  <button
                    onClick={undoLastEvent}
                    className="rounded-xl bg-red-500/20 px-3 py-2 text-xs font-bold text-red-300"
                  >
                    復原上一筆
                  </button>
                </div>

                <div className="mb-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5">
                  <div className="text-[11px] text-white/45">目前紀錄球員</div>
                  <div className="mt-1 text-base font-black text-emerald-200 md:text-lg">
                    {selectedPlayer
                      ? `#${selectedPlayer.number ?? "-"} ${selectedPlayer.name}`
                      : "未選球員"}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => addEvent("fg2_made", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("score")}
                  >
                    2分進
                  </button>
                  <button
                    onClick={() => addEvent("fg2_miss", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("miss")}
                  >
                    2分不進
                  </button>
                  <button
                    onClick={() => addEvent("reb", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("ghost")}
                  >
                    籃板
                  </button>

                  <button
                    onClick={() => addEvent("fg3_made", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("score")}
                  >
                    3分進
                  </button>
                  <button
                    onClick={() => addEvent("fg3_miss", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("miss")}
                  >
                    3分不進
                  </button>
                  <button
                    onClick={() => addEvent("ast", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("def")}
                  >
                    助攻
                  </button>

                  <button
                    onClick={() => addEvent("ft_made", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("score")}
                  >
                    罰進
                  </button>
                  <button
                    onClick={() => addEvent("ft_miss", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("miss")}
                  >
                    罰球不進
                  </button>
                  <button
                    onClick={() => addEvent("stl", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("def")}
                  >
                    抄截
                  </button>

                  <button
                    onClick={() => addEvent("blk", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("def")}
                  >
                    阻攻
                  </button>
                  <button
                    onClick={() => addEvent("pf", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("warn")}
                  >
                    犯規
                  </button>
                  <button
                    onClick={() => addEvent("tov", "teamA")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("warn")}
                  >
                    失誤
                  </button>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr]">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
                      對手快速加分
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => addEvent("ft_made", "teamB")}
                        disabled={game?.status === "finished"}
                        className={actionBtnClass("ghost")}
                      >
                        對手 +1
                      </button>
                      <button
                        onClick={() => addEvent("fg2_made", "teamB")}
                        disabled={game?.status === "finished"}
                        className={actionBtnClass("ghost")}
                      >
                        對手 +2
                      </button>
                      <button
                        onClick={() => addEvent("fg3_made", "teamB")}
                        disabled={game?.status === "finished"}
                        className={actionBtnClass("ghost")}
                      >
                        對手 +3
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
                      本場各節比分
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(quarterScores)
                        .map(Number)
                        .sort((a, b) => a - b)
                        .map((q) => (
                          <div
                            key={q}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/75"
                          >
                            {getQuarterLabel(q)} {quarterScores[q].home}:{quarterScores[q].away}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.07),rgba(255,255,255,0.03)_42%,rgba(255,255,255,0.02)_100%)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
                <div className="mb-2 text-sm font-black">比賽控制</div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={startClock}
                    disabled={game?.status === "finished"}
                    className="rounded-2xl bg-emerald-600 px-3 py-2.5 text-sm font-black hover:bg-emerald-500 disabled:opacity-50"
                  >
                    開始
                  </button>
                  <button
                    onClick={pauseClock}
                    className="rounded-2xl bg-amber-500 px-3 py-2.5 text-sm font-black text-white hover:bg-amber-400"
                  >
                    暫停
                  </button>
                  <button
                    onClick={nextQuarter}
                    disabled={game?.status === "finished"}
                    className="rounded-2xl bg-blue-600 px-3 py-2.5 text-sm font-black hover:bg-blue-500 disabled:opacity-50"
                  >
                    下一節
                  </button>

                  <button
                    onClick={() => adjustClock(-10)}
                    className="rounded-2xl bg-white/10 px-3 py-2.5 text-sm font-black hover:bg-white/15"
                  >
                    -10秒
                  </button>
                  <button
                    onClick={() => adjustClock(-1)}
                    className="rounded-2xl bg-white/10 px-3 py-2.5 text-sm font-black hover:bg-white/15"
                  >
                    -1秒
                  </button>
                  <button
                    onClick={() => adjustClock(1)}
                    className="rounded-2xl bg-white/10 px-3 py-2.5 text-sm font-black hover:bg-white/15"
                  >
                    +1秒
                  </button>

                  <button
                    onClick={() => adjustClock(10)}
                    className="rounded-2xl bg-white/10 px-3 py-2.5 text-sm font-black hover:bg-white/15"
                  >
                    +10秒
                  </button>
                  <button
                    onClick={resetClock}
                    className="rounded-2xl bg-red-600 px-3 py-2.5 text-sm font-black hover:bg-red-500"
                  >
                    重設本節
                  </button>
                  <button
                    onClick={endGame}
                    disabled={endingGame || game?.status === "finished"}
                    className="rounded-2xl bg-rose-700 px-3 py-2.5 text-sm font-black hover:bg-rose-600 disabled:opacity-50"
                  >
                    {game?.status === "finished"
                      ? "已結束"
                      : endingGame
                      ? "結束中..."
                      : "結束比賽"}
                  </button>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={editingTeamA}
                    onChange={(e) => setEditingTeamA(e.target.value)}
                    placeholder="輸入我方隊名"
                    className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-2.5 text-sm outline-none transition focus:border-blue-400/50"
                  />
                  <button
                    onClick={saveTeamAName}
                    disabled={savingTeamA}
                    className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black hover:bg-blue-500 disabled:opacity-60"
                  >
                    {savingTeamA ? "儲存中..." : "更新隊名"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:gap-3">
              <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.07),rgba(255,255,255,0.03)_42%,rgba(255,255,255,0.02)_100%)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
                <div className="mb-2 text-sm font-black">場上五人</div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {onCourtPlayers.map((p) => {
                    const selected = selectedPlayerId === p.id;
                    const selectedOut = subOutPlayerIds.includes(p.id);

                    return (
                      <div
                        key={p.id}
                        className={`rounded-2xl border p-2 transition ${
                          selectedOut
                            ? "border-orange-400 bg-orange-500/15"
                            : selected
                            ? "border-emerald-300 bg-emerald-500/15 shadow-[0_0_18px_rgba(52,211,153,0.14)]"
                            : "border-white/10 bg-white/[0.04]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedPlayerId(p.id)}
                          className="w-full text-left"
                        >
                          <div className="text-lg font-black leading-none">#{p.number ?? "-"}</div>
                          <div className="mt-1 truncate text-sm font-semibold">{p.name}</div>
                          <div className="mt-0.5 text-[10px] font-bold text-cyan-300/80">
                            {p.position || "未設定"}
                          </div>
                          <div className="mt-1 text-[10px] font-bold text-white/45">
                            {selectedOut ? "已選下場" : selected ? "目前紀錄" : shortName(p.name)}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleSubOut(p.id)}
                          className={`mt-2 w-full rounded-xl px-2 py-1.5 text-xs font-black ${
                            selectedOut ? "bg-orange-500 text-white" : "bg-white/10 text-white/80"
                          }`}
                        >
                          {selectedOut ? "取消下場" : "選下場"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.07),rgba(255,255,255,0.03)_42%,rgba(255,255,255,0.02)_100%)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-black">換人區</div>
                  <div className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-black text-white/80">
                    還需 {needSubInCount} 人
                  </div>
                </div>

                {benchPlayers.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/50">
                    沒有場下球員
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {benchPlayers.map((p) => {
                      const selectedIn = subInPlayerIds.includes(p.id);
                      const selectable =
                        subOutPlayerIds.length > 0 &&
                        (selectedIn || subInPlayerIds.length < subOutPlayerIds.length);

                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleSubIn(p.id)}
                          disabled={!selectable}
                          className={`rounded-2xl border p-2 text-left transition ${
                            selectedIn
                              ? "border-sky-300 bg-sky-500/18 shadow-[0_0_18px_rgba(56,189,248,0.14)]"
                              : selectable
                              ? "border-white/10 bg-white/[0.04]"
                              : "border-white/10 bg-white/[0.04] opacity-45"
                          }`}
                        >
                          <div className="text-lg font-black leading-none">#{p.number ?? "-"}</div>
                          <div className="mt-1 truncate text-sm font-semibold">{p.name}</div>
                          <div className="mt-0.5 text-[10px] font-bold text-cyan-300/80">
                            {p.position || "未設定"}
                          </div>
                          <div className="mt-1 text-[10px] font-bold text-white/45">
                            {selectedIn ? "已選上場" : selectable ? "可上場" : "待命"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={clearSubSelection}
                    className="rounded-2xl bg-white/10 px-3 py-2.5 text-sm font-black hover:bg-white/15"
                  >
                    清除換人
                  </button>
                  <button
                    onClick={makeSubstitution}
                    disabled={
                      submittingSub ||
                      game?.status === "finished" ||
                      subOutPlayerIds.length === 0 ||
                      subOutPlayerIds.length !== subInPlayerIds.length
                    }
                    className="rounded-2xl bg-sky-600 px-3 py-2.5 text-sm font-black hover:bg-sky-500 disabled:opacity-50"
                  >
                    {submittingSub ? "換人中..." : "確認換人"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}