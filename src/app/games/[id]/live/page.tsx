"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  player_id: string;
  quarter: number;
  event_type: string;
  created_at: string;
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
};

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
  const s = Math.max(0, total);
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

export default function LiveGamePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clock, setClock] = useState<ClockRow | null>(null);

  const [viewerCount, setViewerCount] = useState(1);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  const tickerRef = useRef<NodeJS.Timeout | null>(null);

  async function loadCurrentGame() {
    setError("");

    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, status")
      .eq("status", "live")
      .order("id", { ascending: false })
      .limit(1);

    if (error) {
      setError(`讀取目前比賽失敗：${error.message}`);
      return null;
    }

    const current = data?.[0] ?? null;

    if (!current) {
      setError("目前沒有 status = live 的比賽，請先建立一場比賽。");
      return null;
    }

    setGame(current);
    return current;
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

  async function loadEvents(gameId: string) {
    const { data, error } = await supabase
      .from("events")
      .select("id, game_id, player_id, quarter, event_type, created_at, is_undone, undone_at")
      .eq("game_id", gameId)
      .or("is_undone.is.null,is_undone.eq.false")
      .order("created_at", { ascending: true });

    if (error) {
      setError((prev) => prev || `讀取事件失敗：${error.message}`);
      return;
    }

    setEvents(data ?? []);
  }

  async function loadClock(gameId: string) {
    const { data, error } = await supabase
      .from("game_clock")
      .select("game_id, quarter, seconds_left, is_running, updated_at")
      .eq("game_id", gameId)
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
          game_id: gameId,
          quarter: 1,
          seconds_left: 600,
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
    init();
  }, []);

  useEffect(() => {
    if (!game?.id) return;

    const channel = supabase.channel(`live-room-${game.id}`, {
      config: {
        presence: { key: Math.random().toString(36).slice(2) },
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
          filter: `game_id=eq.${game.id}`,
        },
        () => {
          loadEvents(game.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_clock",
          filter: `game_id=eq.${game.id}`,
        },
        () => {
          loadClock(game.id);
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [game?.id]);

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
        if (prev.seconds_left <= 0) return { ...prev, is_running: false, seconds_left: 0 };
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
    if (!clock) return;
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
    const next = { ...clock, seconds_left: 600, is_running: false };
    setClock(next);
    await persistClock(next);
  }

  async function adjustClock(delta: number) {
    if (!clock) return;
    const next = {
      ...clock,
      seconds_left: Math.max(0, clock.seconds_left + delta),
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
      seconds_left: 600,
      is_running: false,
    };

    setClock(next);
    await persistClock(next);
  }

  async function addEvent(eventType: string) {
    if (!game || !clock) return;
    if (!selectedPlayerId) {
      setError("請先選擇球員");
      return;
    }

    const { error } = await supabase.from("events").insert({
      game_id: game.id,
      player_id: selectedPlayerId,
      quarter: clock.quarter,
      event_type: eventType,
    });

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

  const statsByPlayer = useMemo(() => {
    const result: Record<string, Stat> = {};

    for (const p of players) {
      result[p.id] = emptyStat();
    }

    for (const e of events) {
      if (!result[e.player_id]) {
        result[e.player_id] = emptyStat();
      }
      applyEvent(result[e.player_id], e.event_type);
    }

    return result;
  }, [players, events]);

  const teamScore = useMemo(() => {
    let total = 0;
    for (const e of events) {
      if (e.event_type === "fg2_made") total += 2;
      if (e.event_type === "fg3_made") total += 3;
      if (e.event_type === "ft_made") total += 1;
    }
    return total;
  }, [events]);

  if (loading) {
    return <div className="p-6 text-white">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm text-white/60">目前比賽</div>
              <h1 className="text-2xl font-bold">
                {game?.teamA || "我方"} vs {game?.teamB || "對手"}
              </h1>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <div className="rounded-xl bg-white/10 px-4 py-2">
                第 {clock?.quarter ?? 1} 節
              </div>
              <div className="rounded-xl bg-white/10 px-4 py-2">
                線上觀看：{viewerCount}
              </div>
              <div className="rounded-xl bg-emerald-500/20 px-4 py-2">
                比分：{teamScore}
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/60 mb-2">比賽時間</div>

              <div className="text-center text-5xl font-bold tracking-wider mb-4">
                {formatTime(clock?.seconds_left ?? 600)}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={startClock} className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold">
                  開始
                </button>
                <button onClick={pauseClock} className="rounded-xl bg-yellow-600 px-4 py-3 font-semibold">
                  暫停
                </button>
                <button onClick={resetClock} className="rounded-xl bg-red-600 px-4 py-3 font-semibold">
                  重設10:00
                </button>
                <button onClick={nextQuarter} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold">
                  下一節
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => adjustClock(-60)} className="rounded-xl bg-white/10 px-3 py-2">
                  -1分
                </button>
                <button onClick={() => adjustClock(-10)} className="rounded-xl bg-white/10 px-3 py-2">
                  -10秒
                </button>
                <button onClick={() => adjustClock(-1)} className="rounded-xl bg-white/10 px-3 py-2">
                  -1秒
                </button>

                <button onClick={() => adjustClock(1)} className="rounded-xl bg-white/10 px-3 py-2">
                  +1秒
                </button>
                <button onClick={() => adjustClock(10)} className="rounded-xl bg-white/10 px-3 py-2">
                  +10秒
                </button>
                <button onClick={() => adjustClock(60)} className="rounded-xl bg-white/10 px-3 py-2">
                  +1分
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/60 mb-2">選擇球員</div>

              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="w-full rounded-xl bg-neutral-900 border border-white/10 px-3 py-3 outline-none"
              >
                {players.length === 0 ? (
                  <option value="">沒有球員資料</option>
                ) : (
                  players.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number ?? "-"} {p.name}
                    </option>
                  ))
                )}
              </select>

              <div className="mt-4 text-sm text-white/60">
                球員數：{players.length}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-white/60">快捷記錄</div>
                <button
                  onClick={undoLastEvent}
                  className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-300"
                >
                  復原上一筆
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => addEvent("fg2_made")} className="rounded-xl bg-emerald-700 px-3 py-3">2分進</button>
                <button onClick={() => addEvent("fg2_miss")} className="rounded-xl bg-white/10 px-3 py-3">2分鐵</button>
                <button onClick={() => addEvent("fg3_made")} className="rounded-xl bg-emerald-700 px-3 py-3">3分進</button>
                <button onClick={() => addEvent("fg3_miss")} className="rounded-xl bg-white/10 px-3 py-3">3分鐵</button>
                <button onClick={() => addEvent("ft_made")} className="rounded-xl bg-emerald-700 px-3 py-3">罰球進</button>
                <button onClick={() => addEvent("ft_miss")} className="rounded-xl bg-white/10 px-3 py-3">罰球鐵</button>
                <button onClick={() => addEvent("reb")} className="rounded-xl bg-white/10 px-3 py-3">籃板</button>
                <button onClick={() => addEvent("ast")} className="rounded-xl bg-white/10 px-3 py-3">助攻</button>
                <button onClick={() => addEvent("tov")} className="rounded-xl bg-white/10 px-3 py-3">失誤</button>
                <button onClick={() => addEvent("stl")} className="rounded-xl bg-white/10 px-3 py-3">抄截</button>
                <button onClick={() => addEvent("blk")} className="rounded-xl bg-white/10 px-3 py-3">阻攻</button>
                <button onClick={() => addEvent("pf")} className="rounded-xl bg-white/10 px-3 py-3">犯規</button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <div className="text-sm text-white/60 mb-3">球員數據</div>

              <table className="w-full min-w-[900px] text-sm">
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
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => {
                    const s = statsByPlayer[p.id] ?? emptyStat();
                    return (
                      <tr key={p.id} className="border-b border-white/5">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/60 mb-3">事件紀錄</div>

              <div className="max-h-[420px] overflow-y-auto space-y-2">
                {[...events]
                  .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
                  .map((e) => {
                    const player = players.find((p) => p.id === e.player_id);
                    return (
                      <div
                        key={e.id}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                      >
                        <div className="font-medium">
                          第 {e.quarter} 節｜{player ? `#${player.number ?? "-"} ${player.name}` : "未知球員"}
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