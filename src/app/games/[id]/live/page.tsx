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
    case "oreb":
    case "dreb":
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
      (e) =>
        normalizeTeamSide(e.team_side) === "teamA" &&
        e.quarter === 1 &&
        !!e.player_id
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

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function calcPer10(statValue: number, minutesPlayed: number) {
  if (!minutesPlayed || minutesPlayed <= 0) return 0;
  return round2((statValue / minutesPlayed) * 10);
}

function safeRate(numerator: number, denominator: number) {
  if (!denominator || denominator <= 0) return 0;
  return round2(numerator / denominator);
}

function calcPossessions(params: {
  fg2a: number;
  fg3a: number;
  fta: number;
  tov: number;
  offReb: number;
}) {
  const { fg2a, fg3a, fta, tov, offReb } = params;
  return round2(fg2a + fg3a + 0.44 * fta + tov - offReb);
}

function getShiftPlayedSeconds(
  shift: PlayerShiftRow,
  latestClock: ClockRow | null
) {
  const outSeconds =
    shift.out_seconds_left != null
      ? shift.out_seconds_left
      : latestClock && latestClock.quarter === shift.quarter
      ? latestClock.seconds_left
      : 0;

  return Math.max(0, shift.in_seconds_left - outSeconds);
}

function buildInsightPayload(params: {
  gameId: string;
  ourPts: number;
  oppPts: number;
  teamStat: StatLine;
  playerRows: Array<{
    player_id: string;
    pts: number;
    reb: number;
    ast: number;
    plus_minus: number;
    minutes_played: number;
  }>;
  players: Player[];
}) {
  const { gameId, ourPts, oppPts, teamStat, playerRows, players } = params;

  const topScorer = [...playerRows].sort((a, b) => b.pts - a.pts)[0];
  const topPlus = [...playerRows].sort((a, b) => b.plus_minus - a.plus_minus)[0];
  const topMinutes = [...playerRows].sort(
    (a, b) => b.minutes_played - a.minutes_played
  )[0];

  const getPlayerLabel = (playerId?: string | null) => {
    if (!playerId) return "—";
    const player = players.find((p) => p.id === playerId);
    if (!player) return "—";
    return `#${player.number ?? "-"} ${player.name}`;
  };

  let summary = `比數 ${ourPts} - ${oppPts}`;
  if (ourPts > oppPts) summary = `贏球 ${ourPts} - ${oppPts}`;
  if (ourPts < oppPts) summary = `輸球 ${ourPts} - ${oppPts}`;

  return {
    game_id: gameId,
    summary,
    key_problem_1: teamStat.tov > 0 ? `失誤 ${teamStat.tov} 次` : "失誤偏少",
    key_problem_2: oppPts > ourPts ? `失分 ${oppPts} 分` : "失分控制尚可",
    key_problem_3: teamStat.fta === 0 ? "罰球製造偏少" : `罰球 ${teamStat.fta} 次`,
    positive_1: `得分 ${ourPts} 分`,
    positive_2: topScorer
      ? `${getPlayerLabel(topScorer.player_id)} ${topScorer.pts} 分`
      : null,
    positive_3: topPlus
      ? `${getPlayerLabel(topPlus.player_id)} 正負值 ${
          topPlus.plus_minus >= 0 ? "+" : ""
        }${topPlus.plus_minus}`
      : null,
    focus_1: topMinutes
      ? `${getPlayerLabel(topMinutes.player_id)} ${round2(
          topMinutes.minutes_played
        )} 分鐘`
      : null,
    focus_2: `助攻 ${teamStat.ast} 次`,
    focus_3: `籃板 ${teamStat.reb} 個`,
  };
}

