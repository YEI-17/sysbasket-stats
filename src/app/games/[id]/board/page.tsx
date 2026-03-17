"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  team_side?: "teamA" | "teamB" | null;
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

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  is_live?: boolean | null;
  ended_at?: string | null;
  status?: string | null;
};

type Player = {
  id: string;
  name: string;
  number: number | null;
  active?: boolean | null;
};

type GamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "teamA" | "teamB";
  is_starter: boolean;
};

type PlayerShiftRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "teamA" | "teamB";
  quarter: number;
  in_seconds_left: number;
  out_seconds_left: number | null;
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
  plusMinus: number;
};

const CLOCK_TABLE = "game_clock";
const REGULAR_SECONDS = 600;

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
  plusMinus: 0,
});

function formatClock(secondsLeft: number) {
  const safe = Math.max(0, Math.floor(secondsLeft || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMinutesFromSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getQuarterSeconds(quarter: number) {
  return quarter <= 4 ? 600 : 300;
}

function getLiveSecondsFromShifts(params: {
  playerId: string;
  shifts: PlayerShiftRow[];
  clock: ClockRow | null;
  displaySeconds: number;
}) {
  const { playerId, shifts, clock, displaySeconds } = params;

  const playerShifts = shifts.filter((s) => s.player_id === playerId);
  let total = 0;

  for (const s of playerShifts) {
    const maxSeconds = getQuarterSeconds(s.quarter);
    const inSec = Math.max(0, Math.min(maxSeconds, s.in_seconds_left ?? maxSeconds));

    if (s.out_seconds_left == null) {
      if (clock && clock.quarter === s.quarter) {
        total += Math.max(0, inSec - displaySeconds);
      }
    } else {
      const outSec = Math.max(0, Math.min(maxSeconds, s.out_seconds_left));
      total += Math.max(0, inSec - outSec);
    }
  }

  return total;
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

function isScoringEvent(eventType: string) {
  return eventType === "fg2_made" || eventType === "fg3_made" || eventType === "ft_made";
}

function computeDisplaySeconds(clock: ClockRow | null) {
  if (!clock) return REGULAR_SECONDS;

  const base = Math.max(0, clock.seconds_left ?? 0);

  if (!clock.is_running) return base;
  if (!clock.updated_at) return base;

  const updatedAtMs = new Date(clock.updated_at).getTime();
  if (Number.isNaN(updatedAtMs)) return base;

  const nowMs = Date.now();
  const elapsedSeconds = Math.floor((nowMs - updatedAtMs) / 1000);

  return Math.max(0, base - elapsedSeconds);
}

function getQuarterLabel(quarter: number) {
  if (quarter <= 4) return `Q${quarter}`;
  return `OT${quarter - 4}`;
}

function sortPlayers(list: Player[]) {
  return [...list].sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
}

function getGameStatusText(game: GameRow | null, clock: ClockRow | null) {
  if (game?.status === "finished") return "比賽已結束";
  if (clock?.is_running) return "計時中";
  return "暫停中";
}

function getGameStatusColors(game: GameRow | null, clock: ClockRow | null) {
  if (game?.status === "finished") {
    return {
      background: "rgba(34,197,94,0.14)",
      color: "#bbf7d0",
      borderColor: "rgba(34,197,94,0.28)",
      dot: "#4ade80",
    };
  }

  if (clock?.is_running) {
    return {
      background: "rgba(239,68,68,0.14)",
      color: "#fecaca",
      borderColor: "rgba(239,68,68,0.30)",
      dot: "#ef4444",
    };
  }

  return {
    background: "rgba(245,158,11,0.14)",
    color: "#fde68a",
    borderColor: "rgba(245,158,11,0.28)",
    dot: "#f59e0b",
  };
}

export default function BoardPage() {
  const params = useParams();
  const gameId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clock, setClock] = useState<ClockRow | null>(null);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);
  const [displaySeconds, setDisplaySeconds] = useState(REGULAR_SECONDS);
  const [playerShifts, setPlayerShifts] = useState<PlayerShiftRow[]>([]);
  const [viewerCount, setViewerCount] = useState(1);

  const presenceKeyRef = useRef(`viewer-${Math.random().toString(36).slice(2)}`);

  async function loadGame() {
    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, is_live, ended_at, status")
      .eq("id", gameId)
      .single();

    if (error) {
      setMsg(`讀取 games 失敗：${error.message}`);
      return;
    }

    setGame(data as GameRow);
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, number, active")
      .order("number", { ascending: true });

    if (error) {
      setMsg(`讀取 players 失敗：${error.message}`);
      return;
    }

    setPlayers((data as Player[]) || []);
  }

  async function loadGamePlayers() {
    const { data, error } = await supabase
      .from("game_players")
      .select("id, game_id, player_id, team_side, is_starter")
      .eq("game_id", gameId);

    if (error) {
      setMsg(`讀取 game_players 失敗：${error.message}`);
      return;
    }

    setGamePlayers((data as GamePlayerRow[]) || []);
  }

  async function loadPlayerShifts() {
    const { data, error } = await supabase
      .from("player_shifts")
      .select("id, game_id, player_id, team_side, quarter, in_seconds_left, out_seconds_left")
      .eq("game_id", gameId)
      .eq("team_side", "teamA");

    if (error) {
      setMsg(`讀取 player_shifts 失敗：${error.message}`);
      return;
    }

    setPlayerShifts((data as PlayerShiftRow[]) || []);
  }

  async function loadEvents() {
    const { data, error } = await supabase
      .from("events")
      .select("id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (error) {
      setMsg(`讀取 events 失敗：${error.message}`);
      return;
    }

    setEvents((data as EventRow[]) || []);
  }

  async function loadClock() {
    const { data, error } = await supabase
      .from(CLOCK_TABLE)
      .select("game_id, quarter, seconds_left, is_running, updated_at")
      .eq("game_id", gameId)
      .order("quarter", { ascending: false })
      .limit(1);

    if (error) {
      setMsg(`讀取 ${CLOCK_TABLE} 失敗：${error.message}`);
      return;
    }

    const latest = (data as ClockRow[] | null)?.[0] ?? null;

    if (!latest) {
      const { data: inserted, error: insertError } = await supabase
        .from(CLOCK_TABLE)
        .insert({
          game_id: gameId,
          quarter: 1,
          seconds_left: REGULAR_SECONDS,
          is_running: false,
        })
        .select("game_id, quarter, seconds_left, is_running, updated_at")
        .single();

      if (insertError) {
        setMsg(`建立 ${CLOCK_TABLE} 失敗：${insertError.message}`);
        return;
      }

      setClock(inserted as ClockRow);
      return;
    }

    setClock(latest);
  }

  async function loadAll(showLoading = false) {
    if (!gameId) return;
    if (showLoading) setLoading(true);
    setMsg("");

    await Promise.all([
      loadGame(),
      loadPlayers(),
      loadGamePlayers(),
      loadPlayerShifts(),
      loadEvents(),
      loadClock(),
    ]);

    if (showLoading) setLoading(false);
  }

  useEffect(() => {
    if (!gameId) return;
    loadAll(true);
  }, [gameId]);

  useEffect(() => {
    setDisplaySeconds(computeDisplaySeconds(clock));

    const timer = setInterval(() => {
      setDisplaySeconds(computeDisplaySeconds(clock));
    }, 250);

    return () => clearInterval(timer);
  }, [clock]);

  useEffect(() => {
    if (!gameId) return;

    const presenceChannel = supabase.channel(`game-presence-${gameId}`, {
      config: {
        presence: { key: presenceKeyRef.current },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const count = Object.keys(state).length;
        setViewerCount(count || 1);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            role: "viewer",
            page: "board",
            gameId,
            joinedAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    const dataChannel = supabase.channel(`game-data-${gameId}`);

    dataChannel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const newRow = payload.new as GameRow | undefined;
          if (newRow && newRow.id) {
            setGame(newRow);
          } else {
            loadGame();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          await loadEvents();
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
          await loadGamePlayers();
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
          await loadPlayerShifts();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: CLOCK_TABLE,
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const newRow = payload.new as ClockRow | undefined;
          if (newRow && newRow.game_id) {
            setClock(newRow);
          } else {
            loadClock();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dataChannel);
    };
  }, [gameId]);

  const validEvents = useMemo(() => {
    return events.filter((e) => !e.is_undone);
  }, [events]);

  const playersMap = useMemo(() => {
    const map: Record<string, Player> = {};
    for (const p of players) {
      map[p.id] = p;
    }
    return map;
  }, [players]);

  const teamAGamePlayers = useMemo(() => {
    return gamePlayers.filter((gp) => gp.team_side === "teamA");
  }, [gamePlayers]);

  const teamAPlayerIds = useMemo(() => {
    return teamAGamePlayers.map((gp) => gp.player_id);
  }, [teamAGamePlayers]);

  const teamAPlayers = useMemo(() => {
    const merged: Player[] = teamAPlayerIds
      .map((id) => playersMap[id])
      .filter(Boolean);

    return sortPlayers(merged);
  }, [teamAPlayerIds, playersMap]);

  const starterIds = useMemo(() => {
    return teamAGamePlayers
      .filter((gp) => gp.is_starter)
      .map((gp) => gp.player_id)
      .slice(0, 5);
  }, [teamAGamePlayers]);

  const currentOnCourtIds = useMemo(() => {
    const lineup = new Set<string>(starterIds);

    for (const e of validEvents) {
      if (e.team_side !== "teamA") continue;
      if (!e.player_id) continue;

      if (e.event_type === "sub_out") {
        lineup.delete(e.player_id);
        continue;
      }

      if (e.event_type === "sub_in") {
        lineup.add(e.player_id);
        continue;
      }
    }

    return Array.from(lineup);
  }, [starterIds, validEvents]);

  const statsMap = useMemo(() => {
    const map: Record<string, Stat> = {};

    for (const p of teamAPlayers) {
      map[p.id] = emptyStat();
    }

    const lineup = new Set<string>(starterIds);

    for (const e of validEvents) {
      if (e.team_side === "teamA" && e.player_id && !map[e.player_id]) {
        map[e.player_id] = emptyStat();
      }

      if (e.team_side === "teamA" && e.player_id) {
        if (e.event_type === "sub_out") {
          lineup.delete(e.player_id);
          continue;
        }

        if (e.event_type === "sub_in") {
          lineup.add(e.player_id);
          continue;
        }
      }

      if (e.team_side === "teamA" && e.player_id) {
        applyEvent(map[e.player_id], e.event_type);
      }

      if (isScoringEvent(e.event_type)) {
        const pts = getPoints(e.event_type);
        if (pts > 0) {
          for (const playerId of Array.from(lineup)) {
            if (!map[playerId]) map[playerId] = emptyStat();

            if (e.team_side === "teamA") {
              map[playerId].plusMinus += pts;
            } else if (e.team_side === "teamB") {
              map[playerId].plusMinus -= pts;
            }
          }
        }
      }
    }

    return map;
  }, [teamAPlayers, validEvents, starterIds]);

  const minutesMap = useMemo(() => {
    const map: Record<string, number> = {};

    for (const p of teamAPlayers) {
      map[p.id] = getLiveSecondsFromShifts({
        playerId: p.id,
        shifts: playerShifts,
        clock,
        displaySeconds,
      });
    }

    return map;
  }, [teamAPlayers, playerShifts, clock, displaySeconds]);

  const totalScore = useMemo(() => {
    let home = 0;
    let away = 0;

    for (const e of validEvents) {
      const pts = getPoints(e.event_type);
      if (e.team_side === "teamA") home += pts;
      if (e.team_side === "teamB") away += pts;
    }

    return { home, away };
  }, [validEvents]);

  const quarterScores = useMemo(() => {
    const maxQuarter = Math.max(clock?.quarter ?? 1, ...validEvents.map((e) => e.quarter), 1);
    const byQuarter: Record<number, { home: number; away: number }> = {};

    for (let q = 1; q <= maxQuarter; q += 1) {
      byQuarter[q] = { home: 0, away: 0 };
    }

    for (const e of validEvents) {
      if (!byQuarter[e.quarter]) {
        byQuarter[e.quarter] = { home: 0, away: 0 };
      }

      const pts = getPoints(e.event_type);
      if (e.team_side === "teamA") byQuarter[e.quarter].home += pts;
      if (e.team_side === "teamB") byQuarter[e.quarter].away += pts;
    }

    return byQuarter;
  }, [validEvents, clock?.quarter]);

  const onCourtPlayers = useMemo(() => {
    return teamAPlayers.filter((p) => currentOnCourtIds.includes(p.id));
  }, [teamAPlayers, currentOnCourtIds]);

  const benchPlayers = useMemo(() => {
    return teamAPlayers.filter((p) => !currentOnCourtIds.includes(p.id));
  }, [teamAPlayers, currentOnCourtIds]);

  const teamTotals = useMemo(() => {
    const total = emptyStat();
    let totalSeconds = 0;

    for (const p of teamAPlayers) {
      const s = statsMap[p.id] || emptyStat();
      total.pts += s.pts;
      total.fg2m += s.fg2m;
      total.fg2a += s.fg2a;
      total.fg3m += s.fg3m;
      total.fg3a += s.fg3a;
      total.ftm += s.ftm;
      total.fta += s.fta;
      total.reb += s.reb;
      total.ast += s.ast;
      total.tov += s.tov;
      total.stl += s.stl;
      total.blk += s.blk;
      total.pf += s.pf;
      totalSeconds += minutesMap[p.id] || 0;
    }

    total.plusMinus = totalScore.home - totalScore.away;

    return {
      stat: total,
      totalSeconds,
    };
  }, [teamAPlayers, statsMap, minutesMap, totalScore]);

  const statusColors = getGameStatusColors(game, clock);

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={bgGlowTopStyle} />
        <div style={bgGlowBottomStyle} />
        <div style={loadingCardStyle}>載入中...</div>
      </main>
    );
  }

  function renderPlayerRow(p: Player, isOnCourt: boolean) {
    const s = statsMap[p.id] || emptyStat();
    const min = formatMinutesFromSeconds(minutesMap[p.id] || 0);

    return (
      <tr
        key={p.id}
        style={{
          background: isOnCourt ? "rgba(255,255,255,0.02)" : "transparent",
        }}
      >
        <td style={tdNameStyle}>
          <div style={playerCellWrapStyle}>
            <span
              style={{
                ...playerDotStyle,
                background: isOnCourt ? "#f97316" : "#52525b",
                boxShadow: isOnCourt ? "0 0 14px rgba(249,115,22,0.45)" : "none",
              }}
            />
            <span style={playerNameStyle}>
              {p.number ? `#${p.number} ` : ""}
              {p.name}
            </span>
          </div>
        </td>
        <td style={tdStyle}>{min}</td>
        <td style={{ ...tdStyle, color: "#fdba74", fontWeight: 800 }}>{s.pts}</td>
        <td style={tdStyle}>{s.fg2m}/{s.fg2a}</td>
        <td style={tdStyle}>{s.fg3m}/{s.fg3a}</td>
        <td style={tdStyle}>{s.ftm}/{s.fta}</td>
        <td style={tdStyle}>{s.reb}</td>
        <td style={tdStyle}>{s.ast}</td>
        <td style={tdStyle}>{s.tov}</td>
        <td style={tdStyle}>{s.stl}</td>
        <td style={tdStyle}>{s.blk}</td>
        <td style={tdStyle}>{s.pf}</td>
        <td
          style={{
            ...tdStyle,
            fontWeight: 800,
            color: s.plusMinus > 0 ? "#86efac" : s.plusMinus < 0 ? "#fca5a5" : "#f4f4f5",
          }}
        >
          {s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus}
        </td>
      </tr>
    );
  }

  function renderTeamRow() {
    const s = teamTotals.stat;
    const min = formatMinutesFromSeconds(teamTotals.totalSeconds);

    return (
      <tr style={teamTotalRowStyle}>
        <td style={teamTotalNameStyle}>TEAM</td>
        <td style={teamTotalTdStyle}>{min}</td>
        <td style={{ ...teamTotalTdStyle, color: "#fdba74", fontWeight: 900 }}>{s.pts}</td>
        <td style={teamTotalTdStyle}>{s.fg2m}/{s.fg2a}</td>
        <td style={teamTotalTdStyle}>{s.fg3m}/{s.fg3a}</td>
        <td style={teamTotalTdStyle}>{s.ftm}/{s.fta}</td>
        <td style={teamTotalTdStyle}>{s.reb}</td>
        <td style={teamTotalTdStyle}>{s.ast}</td>
        <td style={teamTotalTdStyle}>{s.tov}</td>
        <td style={teamTotalTdStyle}>{s.stl}</td>
        <td style={teamTotalTdStyle}>{s.blk}</td>
        <td style={teamTotalTdStyle}>{s.pf}</td>
        <td
          style={{
            ...teamTotalTdStyle,
            fontWeight: 900,
            color: s.plusMinus > 0 ? "#86efac" : s.plusMinus < 0 ? "#fca5a5" : "#f4f4f5",
          }}
        >
          {s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus}
        </td>
      </tr>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={bgGlowTopStyle} />
      <div style={bgGlowBottomStyle} />
      <div style={bgBallStyle} />

      <div style={containerStyle}>
        <div style={topBarStyle}>
          <div style={topLeftStyle}>
            <div style={eyebrowStyle}>COURTSIDE LIVE BOARD</div>
          </div>
          <LogoutButton />
        </div>

        {!!msg && <div style={errorStyle}>{msg}</div>}

        <section style={scoreCardStyle}>
          <div style={scoreGlowOverlayStyle} />

          <div style={teamBigBlockStyle}>
            <div style={teamLabelStyle}>{game?.teamA || "主場"}</div>
            <div style={bigScoreStyle}>{totalScore.home}</div>
          </div>

          <div style={centerBlockStyle}>
            <div style={topInfoRowStyle}>
              <div style={quarterBadgeStyle}>{getQuarterLabel(clock?.quarter ?? 1)}</div>

              <div style={viewerPillStyle}>
                <span style={viewerDotStyle} />
                線上觀看 {viewerCount}
              </div>

              <div
                style={{
                  ...statusBadgeStyle,
                  background: statusColors.background,
                  color: statusColors.color,
                  borderColor: statusColors.borderColor,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: statusColors.dot,
                    display: "inline-block",
                  }}
                />
                {getGameStatusText(game, clock)}
              </div>
            </div>

            <div style={clockStyle}>{formatClock(displaySeconds)}</div>

            <div style={quarterScoreRowStyle}>
              {Object.entries(quarterScores).map(([q, score]) => (
                <div key={q} style={quarterCardStyle}>
                  <div style={quarterCardTitleStyle}>{getQuarterLabel(Number(q))}</div>
                  <div style={quarterCardValueStyle}>
                    {score.home} - {score.away}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={teamBigBlockStyle}>
            <div style={teamLabelStyle}>{game?.teamB || "客場"}</div>
            <div style={bigScoreStyle}>{totalScore.away}</div>
          </div>
        </section>

        <section style={tableCardStyle}>
          <div style={tableHeaderWrapStyle}>
            <div>
              <div style={sectionEyebrowStyle}>TEAM A LIVE STATS</div>
              <h2 style={sectionTitleStyle}>球員數據</h2>
            </div>

            <div style={legendWrapStyle}>
              <div style={legendItemStyle}>
                <span style={{ ...legendDotStyle, background: "#f97316" }} />
                場上球員
              </div>
              <div style={legendItemStyle}>
                <span style={{ ...legendDotStyle, background: "#52525b" }} />
                場下球員
              </div>
            </div>
          </div>

          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thNameStyle}>球員</th>
                  <th style={thStyle}>MIN</th>
                  <th style={thStyle}>PTS</th>
                  <th style={thStyle}>2PT</th>
                  <th style={thStyle}>3PT</th>
                  <th style={thStyle}>FT</th>
                  <th style={thStyle}>REB</th>
                  <th style={thStyle}>AST</th>
                  <th style={thStyle}>TOV</th>
                  <th style={thStyle}>STL</th>
                  <th style={thStyle}>BLK</th>
                  <th style={thStyle}>PF</th>
                  <th style={thStyle}>+/-</th>
                </tr>
              </thead>
              <tbody>
                {onCourtPlayers.map((p) => renderPlayerRow(p, true))}
                {benchPlayers.map((p) => renderPlayerRow(p, false))}
                {renderTeamRow()}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, rgba(249,115,22,0.16), transparent 28%), #05060a",
  color: "#f4f4f5",
  position: "relative",
  overflow: "hidden",
};

const containerStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  width: "100%",
  maxWidth: 1600,
  margin: "0 auto",
  padding: "20px 18px 28px",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 18,
};

const topLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const eyebrowStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.16em",
  color: "#fef3c7",
};

const scoreCardStyle: React.CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "1fr 1.15fr 1fr",
  gap: 16,
  padding: 24,
  borderRadius: 28,
  border: "1px solid rgba(255,255,255,0.08)",
  background:
    "linear-gradient(180deg, rgba(17,24,39,0.92), rgba(2,6,23,0.96))",
  boxShadow:
    "0 24px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
  overflow: "hidden",
};

const scoreGlowOverlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(circle at 50% 0%, rgba(59,130,246,0.10), transparent 28%), radial-gradient(circle at 0% 50%, rgba(249,115,22,0.10), transparent 26%), radial-gradient(circle at 100% 50%, rgba(249,115,22,0.10), transparent 26%)",
  pointerEvents: "none",
};

const teamBigBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  minHeight: 240,
  zIndex: 1,
};

const teamLabelStyle: React.CSSProperties = {
  fontSize: 42,
  fontWeight: 900,
  letterSpacing: "-0.02em",
  marginBottom: 16,
};

const bigScoreStyle: React.CSSProperties = {
  fontSize: 150,
  lineHeight: 1,
  fontWeight: 900,
  letterSpacing: "-0.06em",
};

const centerBlockStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1,
};

const topInfoRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: 10,
  marginBottom: 20,
};

const quarterBadgeStyle: React.CSSProperties = {
  minWidth: 76,
  height: 48,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  fontWeight: 900,
  fontSize: 18,
};

const viewerPillStyle: React.CSSProperties = {
  height: 48,
  padding: "0 16px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontWeight: 700,
};

const viewerDotStyle: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: 999,
  background: "#22c55e",
  boxShadow: "0 0 12px rgba(34,197,94,0.55)",
};

const statusBadgeStyle: React.CSSProperties = {
  height: 48,
  padding: "0 16px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  border: "1px solid transparent",
  fontWeight: 800,
};

const clockStyle: React.CSSProperties = {
  fontSize: 104,
  lineHeight: 1,
  fontWeight: 900,
  letterSpacing: "-0.06em",
  marginBottom: 22,
};

const quarterScoreRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: 10,
};

const quarterCardStyle: React.CSSProperties = {
  minWidth: 104,
  padding: "16px 14px",
  borderRadius: 18,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  textAlign: "center",
};

const quarterCardTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#a1a1aa",
  marginBottom: 8,
};

const quarterCardValueStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
};

const tableCardStyle: React.CSSProperties = {
  marginTop: 18,
  borderRadius: 28,
  border: "1px solid rgba(255,255,255,0.08)",
  background:
    "linear-gradient(180deg, rgba(17,24,39,0.88), rgba(2,6,23,0.94))",
  boxShadow:
    "0 24px 60px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)",
  overflow: "hidden",
};

const tableHeaderWrapStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 16,
  padding: "22px 22px 14px",
};

const sectionEyebrowStyle: React.CSSProperties = {
  fontSize: 13,
  letterSpacing: "0.14em",
  fontWeight: 800,
  color: "#fdba74",
  marginBottom: 10,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  fontWeight: 900,
};

const legendWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const legendItemStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#d4d4d8",
  fontWeight: 700,
};

const legendDotStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
};

const tableScrollStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 1100,
  borderCollapse: "collapse",
};

const thNameStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "18px 16px",
  color: "#a1a1aa",
  fontSize: 15,
  fontWeight: 800,
  borderTop: "1px solid rgba(255,255,255,0.08)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const thStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "18px 12px",
  color: "#a1a1aa",
  fontSize: 15,
  fontWeight: 800,
  borderTop: "1px solid rgba(255,255,255,0.08)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const tdNameStyle: React.CSSProperties = {
  padding: "18px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "18px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const playerCellWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const playerDotStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  flexShrink: 0,
};

const playerNameStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
};

const teamTotalRowStyle: React.CSSProperties = {
  background:
    "linear-gradient(90deg, rgba(249,115,22,0.16), rgba(255,255,255,0.03))",
};

const teamTotalNameStyle: React.CSSProperties = {
  padding: "18px 16px",
  fontWeight: 900,
  fontSize: 16,
};

const teamTotalTdStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "18px 12px",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const loadingCardStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 24,
  fontWeight: 900,
  color: "#f4f4f5",
};

const errorStyle: React.CSSProperties = {
  marginBottom: 14,
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(127,29,29,0.22)",
  color: "#fecaca",
  fontWeight: 700,
};

const bgGlowTopStyle: React.CSSProperties = {
  position: "absolute",
  top: -180,
  left: "10%",
  width: 420,
  height: 420,
  borderRadius: "50%",
  background: "rgba(249,115,22,0.14)",
  filter: "blur(120px)",
  zIndex: 0,
};

const bgGlowBottomStyle: React.CSSProperties = {
  position: "absolute",
  right: "-4%",
  bottom: -220,
  width: 460,
  height: 460,
  borderRadius: "50%",
  background: "rgba(249,115,22,0.12)",
  filter: "blur(130px)",
  zIndex: 0,
};

const bgBallStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(circle at center, rgba(255,255,255,0.02) 0, transparent 52%)",
  zIndex: 0,
  pointerEvents: "none",
};