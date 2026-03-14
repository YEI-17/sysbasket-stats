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
  is_starter?: boolean | null;
  players?: Player | Player[] | null;
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

const DEFAULT_SECONDS = 10 * 60;

const EVENT_LABEL: Record<string, string> = {
  fg2_made: "2分命中",
  fg2_miss: "2分未進",
  fg3_made: "3分命中",
  fg3_miss: "3分未進",
  ft_made: "罰球命中",
  ft_miss: "罰球未進",
  reb: "籃板",
  ast: "助攻",
  stl: "抄截",
  blk: "火鍋",
  tov: "失誤",
  pf: "犯規",
  sub_in: "上場",
  sub_out: "下場",
};

function pct(made: number, attempt: number) {
  if (!attempt) return "0%";
  return `${Math.round((made / attempt) * 100)}%`;
}

function getPlayerName(player: Player) {
  return `${player.number ?? "-"} ${player.name}`;
}

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function calcStat(events: EventRow[]) {
  const base: Stat = {
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

  for (const e of events) {
    if (e.is_undone) continue;

    switch (e.event_type) {
      case "fg2_made":
        base.pts += 2;
        base.fg2m += 1;
        base.fg2a += 1;
        break;
      case "fg2_miss":
        base.fg2a += 1;
        break;
      case "fg3_made":
        base.pts += 3;
        base.fg3m += 1;
        base.fg3a += 1;
        break;
      case "fg3_miss":
        base.fg3a += 1;
        break;
      case "ft_made":
        base.pts += 1;
        base.ftm += 1;
        base.fta += 1;
        break;
      case "ft_miss":
        base.fta += 1;
        break;
      case "reb":
        base.reb += 1;
        break;
      case "ast":
        base.ast += 1;
        break;
      case "stl":
        base.stl += 1;
        break;
      case "blk":
        base.blk += 1;
        break;
      case "tov":
        base.tov += 1;
        break;
      case "pf":
        base.pf += 1;
        break;
      default:
        break;
    }
  }

  return base;
}

function playerFromRelation(row: GamePlayerRow): Player | null {
  if (!row.players) return null;
  if (Array.isArray(row.players)) return row.players[0] ?? null;
  return row.players;
}

function getOnCourtByTeam(
  teamPlayers: Player[],
  teamSide: "A" | "B",
  events: EventRow[],
  starters: string[]
) {
  const active = new Set<string>(starters);

  const ordered = [...events]
    .filter((e) => !e.is_undone && e.team_side === teamSide)
    .sort((a, b) => {
      const at = new Date(a.created_at).getTime();
      const bt = new Date(b.created_at).getTime();
      return at - bt;
    });

  for (const e of ordered) {
    if (!e.player_id) continue;
    if (e.event_type === "sub_in") active.add(e.player_id);
    if (e.event_type === "sub_out") active.delete(e.player_id);
  }

  return teamPlayers.filter((p) => active.has(p.id)).slice(0, 5);
}

export default function BoardPage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;

  const [game, setGame] = useState<GameRow | null>(null);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clock, setClock] = useState<ClockRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [selectedTeamSide, setSelectedTeamSide] = useState<"A" | "B">("A");

  const [manageTeam, setManageTeam] = useState<"A" | "B">("A");
  const [selectedCourtPlayerId, setSelectedCourtPlayerId] = useState<string>("");

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const quarter = clock?.quarter ?? 1;
  const secondsLeft = clock?.seconds_left ?? DEFAULT_SECONDS;
  const isRunning = clock?.is_running ?? false;

  const playersA = useMemo(() => {
    return gamePlayers
      .filter((r) => r.team_side === "A")
      .map(playerFromRelation)
      .filter(Boolean) as Player[];
  }, [gamePlayers]);

  const playersB = useMemo(() => {
    return gamePlayers
      .filter((r) => r.team_side === "B")
      .map(playerFromRelation)
      .filter(Boolean) as Player[];
  }, [gamePlayers]);

  const starterIdsA = useMemo(() => {
    return gamePlayers
      .filter((r) => r.team_side === "A" && r.is_starter)
      .map((r) => r.player_id);
  }, [gamePlayers]);

  const starterIdsB = useMemo(() => {
    return gamePlayers
      .filter((r) => r.team_side === "B" && r.is_starter)
      .map((r) => r.player_id);
  }, [gamePlayers]);

  const activeA = useMemo(() => {
    return getOnCourtByTeam(playersA, "A", events, starterIdsA);
  }, [playersA, events, starterIdsA]);

  const activeB = useMemo(() => {
    return getOnCourtByTeam(playersB, "B", events, starterIdsB);
  }, [playersB, events, starterIdsB]);

  const activeIdsA = useMemo(() => new Set(activeA.map((p) => p.id)), [activeA]);
  const activeIdsB = useMemo(() => new Set(activeB.map((p) => p.id)), [activeB]);

  const scoreA = useMemo(() => {
    return calcStat(events.filter((e) => e.team_side === "A")).pts;
  }, [events]);

  const scoreB = useMemo(() => {
    return calcStat(events.filter((e) => e.team_side === "B")).pts;
  }, [events]);

  const statsByPlayer = useMemo(() => {
    const map = new Map<string, Stat>();

    const allPlayers = [...playersA, ...playersB];
    for (const p of allPlayers) {
      map.set(
        p.id,
        calcStat(events.filter((e) => e.player_id === p.id))
      );
    }

    return map;
  }, [events, playersA, playersB]);

  const recentEvents = useMemo(() => {
    return [...events]
      .filter((e) => !e.is_undone)
      .sort((a, b) => {
        const at = new Date(a.created_at).getTime();
        const bt = new Date(b.created_at).getTime();
        return bt - at;
      })
      .slice(0, 12);
  }, [events]);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setClock((prev) => {
        if (!prev) return prev;
        if (prev.seconds_left <= 0) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          saveClockToDb(prev.quarter, 0, false);
          return { ...prev, seconds_left: 0, is_running: false };
        }

        const next = {
          ...prev,
          seconds_left: prev.seconds_left - 1,
        };

        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  async function fetchAll() {
    try {
      setLoading(true);
      setMsg("");

      const [{ data: gameData, error: gameError }, { data: gpData, error: gpError }, { data: eventData, error: eventError }, { data: clockData, error: clockError }] =
        await Promise.all([
          supabase.from("games").select("id, teamA, teamB, status").eq("id", gameId).single(),
          supabase
            .from("game_players")
            .select("id, game_id, player_id, team_side, is_starter, players(id, name, number, position, active)")
            .eq("game_id", gameId),
          supabase
            .from("events")
            .select("id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at")
            .eq("game_id", gameId)
            .order("created_at", { ascending: true }),
          supabase
            .from("game_clock")
            .select("game_id, quarter, seconds_left, is_running, updated_at")
            .eq("game_id", gameId)
            .eq("quarter", 1)
            .maybeSingle(),
        ]);

      if (gameError) throw gameError;
      if (gpError) throw gpError;
      if (eventError) throw eventError;
      if (clockError) throw clockError;

      setGame(gameData);
      setGamePlayers((gpData as GamePlayerRow[]) ?? []);
      setEvents((eventData as EventRow[]) ?? []);

      if (clockData) {
        setClock(clockData as ClockRow);
      } else {
        const initialClock: ClockRow = {
          game_id: gameId,
          quarter: 1,
          seconds_left: DEFAULT_SECONDS,
          is_running: false,
        };
        setClock(initialClock);
        await supabase.from("game_clock").upsert(initialClock, { onConflict: "game_id,quarter" });
      }
    } catch (error: any) {
      setMsg(`讀取目前比賽失敗：${error.message ?? "未知錯誤"}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveClockToDb(q: number, sec: number, running: boolean) {
    await supabase.from("game_clock").upsert(
      {
        game_id: gameId,
        quarter: q,
        seconds_left: sec,
        is_running: running,
      },
      { onConflict: "game_id,quarter" }
    );
  }

  async function setClockState(nextSeconds: number, nextRunning: boolean, nextQuarter?: number) {
    const q = nextQuarter ?? quarter;
    const sec = Math.max(0, nextSeconds);

    const next: ClockRow = {
      game_id: gameId,
      quarter: q,
      seconds_left: sec,
      is_running: nextRunning,
    };

    setClock(next);
    await saveClockToDb(q, sec, nextRunning);
  }

  async function addEvent(eventType: string, playerId?: string, teamSide?: "A" | "B") {
    try {
      setSaving(true);
      setMsg("");

      const payload = {
        game_id: gameId,
        player_id: playerId ?? null,
        quarter,
        event_type: eventType,
        team_side: teamSide ?? null,
      };

      const { error } = await supabase.from("events").insert(payload);
      if (error) throw error;

      const { data } = await supabase
        .from("events")
        .select("id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });

      setEvents((data as EventRow[]) ?? []);
    } catch (error: any) {
      setMsg(`新增事件失敗：${error.message ?? "未知錯誤"}`);
    } finally {
      setSaving(false);
    }
  }

  async function undoLastEvent() {
    try {
      setMsg("");

      const last = [...events]
        .filter((e) => !e.is_undone)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      if (!last) {
        setMsg("目前沒有可復原的事件");
        return;
      }

      const { error } = await supabase
        .from("events")
        .update({
          is_undone: true,
          undone_at: new Date().toISOString(),
        })
        .eq("id", last.id);

      if (error) throw error;

      const { data } = await supabase
        .from("events")
        .select("id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });

      setEvents((data as EventRow[]) ?? []);
    } catch (error: any) {
      setMsg(`復原失敗：${error.message ?? "未知錯誤"}`);
    }
  }

  async function finishGame() {
    try {
      setMsg("");

      const { error } = await supabase
        .from("games")
        .update({ status: "finished" })
        .eq("id", gameId);

      if (error) throw error;

      setGame((prev) => (prev ? { ...prev, status: "finished" } : prev));
      await setClockState(secondsLeft, false);
    } catch (error: any) {
      setMsg(`結束比賽失敗：${error.message ?? "未知錯誤"}`);
    }
  }

  async function startNextQuarter() {
    try {
      const nextQuarter = quarter + 1;
      const nextClock: ClockRow = {
        game_id: gameId,
        quarter: nextQuarter,
        seconds_left: DEFAULT_SECONDS,
        is_running: false,
      };

      const { error } = await supabase
        .from("game_clock")
        .upsert(nextClock, { onConflict: "game_id,quarter" });

      if (error) throw error;

      setClock(nextClock);
    } catch (error: any) {
      setMsg(`切換節次失敗：${error.message ?? "未知錯誤"}`);
    }
  }

  async function substitutePlayer(inPlayerId: string) {
    try {
      setMsg("");

      const team = manageTeam;
      const onCourt = team === "A" ? activeA : activeB;

      if (onCourt.some((p) => p.id === inPlayerId)) {
        setMsg("該球員已經在場上");
        return;
      }

      if (!selectedCourtPlayerId) {
        if (onCourt.length >= 5) {
          setMsg("請先選擇要換下的場上球員");
          return;
        }
        await addEvent("sub_in", inPlayerId, team);
        return;
      }

      await addEvent("sub_out", selectedCourtPlayerId, team);
      await addEvent("sub_in", inPlayerId, team);
      setSelectedCourtPlayerId("");
    } catch (error: any) {
      setMsg(`換人失敗：${error.message ?? "未知錯誤"}`);
    }
  }

  function renderActionButtons(teamSide: "A" | "B") {
    const teamPlayers = teamSide === "A" ? playersA : playersB;

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {teamSide === "A" ? game?.teamA || "我方" : game?.teamB || "對手"} 事件
          </h3>
          <select
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            value={selectedPlayerId}
            onChange={(e) => {
              setSelectedPlayerId(e.target.value);
              setSelectedTeamSide(teamSide);
            }}
          >
            <option value="">選擇球員</option>
            {teamPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {getPlayerName(p)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[
            ["fg2_made", "2分進"],
            ["fg2_miss", "2分鐵"],
            ["fg3_made", "3分進"],
            ["fg3_miss", "3分鐵"],
            ["ft_made", "罰球進"],
            ["ft_miss", "罰球鐵"],
            ["reb", "籃板"],
            ["ast", "助攻"],
            ["stl", "抄截"],
            ["blk", "火鍋"],
            ["tov", "失誤"],
            ["pf", "犯規"],
          ].map(([type, label]) => (
            <button
              key={type}
              disabled={saving || selectedTeamSide !== teamSide || !selectedPlayerId}
              onClick={() => addEvent(type, selectedPlayerId, teamSide)}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm font-medium transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderManageOnCourt(teamSide: "A" | "B") {
    const teamPlayers = teamSide === "A" ? playersA : playersB;
    const onCourt = teamSide === "A" ? activeA : activeB;
    const activeIds = teamSide === "A" ? activeIdsA : activeIdsB;
    const bench = teamPlayers.filter((p) => !activeIds.has(p.id));

    const currentSelectedPlayer =
      onCourt.find((p) => p.id === selectedCourtPlayerId) ?? null;

    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              {teamSide === "A" ? game?.teamA || "我方" : game?.teamB || "對手"} 場上五人 / 換人
            </h3>
            <p className="mt-1 text-sm text-white/60">
              先點場上球員，再點下面未上場球員即可換人
            </p>
          </div>

          <button
            onClick={() => {
              setManageTeam(teamSide);
              setSelectedCourtPlayerId("");
            }}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              manageTeam === teamSide
                ? "bg-emerald-500 text-black"
                : "bg-white/10 text-white hover:bg-white/15"
            }`}
          >
            目前管理此隊
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, idx) => {
            const p = onCourt[idx];
            const isSelected = p?.id === selectedCourtPlayerId;

            return (
              <button
                key={`${teamSide}-slot-${idx}`}
                onClick={() => {
                  setManageTeam(teamSide);
                  setSelectedCourtPlayerId(p?.id ?? "");
                }}
                className={`min-h-[78px] rounded-2xl border px-3 py-3 text-left transition ${
                  isSelected
                    ? "border-yellow-400 bg-yellow-400/20"
                    : "border-white/10 bg-white/10 hover:bg-white/15"
                }`}
              >
                <div className="text-xs text-white/50">場上 {idx + 1}</div>
                {p ? (
                  <>
                    <div className="mt-1 font-semibold">{p.number ?? "-"}</div>
                    <div className="text-sm">{p.name}</div>
                  </>
                ) : (
                  <div className="mt-2 text-sm text-white/40">空位</div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mb-3 text-sm text-white/70">
          {currentSelectedPlayer
            ? `目前準備換下：${getPlayerName(currentSelectedPlayer)}`
            : onCourt.length < 5
            ? "目前場上不足五人，可直接點未上場球員補上"
            : "尚未選擇要換下的場上球員"}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {teamPlayers.map((p) => {
            const isOnCourt = activeIds.has(p.id);
            return (
              <button
                key={p.id}
                disabled={manageTeam !== teamSide || isOnCourt}
                onClick={() => substitutePlayer(p.id)}
                className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left transition ${
                  isOnCourt
                    ? "border-emerald-400/30 bg-emerald-400/10 opacity-90"
                    : "border-white/10 bg-white/10 hover:bg-white/15"
                } disabled:cursor-not-allowed`}
              >
                <div>
                  <div className="font-medium">
                    #{p.number ?? "-"} {p.name}
                  </div>
                  <div className="text-xs text-white/50">{p.position || "球員"}</div>
                </div>

                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    isOnCourt
                      ? "bg-emerald-400/20 text-emerald-300"
                      : "bg-white/10 text-white/70"
                  }`}
                >
                  {isOnCourt ? "場上" : "未上場"}
                </span>
              </button>
            );
          })}
        </div>

        {bench.length === 0 && (
          <div className="mt-3 text-sm text-white/50">目前沒有可替補球員</div>
        )}
      </div>
    );
  }

  function renderStatsTable(teamSide: "A" | "B") {
    const teamPlayers = teamSide === "A" ? playersA : playersB;
    const activeIds = teamSide === "A" ? activeIdsA : activeIdsB;

    return (
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
        <table className="min-w-full text-sm">
          <thead className="bg-white/10 text-white/80">
            <tr>
              <th className="px-3 py-3 text-left">球員</th>
              <th className="px-3 py-3 text-center">PTS</th>
              <th className="px-3 py-3 text-center">2PT</th>
              <th className="px-3 py-3 text-center">3PT</th>
              <th className="px-3 py-3 text-center">FT</th>
              <th className="px-3 py-3 text-center">REB</th>
              <th className="px-3 py-3 text-center">AST</th>
              <th className="px-3 py-3 text-center">STL</th>
              <th className="px-3 py-3 text-center">BLK</th>
              <th className="px-3 py-3 text-center">TOV</th>
              <th className="px-3 py-3 text-center">PF</th>
            </tr>
          </thead>
          <tbody>
            {teamPlayers.map((p) => {
              const s =
                statsByPlayer.get(p.id) ??
                ({
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
                } as Stat);

              const isOnCourt = activeIds.has(p.id);

              return (
                <tr key={p.id} className="border-t border-white/10">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        #{p.number ?? "-"} {p.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          isOnCourt
                            ? "bg-emerald-400/20 text-emerald-300"
                            : "bg-white/10 text-white/60"
                        }`}
                      >
                        {isOnCourt ? "場上" : "未上場"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">{s.pts}</td>
                  <td className="px-3 py-3 text-center">
                    {s.fg2m}/{s.fg2a} ({pct(s.fg2m, s.fg2a)})
                  </td>
                  <td className="px-3 py-3 text-center">
                    {s.fg3m}/{s.fg3a} ({pct(s.fg3m, s.fg3a)})
                  </td>
                  <td className="px-3 py-3 text-center">
                    {s.ftm}/{s.fta} ({pct(s.ftm, s.fta)})
                  </td>
                  <td className="px-3 py-3 text-center">{s.reb}</td>
                  <td className="px-3 py-3 text-center">{s.ast}</td>
                  <td className="px-3 py-3 text-center">{s.stl}</td>
                  <td className="px-3 py-3 text-center">{s.blk}</td>
                  <td className="px-3 py-3 text-center">{s.tov}</td>
                  <td className="px-3 py-3 text-center">{s.pf}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b1020] px-4 py-6 text-white">
        <div className="mx-auto max-w-7xl">讀取中...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b1020] px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/games"
              className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
            >
              ← 返回比賽列表
            </Link>
            <Link
              href={`/games/${gameId}/box`}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
            >
              查看 Box Score
            </Link>
          </div>
          <LogoutButton />
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm text-white/50">即時比賽紀錄</div>
              <h1 className="text-2xl font-bold">
                {game?.teamA || "Team A"} vs {game?.teamB || "Team B"}
              </h1>
            </div>

            {game?.status === "finished" && (
              <div className="rounded-full bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-300">
                比賽已結束
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-2xl bg-white/5 p-4 text-center">
              <div className="mb-2 text-sm text-white/60">{game?.teamA || "Team A"}</div>
              <div className="text-5xl font-black">{scoreA}</div>
            </div>

            <div className="flex min-w-[240px] flex-col items-center justify-center rounded-2xl bg-white/10 px-6 py-5">
              <div className="text-sm text-white/60">第 {quarter} 節</div>
              <div className="mt-2 text-5xl font-black tracking-wider">
                {formatClock(secondsLeft)}
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => setClockState(secondsLeft, !isRunning)}
                  className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-black"
                >
                  {isRunning ? "暫停" : "開始"}
                </button>
                <button
                  onClick={() => setClockState(DEFAULT_SECONDS, false)}
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                >
                  重設
                </button>
                <button
                  onClick={() => setClockState(secondsLeft + 1, false)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                >
                  +1秒
                </button>
                <button
                  onClick={() => setClockState(secondsLeft - 1, false)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                >
                  -1秒
                </button>
                <button
                  onClick={() => setClockState(secondsLeft + 10, false)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                >
                  +10秒
                </button>
                <button
                  onClick={() => setClockState(secondsLeft - 10, false)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                >
                  -10秒
                </button>
                <button
                  onClick={() => setClockState(secondsLeft + 60, false)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                >
                  +1分
                </button>
                <button
                  onClick={() => setClockState(secondsLeft - 60, false)}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                >
                  -1分
                </button>
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  onClick={undoLastEvent}
                  className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-bold text-black"
                >
                  Undo 最近一筆
                </button>
                <button
                  onClick={startNextQuarter}
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
                >
                  下一節
                </button>
                <button
                  onClick={finishGame}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white"
                >
                  結束比賽
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 p-4 text-center">
              <div className="mb-2 text-sm text-white/60">{game?.teamB || "Team B"}</div>
              <div className="text-5xl font-black">{scoreB}</div>
            </div>
          </div>

          {msg && (
            <div className="mt-4 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-200">
              {msg}
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          {renderActionButtons("A")}
          {renderActionButtons("B")}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          {renderManageOnCourt("A")}
          {renderManageOnCourt("B")}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-4 text-xl font-bold">
                {game?.teamA || "Team A"} 球員數據
              </h2>
              {renderStatsTable("A")}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-4 text-xl font-bold">
                {game?.teamB || "Team B"} 球員數據
              </h2>
              {renderStatsTable("B")}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="mb-4 text-xl font-bold">最近事件</h2>
            <div className="space-y-2">
              {recentEvents.length === 0 && (
                <div className="text-sm text-white/50">目前尚無事件紀錄</div>
              )}

              {recentEvents.map((e) => {
                const allPlayers = [...playersA, ...playersB];
                const player = allPlayers.find((p) => p.id === e.player_id);
                const teamName =
                  e.team_side === "A"
                    ? game?.teamA || "Team A"
                    : e.team_side === "B"
                    ? game?.teamB || "Team B"
                    : "未分類";

                return (
                  <div
                    key={e.id}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">
                        {EVENT_LABEL[e.event_type] || e.event_type}
                      </div>
                      <div className="text-xs text-white/40">第 {e.quarter} 節</div>
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      {teamName}
                      {player ? ` · #${player.number ?? "-"} ${player.name}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-white/40">
                      {new Date(e.created_at).toLocaleString("zh-TW")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}