function logFinalizeDebug(label: string, payload?: unknown) {
  console.log(`[finalizeGameStats] ${label}`, payload ?? "");
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

async function handleRebuildThisGame() {
  if (!game?.id) return;
  try {
    await finalizeGameStats(game.id);
    alert("本場資料已補算完成");
  } catch (err: any) {
    alert(err?.message || "補算失敗");
  }
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

  async function backfillGamePlayersFromEvents(currentGameId: string) {
  const { data: latestEvents, error: eventsError } = await supabase
    .from("events")
    .select("id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at")
    .eq("game_id", currentGameId)
    .order("created_at", { ascending: true });

  if (eventsError) {
    throw new Error(`讀取 events 失敗：${eventsError.message}`);
  }

  const validEvents = sortEventsStable(
    ((latestEvents ?? []) as EventRow[]).filter((e) => !e.is_undone)
  );

  const teamASeenIds: string[] = [];
  for (const e of validEvents) {
    const side = normalizeTeamSide(e.team_side);
    if (side !== "teamA") continue;
    if (!e.player_id) continue;
    if (!teamASeenIds.includes(e.player_id)) {
      teamASeenIds.push(e.player_id);
    }
  }

  if (teamASeenIds.length === 0) return;

  const { data: existingRows, error: existingError } = await supabase
    .from("game_players")
    .select("player_id, team_side, is_starter")
    .eq("game_id", currentGameId);

  if (existingError) {
    throw new Error(`讀取 game_players 失敗：${existingError.message}`);
  }

  const existing = (existingRows ?? []) as GamePlayerRow[];
  const existingTeamAIds = new Set(
    existing
      .filter((row) => normalizeTeamSide(row.team_side) === "teamA")
      .map((row) => row.player_id)
  );

  const starterIds = getStarterIdsFallback({
    gamePlayers: existing.map((gp) => ({
      ...gp,
      team_side: normalizeTeamSide(gp.team_side) ?? "teamA",
    })) as GamePlayerRow[],
    validEvents,
  });

  const insertRows = teamASeenIds
    .filter((playerId) => !existingTeamAIds.has(playerId))
    .map((playerId) => ({
      game_id: currentGameId,
      player_id: playerId,
      team_side: "teamA" as const,
      is_starter: starterIds.includes(playerId),
      is_active: true,
    }));

  if (insertRows.length === 0) return;

  const { error: insertError } = await supabase
    .from("game_players")
    .insert(insertRows);

  if (insertError) {
    throw new Error(`回填 game_players 失敗：${insertError.message}`);
  }
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

  await syncDerivedStatsSilently(g.id);
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
      supabase.removeChannel(channel);
    };
  }, [gameId]);

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

  async function buildFinalStatsPayload(currentGameId: string) {
  const [
    { data: latestEvents, error: eventsError },
    { data: latestGamePlayers, error: gamePlayersError },
    { data: latestPlayerShifts, error: playerShiftsError },
    { data: latestClockRows, error: clockError },
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

    supabase
      .from("game_clock")
      .select("game_id, quarter, seconds_left, is_running, updated_at")
      .eq("game_id", currentGameId)
      .order("quarter", { ascending: false })
      .limit(1),
  ]);

  if (eventsError) throw new Error(`讀取 events 失敗：${eventsError.message}`);
  if (gamePlayersError) throw new Error(`讀取 game_players 失敗：${gamePlayersError.message}`);
  if (playerShiftsError) throw new Error(`讀取 player_shifts 失敗：${playerShiftsError.message}`);
  if (clockError) throw new Error(`讀取 game_clock 失敗：${clockError.message}`);

  const latestClock = (latestClockRows?.[0] as ClockRow | undefined) ?? null;
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

  if (currentGamePlayers.length === 0) {
    throw new Error("game_players 為空，無法產生最終統計");
  }

  if (teamAIds.length === 0) {
    throw new Error("teamA 球員名單為空，無法產生最終統計");
  }

  const normalizedValidEvents = valid.map((e) => ({
    ...e,
    team_side: normalizeTeamSide(e.team_side),
  }));

  const starters = getStarterIdsFallback({
    gamePlayers: normalizedGamePlayers,
    validEvents: normalizedValidEvents,
  });

  const plusMinusMap = computePlusMinusMap({
    teamAIds,
    starterIds: starters,
    validEvents: normalizedValidEvents,
  });

  const playerStatMap = new Map<string, StatLine>();
  for (const playerId of teamAIds) {
    playerStatMap.set(playerId, emptyStat());
  }

  const teamStat = emptyStat();
  const oppStat = emptyStat();

  let oppPts = 0;
  let oppTov = 0;
  let offReb = 0;
  let defReb = 0;
  let oppOffReb = 0;
  let oppDefReb = 0;

  for (const rawEvent of valid) {
    const e = {
      ...rawEvent,
      team_side: normalizeTeamSide(rawEvent.team_side),
    };

    if (e.team_side === "teamA") {
      applyEventToStat(teamStat, e.event_type);

      if (e.event_type === "oreb") offReb += 1;
      if (e.event_type === "dreb") defReb += 1;

      if (e.event_type === "tov") oppTov += 0;

      if (e.player_id && playerStatMap.has(e.player_id)) {
        const stat = playerStatMap.get(e.player_id)!;
        applyEventToStat(stat, e.event_type);
      }

      continue;
    }

    if (e.team_side === "teamB") {
      applyEventToStat(oppStat, e.event_type);
      oppPts += getPoints(e.event_type);

      if (e.event_type === "tov") oppTov += 1;
      if (e.event_type === "oreb") oppOffReb += 1;
      if (e.event_type === "dreb") oppDefReb += 1;
    }
  }

  const totalReb =
    offReb + defReb > 0 ? offReb + defReb : teamStat.reb;

  const oppTotalReb =
    oppOffReb + oppDefReb > 0 ? oppOffReb + oppDefReb : oppStat.reb;

  const teamPossessions = calcPossessions({
    fg2a: teamStat.fg2a,
    fg3a: teamStat.fg3a,
    fta: teamStat.fta,
    tov: teamStat.tov,
    offReb,
  });

  const oppPossessions = calcPossessions({
    fg2a: oppStat.fg2a,
    fg3a: oppStat.fg3a,
    fta: oppStat.fta,
    tov: oppTov,
    offReb: oppOffReb,
  });

  const offRating = safeRate(teamStat.pts * 100, teamPossessions);
  const defRating = safeRate(oppPts * 100, oppPossessions);
  const netRating = round2(offRating - defRating);

  const rebRate = safeRate(totalReb, totalReb + oppTotalReb);
  const oppRebRate = safeRate(oppTotalReb, totalReb + oppTotalReb);
  const tovRate = safeRate(teamStat.tov, teamPossessions);
  const oppTovRate = safeRate(oppTov, oppPossessions);

  const playerRows = teamAIds.map((playerId) => {
    const stat = playerStatMap.get(playerId) ?? emptyStat();
    const plusMinus = plusMinusMap[playerId] ?? 0;

    const playerShiftsForGame = currentPlayerShifts.filter(
      (s) => s.player_id === playerId && s.game_id === currentGameId
    );

    const playedSeconds = playerShiftsForGame.reduce(
      (sum, shift) => sum + getShiftPlayedSeconds(shift, latestClock),
      0
    );

    const minutesPlayed = round2(playedSeconds / 60);
    const hasShift = playerShiftsForGame.length > 0;

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
      minutes_played: minutesPlayed,
      pts_per_10_min: calcPer10(stat.pts, minutesPlayed),
      reb_per_10_min: calcPer10(stat.reb, minutesPlayed),
      ast_per_10_min: calcPer10(stat.ast, minutesPlayed),
      stl_per_10_min: calcPer10(stat.stl, minutesPlayed),
      blk_per_10_min: calcPer10(stat.blk, minutesPlayed),
      tov_per_10_min: calcPer10(stat.tov, minutesPlayed),
      scoring_share: safeRate(stat.pts, teamStat.pts),
      reb_share: safeRate(stat.reb, totalReb),
      ast_share: safeRate(stat.ast, teamStat.ast),
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
    team_possessions: teamPossessions,
    opp_possessions: oppPossessions,
    off_rating: offRating,
    def_rating: defRating,
    net_rating: netRating,
    off_reb: offReb,
    def_reb: defReb,
    total_reb: totalReb,
    opp_off_reb: oppOffReb,
    opp_def_reb: oppDefReb,
    opp_total_reb: oppTotalReb,
    reb_rate: rebRate,
    opp_reb_rate: oppRebRate,
    opp_tov: oppTov,
    tov_rate: tovRate,
    opp_tov_rate: oppTovRate,
    result:
      teamStat.pts > oppPts ? "win" : teamStat.pts < oppPts ? "lose" : "draw",
  };

  const insightRow = buildInsightPayload({
    gameId: currentGameId,
    ourPts: teamStat.pts,
    oppPts,
    teamStat,
    playerRows: playerRows.map((row) => ({
      player_id: row.player_id,
      pts: row.pts,
      reb: row.reb,
      ast: row.ast,
      plus_minus: row.plus_minus,
      minutes_played: row.minutes_played,
    })),
    players,
  });

  return {
    playerRows,
    teamRow,
    insightRow,
  };
}

  async function finalizeGameStats(currentGameId: string) {
  logFinalizeDebug("start", { gameId: currentGameId });

  // ✅ 1. 先查這場是不是正式賽
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, is_official")
    .eq("id", currentGameId)
    .single();

  if (gameError || !game) {
    throw new Error("讀取比賽失敗");
  }

  await backfillGamePlayersFromEvents(currentGameId);

  // ✅ 2. 先刪掉舊的統計（超重要）
  await supabase.from("player_game_stats").delete().eq("game_id", currentGameId);
  await supabase.from("team_game_stats").delete().eq("game_id", currentGameId);

  // ✅ 3. 如果不是正式賽 → 直接結束
  if (!game.is_official) {
    logFinalizeDebug("skip non-official game", { gameId: currentGameId });
    return;
  }

  // ✅ 4. 正式賽才繼續算
  const { playerRows, teamRow, insightRow } =
    await buildFinalStatsPayload(currentGameId);

  // ✅ 5. 寫入 player_game_stats
  const { error: playerStatError } = await supabase
    .from("player_game_stats")
    .insert(playerRows);

  if (playerStatError) {
    throw new Error(`寫入 player_game_stats 失敗：${playerStatError.message}`);
  }

  // ✅ 6. 寫入 team_game_stats
  const { error: teamStatError } = await supabase
    .from("team_game_stats")
    .insert(teamRow);

  if (teamStatError) {
    throw new Error(`寫入 team_game_stats 失敗：${teamStatError.message}`);
  }

  // ✅ 7. insight 可以選擇要不要留（不影響主邏輯）
  const { error: insightError } = await supabase
    .from("game_insights")
    .upsert(insightRow, { onConflict: "game_id" });

  if (insightError) {
    throw new Error(`寫入 game_insights 失敗：${insightError.message}`);
  }

  logFinalizeDebug("success", {
    gameId: currentGameId,
    playerRowsCount: playerRows.length,
  });
}

