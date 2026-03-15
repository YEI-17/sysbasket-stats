"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

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
};

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  team_side?: "A" | "B" | null;
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
  team_side: "A" | "B";
  is_starter: boolean;
};

const REGULAR_SECONDS = 600;
const OT_SECONDS = 300;

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

export default function LiveGamePage() {
  const params = useParams();
  const gameId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clock, setClock] = useState<ClockRow | null>(null);
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

  const cooldownRef = useRef<Record<string, number>>({});
  const eventsReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gamePlayersReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      .select("id, teamA, teamB, status")
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

    setEvents(data ?? []);
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

  async function init() {
    if (!gameId) return;

    setLoading(true);
    setError("");

    await loadPlayers();
    const g = await loadCurrentGame();

    if (g) {
      await Promise.all([loadEvents(g.id), loadClock(g.id), loadGamePlayers(g.id)]);
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
          scheduleReload(eventsReloadTimerRef, () => loadEvents(gameId), 80);
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
          scheduleReload(gamePlayersReloadTimerRef, () => loadGamePlayers(gameId), 80);
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
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  useEffect(() => {
    if (!clock?.is_running) {
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
        if (prev.seconds_left <= 0) {
          return { ...prev, is_running: false, seconds_left: 0 };
        }
        return { ...prev, seconds_left: prev.seconds_left - 1 };
      });
    }, 1000);

    return () => {
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    };
  }, [clock?.is_running]);

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

  async function nextQuarter() {
    if (!clock || !game) return;
    if (inCooldown("clock:nextQuarter", 180)) return;

    const nextQuarterNum = clock.quarter + 1;
    const next: ClockRow = {
      game_id: game.id,
      quarter: nextQuarterNum,
      seconds_left: getQuarterSeconds(nextQuarterNum),
      is_running: false,
    };

    setClock(next);
    await persistClock(next);
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
      }

      const { error } = await supabase
        .from("games")
        .update({ status: "finished" })
        .eq("id", game.id);

      if (error) {
        setError(`結束比賽失敗：${error.message}`);
        return;
      }

      setGame((prev) => (prev ? { ...prev, status: "finished" } : prev));
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

  async function addEvent(eventType: string, teamSide: "A" | "B" = "A") {
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
      team_side: "A" | "B";
    } = {
      game_id: game.id,
      quarter: clock.quarter,
      event_type: eventType,
      team_side: teamSide,
    };

    if (teamSide === "A") {
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
      setEvents((prev) => {
        if (prev.some((e) => e.id === data.id)) return prev;
        return [...prev, data];
      });
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

    setEvents((prev) =>
      prev.map((e) =>
        e.id === last.id
          ? {
              ...e,
              is_undone: true,
              undone_at: undoneAt,
            }
          : e
      )
    );
  }

  const validEvents = useMemo(() => {
    return events.filter((e) => !e.is_undone);
  }, [events]);

  const teamAPlayerIds = useMemo(() => {
    const ids = gamePlayers
      .filter((gp) => gp.team_side === "A")
      .map((gp) => gp.player_id);

    if (ids.length > 0) return ids;
    return players.map((p) => p.id);
  }, [gamePlayers, players]);

  const teamAPlayers = useMemo(() => {
    return sortByNumber(players.filter((p) => teamAPlayerIds.includes(p.id)));
  }, [players, teamAPlayerIds]);

  const starterIds = useMemo(() => {
    const starterFromDb = gamePlayers
      .filter((gp) => gp.team_side === "A" && gp.is_starter)
      .map((gp) => gp.player_id);

    if (starterFromDb.length > 0) return starterFromDb;
    return teamAPlayers.slice(0, 5).map((p) => p.id);
  }, [gamePlayers, teamAPlayers]);

  const currentOnCourtIds = useMemo(() => {
    const lineup = new Set<string>(starterIds);

    for (const e of validEvents) {
      if (e.team_side !== "A") continue;
      if (!e.player_id) continue;

      if (e.event_type === "sub_in") lineup.add(e.player_id);
      if (e.event_type === "sub_out") lineup.delete(e.player_id);
    }

    return Array.from(lineup);
  }, [starterIds, validEvents]);

  const onCourtPlayers = useMemo(() => {
    return sortByNumber(teamAPlayers.filter((p) => currentOnCourtIds.includes(p.id))).slice(0, 5);
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

    const payload = [
      ...subOutPlayerIds.map((playerId) => ({
        game_id: game.id,
        player_id: playerId,
        quarter: clock.quarter,
        event_type: "sub_out",
        team_side: "A" as const,
      })),
      ...subInPlayerIds.map((playerId) => ({
        game_id: game.id,
        player_id: playerId,
        quarter: clock.quarter,
        event_type: "sub_in",
        team_side: "A" as const,
      })),
    ];

    const { data, error } = await supabase
      .from("events")
      .insert(payload)
      .select(
        "id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at"
      );

    setSubmittingSub(false);

    if (error) {
      setError(`換人失敗：${error.message}`);
      return;
    }

    if (subOutPlayerIds.includes(selectedPlayerId)) {
      setSelectedPlayerId(subInPlayerIds[0] || "");
    }

    clearSubSelection();

    if (data?.length) {
      setEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const nextItems = data.filter((e) => !existingIds.has(e.id));
        return [...prev, ...nextItems];
      });
    }
  }

  const teamScore = useMemo(() => {
    let scoreA = 0;
    let scoreB = 0;

    for (const e of validEvents) {
      const pts = getPoints(e.event_type);
      if (e.team_side === "A") scoreA += pts;
      if (e.team_side === "B") scoreB += pts;
    }

    return { scoreA, scoreB };
  }, [validEvents]);

  const quarterScores = useMemo(() => {
    const maxQuarter = Math.max(clock?.quarter ?? 1, ...validEvents.map((e) => e.quarter), 1);
    const result: Record<number, { home: number; away: number }> = {};

    for (const q of buildQuarterRange(maxQuarter)) {
      result[q] = { home: 0, away: 0 };
    }

    for (const e of validEvents) {
      if (!result[e.quarter]) result[e.quarter] = { home: 0, away: 0 };
      const pts = getPoints(e.event_type);
      if (e.team_side === "A") result[e.quarter].home += pts;
      if (e.team_side === "B") result[e.quarter].away += pts;
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
          {/* 上方：精簡控制列 */}
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
                  href={`/games/${gameId}/box`}
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


                    {/* 主內容 */}
          <div className="grid flex-1 gap-2 md:gap-3 lg:grid-cols-[1.08fr_0.92fr]">
            {/* 左：快速紀錄 + 比賽控制 */}
            <div className="flex flex-col gap-2 md:gap-3">
              <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.07),rgba(255,255,255,0.03)_42%,rgba(255,255,255,0.02)_100%)] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-black">快速紀錄</div>
                    <div className="text-[11px] text-white/45">
                      常用事件集中在主區
                    </div>
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
                    onClick={() => addEvent("fg2_made", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("score")}
                  >
                    2分進
                  </button>
                  <button
                    onClick={() => addEvent("fg2_miss", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("miss")}
                  >
                    2分鐵
                  </button>
                  <button
                    onClick={() => addEvent("reb", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("ghost")}
                  >
                    籃板
                  </button>

                  <button
                    onClick={() => addEvent("fg3_made", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("score")}
                  >
                    3分進
                  </button>
                  <button
                    onClick={() => addEvent("fg3_miss", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("miss")}
                  >
                    3分鐵
                  </button>
                  <button
                    onClick={() => addEvent("ast", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("def")}
                  >
                    助攻
                  </button>

                  <button
                    onClick={() => addEvent("ft_made", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("score")}
                  >
                    罰進
                  </button>
                  <button
                    onClick={() => addEvent("ft_miss", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("miss")}
                  >
                    罰鐵
                  </button>
                  <button
                    onClick={() => addEvent("pf", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("warn")}
                  >
                    犯規
                  </button>

                  <button
                    onClick={() => addEvent("stl", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("def")}
                  >
                    抄截
                  </button>
                  <button
                    onClick={() => addEvent("blk", "A")}
                    disabled={game?.status === "finished"}
                    className={actionBtnClass("def")}
                  >
                    阻攻
                  </button>
                  <button
                    onClick={() => addEvent("tov", "A")}
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
                        onClick={() => addEvent("ft_made", "B")}
                        disabled={game?.status === "finished"}
                        className={actionBtnClass("ghost")}
                      >
                        對手 +1
                      </button>
                      <button
                        onClick={() => addEvent("fg2_made", "B")}
                        disabled={game?.status === "finished"}
                        className={actionBtnClass("ghost")}
                      >
                        對手 +2
                      </button>
                      <button
                        onClick={() => addEvent("fg3_made", "B")}
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

            {/* 右：球員 / 換人 */}
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