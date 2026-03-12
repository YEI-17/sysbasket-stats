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

const EVENT_LABELS: Record<string, string> = {
  fg2_made: "2分進",
  fg2_miss: "2分鐵",
  fg3_made: "3分進",
  fg3_miss: "3分鐵",
  ft_made: "罰球進",
  ft_miss: "罰球鐵",
  reb: "籃板",
  ast: "助攻",
  tov: "失誤",
  stl: "抄截",
  blk: "阻攻",
  pf: "犯規",
  sub_in: "上場",
  sub_out: "下場",
};

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

function getPlayerDisplayName(player?: Player | null) {
  if (!player) return "未選擇";
  return `#${player.number ?? "-"} ${player.name}`;
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

  const [benchOpen, setBenchOpen] = useState(false);
  const [subOutPlayerId, setSubOutPlayerId] = useState("");
  const [subInPlayerId, setSubInPlayerId] = useState("");
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
    const { error } = await supabase
      .from("game_clock")
      .upsert(
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
        setError("請先選擇球員");
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
    const ids = gamePlayers.filter((gp) => gp.team_side === "A").map((gp) => gp.player_id);

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
      !teamAPlayers.some((p) => p.id === selectedPlayerId) &&
      onCourtPlayers.length > 0
    ) {
      setSelectedPlayerId(onCourtPlayers[0].id);
    }
  }, [selectedPlayerId, onCourtPlayers, teamAPlayers]);

  const selectedPlayer = useMemo(
    () => players.find((p) => p.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId]
  );

  const subOutPlayer = useMemo(
    () => players.find((p) => p.id === subOutPlayerId) ?? null,
    [players, subOutPlayerId]
  );

  const subInPlayer = useMemo(
    () => players.find((p) => p.id === subInPlayerId) ?? null,
    [players, subInPlayerId]
  );

  useEffect(() => {
    if (!subOutPlayerId && onCourtPlayers.length > 0) {
      setSubOutPlayerId(onCourtPlayers[0].id);
    }
  }, [subOutPlayerId, onCourtPlayers]);

  useEffect(() => {
    if (!subInPlayerId && benchPlayers.length > 0) {
      setSubInPlayerId(benchPlayers[0].id);
    }
  }, [subInPlayerId, benchPlayers]);

  async function makeSubstitution() {
    if (!game || !clock) return;

    if (game.status === "finished") {
      setError("比賽已結束，不能換人");
      return;
    }

    if (!subOutPlayerId || !subInPlayerId) {
      setError("請選擇下場與上場球員");
      return;
    }

    if (subOutPlayerId === subInPlayerId) {
      setError("上場與下場不能是同一人");
      return;
    }

    setSubmittingSub(true);
    setError("");

    const payload = [
      {
        game_id: game.id,
        player_id: subOutPlayerId,
        quarter: clock.quarter,
        event_type: "sub_out",
        team_side: "A" as const,
      },
      {
        game_id: game.id,
        player_id: subInPlayerId,
        quarter: clock.quarter,
        event_type: "sub_in",
        team_side: "A" as const,
      },
    ];

    const { error } = await supabase.from("events").insert(payload);

    setSubmittingSub(false);

    if (error) {
      setError(`換人失敗：${error.message}`);
      return;
    }

    setSelectedPlayerId(subInPlayerId);
    setSubOutPlayerId("");
    setSubInPlayerId("");
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

  const eventButtons = [
    { key: "fg2_made", label: "2分進", strong: true },
    { key: "fg2_miss", label: "2分鐵", strong: false },
    { key: "fg3_made", label: "3分進", strong: true },
    { key: "fg3_miss", label: "3分鐵", strong: false },
    { key: "ft_made", label: "罰球進", strong: true },
    { key: "ft_miss", label: "罰球鐵", strong: false },
    { key: "reb", label: "籃板", strong: false },
    { key: "ast", label: "助攻", strong: false },
    { key: "tov", label: "失誤", strong: false },
    { key: "stl", label: "抄截", strong: false },
    { key: "blk", label: "阻攻", strong: false },
    { key: "pf", label: "犯規", strong: false },
  ];

  const lastThreeEvents = useMemo(() => {
    return [...validEvents]
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 3);
  }, [validEvents]);

  if (loading) {
    return <div className="p-6 text-white">載入中...</div>;
  }

  return (
  <div className="h-[100dvh] overflow-hidden bg-neutral-950 text-white">
    <div className="mx-auto flex h-full max-w-6xl flex-col p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs text-white/50">目前比賽</div>
          <div className="truncate text-sm font-bold">
            {game?.teamA || "我方"} vs {game?.teamB || "對手"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/games/${gameId}/stats`}
            className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold"
          >
            數據頁
          </Link>
          <LogoutButton />
        </div>
      </div>

      <div className="mb-2 rounded-2xl border border-white/10 bg-white/5 p-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="min-w-0 text-center">
            <div className="truncate text-[11px] text-white/50">主隊</div>
            <div className="truncate text-sm font-bold">{game?.teamA || "我方"}</div>
            <div className="text-3xl font-extrabold leading-none">{teamScore.scoreA}</div>
          </div>

          <div className="text-center">
            <div className="text-sm font-bold">{getQuarterLabel(clock?.quarter ?? 1)}</div>
            <div className="text-3xl font-extrabold tracking-wide">
              {formatTime(clock?.seconds_left ?? REGULAR_SECONDS)}
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-1">
              <span className="rounded-full bg-white/10 px-2 py-1 text-[10px]">
                觀看 {viewerCount}
              </span>
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                  game?.status === "finished"
                    ? "bg-red-500/20 text-red-300"
                    : clock?.is_running
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-yellow-500/20 text-yellow-300"
                }`}
              >
                {game?.status === "finished"
                  ? "結束"
                  : clock?.is_running
                  ? "計時中"
                  : "暫停"}
              </span>
            </div>
          </div>

          <div className="min-w-0 text-center">
            <div className="truncate text-[11px] text-white/50">客隊</div>
            <div className="truncate text-sm font-bold">{game?.teamB || "對手"}</div>
            <div className="text-3xl font-extrabold leading-none">{teamScore.scoreB}</div>
          </div>
        </div>

        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {Object.keys(quarterScores)
            .map(Number)
            .sort((a, b) => a - b)
            .map((q) => (
              <div
                key={q}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px]"
              >
                {getQuarterLabel(q)} {quarterScores[q].home}:{quarterScores[q].away}
              </div>
            ))}
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-2 md:grid-cols-[1.2fr_0.8fr]">
        <div className="grid min-h-0 grid-rows-[auto_auto_1fr_auto] gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold">場上五人</div>
              <div className="truncate rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">
                {selectedPlayer ? getPlayerDisplayName(selectedPlayer) : "未選擇"}
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1">
              {onCourtPlayers.slice(0, 5).map((p) => {
                const selected = selectedPlayerId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayerId(p.id)}
                    className={`rounded-xl border px-1 py-2 text-center ${
                      selected
                        ? "border-emerald-400 bg-emerald-500/20"
                        : "border-emerald-500/20 bg-emerald-500/10"
                    }`}
                  >
                    <div className="text-sm font-extrabold leading-none">#{p.number ?? "-"}</div>
                    <div className="mt-1 truncate text-[10px]">{p.name}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold">場下名單</div>
              <button
                onClick={() => setBenchOpen((v) => !v)}
                className="rounded-xl bg-white/10 px-2 py-1 text-[10px]"
              >
                {benchOpen ? "收起" : "展開"}
              </button>
            </div>

            {benchOpen ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {benchPlayers.length === 0 ? (
                  <div className="text-xs text-white/50">無場下球員</div>
                ) : (
                  benchPlayers.map((p) => {
                    const selected = selectedPlayerId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPlayerId(p.id)}
                        className={`shrink-0 rounded-xl border px-3 py-2 text-center ${
                          selected
                            ? "border-blue-400 bg-blue-500/20"
                            : "border-white/10 bg-white/5"
                        }`}
                      >
                        <div className="text-sm font-extrabold leading-none">#{p.number ?? "-"}</div>
                        <div className="mt-1 text-[10px]">{p.name}</div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="text-[10px] text-white/50">點展開可快速選場下球員</div>
            )}
          </div>

          <div className="min-h-0 rounded-2xl border border-white/10 bg-white/5 p-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold">我方快速紀錄</div>
              <button
                onClick={undoLastEvent}
                className="rounded-xl bg-red-500/20 px-2 py-1 text-[10px] text-red-300"
              >
                復原
              </button>
            </div>

            <div className="grid h-full grid-cols-3 gap-2">
              {eventButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => addEvent(btn.key, "A")}
                  disabled={game?.status === "finished"}
                  className={`rounded-xl px-2 py-3 text-sm font-bold disabled:opacity-50 ${
                    btn.strong ? "bg-emerald-700" : "bg-white/10"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
            <div className="mb-2 text-xs font-semibold">對手加分</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => addEvent("ft_made", "B")}
                disabled={game?.status === "finished"}
                className="rounded-xl bg-orange-600 px-2 py-3 text-base font-extrabold disabled:opacity-50"
              >
                +1
              </button>
              <button
                onClick={() => addEvent("fg2_made", "B")}
                disabled={game?.status === "finished"}
                className="rounded-xl bg-orange-600 px-2 py-3 text-base font-extrabold disabled:opacity-50"
              >
                +2
              </button>
              <button
                onClick={() => addEvent("fg3_made", "B")}
                disabled={game?.status === "finished"}
                className="rounded-xl bg-orange-600 px-2 py-3 text-base font-extrabold disabled:opacity-50"
              >
                +3
              </button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 grid-rows-[auto_auto_1fr] gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
            <div className="mb-2 text-xs font-semibold">比賽時間</div>

            <div className="mb-2 rounded-2xl border border-white/10 bg-black/30 py-3 text-center">
              <div className="text-xs text-white/60">{getQuarterLabel(clock?.quarter ?? 1)}</div>
              <div className="text-4xl font-extrabold">
                {formatTime(clock?.seconds_left ?? REGULAR_SECONDS)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={startClock}
                disabled={game?.status === "finished"}
                className="rounded-xl bg-emerald-600 px-2 py-2 text-xs font-bold disabled:opacity-50"
              >
                開始
              </button>
              <button
                onClick={pauseClock}
                className="rounded-xl bg-yellow-600 px-2 py-2 text-xs font-bold"
              >
                暫停
              </button>
              <button
                onClick={resetClock}
                className="rounded-xl bg-red-600 px-2 py-2 text-xs font-bold"
              >
                重設
              </button>
              <button
                onClick={nextQuarter}
                disabled={game?.status === "finished"}
                className="rounded-xl bg-blue-600 px-2 py-2 text-xs font-bold disabled:opacity-50"
              >
                下一節
              </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <button onClick={() => adjustClock(-60)} className="rounded-xl bg-white/10 px-2 py-2 text-xs">
                -1分
              </button>
              <button onClick={() => adjustClock(-10)} className="rounded-xl bg-white/10 px-2 py-2 text-xs">
                -10秒
              </button>
              <button onClick={() => adjustClock(-1)} className="rounded-xl bg-white/10 px-2 py-2 text-xs">
                -1秒
              </button>
              <button onClick={() => adjustClock(1)} className="rounded-xl bg-white/10 px-2 py-2 text-xs">
                +1秒
              </button>
              <button onClick={() => adjustClock(10)} className="rounded-xl bg-white/10 px-2 py-2 text-xs">
                +10秒
              </button>
              <button onClick={() => adjustClock(60)} className="rounded-xl bg-white/10 px-2 py-2 text-xs">
                +1分
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
            <div className="mb-2 text-xs font-semibold">快速換人</div>

            <div className="grid gap-2">
              <div className="rounded-xl bg-orange-500/10 px-3 py-2">
                <div className="text-[10px] text-orange-200/80">下場</div>
                <div className="text-sm font-bold">
                  {subOutPlayer ? getPlayerDisplayName(subOutPlayer) : "未選擇"}
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {onCourtPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSubOutPlayerId(p.id)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-xs ${
                      subOutPlayerId === p.id
                        ? "border-orange-400 bg-orange-500/20"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    #{p.number ?? "-"} {p.name}
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-sky-500/10 px-3 py-2">
                <div className="text-[10px] text-sky-200/80">上場</div>
                <div className="text-sm font-bold">
                  {subInPlayer ? getPlayerDisplayName(subInPlayer) : "未選擇"}
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {benchPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSubInPlayerId(p.id)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-xs ${
                      subInPlayerId === p.id
                        ? "border-sky-400 bg-sky-500/20"
                        : "border-white/10 bg-white/5"
                    }`}
                  >
                    #{p.number ?? "-"} {p.name}
                  </button>
                ))}
              </div>

              <button
                onClick={makeSubstitution}
                disabled={
                  submittingSub ||
                  game?.status === "finished" ||
                  onCourtPlayers.length === 0 ||
                  benchPlayers.length === 0
                }
                className="rounded-xl bg-sky-600 px-3 py-3 text-sm font-extrabold disabled:opacity-50"
              >
                {submittingSub ? "換人中..." : "確認換人"}
              </button>
            </div>
          </div>

          <button
            onClick={endGame}
            disabled={endingGame || game?.status === "finished"}
            className="rounded-2xl bg-rose-700 px-4 py-3 text-sm font-extrabold disabled:opacity-50"
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