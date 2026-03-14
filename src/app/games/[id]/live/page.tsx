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

  const tickerRef = useRef<NodeJS.Timeout | null>(null);
  const presenceKeyRef = useRef(`viewer-${Math.random().toString(36).slice(2)}`);

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
    init();
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
          await loadEvents(gameId);
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
          await loadClock(gameId);
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
          await loadCurrentGame();
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
          await loadGamePlayers(gameId);
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
    const next = { ...clock, is_running: true };
    setClock(next);
    await persistClock(next);
  }

  async function pauseClock() {
    if (!clock) return;
    const next = { ...clock, is_running: false };
    setClock(next);
    await persistClock(next);
  }

  async function resetClock() {
    if (!clock) return;
    const nextSeconds = getQuarterSeconds(clock.quarter);
    const next = { ...clock, seconds_left: nextSeconds, is_running: false };
    setClock(next);
    await persistClock(next);
  }

  async function adjustClock(delta: number) {
    if (!clock) return;
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

    const { error } = await supabase.from("events").insert(payload);

    if (error) {
      setError(`新增事件失敗：${error.message}`);
      return;
    }

    await loadEvents(game.id);
  }

  async function undoLastEvent() {
    if (!game) return;

    const validEvents = [...events]
      .filter((e) => !e.is_undone)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

    const last = validEvents[0];
    if (!last) return;

    const { error } = await supabase
      .from("events")
      .update({
        is_undone: true,
        undone_at: new Date().toISOString(),
      })
      .eq("id", last.id);

    if (error) {
      setError(`復原失敗：${error.message}`);
      return;
    }

    await loadEvents(game.id);
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
    return sortByNumber(teamAPlayers.filter((p) => currentOnCourtIds.includes(p.id)));
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
      let next = exists ? prev.filter((id) => id !== playerId) : [...prev, playerId];

      setSubInPlayerIds((prevIn) => prevIn.slice(0, next.length));

      return next;
    });
  }

  function toggleSubIn(playerId: string) {
    setSubInPlayerIds((prev) => {
      const exists = prev.includes(playerId);

      if (exists) {
        return prev.filter((id) => id !== playerId);
      }

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

    const { error } = await supabase.from("events").insert(payload);

    setSubmittingSub(false);

    if (error) {
      setError(`換人失敗：${error.message}`);
      return;
    }

    if (subOutPlayerIds.includes(selectedPlayerId)) {
      setSelectedPlayerId(subInPlayerIds[0] || "");
    }

    clearSubSelection();
    await loadEvents(game.id);
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
      if (!result[e.quarter]) {
        result[e.quarter] = { home: 0, away: 0 };
      }

      const pts = getPoints(e.event_type);
      if (e.team_side === "A") result[e.quarter].home += pts;
      if (e.team_side === "B") result[e.quarter].away += pts;
    }

    return result;
  }, [validEvents, clock?.quarter]);

  const needSubInCount = Math.max(0, subOutPlayerIds.length - subInPlayerIds.length);

  if (loading) {
    return <div className="p-6 text-white">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-950 p-2 text-white md:p-4">
      <div className="mx-auto max-w-7xl space-y-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-3 md:p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-white/50">目前比賽</div>
              <h1 className="truncate text-xl font-extrabold md:text-3xl">
                {game?.teamA || "我方"} vs {game?.teamB || "對手"}
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/games/${gameId}/box`}
                className="rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-semibold md:text-sm"
              >
                數據頁
              </Link>
              <LogoutButton />
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={editingTeamA}
              onChange={(e) => setEditingTeamA(e.target.value)}
              placeholder="輸入我方隊名"
              className="flex-1 rounded-2xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none"
            />
            <button
              onClick={saveTeamAName}
              disabled={savingTeamA}
              className="rounded-2xl bg-blue-600 px-4 py-3 font-semibold disabled:opacity-60"
            >
              {savingTeamA ? "儲存中..." : "更新我方隊名"}
            </button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/30 p-3 md:p-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="min-w-0 text-center md:text-left">
                <div className="text-[11px] text-white/50 md:text-sm">主隊</div>
                <div className="truncate text-lg font-bold md:text-3xl">
                  {game?.teamA || "我方"}
                </div>
                <div className="mt-1 text-4xl font-extrabold leading-none md:mt-2 md:text-7xl">
                  {teamScore.scoreA}
                </div>
              </div>

              <div className="text-center">
                <div className="text-lg font-bold md:text-2xl">
                  {getQuarterLabel(clock?.quarter ?? 1)}
                </div>
                <div className="mt-1 text-4xl font-extrabold tracking-wider md:mt-2 md:text-6xl">
                  {formatTime(clock?.seconds_left ?? REGULAR_SECONDS)}
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-1 md:gap-2">
                  <div className="rounded-full bg-white/10 px-2 py-1 text-[10px] md:px-4 md:py-2 md:text-sm">
                    觀看 {viewerCount}
                  </div>
                  <div
                    className={`rounded-full px-2 py-1 text-[10px] font-bold md:px-4 md:py-2 md:text-sm ${
                      game?.status === "finished"
                        ? "bg-red-500/20 text-red-300"
                        : clock?.is_running
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-yellow-500/20 text-yellow-300"
                    }`}
                  >
                    {game?.status === "finished"
                      ? "比賽已結束"
                      : clock?.is_running
                      ? "計時中"
                      : "暫停中"}
                  </div>
                </div>
              </div>

              <div className="min-w-0 text-center md:text-right">
                <div className="text-[11px] text-white/50 md:text-sm">客隊</div>
                <div className="truncate text-lg font-bold md:text-3xl">
                  {game?.teamB || "對手"}
                </div>
                <div className="mt-1 text-4xl font-extrabold leading-none md:mt-2 md:text-7xl">
                  {teamScore.scoreB}
                </div>
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {Object.keys(quarterScores)
                .map(Number)
                .sort((a, b) => a - b)
                .map((q) => (
                  <div
                    key={q}
                    className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] md:px-3 md:py-2 md:text-sm"
                  >
                    {getQuarterLabel(q)} {quarterScores[q].home}:{quarterScores[q].away}
                  </div>
                ))}
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-3">
              <div className="mb-3">
                <div className="text-sm font-semibold">場上五人 / 快速換人</div>
                <div className="text-[11px] text-white/50">
                  點球員卡片選紀錄球員，右上角小按鈕勾選下場
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="mb-2 text-[11px] font-semibold text-emerald-300/80">
                    場上球員
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    {onCourtPlayers.slice(0, 5).map((p) => {
                      const selected = selectedPlayerId === p.id;
                      const selectedOut = subOutPlayerIds.includes(p.id);

                      return (
                        <div
                          key={p.id}
                          className={`relative rounded-2xl border p-2 transition ${
                            selectedOut
                              ? "border-orange-400 bg-orange-500/15"
                              : selected
                              ? "border-emerald-300 bg-emerald-500/20 shadow-[0_0_18px_rgba(52,211,153,0.28)]"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedPlayerId(p.id)}
                            className="w-full rounded-xl px-1 py-3 text-center"
                          >
                            <div className="text-lg font-extrabold leading-none">
                              #{p.number ?? "-"}
                            </div>
                            <div className="mt-1 truncate text-xs">{p.name}</div>
                            <div
                              className={`mt-1 text-[10px] font-bold ${
                                selectedOut
                                  ? "text-orange-200"
                                  : selected
                                  ? "text-emerald-200"
                                  : "text-white/45"
                              }`}
                            >
                              {selectedOut ? "下場" : selected ? "紀錄中" : "球員"}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleSubOut(p.id)}
                            className={`absolute right-2 top-2 h-7 min-w-7 rounded-full px-2 text-[10px] font-extrabold ${
                              selectedOut
                                ? "bg-orange-500 text-white"
                                : "bg-white/10 text-white/80"
                            }`}
                          >
                            下
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {(subOutPlayerIds.length > 0 || subInPlayerIds.length > 0) && (
                  <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                      <span className="rounded-full bg-orange-500/15 px-2 py-1 text-orange-200">
                        下場 {subOutPlayerIds.length}
                      </span>
                      <span className="rounded-full bg-sky-500/15 px-2 py-1 text-sky-200">
                        上場 {subInPlayerIds.length}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-white/80">
                        {needSubInCount > 0 ? `還需 ${needSubInCount} 人上場` : "可確認換人"}
                      </span>

                      <div className="ml-auto flex gap-2">
                        <button
                          onClick={clearSubSelection}
                          className="rounded-xl bg-white/10 px-3 py-2 text-[11px] font-bold text-white/80"
                        >
                          清除
                        </button>
                        <button
                          onClick={makeSubstitution}
                          disabled={
                            submittingSub ||
                            game?.status === "finished" ||
                            subOutPlayerIds.length === 0 ||
                            subOutPlayerIds.length !== subInPlayerIds.length
                          }
                          className="rounded-xl bg-sky-600 px-3 py-2 text-[11px] font-extrabold disabled:opacity-50"
                        >
                          {submittingSub ? "換人中..." : "確認換人"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-2 text-[11px] font-semibold text-sky-300/80">
                    場下球員
                  </div>

                  {benchPlayers.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/50">
                      目前沒有可換上的場下球員
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
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
                            className={`rounded-2xl border p-2 text-center transition ${
                              selectedIn
                                ? "border-sky-300 bg-sky-500/20 shadow-[0_0_16px_rgba(56,189,248,0.22)]"
                                : selectable
                                ? "border-white/10 bg-white/5"
                                : "border-white/10 bg-white/5 opacity-50"
                            }`}
                          >
                            <div className="text-lg font-extrabold leading-none">
                              #{p.number ?? "-"}
                            </div>
                            <div className="mt-1 truncate text-xs">{p.name}</div>
                            <div
                              className={`mt-1 text-[10px] font-bold ${
                                selectedIn ? "text-sky-200" : "text-white/45"
                              }`}
                            >
                              {selectedIn
                                ? "已選上場"
                                : subOutPlayerIds.length > 0
                                ? "可上場"
                                : "待命"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">我方快速紀錄</div>
                  <div className="text-[11px] text-white/50">先點場上球員，再點事件</div>
                </div>
                <button
                  onClick={undoLastEvent}
                  className="rounded-xl bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-300"
                >
                  復原上一筆
                </button>
              </div>

              <div className="mb-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="text-[11px] text-white/50">目前事件會記到</div>
                <div className="mt-1 text-lg font-extrabold text-emerald-200">
                  {selectedPlayer ? `#${selectedPlayer.number ?? "-"} ${selectedPlayer.name}` : "未選球員"}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="mb-2 text-[11px] font-semibold text-white/50">得分事件</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => addEvent("fg2_made", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-emerald-700 px-2 py-4 text-sm font-extrabold disabled:opacity-50"
                    >
                      2分進
                    </button>
                    <button
                      onClick={() => addEvent("fg2_miss", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-white/10 px-2 py-4 text-sm font-bold disabled:opacity-50"
                    >
                      2分鐵
                    </button>
                    <button
                      onClick={() => addEvent("reb", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-slate-700 px-2 py-4 text-sm font-bold disabled:opacity-50"
                    >
                      籃板
                    </button>

                    <button
                      onClick={() => addEvent("fg3_made", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-emerald-700 px-2 py-4 text-sm font-extrabold disabled:opacity-50"
                    >
                      3分進
                    </button>
                    <button
                      onClick={() => addEvent("fg3_miss", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-white/10 px-2 py-4 text-sm font-bold disabled:opacity-50"
                    >
                      3分鐵
                    </button>
                    <button
                      onClick={() => addEvent("ast", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-blue-700 px-2 py-4 text-sm font-bold disabled:opacity-50"
                    >
                      助攻
                    </button>

                    <button
                      onClick={() => addEvent("ft_made", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-emerald-700 px-2 py-4 text-sm font-extrabold disabled:opacity-50"
                    >
                      罰進
                    </button>
                    <button
                      onClick={() => addEvent("ft_miss", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-white/10 px-2 py-4 text-sm font-bold disabled:opacity-50"
                    >
                      罰鐵
                    </button>
                    <button
                      onClick={() => addEvent("pf", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-orange-700 px-2 py-4 text-sm font-bold disabled:opacity-50"
                    >
                      犯規
                    </button>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[11px] font-semibold text-white/50">其他事件</div>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => addEvent("tov", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-red-700 px-2 py-3 text-sm font-bold disabled:opacity-50"
                    >
                      失誤
                    </button>
                    <button
                      onClick={() => addEvent("stl", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-cyan-700 px-2 py-3 text-sm font-bold disabled:opacity-50"
                    >
                      抄截
                    </button>
                    <button
                      onClick={() => addEvent("blk", "A")}
                      disabled={game?.status === "finished"}
                      className="rounded-2xl bg-indigo-700 px-2 py-3 text-sm font-bold disabled:opacity-50"
                    >
                      阻攻
                    </button>
                    <button
                      onClick={undoLastEvent}
                      className="rounded-2xl bg-red-500/20 px-2 py-3 text-sm font-bold text-red-300"
                    >
                      復原
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2">
                <div className="text-sm font-semibold">對手快速加分</div>
                <div className="text-[11px] text-white/50">快速記錄對手得分</div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => addEvent("ft_made", "B")}
                  disabled={game?.status === "finished"}
                  className="rounded-2xl bg-orange-600 px-3 py-4 text-lg font-extrabold disabled:opacity-50"
                >
                  +1
                </button>
                <button
                  onClick={() => addEvent("fg2_made", "B")}
                  disabled={game?.status === "finished"}
                  className="rounded-2xl bg-orange-600 px-3 py-4 text-lg font-extrabold disabled:opacity-50"
                >
                  +2
                </button>
                <button
                  onClick={() => addEvent("fg3_made", "B")}
                  disabled={game?.status === "finished"}
                  className="rounded-2xl bg-orange-600 px-3 py-4 text-lg font-extrabold disabled:opacity-50"
                >
                  +3
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2">
                <div className="text-sm font-semibold">比賽時間控制</div>
                <div className="text-[11px] text-white/50">手機也方便操作</div>
              </div>

              <div className="mb-3 rounded-3xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm font-bold text-white/70">
                  {getQuarterLabel(clock?.quarter ?? 1)}
                </div>
                <div className="mt-1 text-5xl font-extrabold tracking-wider md:text-6xl">
                  {formatTime(clock?.seconds_left ?? REGULAR_SECONDS)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={startClock}
                  disabled={game?.status === "finished"}
                  className="rounded-2xl bg-emerald-600 px-4 py-4 text-sm font-bold disabled:opacity-50"
                >
                  開始
                </button>
                <button
                  onClick={pauseClock}
                  className="rounded-2xl bg-yellow-600 px-4 py-4 text-sm font-bold"
                >
                  暫停
                </button>
                <button
                  onClick={resetClock}
                  className="rounded-2xl bg-red-600 px-4 py-4 text-sm font-bold"
                >
                  重設本節
                </button>
                <button
                  onClick={nextQuarter}
                  disabled={game?.status === "finished"}
                  className="rounded-2xl bg-blue-600 px-4 py-4 text-sm font-bold disabled:opacity-50"
                >
                  下一節
                </button>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  onClick={() => adjustClock(-60)}
                  className="rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold"
                >
                  -1分
                </button>
                <button
                  onClick={() => adjustClock(-10)}
                  className="rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold"
                >
                  -10秒
                </button>
                <button
                  onClick={() => adjustClock(-1)}
                  className="rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold"
                >
                  -1秒
                </button>
                <button
                  onClick={() => adjustClock(1)}
                  className="rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold"
                >
                  +1秒
                </button>
                <button
                  onClick={() => adjustClock(10)}
                  className="rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold"
                >
                  +10秒
                </button>
                <button
                  onClick={() => adjustClock(60)}
                  className="rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold"
                >
                  +1分
                </button>
              </div>
            </div>

            <button
              onClick={endGame}
              disabled={endingGame || game?.status === "finished"}
              className="w-full rounded-3xl bg-rose-700 px-4 py-5 text-base font-extrabold disabled:opacity-50"
            >
              {game?.status === "finished"
                ? "比賽已結束"
                : endingGame
                ? "結束中..."
                : "結束該場比賽"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}