async function syncDerivedStatsSilently(currentGameId: string) {
  try {
    await finalizeGameStats(currentGameId);
  } catch (err) {
    console.error(err);
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
      let pausedClock = clock;

      if (clock) {
        pausedClock = { ...clock, is_running: false };
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

      const { error: gameUpdateError } = await supabase
        .from("games")
        .update({
          status: "finished",
          is_live: false,
        })
        .eq("id", game.id);

      if (gameUpdateError) {
        setError(`結束比賽失敗：${gameUpdateError.message}`);
        return;
      }

      await loadPlayerShifts(game.id);
      await loadEvents(game.id);
      await loadGamePlayers(game.id);

      await finalizeGameStats(game.id);

      setGame((prev) =>
        prev
          ? {
              ...prev,
              status: "finished",
              is_live: false,
            }
          : prev
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "完賽統計失敗";
      setError(message);
      return;
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
      event_type: eventType,
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
    }
    await syncDerivedStatsSilently(game.id);
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
    await syncDerivedStatsSilently(game.id);
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
      }
      await syncDerivedStatsSilently(game.id);
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
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/games"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold hover:bg-white/10"
            >
              返回賽事中心
            </Link>
            <div className="text-sm text-white/70">
              觀看人數：<span className="font-bold text-white">{viewerCount}</span>
            </div>
          </div>
          <LogoutButton />
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.95fr_1fr]">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold tracking-[0.2em] text-white/45">
                  即時記錄
                </div>
                <div className="mt-1 text-2xl font-black">
                  {game?.teamA || "我方"} vs {game?.teamB || "對手"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                <div className="text-xs text-white/50">
                  {getQuarterLabel(clock?.quarter ?? 1)}
                </div>
                <div className="text-3xl font-black">
                  {formatTime(clock?.seconds_left ?? REGULAR_SECONDS)}
                </div>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-emerald-500/10 p-4 text-center">
                <div className="text-sm text-white/60">{game?.teamA || "我方"}</div>
                <div className="text-5xl font-black">{teamScore.scoreA}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-500/10 p-4 text-center">
                <div className="text-sm text-white/60">{game?.teamB || "對手"}</div>
                <div className="text-5xl font-black">{teamScore.scoreB}</div>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              <button onClick={startClock} className={actionBtnClass("score")}>
                開始
              </button>
              <button onClick={pauseClock} className={actionBtnClass("miss")}>
                暫停
              </button>
              <button onClick={resetClock} className={actionBtnClass("ghost")}>
                重設本節
              </button>
              <button onClick={() => adjustClock(-1)} className={actionBtnClass("ghost")}>
                -1 秒
              </button>
              <button onClick={() => adjustClock(1)} className={actionBtnClass("ghost")}>
                +1 秒
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button onClick={nextQuarter} className={actionBtnClass("def")}>
                下一節
              </button>
              <button
                onClick={endGame}
                disabled={endingGame}
                className={actionBtnClass("warn")}
              >
                {endingGame ? "結束中..." : "結束比賽並寫入統計"}
              </button>
            </div>

            <div className="mb-5 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 text-sm font-bold text-white/80">更新我方隊名</div>
              <div className="flex gap-2">
                <input
                  value={editingTeamA}
                  onChange={(e) => setEditingTeamA(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 outline-none placeholder:text-white/25"
                  placeholder="輸入我方隊名"
                />
                <button
                  onClick={saveTeamAName}
                  disabled={savingTeamA}
                  className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15 disabled:opacity-50"
                >
                  {savingTeamA ? "儲存中" : "儲存"}
                </button>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-black">場上球員</div>
              <div className="text-sm text-white/55">
                目前選中：
                <span className="ml-1 font-bold text-white">
                  {selectedPlayer ? `${selectedPlayer.number ?? "-"} ${selectedPlayer.name}` : "未選擇"}
                </span>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              {onCourtPlayers.map((player) => {
                const active = player.id === selectedPlayerId;
                return (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayerId(player.id)}
                    className={`rounded-2xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-emerald-400/40 bg-emerald-500/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="text-xs text-white/50">#{player.number ?? "-"}</div>
                    <div className="text-sm font-black">{player.name}</div>
                    <div className="text-xs text-white/45">{player.position || "未設定位置"}</div>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-3 text-sm font-black text-white/80">我方紀錄</div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => addEvent("fg2_made")} className={actionBtnClass("score")}>
                    2 分進
                  </button>
                  <button onClick={() => addEvent("fg2_miss")} className={actionBtnClass("miss")}>
                    2 分失
                  </button>
                  <button onClick={() => addEvent("fg3_made")} className={actionBtnClass("score")}>
                    3 分進
                  </button>
                  <button onClick={() => addEvent("fg3_miss")} className={actionBtnClass("miss")}>
                    3 分失
                  </button>
                  <button onClick={() => addEvent("ft_made")} className={actionBtnClass("score")}>
                    罰球進
                  </button>
                  <button onClick={() => addEvent("ft_miss")} className={actionBtnClass("miss")}>
                    罰球失
                  </button>
                  <button onClick={() => addEvent("reb")} className={actionBtnClass("def")}>
                    籃板
                  </button>
                  <button onClick={() => addEvent("ast")} className={actionBtnClass("def")}>
                    助攻
                  </button>
                  <button onClick={() => addEvent("stl")} className={actionBtnClass("def")}>
                    抄截
                  </button>
                  <button onClick={() => addEvent("blk")} className={actionBtnClass("def")}>
                    阻攻
                  </button>
                  <button onClick={() => addEvent("tov")} className={actionBtnClass("warn")}>
                    失誤
                  </button>
                  <button onClick={() => addEvent("pf")} className={actionBtnClass("warn")}>
                    犯規
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-3 text-sm font-black text-white/80">對手紀錄</div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => addEvent("fg2_made", "teamB")}
                    className={actionBtnClass("score")}
                  >
                    2 分進
                  </button>
                  <button
                    onClick={() => addEvent("fg2_miss", "teamB")}
                    className={actionBtnClass("miss")}
                  >
                    2 分失
                  </button>
                  <button
                    onClick={() => addEvent("fg3_made", "teamB")}
                    className={actionBtnClass("score")}
                  >
                    3 分進
                  </button>
                  <button
                    onClick={() => addEvent("fg3_miss", "teamB")}
                    className={actionBtnClass("miss")}
                  >
                    3 分失
                  </button>
                  <button
                    onClick={() => addEvent("ft_made", "teamB")}
                    className={actionBtnClass("score")}
                  >
                    罰球進
                  </button>
                  <button
                    onClick={() => addEvent("ft_miss", "teamB")}
                    className={actionBtnClass("miss")}
                  >
                    罰球失
                  </button>
                </div>

                <button
                  onClick={undoLastEvent}
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-3 text-sm font-black hover:bg-white/15"
                >
                  復原上一筆
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 text-lg font-black">換人</div>

            <div className="mb-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 text-sm font-bold text-white/70">下場球員</div>
              <div className="grid grid-cols-2 gap-2">
                {onCourtPlayers.map((player) => {
                  const checked = subOutPlayerIds.includes(player.id);
                  return (
                    <button
                      key={player.id}
                      onClick={() => toggleSubOut(player.id)}
                      className={`rounded-2xl border px-3 py-3 text-left transition ${
                        checked
                          ? "border-rose-400/40 bg-rose-500/15"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div className="text-xs text-white/50">#{player.number ?? "-"}</div>
                      <div className="text-sm font-black">{player.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 text-sm font-bold text-white/70">
                上場球員 {needSubInCount > 0 ? `(還需選 ${needSubInCount} 人)` : ""}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {benchPlayers.map((player) => {
                  const checked = subInPlayerIds.includes(player.id);
                  return (
                    <button
                      key={player.id}
                      onClick={() => toggleSubIn(player.id)}
                      className={`rounded-2xl border px-3 py-3 text-left transition ${
                        checked
                          ? "border-sky-400/40 bg-sky-500/15"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div className="text-xs text-white/50">#{player.number ?? "-"}</div>
                      <div className="text-sm font-black">{player.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={clearSubSelection} className={actionBtnClass("ghost")}>
                清除選擇
              </button>
              <button
                onClick={makeSubstitution}
                disabled={submittingSub}
                className={actionBtnClass("def")}
              >
                {submittingSub ? "換人中..." : "確認換人"}
              </button>
            </div>

            <button onClick={handleRebuildThisGame}>
              補算本場資料
            </button>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 text-sm font-black text-white/75">本節比分</div>
              <div className="flex items-center justify-between text-sm">
                <span>{game?.teamA || "我方"}</span>
                <span className="font-black">{recentQuarterScore?.home ?? 0}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span>{game?.teamB || "對手"}</span>
                <span className="font-black">{recentQuarterScore?.away ?? 0}</span>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 text-lg font-black">比賽摘要</div>

            <div className="mb-4 overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-white/60">
                  <tr>
                    <th className="px-3 py-2 text-left">節次</th>
                    <th className="px-3 py-2 text-right">{game?.teamA || "我方"}</th>
                    <th className="px-3 py-2 text-right">{game?.teamB || "對手"}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(quarterScores).map(([quarter, score]) => (
                    <tr key={quarter} className="border-t border-white/10">
                      <td className="px-3 py-2">{getQuarterLabel(Number(quarter))}</td>
                      <td className="px-3 py-2 text-right font-bold">{score.home}</td>
                      <td className="px-3 py-2 text-right font-bold">{score.away}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-3 text-sm font-black text-white/75">事件紀錄</div>
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {validEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/45">
                  尚未有紀錄
                </div>
              ) : (
                [...validEvents].reverse().map((e) => {
                  const player = players.find((p) => p.id === e.player_id);
                  const teamSide = normalizeTeamSide(e.team_side);
                  const labelMap: Record<string, string> = {
                    fg2_made: "2 分進",
                    fg2_miss: "2 分失",
                    fg3_made: "3 分進",
                    fg3_miss: "3 分失",
                    ft_made: "罰球進",
                    ft_miss: "罰球失",
                    reb: "籃板",
                    ast: "助攻",
                    stl: "抄截",
                    blk: "阻攻",
                    tov: "失誤",
                    pf: "犯規",
                    sub_in: "上場",
                    sub_out: "下場",
                  };

                  return (
                    <div
                      key={e.id}
                      className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-black">
                            {labelMap[e.event_type] || e.event_type}
                          </div>
                          <div className="truncate text-xs text-white/50">
                            {teamSide === "teamA" ? game?.teamA || "我方" : game?.teamB || "對手"}
                            {player ? `・#${player.number ?? "-"} ${shortName(player.name)}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs text-white/45">
                          {getQuarterLabel(e.quarter)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}