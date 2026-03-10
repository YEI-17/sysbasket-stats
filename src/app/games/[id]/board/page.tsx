"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

const CLOCK_TABLE = "clock"; // ← 如果你的表名不是 clock，就改這一行

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
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

  async function loadAll(showLoading = false) {
    if (showLoading) setLoading(true);
    setMsg("");

    const [gameRes, playersRes, eventsRes, clockRes] = await Promise.all([
      supabase
        .from("games")
        .select("id, teamA, teamB")
        .eq("id", gameId)
        .single(),

      supabase
        .from("players")
        .select("id, name, number, active")
        .eq("active", true)
        .order("number", { ascending: true }),

      supabase
        .from("events")
        .select("id, game_id, player_id, quarter, event_type, created_at, is_undone, undone_at")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true }),

      supabase
        .from(CLOCK_TABLE)
        .select("game_id, quarter, seconds_left, is_running, updated_at")
        .eq("game_id", gameId)
        .maybeSingle(),
    ]);

    if (gameRes.error) {
      setMsg(`讀取 games 失敗：${gameRes.error.message}`);
    } else {
      setGame(gameRes.data as GameRow);
    }

    if (playersRes.error) {
      setMsg(`讀取 players 失敗：${playersRes.error.message}`);
    } else {
      setPlayers((playersRes.data as Player[]) || []);
    }

    if (eventsRes.error) {
      setMsg(`讀取 events 失敗：${eventsRes.error.message}`);
    } else {
      setEvents((eventsRes.data as EventRow[]) || []);
    }

    if (clockRes.error) {
      setMsg(`讀取 ${CLOCK_TABLE} 失敗：${clockRes.error.message}`);
      setClock(null);
    } else {
      setClock((clockRes.data as ClockRow | null) || null);
    }

    if (showLoading) setLoading(false);
  }

  useEffect(() => {
    loadAll(true);

    const eventsChannel = supabase
      .channel(`board-events-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          await loadAll(false);
        }
      )
      .subscribe();

    const gamesChannel = supabase
      .channel(`board-games-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        async () => {
          await loadAll(false);
        }
      )
      .subscribe();

    const clockChannel = supabase
      .channel(`board-clock-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: CLOCK_TABLE,
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          await loadAll(false);
        }
      )
      .subscribe();

    const poll = setInterval(() => {
      loadAll(false);
    }, 2000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(gamesChannel);
      supabase.removeChannel(clockChannel);
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
      if (!map[e.player_id]) {
        map[e.player_id] = emptyStat();
      }

      const s = map[e.player_id];
      const type = e.event_type.toUpperCase();

      if (type === "FG2_MAKE") {
        s.pts += 2;
        s.fg2m += 1;
        s.fg2a += 1;
      } else if (type === "FG2_MISS") {
        s.fg2a += 1;
      } else if (type === "FG3_MAKE") {
        s.pts += 3;
        s.fg3m += 1;
        s.fg3a += 1;
      } else if (type === "FG3_MISS") {
        s.fg3a += 1;
      } else if (type === "FT_MAKE") {
        s.pts += 1;
        s.ftm += 1;
        s.fta += 1;
      } else if (type === "FT_MISS") {
        s.fta += 1;
      } else if (type === "REB") {
        s.reb += 1;
      } else if (type === "AST") {
        s.ast += 1;
      } else if (type === "TOV") {
        s.tov += 1;
      } else if (type === "STL") {
        s.stl += 1;
      } else if (type === "BLK") {
        s.blk += 1;
      } else if (type === "PF") {
        s.pf += 1;
      }
    }

    return map;
  }, [players, validEvents]);

  const totalScore = useMemo(() => {
    let home = 0;
    let away = 0;

    for (const e of validEvents) {
      const type = e.event_type.toUpperCase();

      if (type === "FG2_MAKE") home += 2;
      if (type === "FG3_MAKE") home += 3;
      if (type === "FT_MAKE") home += 1;
    }

    return { home, away };
  }, [validEvents]);

  const quarterScores = useMemo(() => {
    const byQuarter: Record<number, { home: number; away: number }> = {
      1: { home: 0, away: 0 },
      2: { home: 0, away: 0 },
      3: { home: 0, away: 0 },
      4: { home: 0, away: 0 },
    };

    for (const e of validEvents) {
      const q = e.quarter;
      if (!byQuarter[q]) continue;

      const type = e.event_type.toUpperCase();
      if (type === "FG2_MAKE") byQuarter[q].home += 2;
      if (type === "FG3_MAKE") byQuarter[q].home += 3;
      if (type === "FT_MAKE") byQuarter[q].home += 1;
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
            <div style={quarterStyle}>Q{clock?.quarter ?? 1}</div>
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