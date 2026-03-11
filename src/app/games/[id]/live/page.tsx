"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  tov: number;
  stl: number;
  blk: number;
  pf: number;
  plusMinus: number | null;
};

const REGULAR_SECONDS = 600;
const OT_SECONDS = 300;

const emptyStat = (): Stat => ({
  pts: 0,
  fg2m: 0,
  fg2a: 0,
  fg3m: 0,
  fg3a: 0,
  ftm: 0,
  fta: 0,
  reb: 0,
  ast: 0,
  tov: 0,
  stl: 0,
  blk: 0,
  pf: 0,
  plusMinus: null,
});

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
};

function formatTime(total: number) {
  const s = Math.max(0, total || 0);
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function applyEvent(stat: Stat, eventType: string) {
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
    case "tov":
      stat.tov += 1;
      break;
    case "stl":
      stat.stl += 1;
      break;
    case "blk":
      stat.blk += 1;
      break;
    case "pf":
      stat.pf += 1;
      break;
    default:
      break;
  }
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

export default function LiveGamePage() {
  const params = useParams();
  const gameId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clock, setClock] = useState<ClockRow | null>(null);

  const [viewerCount, setViewerCount] = useState(1);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  const [editingTeamA, setEditingTeamA] = useState("");
  const [savingTeamA, setSavingTeamA] = useState(false);
  const [endingGame, setEndingGame] = useState(false);

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

  async function loadEvents(targetGameId: string) {
    const { data, error } = await supabase
      .from("events")
      .select("id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at")
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
      await Promise.all([loadEvents(g.id), loadClock(g.id)]);
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

  const starters = useMemo(() => players.slice(0, 5), [players]);
  const benchPlayers = useMemo(() => players.slice(5), [players]);

  const statsByPlayer = useMemo(() => {
    const result: Record<string, Stat> = {};

    for (const p of players) {
      result[p.id] = emptyStat();
    }

    for (const e of validEvents) {
      if (e.team_side !== "A") continue;
      if (!e.player_id) continue;

      if (!result[e.player_id]) {
        result[e.player_id] = emptyStat();
      }

      applyEvent(result[e.player_id], e.event_type);
    }

    return result;
  }, [players, validEvents]);

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
    const maxQuarter = Math.max(
      clock?.quarter ?? 1,
      ...validEvents.map((e) => e.quarter),
      1
    );

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
    { key: "fg2_made", label: "2分進", made: true },
    { key: "fg2_miss", label: "2分鐵", made: false },
    { key: "fg3_made", label: "3分進", made: true },
    { key: "fg3_miss", label: "3分鐵", made: false },
    { key: "ft_made", label: "罰球進", made: true },
    { key: "ft_miss", label: "罰球鐵", made: false },
    { key: "reb", label: "籃板", made: false },
    { key: "ast", label: "助攻", made: false },
    { key: "tov", label: "失誤", made: false },
    { key: "stl", label: "抄截", made: false },
    { key: "blk", label: "阻攻", made: false },
    { key: "pf", label: "犯規", made: false },
  ];

  if (loading) {
    return <div className="p-6 text-white">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-white/60">目前比賽</div>
                  <h1 className="text-2xl md:text-3xl font-bold">
                    {game?.teamA || "我方"} vs {game?.teamB || "對手"}
                  </h1>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={editingTeamA}
                    onChange={(e) => setEditingTeamA(e.target.value)}
                    placeholder="輸入我方隊名"
                    className="rounded-xl bg-neutral-900 border border-white/10 px-3 py-2 outline-none"
                  />
                  <button
                    onClick={saveTeamAName}
                    disabled={savingTeamA}
                    className="rounded-xl bg-blue-600 px-4 py-2 font-semibold disabled:opacity-60"
                  >
                    {savingTeamA ? "儲存中..." : "更新我方隊名"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
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
                <LogoutButton />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] items-center rounded-2xl border border-white/10 bg-black/20 p-4 md:p-6">
              <div className="text-center md:text-left">
                <div className="text-white/60 text-sm mb-1">主隊</div>
                <div className="text-2xl md:text-3xl font-bold">{game?.teamA || "我方"}</div>
                <div className="text-6xl md:text-7xl font-extrabold mt-2">{teamScore.scoreA}</div>
              </div>

              <div className="text-center space-y-3">
                <div className="text-xl md:text-2xl font-bold">
                  {getQuarterLabel(clock?.quarter ?? 1)}
                </div>
                <div className="text-5xl md:text-6xl font-extrabold tracking-wider">
                  {formatTime(clock?.seconds_left ?? REGULAR_SECONDS)}
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-sm">
                  <div className="rounded-xl bg-white/10 px-4 py-2">
                    線上觀看：{viewerCount}
                  </div>
                  <div className="rounded-xl bg-white/10 px-4 py-2">
                    {clock?.quarter && clock.quarter <= 4 ? "每節10分鐘" : "OT每節5分鐘"}
                  </div>
                </div>
              </div>

              <div className="text-center md:text-right">
                <div className="text-white/60 text-sm mb-1">客隊</div>
                <div className="text-2xl md:text-3xl font-bold">{game?.teamB || "對手"}</div>
                <div className="text-6xl md:text-7xl font-extrabold mt-2">{teamScore.scoreB}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              {Object.keys(quarterScores)
                .map(Number)
                .sort((a, b) => a - b)
                .map((q) => (
                  <div key={q} className="rounded-xl bg-white/10 px-3 py-2">
                    {getQuarterLabel(q)} {quarterScores[q].home}:{quarterScores[q].away}
                  </div>
                ))}
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/60 mb-2">比賽時間</div>

              <div className="text-center text-5xl font-bold tracking-wider mb-4">
                {formatTime(clock?.seconds_left ?? REGULAR_SECONDS)}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={startClock}
                  disabled={game?.status === "finished"}
                  className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold disabled:opacity-50"
                >
                  開始
                </button>
                <button
                  onClick={pauseClock}
                  className="rounded-xl bg-yellow-600 px-4 py-3 font-semibold"
                >
                  暫停
                </button>
                <button
                  onClick={resetClock}
                  className="rounded-xl bg-red-600 px-4 py-3 font-semibold"
                >
                  重設本節
                </button>
                <button
                  onClick={nextQuarter}
                  disabled={game?.status === "finished"}
                  className="rounded-xl bg-blue-600 px-4 py-3 font-semibold disabled:opacity-50"
                >
                  下一節
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <button
                  onClick={() => adjustClock(-60)}
                  className="rounded-xl bg-white/10 px-3 py-2"
                >
                  -1分
                </button>
                <button
                  onClick={() => adjustClock(-10)}
                  className="rounded-xl bg-white/10 px-3 py-2"
                >
                  -10秒
                </button>
                <button
                  onClick={() => adjustClock(-1)}
                  className="rounded-xl bg-white/10 px-3 py-2"
                >
                  -1秒
                </button>

                <button
                  onClick={() => adjustClock(1)}
                  className="rounded-xl bg-white/10 px-3 py-2"
                >
                  +1秒
                </button>
                <button
                  onClick={() => adjustClock(10)}
                  className="rounded-xl bg-white/10 px-3 py-2"
                >
                  +10秒
                </button>
                <button
                  onClick={() => adjustClock(60)}
                  className="rounded-xl bg-white/10 px-3 py-2"
                >
                  +1分
                </button>
              </div>

              <button
                onClick={endGame}
                disabled={endingGame || game?.status === "finished"}
                className="w-full rounded-xl bg-rose-700 px-4 py-3 font-bold disabled:opacity-50"
              >
                {game?.status === "finished"
                  ? "比賽已結束"
                  : endingGame
                  ? "結束中..."
                  : "結束該場比賽"}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-white/60">我方快捷記錄</div>
                <button
                  onClick={undoLastEvent}
                  className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-300"
                >
                  復原上一筆
                </button>
              </div>

              <div className="text-sm text-white/60 mb-2">目前選擇球員</div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 mb-4">
                {selectedPlayerId
                  ? (() => {
                      const p = players.find((x) => x.id === selectedPlayerId);
                      return p ? `#${p.number ?? "-"} ${p.name}` : "未選擇";
                    })()
                  : "未選擇"}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {eventButtons.map((btn) => (
                  <button
                    key={btn.key}
                    onClick={() => addEvent(btn.key, "A")}
                    disabled={game?.status === "finished"}
                    className={`rounded-xl px-3 py-3 font-semibold disabled:opacity-50 ${
                      btn.made ? "bg-emerald-700" : "bg-white/10"
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/60 mb-3">對手快速加分</div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => addEvent("ft_made", "B")}
                  disabled={game?.status === "finished"}
                  className="rounded-xl bg-orange-600 px-3 py-3 font-semibold disabled:opacity-50"
                >
                  對手 +1
                </button>
                <button
                  onClick={() => addEvent("fg2_made", "B")}
                  disabled={game?.status === "finished"}
                  className="rounded-xl bg-orange-600 px-3 py-3 font-semibold disabled:opacity-50"
                >
                  對手 +2
                </button>
                <button
                  onClick={() => addEvent("fg3_made", "B")}
                  disabled={game?.status === "finished"}
                  className="rounded-xl bg-orange-600 px-3 py-3 font-semibold disabled:opacity-50"
                >
                  對手 +3
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/60 mb-3">先發五人</div>
              <div className="grid grid-cols-2 gap-2">
                {starters.map((p) => {
                  const selected = selectedPlayerId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlayerId(p.id)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-emerald-400 bg-emerald-500/20"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="font-bold">#{p.number ?? "-"} {p.name}</div>
                      <div className="text-xs text-white/60">先發</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/60 mb-3">板凳球員</div>
              {benchPlayers.length === 0 ? (
                <div className="text-white/50 text-sm">目前沒有板凳球員</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {benchPlayers.map((p) => {
                    const selected = selectedPlayerId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPlayerId(p.id)}
                        className={`rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-blue-400 bg-blue-500/20"
                            : "border-white/10 bg-black/20"
                        }`}
                      >
                        <div className="font-bold">#{p.number ?? "-"} {p.name}</div>
                        <div className="text-xs text-white/60">板凳</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <div className="text-sm text-white/60 mb-3">球員數據</div>

              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/60">
                    <th className="text-left py-2">球員</th>
                    <th className="py-2">PTS</th>
                    <th className="py-2">2M</th>
                    <th className="py-2">2A</th>
                    <th className="py-2">3M</th>
                    <th className="py-2">3A</th>
                    <th className="py-2">FTM</th>
                    <th className="py-2">FTA</th>
                    <th className="py-2">REB</th>
                    <th className="py-2">AST</th>
                    <th className="py-2">TOV</th>
                    <th className="py-2">STL</th>
                    <th className="py-2">BLK</th>
                    <th className="py-2">PF</th>
                    <th className="py-2">+/-</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => {
                    const s = statsByPlayer[p.id] ?? emptyStat();
                    const selected = selectedPlayerId === p.id;

                    return (
                      <tr
                        key={p.id}
                        className={`border-b border-white/5 ${selected ? "bg-white/5" : ""}`}
                      >
                        <td className="py-3">
                          #{p.number ?? "-"} {p.name}
                        </td>
                        <td className="text-center">{s.pts}</td>
                        <td className="text-center">{s.fg2m}</td>
                        <td className="text-center">{s.fg2a}</td>
                        <td className="text-center">{s.fg3m}</td>
                        <td className="text-center">{s.fg3a}</td>
                        <td className="text-center">{s.ftm}</td>
                        <td className="text-center">{s.fta}</td>
                        <td className="text-center">{s.reb}</td>
                        <td className="text-center">{s.ast}</td>
                        <td className="text-center">{s.tov}</td>
                        <td className="text-center">{s.stl}</td>
                        <td className="text-center">{s.blk}</td>
                        <td className="text-center">{s.pf}</td>
                        <td className="text-center">{s.plusMinus ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/60 mb-3">事件紀錄</div>

              <div className="max-h-[420px] overflow-y-auto space-y-2">
                {[...validEvents]
                  .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
                  .map((e) => {
                    const player = players.find((p) => p.id === e.player_id);

                    return (
                      <div
                        key={e.id}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                      >
                        <div className="font-medium">
                          {getQuarterLabel(e.quarter)}｜
                          {e.team_side === "A"
                            ? game?.teamA || "我方"
                            : game?.teamB || "對手"}
                          {e.team_side === "A"
                            ? `｜${
                                player
                                  ? `#${player.number ?? "-"} ${player.name}`
                                  : "未知球員"
                              }`
                            : ""}
                        </div>
                        <div className="text-sm text-white/60">
                          {EVENT_LABELS[e.event_type] ?? e.event_type}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}