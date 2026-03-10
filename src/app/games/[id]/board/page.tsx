"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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
};

type Player = {
  id: string;
  name: string;
  number: number | null;
  active?: boolean;
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

const CLOCK_TABLE = "game_clock";

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

function formatClock(secondsLeft: number) {
  const safe = Math.max(0, secondsLeft || 0);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

export default function BoardPage() {
  const params = useParams();
  const gameId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clock, setClock] = useState<ClockRow | null>(null);
  const [viewerCount, setViewerCount] = useState(1);

  const presenceKeyRef = useRef(`admin-${Math.random().toString(36).slice(2)}`);

  async function loadGame() {
    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB")
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
          seconds_left: 600,
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

    await Promise.all([loadGame(), loadPlayers(), loadEvents(), loadClock()]);

    if (showLoading) setLoading(false);
  }

  useEffect(() => {
    if (!gameId) return;
    loadAll(true);
  }, [gameId]);

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
            role: "admin",
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
        async () => {
          await loadGame();
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
          table: CLOCK_TABLE,
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          await loadClock();
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

  const statsMap = useMemo(() => {
    const map: Record<string, Stat> = {};

    for (const p of players) {
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
  }, [players, validEvents]);

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
    const byQuarter: Record<number, { home: number; away: number }> = {
      1: { home: 0, away: 0 },
      2: { home: 0, away: 0 },
      3: { home: 0, away: 0 },
      4: { home: 0, away: 0 },
      5: { home: 0, away: 0 },
      6: { home: 0, away: 0 },
      7: { home: 0, away: 0 },
      8: { home: 0, away: 0 },
    };

    for (const e of validEvents) {
      const q = e.quarter;
      if (!byQuarter[q]) continue;

      const pts = getPoints(e.event_type);
      if (e.team_side === "A") byQuarter[q].home += pts;
      if (e.team_side === "B") byQuarter[q].away += pts;
    }

    return byQuarter;
  }, [validEvents]);

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={{ color: "#aaa", fontSize: 18 }}>載入中...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <section style={scoreCardStyle}>
          <div style={teamBlockStyle}>
            <div style={teamLabelStyle}>{game?.teamA || "主場"}</div>
            <div style={scoreStyle}>{totalScore.home}</div>
          </div>

          <div style={centerBlockStyle}>
            <div style={topInfoRowStyle}>
              <div style={quarterStyle}>Q{clock?.quarter ?? 1}</div>
              <div style={viewerStyle}>線上觀看：{viewerCount}</div>
            </div>

            <div style={clockStyle}>{formatClock(clock?.seconds_left ?? 600)}</div>

            <div style={quarterLineStyle}>
              <span>Q1 {quarterScores[1].home}:{quarterScores[1].away}</span>
              <span>Q2 {quarterScores[2].home}:{quarterScores[2].away}</span>
              <span>Q3 {quarterScores[3].home}:{quarterScores[3].away}</span>
              <span>Q4 {quarterScores[4].home}:{quarterScores[4].away}</span>
            </div>
          </div>

          <div style={teamBlockStyle}>
            <div style={teamLabelStyle}>{game?.teamB || "客場"}</div>
            <div style={scoreStyle}>{totalScore.away}</div>
          </div>
        </section>

        <section style={tableCardStyle}>
          <div style={sectionTitleStyle}>球員數據</div>

          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>球員</th>
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
                </tr>
              </thead>

              <tbody>
                {players.map((p) => {
                  const s = statsMap[p.id] || emptyStat();

                  return (
                    <tr key={p.id}>
                      <td style={tdNameStyle}>
                        {p.number ? `#${p.number} ` : ""}
                        {p.name}
                      </td>
                      <td style={tdStyle}>{s.pts}</td>
                      <td style={tdStyle}>{s.fg2m}/{s.fg2a}</td>
                      <td style={tdStyle}>{s.fg3m}/{s.fg3a}</td>
                      <td style={tdStyle}>{s.ftm}/{s.fta}</td>
                      <td style={tdStyle}>{s.reb}</td>
                      <td style={tdStyle}>{s.ast}</td>
                      <td style={tdStyle}>{s.tov}</td>
                      <td style={tdStyle}>{s.stl}</td>
                      <td style={tdStyle}>{s.blk}</td>
                      <td style={tdStyle}>{s.pf}</td>
                    </tr>
                  );
                })}
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
  maxWidth: 1400,
  margin: "0 auto",
  display: "grid",
  gap: 16,
};

const scoreCardStyle: React.CSSProperties = {
  background: "#0b0b0b",
  border: "1px solid #222",
  borderRadius: 24,
  padding: 24,
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  alignItems: "center",
  gap: 16,
};

const teamBlockStyle: React.CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: 12,
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
  fontSize: 28,
  color: "#b3b3b3",
  fontWeight: 700,
};

const scoreStyle: React.CSSProperties = {
  fontSize: 110,
  lineHeight: 1,
  fontWeight: 800,
};

const quarterStyle: React.CSSProperties = {
  fontSize: 28,
  color: "#b3b3b3",
};

const viewerStyle: React.CSSProperties = {
  fontSize: 20,
  color: "#9a9a9a",
};

const clockStyle: React.CSSProperties = {
  fontSize: 92,
  lineHeight: 1,
  fontWeight: 800,
};

const quarterLineStyle: React.CSSProperties = {
  display: "flex",
  gap: 20,
  flexWrap: "wrap",
  justifyContent: "center",
  color: "#9a9a9a",
  fontSize: 20,
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

const tableWrapStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 980,
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

const msgStyle: React.CSSProperties = {
  color: "#d1d1d1",
  padding: "8px 4px",
};