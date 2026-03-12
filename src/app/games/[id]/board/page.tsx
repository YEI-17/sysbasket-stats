"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  active?: boolean;
};

type GamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "A" | "B";
  is_starter: boolean;
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
  plusMinus: null,
});

function formatClock(secondsLeft: number) {
  const safe = Math.max(0, secondsLeft || 0);
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

function getQuarterPlayedSeconds(
  quarter: number,
  currentQuarter: number,
  currentDisplaySeconds: number
) {
  if (quarter < currentQuarter) return REGULAR_SECONDS;
  if (quarter > currentQuarter) return 0;
  return REGULAR_SECONDS - currentDisplaySeconds;
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
      .eq("active", true)
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

  const teamAPlayerIds = useMemo(() => {
    const ids = gamePlayers
      .filter((gp) => gp.team_side === "A")
      .map((gp) => gp.player_id);

    if (ids.length > 0) return ids;
    return players.map((p) => p.id);
  }, [gamePlayers, players]);

  const teamAPlayers = useMemo(() => {
    return sortPlayers(players.filter((p) => teamAPlayerIds.includes(p.id)));
  }, [players, teamAPlayerIds]);

  const starterIds = useMemo(() => {
    const ids = gamePlayers
      .filter((gp) => gp.team_side === "A" && gp.is_starter)
      .map((gp) => gp.player_id);

    if (ids.length > 0) return ids;
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

  const statsMap = useMemo(() => {
    const map: Record<string, Stat> = {};

    for (const p of teamAPlayers) {
      map[p.id] = emptyStat();
    }

    for (const e of validEvents) {
      if (e.team_side !== "A") continue;
      if (!e.player_id) continue;

      if (!map[e.player_id]) {
        map[e.player_id] = emptyStat();
      }

      applyEvent(map[e.player_id], e.event_type);
    }

    return map;
  }, [teamAPlayers, validEvents]);

  const minutesMap = useMemo(() => {
    const map: Record<string, number> = {};
    const currentQuarter = clock?.quarter ?? 1;

    for (const p of teamAPlayers) {
      map[p.id] = 0;
    }

    const activeStartByPlayerQuarter: Record<string, number | null> = {};

    for (let q = 1; q <= currentQuarter; q += 1) {
      const playedSecondsThisQuarter = getQuarterPlayedSeconds(q, currentQuarter, displaySeconds);

      const quarterEvents = validEvents.filter(
        (e) => e.team_side === "A" && e.quarter === q && !!e.player_id
      );

      const initialOnCourt = new Set<string>();

      if (q === 1) {
        starterIds.forEach((id) => initialOnCourt.add(id));
      } else {
        const prevQuarterLineup = new Set<string>(starterIds);

        for (const e of validEvents) {
          if (e.team_side !== "A") continue;
          if (!e.player_id) continue;
          if (e.quarter >= q) break;

          if (e.event_type === "sub_in") prevQuarterLineup.add(e.player_id);
          if (e.event_type === "sub_out") prevQuarterLineup.delete(e.player_id);
        }

        prevQuarterLineup.forEach((id) => initialOnCourt.add(id));
      }

      for (const p of teamAPlayers) {
        const key = `${p.id}-${q}`;
        activeStartByPlayerQuarter[key] = initialOnCourt.has(p.id) ? 0 : null;
      }

      for (const e of quarterEvents) {
        const elapsedApprox = Math.min(
          playedSecondsThisQuarter,
          Math.max(
            0,
            Math.floor(
              ((new Date(e.created_at).getTime() -
                new Date(
                  quarterEvents[0]?.created_at ?? e.created_at
                ).getTime()) /
                1000)
            )
          )
        );

        const playerId = e.player_id!;
        const key = `${playerId}-${q}`;
        const startAt = activeStartByPlayerQuarter[key];

        if (e.event_type === "sub_in") {
          if (startAt == null) {
            activeStartByPlayerQuarter[key] = elapsedApprox;
          }
        }

        if (e.event_type === "sub_out") {
          if (startAt != null) {
            map[playerId] = (map[playerId] || 0) + Math.max(0, elapsedApprox - startAt);
            activeStartByPlayerQuarter[key] = null;
          }
        }
      }

      for (const p of teamAPlayers) {
        const key = `${p.id}-${q}`;
        const startAt = activeStartByPlayerQuarter[key];

        if (startAt != null) {
          map[p.id] = (map[p.id] || 0) + Math.max(0, playedSecondsThisQuarter - startAt);
        }
      }
    }

    return map;
  }, [teamAPlayers, validEvents, starterIds, clock?.quarter, displaySeconds]);

  const totalScore = useMemo(() => {
    let home = 0;
    let away = 0;

    for (const e of validEvents) {
      const pts = getPoints(e.event_type);
      if (e.team_side === "A") home += pts;
      if (e.team_side === "B") away += pts;
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
      if (e.team_side === "A") byQuarter[e.quarter].home += pts;
      if (e.team_side === "B") byQuarter[e.quarter].away += pts;
    }

    return byQuarter;
  }, [validEvents, clock?.quarter]);

  const onCourtPlayers = useMemo(() => {
    return teamAPlayers.filter((p) => currentOnCourtIds.includes(p.id));
  }, [teamAPlayers, currentOnCourtIds]);

  const benchPlayers = useMemo(() => {
    return teamAPlayers.filter((p) => !currentOnCourtIds.includes(p.id));
  }, [teamAPlayers, currentOnCourtIds]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={{ color: "#aaa", fontSize: 18 }}>載入中...</div>
      </main>
    );
  }

  function renderPlayerRow(p: Player) {
    const s = statsMap[p.id] || emptyStat();
    const min = formatMinutesFromSeconds(minutesMap[p.id] || 0);

    return (
      <tr key={p.id}>
        <td style={tdNameStyle}>
          {p.number ? `#${p.number} ` : ""}
          {p.name}
        </td>
        <td style={tdStyle}>{min}</td>
        <td style={tdStyle}>{s.pts}</td>
        <td style={tdStyle}>
          {s.fg2m}/{s.fg2a}
        </td>
        <td style={tdStyle}>
          {s.fg3m}/{s.fg3a}
        </td>
        <td style={tdStyle}>
          {s.ftm}/{s.fta}
        </td>
        <td style={tdStyle}>{s.reb}</td>
        <td style={tdStyle}>{s.ast}</td>
        <td style={tdStyle}>{s.tov}</td>
        <td style={tdStyle}>{s.stl}</td>
        <td style={tdStyle}>{s.blk}</td>
        <td style={tdStyle}>{s.pf}</td>
        <td style={tdStyle}>{s.plusMinus ?? "—"}</td>
      </tr>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={topBarStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 14, color: "#9a9a9a" }}>比賽看板</div>
            <Link href={`/games/${gameId}/box`} style={linkButtonStyle}>
              Box Score
            </Link>
          </div>
          <LogoutButton />
        </div>

        <section style={scoreCardStyle}>
          <div style={teamBigBlockStyle}>
            <div style={teamLabelStyle}>{game?.teamA || "主場"}</div>
            <div style={bigScoreStyle}>{totalScore.home}</div>
          </div>

          <div style={centerBlockStyle}>
            <div style={topInfoRowStyle}>
              <div style={quarterStyle}>{getQuarterLabel(clock?.quarter ?? 1)}</div>
              <div style={viewerStyle}>線上觀看：{viewerCount}</div>

              <div
                style={{
                  ...statusBadgeStyle,
                  background:
                    game?.status === "finished" ? "#3a1111" : clock?.is_running ? "#102814" : "#3a3211",
                  color:
                    game?.status === "finished" ? "#ff9c9c" : clock?.is_running ? "#9effae" : "#ffe08a",
                  borderColor:
                    game?.status === "finished" ? "#5a2020" : clock?.is_running ? "#1f5a2c" : "#5a4b20",
                }}
              >
                {game?.status === "finished"
                  ? "比賽已結束"
                  : clock?.is_running
                  ? "計時中"
                  : "暫停中"}
              </div>
            </div>

            <div style={clockStyle}>{formatClock(displaySeconds)}</div>

            <div style={quarterLineStyle}>
              {Object.keys(quarterScores)
                .map(Number)
                .sort((a, b) => a - b)
                .map((q) => (
                  <span key={q}>
                    {getQuarterLabel(q)} {quarterScores[q].home}:{quarterScores[q].away}
                  </span>
                ))}
            </div>
          </div>

          <div style={teamBigBlockStyle}>
            <div style={teamLabelStyle}>{game?.teamB || "客場"}</div>
            <div style={bigScoreStyle}>{totalScore.away}</div>
          </div>
        </section>

        <section style={tableCardStyle}>
          <div style={sectionTitleStyle}>球員數據</div>

          <div style={lineupSummaryStyle}>
            <div style={lineupGroupStyle}>
              <span style={lineupDotOnStyle} />
              <span>場上 5 人</span>
            </div>
            <div style={lineupGroupStyle}>
              <span style={lineupDotBenchStyle} />
              <span>場下球員</span>
            </div>
          </div>

          <div style={tableWrapStyle}>
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
                {onCourtPlayers.map(renderPlayerRow)}

                {benchPlayers.length > 0 && (
                  <tr>
                    <td colSpan={13} style={dividerCellStyle}>
                      <div style={dividerWrapStyle}>
                        <div style={dividerLineStyle} />
                        <div style={dividerLabelStyle}>場上 / 場下分隔</div>
                        <div style={dividerLineStyle} />
                      </div>
                    </td>
                  </tr>
                )}

                {benchPlayers.map(renderPlayerRow)}
              </tbody>
            </table>
          </div>
        </section>

        {msg && <div style={msgStyle}>{msg}</div>}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#000",
  color: "#fff",
  padding: 16,
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1500,
  margin: "0 auto",
  display: "grid",
  gap: 16,
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const linkButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  background: "#4f46e5",
  color: "#fff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};

const scoreCardStyle: React.CSSProperties = {
  background: "#0b0b0b",
  border: "1px solid #222",
  borderRadius: 24,
  padding: 24,
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr 1.2fr",
  alignItems: "center",
  gap: 20,
};

const teamBigBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  justifyItems: "center",
};

const centerBlockStyle: React.CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: 16,
};

const topInfoRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  justifyContent: "center",
};

const teamLabelStyle: React.CSSProperties = {
  fontSize: 30,
  color: "#c7c7c7",
  fontWeight: 700,
};

const bigScoreStyle: React.CSSProperties = {
  fontSize: 140,
  lineHeight: 1,
  fontWeight: 900,
};

const quarterStyle: React.CSSProperties = {
  fontSize: 30,
  color: "#d0d0d0",
  fontWeight: 800,
};

const viewerStyle: React.CSSProperties = {
  fontSize: 20,
  color: "#9a9a9a",
};

const statusBadgeStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid #333",
};

