"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getRole, getViewerName, type Role } from "@/lib/roles";

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

const OPPONENT_PLAYER_ID = "584596d5-6d07-4c0a-afea-3b9ad1a5278c";

function emptyStat(): Stat {
  return {
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
  };
}

function formatMMSS(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pointsOf(eventType: string) {
  if (eventType === "FG2_MAKE") return 2;
  if (eventType === "FG3_MAKE") return 3;
  if (eventType === "FT_MAKE") return 1;
  return 0;
}

function applyEventToStat(stat: Stat, e: EventRow) {
  switch (e.event_type) {
    case "FG2_MAKE":
      stat.pts += 2;
      stat.fg2m += 1;
      stat.fg2a += 1;
      break;
    case "FG2_MISS":
      stat.fg2a += 1;
      break;
    case "FG3_MAKE":
      stat.pts += 3;
      stat.fg3m += 1;
      stat.fg3a += 1;
      break;
    case "FG3_MISS":
      stat.fg3a += 1;
      break;
    case "FT_MAKE":
      stat.pts += 1;
      stat.ftm += 1;
      stat.fta += 1;
      break;
    case "FT_MISS":
      stat.fta += 1;
      break;
    case "REB":
      stat.reb += 1;
      break;
    case "AST":
      stat.ast += 1;
      break;
    case "TOV":
      stat.tov += 1;
      break;
    case "STL":
      stat.stl += 1;
      break;
    case "BLK":
      stat.blk += 1;
      break;
    case "PF":
      stat.pf += 1;
      break;
  }
}

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = String(params?.id || "");

  const [role, setRole] = useState<Role | null>(null);
  const [viewerName, setViewerNameState] = useState("");
  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clock, setClock] = useState<ClockRow | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const r = getRole();
    setRole(r);
    setViewerNameState(getViewerName());

    if (!r) {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (!gameId) return;

    (async () => {
      const g = await supabase
        .from("games")
        .select("id,teamA,teamB")
        .eq("id", gameId)
        .single();

      if (g.error) setMsg(g.error.message);
      else if (g.data) setGame(g.data as GameRow);

      const p = await supabase
        .from("players")
        .select("id,name,number")
        .eq("active", true)
        .order("number");

      if (p.data) setPlayers((p.data as Player[]) || []);

      const ev = await supabase
        .from("events")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });

      if (ev.error) setMsg(ev.error.message);
      else setEvents((ev.data as EventRow[]) || []);

      const c = await supabase
        .from("game_clock")
        .select("*")
        .eq("game_id", gameId)
        .single();

      if (c.data) setClock(c.data as ClockRow);
    })();
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    const chEv = supabase
      .channel(`board-events-${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as EventRow;
          setEvents((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "events", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as EventRow;
          setEvents((prev) => prev.map((x) => (x.id === row.id ? row : x)));
        }
      )
      .subscribe();

    const chClock = supabase
      .channel(`board-clock-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_clock", filter: `game_id=eq.${gameId}` },
        (payload) => {
          setClock(payload.new as ClockRow);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chEv);
      supabase.removeChannel(chClock);
    };
  }, [gameId]);

  const activeEvents = useMemo(() => events.filter((e) => !e.is_undone), [events]);

  const score = useMemo(() => {
    let home = 0;
    let away = 0;

    const byQuarter: Record<number, { home: number; away: number }> = {
      1: { home: 0, away: 0 },
      2: { home: 0, away: 0 },
      3: { home: 0, away: 0 },
      4: { home: 0, away: 0 },
    };

    for (const e of activeEvents) {
      const pts = pointsOf(e.event_type);
      if (!pts) continue;

      const isAway = e.player_id === OPPONENT_PLAYER_ID;
      const q = e.quarter ?? 1;
      if (!byQuarter[q]) byQuarter[q] = { home: 0, away: 0 };

      if (isAway) {
        away += pts;
        byQuarter[q].away += pts;
      } else {
        home += pts;
        byQuarter[q].home += pts;
      }
    }

    return { home, away, byQuarter };
  }, [activeEvents]);

  const statsByPlayer = useMemo(() => {
    const map = new Map<string, Stat>();
    for (const p of players) {
      if (p.id !== OPPONENT_PLAYER_ID) map.set(p.id, emptyStat());
    }

    for (const e of activeEvents) {
      if (e.player_id === OPPONENT_PLAYER_ID) continue;
      const st = map.get(e.player_id) ?? emptyStat();
      applyEventToStat(st, e);
      map.set(e.player_id, st);
    }

    return map;
  }, [players, activeEvents]);

  const recentEvents = useMemo(() => {
    return [...activeEvents].slice(-8).reverse();
  }, [activeEvents]);

  const homeName = game?.teamA?.trim() || "主場";
  const awayName = game?.teamB?.trim() || "客場";

  return (
    <main style={{ minHeight: "100vh", background: "#000", color: "white", padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 18 }}>
        <div
          style={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: 18,
            padding: 24,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: 20,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, color: "#aaa", marginBottom: 10 }}>{homeName}</div>
              <div style={{ fontSize: 72, fontWeight: 900 }}>{score.home}</div>
            </div>

            <div style={{ textAlign: "center", minWidth: 200 }}>
              <div style={{ fontSize: 24, color: "#aaa", marginBottom: 8 }}>
                Q{clock?.quarter ?? 1}
              </div>
              <div style={{ fontSize: 56, fontWeight: 900 }}>
                {formatMMSS(clock?.seconds_left ?? 600)}
              </div>
              {role === "viewer" && viewerName && (
                <div style={{ color: "#888", marginTop: 8 }}>觀眾：{viewerName}</div>
              )}
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, color: "#aaa", marginBottom: 10 }}>{awayName}</div>
              <div style={{ fontSize: 72, fontWeight: 900 }}>{score.away}</div>
            </div>
          </div>

          <div style={{ marginTop: 18, color: "#aaa", textAlign: "center", fontSize: 15 }}>
            Q1 {score.byQuarter[1].home}:{score.byQuarter[1].away}　
            Q2 {score.byQuarter[2].home}:{score.byQuarter[2].away}　
            Q3 {score.byQuarter[3].home}:{score.byQuarter[3].away}　
            Q4 {score.byQuarter[4].home}:{score.byQuarter[4].away}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 18,
          }}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 18,
              padding: 18,
              overflowX: "auto",
            }}
          >
            <h3 style={{ marginTop: 0 }}>球員數據</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead style={{ background: "#0b0b0b" }}>
                <tr>
                  {["球員", "PTS", "2PT", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK", "PF"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: 10,
                          borderBottom: "1px solid #222",
                          color: "#ddd",
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {players
                  .filter((p) => p.id !== OPPONENT_PLAYER_ID)
                  .map((p) => {
                    const st = statsByPlayer.get(p.id) ?? emptyStat();
                    return (
                      <tr key={p.id}>
                        <td style={tdStyle}>
                          #{p.number ?? "-"} {p.name}
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 900 }}>{st.pts}</td>
                        <td style={tdStyle}>{st.fg2m}/{st.fg2a}</td>
                        <td style={tdStyle}>{st.fg3m}/{st.fg3a}</td>
                        <td style={tdStyle}>{st.ftm}/{st.fta}</td>
                        <td style={tdStyle}>{st.reb}</td>
                        <td style={tdStyle}>{st.ast}</td>
                        <td style={tdStyle}>{st.tov}</td>
                        <td style={tdStyle}>{st.stl}</td>
                        <td style={tdStyle}>{st.blk}</td>
                        <td style={tdStyle}>{st.pf}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              background: "#111",
              border: "1px solid #222",
              borderRadius: 18,
              padding: 18,
            }}
          >
            <h3 style={{ marginTop: 0 }}>最近事件</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {recentEvents.length === 0 && <div style={{ color: "#777" }}>目前沒有事件</div>}

              {recentEvents.map((e) => {
                const player =
                  e.player_id === OPPONENT_PLAYER_ID
                    ? awayName
                    : players.find((p) => p.id === e.player_id)?.name || "未知球員";

                return (
                  <div
                    key={e.id}
                    style={{
                      background: "#0b0b0b",
                      border: "1px solid #1f1f1f",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{player}</div>
                    <div style={{ color: "#aaa", marginTop: 4 }}>
                      Q{e.quarter} · {e.event_type}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {msg && <p style={{ color: "#ddd" }}>{msg}</p>}
      </div>
    </main>
  );
}

const tdStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #1f1f1f",
  color: "white",
};