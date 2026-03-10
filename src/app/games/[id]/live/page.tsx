"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type GameRow = {
  id: string;
  game_date: string;
  start_time: string | null;
  location: string | null;
  status: string;
  teamA: string | null;
  teamB: string | null;
  quarters?: number | null;
};

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  is_undone: boolean;
  undone_at: string | null;
};

type PlayerRow = {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
  active?: boolean;
};

type PlayerInfo = {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
};

type GamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "teamA" | "teamB";
  is_starter: boolean;
  is_active: boolean;
  player: PlayerInfo | null;
};

type GameClockRow = {
  id: string;
  game_id: string;
  quarter: number;
  seconds_left: number;
  is_running: boolean;
  updated_at: string;
};

type TabKey = "record" | "events" | "stats" | "players";

function formatStatus(status?: string) {
  if (status === "live") return "LIVE";
  if (status === "finished") return "FINAL";
  return "SCHEDULED";
}

function formatDate(dateStr?: string | null) {
  return dateStr || "-";
}

function formatTime(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function eventLabel(eventType: string, teamA = "隊伍A", teamB = "隊伍B") {
  const map: Record<string, string> = {
    teamA_1pt: `${teamA} 罰球命中`,
    teamA_2pt: `${teamA} 兩分命中`,
    teamA_3pt: `${teamA} 三分命中`,
    teamA_reb: `${teamA} 籃板`,
    teamA_ast: `${teamA} 助攻`,
    teamA_stl: `${teamA} 抄截`,
    teamA_blk: `${teamA} 火鍋`,
    teamA_tov: `${teamA} 失誤`,
    teamA_pf: `${teamA} 犯規`,

    teamB_1pt: `${teamB} 罰球命中`,
    teamB_2pt: `${teamB} 兩分命中`,
    teamB_3pt: `${teamB} 三分命中`,
    teamB_reb: `${teamB} 籃板`,
    teamB_ast: `${teamB} 助攻`,
    teamB_stl: `${teamB} 抄截`,
    teamB_blk: `${teamB} 火鍋`,
    teamB_tov: `${teamB} 失誤`,
    teamB_pf: `${teamB} 犯規`,
  };

  return map[eventType] ?? eventType;
}

function normalizeGamePlayers(rows: any[]): GamePlayerRow[] {
  return rows.map((row) => {
    const rawPlayer = Array.isArray(row.player) ? row.player[0] : row.player;

    return {
      id: String(row.id),
      game_id: String(row.game_id),
      player_id: String(row.player_id),
      team_side: row.team_side === "teamB" ? "teamB" : "teamA",
      is_starter: Boolean(row.is_starter),
      is_active: Boolean(row.is_active),
      player: rawPlayer
        ? {
            id: String(rawPlayer.id),
            name: String(rawPlayer.name ?? ""),
            number:
              rawPlayer.number === null || rawPlayer.number === undefined
                ? null
                : Number(rawPlayer.number),
            position:
              rawPlayer.position === null || rawPlayer.position === undefined
                ? null
                : String(rawPlayer.position),
          }
        : null,
    };
  });
}

function toClockText(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-white/50">
      {text}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

export default function LiveGamePage() {
  const params = useParams();
  const gameId = String(params.id);

  const [game, setGame] = useState<GameRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);
  const [rosterPool, setRosterPool] = useState<PlayerRow[]>([]);
  const [clock, setClock] = useState<GameClockRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [tab, setTab] = useState<TabKey>("record");
  const [quarter, setQuarter] = useState(1);

  const [selectedTeamAPlayerId, setSelectedTeamAPlayerId] = useState<string | null>(null);
  const [selectedTeamBPlayerId, setSelectedTeamBPlayerId] = useState<string | null>(null);

  async function fetchGame() {
    const { data, error } = await supabase
      .from("games")
      .select('id, game_date, start_time, location, status, quarters, "teamA", "teamB"')
      .eq("id", gameId)
      .single();

    if (error) throw error;
    setGame(data);
  }

  async function fetchEvents() {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    setEvents((data ?? []) as EventRow[]);
  }

  async function fetchGamePlayers() {
    const { data, error } = await supabase
      .from("game_players")
      .select(`
        id,
        game_id,
        player_id,
        team_side,
        is_starter,
        is_active,
        player:players (
          id,
          name,
          number,
          position
        )
      `)
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (error) {
      setGamePlayers([]);
      return;
    }

    const safeRows = Array.isArray(data) ? normalizeGamePlayers(data) : [];
    setGamePlayers(safeRows);
  }

  async function fetchRosterPool() {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, number, position, active")
      .eq("active", true)
      .order("number", { ascending: true });

    if (error) {
      setRosterPool([]);
      return;
    }

    setRosterPool((data ?? []) as PlayerRow[]);
  }

  async function ensureQuarterClock(targetQuarter: number) {
    const { data: existing } = await supabase
      .from("game_clock")
      .select("*")
      .eq("game_id", gameId)
      .eq("quarter", targetQuarter)
      .maybeSingle();

    if (existing) {
      setClock(existing as GameClockRow);
      return existing as GameClockRow;
    }

    const { data, error } = await supabase
      .from("game_clock")
      .insert({
        game_id: gameId,
        quarter: targetQuarter,
        seconds_left: 600,
        is_running: false,
      })
      .select("*")
      .single();

    if (error) throw error;
    setClock(data as GameClockRow);
    return data as GameClockRow;
  }

  async function fetchClock(targetQuarter: number) {
    const { data, error } = await supabase
      .from("game_clock")
      .select("*")
      .eq("game_id", gameId)
      .eq("quarter", targetQuarter)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      await ensureQuarterClock(targetQuarter);
      return;
    }

    setClock(data as GameClockRow);
  }

  async function loadAll() {
    try {
      setLoading(true);
      setMsg("");
      await Promise.all([fetchGame(), fetchEvents(), fetchGamePlayers(), fetchRosterPool()]);
    } catch (err: any) {
      setMsg(err.message || "讀取比賽失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!gameId) return;
    loadAll();
  }, [gameId]);

  useEffect(() => {
    if (!loading) {
      fetchClock(quarter).catch(() => {});
    }
  }, [loading, quarter]);

  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`live-full-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        async () => {
          try {
            await fetchGame();
          } catch {}
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `game_id=eq.${gameId}` },
        async () => {
          try {
            await fetchEvents();
          } catch {}
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` },
        async () => {
          try {
            await fetchGamePlayers();
          } catch {}
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_clock", filter: `game_id=eq.${gameId}` },
        async () => {
          try {
            await fetchClock(quarter);
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, quarter]);

  const activeEvents = useMemo(() => events.filter((e) => !e.is_undone), [events]);

  const summary = useMemo(() => {
    let teamAPoints = 0;
    let teamBPoints = 0;
    let teamAReb = 0;
    let teamBReb = 0;
    let teamAAst = 0;
    let teamBAst = 0;
    let teamAStl = 0;
    let teamBStl = 0;
    let teamABlk = 0;
    let teamBBlk = 0;
    let teamATov = 0;
    let teamBTov = 0;
    let teamAPf = 0;
    let teamBPf = 0;

    let teamA2m = 0;
    let teamA2a = 0;
    let teamA3m = 0;
    let teamA3a = 0;
    let teamA1m = 0;
    let teamA1a = 0;

    let teamB2m = 0;
    let teamB2a = 0;
    let teamB3m = 0;
    let teamB3a = 0;
    let teamB1m = 0;
    let teamB1a = 0;

    for (const e of activeEvents) {
      switch (e.event_type) {
        case "teamA_1pt":
          teamAPoints += 1;
          teamA1m += 1;
          teamA1a += 1;
          break;
        case "teamA_2pt":
          teamAPoints += 2;
          teamA2m += 1;
          teamA2a += 1;
          break;
        case "teamA_3pt":
          teamAPoints += 3;
          teamA3m += 1;
          teamA3a += 1;
          break;
        case "teamA_reb":
          teamAReb += 1;
          break;
        case "teamA_ast":
          teamAAst += 1;
          break;
        case "teamA_stl":
          teamAStl += 1;
          break;
        case "teamA_blk":
          teamABlk += 1;
          break;
        case "teamA_tov":
          teamATov += 1;
          break;
        case "teamA_pf":
          teamAPf += 1;
          break;

        case "teamB_1pt":
          teamBPoints += 1;
          teamB1m += 1;
          teamB1a += 1;
          break;
        case "teamB_2pt":
          teamBPoints += 2;
          teamB2m += 1;
          teamB2a += 1;
          break;
        case "teamB_3pt":
          teamBPoints += 3;
          teamB3m += 1;
          teamB3a += 1;
          break;
        case "teamB_reb":
          teamBReb += 1;
          break;
        case "teamB_ast":
          teamBAst += 1;
          break;
        case "teamB_stl":
          teamBStl += 1;
          break;
        case "teamB_blk":
          teamBBlk += 1;
          break;
        case "teamB_tov":
          teamBTov += 1;
          break;
        case "teamB_pf":
          teamBPf += 1;
          break;
      }
    }

    return {
      teamA: {
        pts: teamAPoints,
        reb: teamAReb,
        ast: teamAAst,
        stl: teamAStl,
        blk: teamABlk,
        tov: teamATov,
        pf: teamAPf,
        fg2m: teamA2m,
        fg2a: teamA2a,
        fg3m: teamA3m,
        fg3a: teamA3a,
        ftm: teamA1m,
        fta: teamA1a,
      },
      teamB: {
        pts: teamBPoints,
        reb: teamBReb,
        ast: teamBAst,
        stl: teamBStl,
        blk: teamBBlk,
        tov: teamBTov,
        pf: teamBPf,
        fg2m: teamB2m,
        fg2a: teamB2a,
        fg3m: teamB3m,
        fg3a: teamB3a,
        ftm: teamB1m,
        fta: teamB1a,
      },
    };
  }, [activeEvents]);

  const playerStats = useMemo(() => {
    const playerMap = new Map<string, PlayerInfo>();
    gamePlayers.forEach((gp) => {
      if (gp.player) playerMap.set(gp.player_id, gp.player);
    });

    type Row = {
      player_id: string;
      name: string;
      side: "teamA" | "teamB";
      pts: number;
      reb: number;
      ast: number;
      stl: number;
      blk: number;
      tov: number;
      pf: number;
    };

    const map = new Map<string, Row>();

    for (const e of activeEvents) {
      if (!e.player_id) continue;

      const side = e.event_type.startsWith("teamB_") ? "teamB" : "teamA";
      const p = playerMap.get(e.player_id);
      const key = `${side}-${e.player_id}`;

      if (!map.has(key)) {
        map.set(key, {
          player_id: e.player_id,
          name: p?.name || "未命名球員",
          side,
          pts: 0,
          reb: 0,
          ast: 0,
          stl: 0,
          blk: 0,
          tov: 0,
          pf: 0,
        });
      }

      const row = map.get(key)!;

      switch (e.event_type) {
        case "teamA_1pt":
        case "teamB_1pt":
          row.pts += 1;
          break;
        case "teamA_2pt":
        case "teamB_2pt":
          row.pts += 2;
          break;
        case "teamA_3pt":
        case "teamB_3pt":
          row.pts += 3;
          break;
        case "teamA_reb":
        case "teamB_reb":
          row.reb += 1;
          break;
        case "teamA_ast":
        case "teamB_ast":
          row.ast += 1;
          break;
        case "teamA_stl":
        case "teamB_stl":
          row.stl += 1;
          break;
        case "teamA_blk":
        case "teamB_blk":
          row.blk += 1;
          break;
        case "teamA_tov":
        case "teamB_tov":
          row.tov += 1;
          break;
        case "teamA_pf":
        case "teamB_pf":
          row.pf += 1;
          break;
      }
    }

    return {
      teamA: Array.from(map.values()).filter((r) => r.side === "teamA"),
      teamB: Array.from(map.values()).filter((r) => r.side === "teamB"),
    };
  }, [activeEvents, gamePlayers]);

  const displayedClockSeconds = useMemo(() => {
    if (!clock) return 600;
    if (!clock.is_running) return clock.seconds_left;

    const updated = new Date(clock.updated_at).getTime();
    const now = Date.now();
    const diff = Math.floor((now - updated) / 1000);
    return Math.max(0, clock.seconds_left - diff);
  }, [clock]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!clock?.is_running) return;
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [clock?.is_running]);

  const liveClockText = useMemo(() => toClockText(displayedClockSeconds), [displayedClockSeconds, tick]);

  const teamAName = game?.teamA ?? "隊伍A";
  const teamBName = game?.teamB ?? "隊伍B";
  const totalQuarters = game?.quarters ?? 4;

  const teamAPlayers = useMemo(
    () => gamePlayers.filter((p) => p.team_side === "teamA"),
    [gamePlayers]
  );

  const teamBPlayers = useMemo(
    () => gamePlayers.filter((p) => p.team_side === "teamB"),
    [gamePlayers]
  );

  const assignedPlayerIds = useMemo(
    () => new Set(gamePlayers.map((p) => p.player_id)),
    [gamePlayers]
  );

  const unassignedPlayers = useMemo(
    () => rosterPool.filter((p) => !assignedPlayerIds.has(p.id)),
    [rosterPool, assignedPlayerIds]
  );

  const recentEvents = useMemo(() => [...activeEvents].reverse().slice(0, 15), [activeEvents]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "record", label: "記錄" },
    { key: "events", label: "事件" },
    { key: "stats", label: "數據" },
    { key: "players", label: "球員" },
  ];

  async function startGame() {
    try {
      setSaving(true);
      setMsg("");
      const { error } = await supabase.from("games").update({ status: "live" }).eq("id", gameId);
      if (error) throw error;
      await fetchGame();
    } catch (err: any) {
      setMsg(err.message || "開始比賽失敗");
    } finally {
      setSaving(false);
    }
  }

  async function pauseGame() {
    try {
      setSaving(true);
      setMsg("");
      const { error } = await supabase.from("games").update({ status: "scheduled" }).eq("id", gameId);
      if (error) throw error;
      await fetchGame();
    } catch (err: any) {
      setMsg(err.message || "暫停比賽失敗");
    } finally {
      setSaving(false);
    }
  }

  async function finishGame() {
    try {
      setSaving(true);
      setMsg("");
      const { error } = await supabase.from("games").update({ status: "finished" }).eq("id", gameId);
      if (error) throw error;
      await fetchGame();
    } catch (err: any) {
      setMsg(err.message || "結束比賽失敗");
    } finally {
      setSaving(false);
    }
  }

  async function startClock() {
    try {
      setSaving(true);
      setMsg("");
      const existing = await ensureQuarterClock(quarter);

      const { error } = await supabase
        .from("game_clock")
        .update({
          is_running: true,
          seconds_left: displayedClockSeconds,
        })
        .eq("id", existing.id);

      if (error) throw error;
      await fetchClock(quarter);
    } catch (err: any) {
      setMsg(err.message || "開始計時失敗");
    } finally {
      setSaving(false);
    }
  }

  async function pauseClock() {
    try {
      setSaving(true);
      setMsg("");
      const existing = await ensureQuarterClock(quarter);

      const { error } = await supabase
        .from("game_clock")
        .update({
          is_running: false,
          seconds_left: displayedClockSeconds,
        })
        .eq("id", existing.id);

      if (error) throw error;
      await fetchClock(quarter);
    } catch (err: any) {
      setMsg(err.message || "暫停計時失敗");
    } finally {
      setSaving(false);
    }
  }

  async function resetClock() {
    try {
      setSaving(true);
      setMsg("");
      const existing = await ensureQuarterClock(quarter);

      const { error } = await supabase
        .from("game_clock")
        .update({
          is_running: false,
          seconds_left: 600,
        })
        .eq("id", existing.id);

      if (error) throw error;
      await fetchClock(quarter);
    } catch (err: any) {
      setMsg(err.message || "重設計時失敗");
    } finally {
      setSaving(false);
    }
  }

  async function nextQuarter() {
    if (quarter >= totalQuarters) return;
    const next = quarter + 1;
    setQuarter(next);
    try {
      await ensureQuarterClock(next);
    } catch {}
  }

  async function addEvent(eventType: string, playerId: string | null) {
    try {
      setSaving(true);
      setMsg("");

      const { error } = await supabase.from("events").insert({
        game_id: gameId,
        player_id: playerId,
        quarter,
        event_type: eventType,
      });

      if (error) throw error;
      await fetchEvents();
    } catch (err: any) {
      setMsg(err.message || "新增事件失敗");
    } finally {
      setSaving(false);
    }
  }

  async function undoLastEvent() {
    try {
      setSaving(true);
      setMsg("");

      const lastEvent = [...activeEvents].reverse()[0];
      if (!lastEvent) {
        setMsg("目前沒有可復原的事件");
        return;
      }

      const { error } = await supabase
        .from("events")
        .update({
          is_undone: true,
          undone_at: new Date().toISOString(),
        })
        .eq("id", lastEvent.id);

      if (error) throw error;
      await fetchEvents();
    } catch (err: any) {
      setMsg(err.message || "Undo 失敗");
    } finally {
      setSaving(false);
    }
  }

  async function assignPlayerToTeam(playerId: string, teamSide: "teamA" | "teamB") {
    try {
      setSaving(true);
      setMsg("");

      const { error } = await supabase.from("game_players").insert({
        game_id: gameId,
        player_id: playerId,
        team_side: teamSide,
        is_starter: false,
        is_active: true,
      });

      if (error) throw error;
      await fetchGamePlayers();
    } catch (err: any) {
      setMsg(err.message || "加入本場名單失敗");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStarter(row: GamePlayerRow) {
    try {
      setSaving(true);
      setMsg("");

      const { error } = await supabase
        .from("game_players")
        .update({ is_starter: !row.is_starter })
        .eq("id", row.id);

      if (error) throw error;
      await fetchGamePlayers();
    } catch (err: any) {
      setMsg(err.message || "切換先發失敗");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-6xl px-4 py-6">載入中...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl">
        <div className="sticky top-0 z-30 border-b border-white/10 bg-black/95 backdrop-blur">
          <div className="px-4 pt-4 pb-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-xs tracking-[0.25em] text-white/40">LEAGUE LIVE CONSOLE</div>
              <div
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  game?.status === "live"
                    ? "bg-green-500/20 text-green-300"
                    : game?.status === "finished"
                    ? "bg-white/10 text-white"
                    : "bg-yellow-500/20 text-yellow-300"
                }`}
              >
                {formatStatus(game?.status)}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/10 to-white/5 px-4 py-4 shadow-2xl">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-white/50">HOME</div>
                  <div className="truncate text-2xl font-black">{teamAName}</div>
                </div>

                <div className="text-center">
                  <div className="text-4xl font-black sm:text-6xl">
                    {summary.teamA.pts} : {summary.teamB.pts}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    Q{quarter} ｜ {liveClockText}
                  </div>
                </div>

                <div className="min-w-0 text-right">
                  <div className="truncate text-sm text-white/50">AWAY</div>
                  <div className="truncate text-2xl font-black">{teamBName}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-white/50">日期</div>
                  <div className="mt-1 font-semibold">{formatDate(game?.game_date)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-white/50">時間</div>
                  <div className="mt-1 font-semibold">{formatTime(game?.start_time)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-white/50">地點</div>
                  <div className="mt-1 truncate font-semibold">{game?.location || "-"}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/games/${gameId}/view`}
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-black"
                >
                  觀眾畫面
                </Link>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <div className="flex min-w-max gap-2">
                {tabs.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
                      tab === item.key
                        ? "bg-white text-black"
                        : "border border-white/10 bg-white/5 text-white/80"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-4">
          {msg && (
            <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/20 px-4 py-3">
              {msg}
            </div>
          )}

          {tab === "record" && (
            <div className="space-y-4">
              <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold">比賽控制</h2>
                  <div className="text-sm text-white/50">Record Desk</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={startGame}
                    disabled={saving || game?.status === "live"}
                    className="rounded-2xl bg-green-500 px-4 py-4 text-base font-black text-black disabled:opacity-50"
                  >
                    開始比賽
                  </button>
                  <button
                    onClick={pauseGame}
                    disabled={saving}
                    className="rounded-2xl bg-yellow-400 px-4 py-4 text-base font-black text-black disabled:opacity-50"
                  >
                    暫停比賽
                  </button>
                  <button
                    onClick={finishGame}
                    disabled={saving || game?.status === "finished"}
                    className="rounded-2xl bg-red-600 px-4 py-4 text-base font-black disabled:opacity-50"
                  >
                    結束比賽
                  </button>
                  <button
                    onClick={undoLastEvent}
                    disabled={saving}
                    className="rounded-2xl bg-white px-4 py-4 text-base font-black text-black disabled:opacity-50"
                  >
                    Undo 最後一筆
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold">比賽時間</h2>
                  <div className="text-sm text-white/50">Q{quarter}</div>
                </div>

                <div className="mb-4 rounded-3xl border border-white/10 bg-black/30 p-6 text-center">
                  <div className="text-sm text-white/50">剩餘時間</div>
                  <div className="mt-2 text-5xl font-black">{liveClockText}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={startClock}
                    disabled={saving}
                    className="rounded-2xl bg-green-500 px-4 py-4 font-black text-black disabled:opacity-50"
                  >
                    開始計時
                  </button>
                  <button
                    onClick={pauseClock}
                    disabled={saving}
                    className="rounded-2xl bg-yellow-400 px-4 py-4 font-black text-black disabled:opacity-50"
                  >
                    暫停計時
                  </button>
                  <button
                    onClick={resetClock}
                    disabled={saving}
                    className="rounded-2xl bg-white px-4 py-4 font-black text-black disabled:opacity-50"
                  >
                    重設 10:00
                  </button>
                  <button
                    onClick={nextQuarter}
                    disabled={saving || quarter >= totalQuarters}
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-black disabled:opacity-50"
                  >
                    下一節
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold">節次管理</h2>
                  <div className="text-sm text-white/50">
                    Q{quarter} / {totalQuarters}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: totalQuarters }, (_, i) => i + 1).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuarter(q)}
                      className={`rounded-2xl px-4 py-4 text-base font-bold transition ${
                        quarter === q
                          ? "bg-white text-black"
                          : "border border-white/10 bg-black/30"
                      }`}
                    >
                      第 {q} 節
                    </button>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-2xl font-bold">{teamAName}</h2>
                    <div className="text-sm text-white/50">
                      目前球員：{teamAPlayers.find((p) => p.player_id === selectedTeamAPlayerId)?.player?.name || "未選擇"}
                    </div>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    {teamAPlayers.length === 0 ? (
                      <EmptyState text="先到球員分頁把球員加入 teamA" />
                    ) : (
                      teamAPlayers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedTeamAPlayerId(p.player_id)}
                          className={`rounded-full px-3 py-2 text-sm font-bold ${
                            selectedTeamAPlayerId === p.player_id
                              ? "bg-white text-black"
                              : "border border-white/10 bg-black/30"
                          }`}
                        >
                          {p.player?.number != null ? `#${p.player.number} ` : ""}
                          {p.player?.name || "未命名球員"}
                        </button>
                      ))
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <button onClick={() => addEvent("teamA_1pt", selectedTeamAPlayerId)} disabled={saving} className="rounded-2xl bg-white px-4 py-5 text-xl font-black text-black disabled:opacity-50">+1</button>
                    <button onClick={() => addEvent("teamA_2pt", selectedTeamAPlayerId)} disabled={saving} className="rounded-2xl bg-white px-4 py-5 text-xl font-black text-black disabled:opacity-50">+2</button>
                    <button onClick={() => addEvent("teamA_3pt", selectedTeamAPlayerId)} disabled={saving} className="rounded-2xl bg-white px-4 py-5 text-xl font-black text-black disabled:opacity-50">+3</button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => addEvent("teamA_reb", selectedTeamAPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">籃板</button>
                    <button onClick={() => addEvent("teamA_ast", selectedTeamAPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">助攻</button>
                    <button onClick={() => addEvent("teamA_stl", selectedTeamAPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">抄截</button>
                    <button onClick={() => addEvent("teamA_blk", selectedTeamAPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">火鍋</button>
                    <button onClick={() => addEvent("teamA_tov", selectedTeamAPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">失誤</button>
                    <button onClick={() => addEvent("teamA_pf", selectedTeamAPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">犯規</button>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-2xl font-bold">{teamBName}</h2>
                    <div className="text-sm text-white/50">
                      目前球員：{teamBPlayers.find((p) => p.player_id === selectedTeamBPlayerId)?.player?.name || "未選擇"}
                    </div>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    {teamBPlayers.length === 0 ? (
                      <EmptyState text="先到球員分頁把球員加入 teamB" />
                    ) : (
                      teamBPlayers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedTeamBPlayerId(p.player_id)}
                          className={`rounded-full px-3 py-2 text-sm font-bold ${
                            selectedTeamBPlayerId === p.player_id
                              ? "bg-white text-black"
                              : "border border-white/10 bg-black/30"
                          }`}
                        >
                          {p.player?.number != null ? `#${p.player.number} ` : ""}
                          {p.player?.name || "未命名球員"}
                        </button>
                      ))
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <button onClick={() => addEvent("teamB_1pt", selectedTeamBPlayerId)} disabled={saving} className="rounded-2xl bg-white px-4 py-5 text-xl font-black text-black disabled:opacity-50">+1</button>
                    <button onClick={() => addEvent("teamB_2pt", selectedTeamBPlayerId)} disabled={saving} className="rounded-2xl bg-white px-4 py-5 text-xl font-black text-black disabled:opacity-50">+2</button>
                    <button onClick={() => addEvent("teamB_3pt", selectedTeamBPlayerId)} disabled={saving} className="rounded-2xl bg-white px-4 py-5 text-xl font-black text-black disabled:opacity-50">+3</button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => addEvent("teamB_reb", selectedTeamBPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">籃板</button>
                    <button onClick={() => addEvent("teamB_ast", selectedTeamBPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">助攻</button>
                    <button onClick={() => addEvent("teamB_stl", selectedTeamBPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">抄截</button>
                    <button onClick={() => addEvent("teamB_blk", selectedTeamBPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">火鍋</button>
                    <button onClick={() => addEvent("teamB_tov", selectedTeamBPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">失誤</button>
                    <button onClick={() => addEvent("teamB_pf", selectedTeamBPlayerId)} disabled={saving} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-bold disabled:opacity-50">犯規</button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {tab === "events" && (
            <div className="space-y-4">
              <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold">事件時間軸</h2>
                  <div className="text-sm text-white/50">共 {activeEvents.length} 筆</div>
                </div>

                {recentEvents.length === 0 ? (
                  <EmptyState text="目前還沒有事件" />
                ) : (
                  <div className="space-y-3">
                    {recentEvents.map((e, idx) => (
                      <div key={e.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-white/50">
                              #{activeEvents.length - idx} ｜ Q{e.quarter}
                            </div>
                            <div className="mt-1 font-semibold">
                              {eventLabel(e.event_type, teamAName, teamBName)}
                              {e.player_id && (
                                <span className="ml-2 text-white/50">
                                  · {gamePlayers.find((p) => p.player_id === e.player_id)?.player?.name || "球員"}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-sm text-white/50">
                            {new Date(e.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === "stats" && (
            <div className="space-y-4">
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label={`${teamAName} 籃板`} value={summary.teamA.reb} />
                <StatCard label={`${teamAName} 助攻`} value={summary.teamA.ast} />
                <StatCard label={`${teamBName} 籃板`} value={summary.teamB.reb} />
                <StatCard label={`${teamBName} 助攻`} value={summary.teamB.ast} />
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xl font-bold">{teamAName} 團隊數據</div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="PTS" value={summary.teamA.pts} />
                    <StatCard label="2FG" value={`${summary.teamA.fg2m}/${summary.teamA.fg2a}`} />
                    <StatCard label="3FG" value={`${summary.teamA.fg3m}/${summary.teamA.fg3a}`} />
                    <StatCard label="FT" value={`${summary.teamA.ftm}/${summary.teamA.fta}`} />
                    <StatCard label="REB" value={summary.teamA.reb} />
                    <StatCard label="AST" value={summary.teamA.ast} />
                    <StatCard label="STL" value={summary.teamA.stl} />
                    <StatCard label="BLK" value={summary.teamA.blk} />
                    <StatCard label="TO" value={summary.teamA.tov} />
                    <StatCard label="PF" value={summary.teamA.pf} />
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xl font-bold">{teamBName} 團隊數據</div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="PTS" value={summary.teamB.pts} />
                    <StatCard label="2FG" value={`${summary.teamB.fg2m}/${summary.teamB.fg2a}`} />
                    <StatCard label="3FG" value={`${summary.teamB.fg3m}/${summary.teamB.fg3a}`} />
                    <StatCard label="FT" value={`${summary.teamB.ftm}/${summary.teamB.fta}`} />
                    <StatCard label="REB" value={summary.teamB.reb} />
                    <StatCard label="AST" value={summary.teamB.ast} />
                    <StatCard label="STL" value={summary.teamB.stl} />
                    <StatCard label="BLK" value={summary.teamB.blk} />
                    <StatCard label="TO" value={summary.teamB.tov} />
                    <StatCard label="PF" value={summary.teamB.pf} />
                  </div>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xl font-bold">{teamAName} 球員數據</div>
                  {playerStats.teamA.length === 0 ? (
                    <EmptyState text="目前還沒有球員級數據" />
                  ) : (
                    <div className="space-y-3">
                      {playerStats.teamA.map((r) => (
                        <div key={r.player_id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <div className="mb-2 font-bold">{r.name}</div>
                          <div className="grid grid-cols-4 gap-2 text-center text-sm">
                            <StatCard label="PTS" value={r.pts} />
                            <StatCard label="REB" value={r.reb} />
                            <StatCard label="AST" value={r.ast} />
                            <StatCard label="TO" value={r.tov} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xl font-bold">{teamBName} 球員數據</div>
                  {playerStats.teamB.length === 0 ? (
                    <EmptyState text="目前還沒有球員級數據" />
                  ) : (
                    <div className="space-y-3">
                      {playerStats.teamB.map((r) => (
                        <div key={r.player_id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                          <div className="mb-2 font-bold">{r.name}</div>
                          <div className="grid grid-cols-4 gap-2 text-center text-sm">
                            <StatCard label="PTS" value={r.pts} />
                            <StatCard label="REB" value={r.reb} />
                            <StatCard label="AST" value={r.ast} />
                            <StatCard label="TO" value={r.tov} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {tab === "players" && (
            <div className="space-y-4">
              <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold">球員池</h2>
                  <div className="text-sm text-white/50">從 players 表載入</div>
                </div>

                {rosterPool.length === 0 ? (
                  <EmptyState text="players table 目前沒有 active=true 的球員" />
                ) : (
                  <div className="space-y-3">
                    {rosterPool.map((p) => {
                      const assigned = assignedPlayerIds.has(p.id);
                      return (
                        <div key={p.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="font-semibold">
                                {p.number != null ? `#${p.number} ` : ""}
                                {p.name}
                              </div>
                              <div className="text-sm text-white/50">{p.position || "-"}</div>
                            </div>

                            {assigned ? (
                              <div className="rounded-full bg-white/10 px-3 py-1 text-sm">已加入本場</div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => assignPlayerToTeam(p.id, "teamA")}
                                  disabled={saving}
                                  className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-black disabled:opacity-50"
                                >
                                  加入 {teamAName}
                                </button>
                                <button
                                  onClick={() => assignPlayerToTeam(p.id, "teamB")}
                                  disabled={saving}
                                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold disabled:opacity-50"
                                >
                                  加入 {teamBName}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xl font-bold">{teamAName}</h2>
                    <div className="text-sm text-white/50">本場名單</div>
                  </div>

                  {teamAPlayers.length === 0 ? (
                    <EmptyState text={`目前沒有 ${teamAName} 球員`} />
                  ) : (
                    <div className="space-y-3">
                      {teamAPlayers.map((p) => (
                        <div key={p.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold">
                                {p.player?.number != null ? `#${p.player.number} ` : ""}
                                {p.player?.name ?? "未命名球員"}
                              </div>
                              <div className="mt-1 text-sm text-white/50">{p.player?.position || "-"}</div>
                            </div>

                            <button
                              onClick={() => toggleStarter(p)}
                              disabled={saving}
                              className={`rounded-full px-3 py-2 text-xs font-bold ${
                                p.is_starter
                                  ? "bg-green-500/20 text-green-300"
                                  : "border border-white/10 bg-black/30"
                              }`}
                            >
                              {p.is_starter ? "先發" : "設先發"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xl font-bold">{teamBName}</h2>
                    <div className="text-sm text-white/50">本場名單</div>
                  </div>

                  {teamBPlayers.length === 0 ? (
                    <EmptyState text={`目前沒有 ${teamBName} 球員`} />
                  ) : (
                    <div className="space-y-3">
                      {teamBPlayers.map((p) => (
                        <div key={p.id} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold">
                                {p.player?.number != null ? `#${p.player.number} ` : ""}
                                {p.player?.name ?? "未命名球員"}
                              </div>
                              <div className="mt-1 text-sm text-white/50">{p.player?.position || "-"}</div>
                            </div>

                            <button
                              onClick={() => toggleStarter(p)}
                              disabled={saving}
                              className={`rounded-full px-3 py-2 text-xs font-bold ${
                                p.is_starter
                                  ? "bg-green-500/20 text-green-300"
                                  : "border border-white/10 bg-black/30"
                              }`}
                            >
                              {p.is_starter ? "先發" : "設先發"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}