const clockStyle: React.CSSProperties = {
  fontSize: 96,
  lineHeight: 1,
  fontWeight: 900,
};

const quarterLineStyle: React.CSSProperties = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  justifyContent: "center",
  color: "#9a9a9a",
  fontSize: 18,
};

const tableCardStyle: React.CSSProperties = {
  background: "#0b0b0b",
  border: "1px solid #222",
  borderRadius: 24,
  overflow: "hidden",
};

const sectionTitleStyle: React.CSSProperties = {
  padding: "18px 20px",
  fontSize: 22,
  fontWeight: 800,
  borderBottom: "1px solid #1f1f1f",
};

const lineupSummaryStyle: React.CSSProperties = {
  display: "flex",
  gap: 18,
  alignItems: "center",
  padding: "12px 20px 0 20px",
  color: "#cfcfcf",
  fontSize: 14,
  flexWrap: "wrap",
};

const lineupGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const lineupDotOnStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#67e08a",
  display: "inline-block",
};

const lineupDotBenchStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#666",
  display: "inline-block",
};

const tableWrapStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 1180,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "16px 10px",
  borderBottom: "1px solid #222",
  color: "#cfcfcf",
  fontSize: 18,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const thNameStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "16px 14px",
  borderBottom: "1px solid #222",
  color: "#cfcfcf",
  fontSize: 18,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "16px 10px",
  borderBottom: "1px solid #1b1b1b",
  fontSize: 18,
  color: "#f5f5f5",
  whiteSpace: "nowrap",
};

const tdNameStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "16px 14px",
  borderBottom: "1px solid #1b1b1b",
  fontSize: 18,
  color: "#f5f5f5",
  whiteSpace: "nowrap",
};

const dividerCellStyle: React.CSSProperties = {
  padding: "14px 12px",
  background: "#050505",
  borderBottom: "1px solid #1b1b1b",
};

const dividerWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: "#2a2a2a",
};

const dividerLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "#8f8f8f",
  whiteSpace: "nowrap",
  letterSpacing: 1,
};

const msgStyle: React.CSSProperties = {
  color: "#d1d1d1",
  padding: "8px 4px",
};