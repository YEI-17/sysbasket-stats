"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Player = { id: string; name: string; number: number | null };

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
  updated_at: string;
};

type GameRow = { id: string; teamA: string | null; teamB: string | null };

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

const OPPONENT_PLAYER_ID = "584596d5-6d07-4c0a-afea-3b9ad1a5278c";

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

export default function LivePage() {
  const pathname = usePathname();

  const gameId = useMemo(() => {
    const parts = (pathname || "").split("/").filter(Boolean);
    return parts[1] || "";
  }, [pathname]);

  const [game, setGame] = useState<GameRow | null>(null);

  const homeName = game?.teamA?.trim() || "主場";
  const awayName = game?.teamB?.trim() || "客場";

  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const [quarter, setQuarter] = useState(1);
  const [msg, setMsg] = useState("");

  const [events, setEvents] = useState<EventRow[]>([]);
  const [clock, setClock] = useState<ClockRow | null>(null);

  const [side, setSide] = useState<"home" | "away">("home");

  const [starters, setStarters] = useState<string[]>([]);
  const [showBench, setShowBench] = useState(false);

  const clockRef = useRef<ClockRow | null>(null);
  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  const localTickRef = useRef<number | null>(null);
  const writeBackRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gameId) return;
    (async () => {
      const { data } = await supabase
        .from("games")
        .select("id,teamA,teamB")
        .eq("id", gameId)
        .single();
      if (data) setGame(data as GameRow);
    })();
  }, [gameId]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id,name,number")
        .eq("active", true)
        .order("number");
      if (error) return setMsg(error.message);

      const filtered = ((data as Player[]) || []).filter(
        (p) => p.id !== OPPONENT_PLAYER_ID
      );
      setPlayers(filtered);

      setStarters((prev) => {
        if (prev.length > 0) return prev.filter((id) => filtered.some((p) => p.id === id));
        return filtered.slice(0, 5).map((p) => p.id);
      });
    })();
  }, []);

  useEffect(() => {
    if (!gameId) return;

    (async () => {
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

      if (c.error) {
        const ins = await supabase.from("game_clock").insert({
          game_id: gameId,
          quarter: 1,
          seconds_left: 600,
          is_running: false,
        });
        if (ins.error) return setMsg(ins.error.message);

        const c2 = await supabase
          .from("game_clock")
          .select("*")
          .eq("game_id", gameId)
          .single();

        if (c2.error) setMsg(c2.error.message);
        else {
          setClock(c2.data as ClockRow);
          setQuarter((c2.data as ClockRow)?.quarter ?? 1);
        }
      } else {
        setClock(c.data as ClockRow);
        setQuarter((c.data as ClockRow)?.quarter ?? 1);
      }
    })();
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    const chEv = supabase
      .channel(`events-${gameId}`)
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
      .channel(`clock-${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_clock", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const row = payload.new as ClockRow;
          setClock(row);
          setQuarter(row.quarter);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chEv);
      supabase.removeChannel(chClock);
    };
  }, [gameId]);

  const activeEvents = useMemo(() => events.filter((e) => !e.is_undone), [events]);

  const statsByPlayer = useMemo(() => {
    const map = new Map<string, Stat>();
    for (const p of players) map.set(p.id, emptyStat());
    for (const e of activeEvents) {
      if (e.player_id === OPPONENT_PLAYER_ID) continue;
      const st = map.get(e.player_id) ?? emptyStat();
      applyEventToStat(st, e);
      map.set(e.player_id, st);
    }
    return map;
  }, [players, activeEvents]);

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

  const starterPlayers = useMemo(
    () => players.filter((p) => starters.includes(p.id)),
    [players, starters]
  );

  const benchPlayers = useMemo(
    () => players.filter((p) => !starters.includes(p.id)),
    [players, starters]
  );

  function toggleStarter(playerId: string) {
    setStarters((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= 5) return prev;
      return [...prev, playerId];
    });

    if (selectedPlayer?.id === playerId && starters.includes(playerId)) {
      setSelectedPlayer(null);
    }
  }

  async function record(eventType: string) {
    setMsg("");
    if (!gameId) return setMsg("找不到 gameId");

    if (side === "home") {
      if (starters.length < 5) return setMsg("請先選滿 5 位先發球員");
      if (!selectedPlayer) return setMsg("請先選擇球員");
    }

    if (!OPPONENT_PLAYER_ID) return setMsg("請先設定 OPPONENT_PLAYER_ID");

    const player_id = side === "home" ? selectedPlayer!.id : OPPONENT_PLAYER_ID;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setMsg("請先登入");

    const payload = {
      game_id: gameId,
      player_id,
      quarter,
      event_type: eventType,
      created_by: auth.user.id,
    };

    const { data, error } = await supabase
      .from("events")
      .insert(payload)
      .select("*")
      .single();

    if (error) return setMsg(error.message);

    setEvents((prev) => [...prev, data as EventRow]);
    setMsg(`✅ ${side === "home" ? homeName : awayName} ${eventType}`);
  }

  async function undoLast() {
    setMsg("");
    if (!gameId) return;

    const last = [...activeEvents]
      .filter((e) => e.quarter === quarter)
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0];

    if (!last) return setMsg("這一節沒有可以撤銷的事件");

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("events")
      .update({ is_undone: true, undone_at: now })
      .eq("id", last.id);

    if (error) return setMsg(error.message);

    setEvents((prev) =>
      prev.map((x) => (x.id === last.id ? { ...x, is_undone: true, undone_at: now } : x))
    );

    setMsg("↩️ 已撤銷最後一筆");
  }

  async function updateClock(patch: Partial<ClockRow>) {
    if (!gameId) return;
    setClock((prev) => (prev ? ({ ...prev, ...patch } as ClockRow) : prev));

    const { error } = await supabase
      .from("game_clock")
      .update(patch)
      .eq("game_id", gameId);

    if (error) setMsg(error.message);
  }

  useEffect(() => {
    if (localTickRef.current) {
      clearInterval(localTickRef.current);
      localTickRef.current = null;
    }
    if (writeBackRef.current) {
      clearInterval(writeBackRef.current);
      writeBackRef.current = null;
    }

    if (!clock?.is_running) return;

    localTickRef.current = window.setInterval(() => {
      setClock((prev) => {
        if (!prev || !prev.is_running) return prev;
        if (prev.seconds_left <= 0) return { ...prev, seconds_left: 0, is_running: false };
        return { ...prev, seconds_left: prev.seconds_left - 1 };
      });
    }, 1000);

    writeBackRef.current = window.setInterval(() => {
      const c = clockRef.current;
      if (!c || !c.is_running) return;
      supabase.from("game_clock").update({ seconds_left: c.seconds_left }).eq("game_id", gameId);
    }, 2000);

    return () => {
      if (localTickRef.current) clearInterval(localTickRef.current);
      if (writeBackRef.current) clearInterval(writeBackRef.current);
      localTickRef.current = null;
      writeBackRef.current = null;
    };
  }, [clock?.is_running, gameId]);

  const btnBase: React.CSSProperties = {
    padding: "10px 12px",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    background: "#222",
    color: "white",
    fontSize: 16,
  };
  const btnGreen: React.CSSProperties = {
    ...btnBase,
    background: "#22c55e",
    color: "#052e12",
    fontWeight: 800,
  };
  const btnGray: React.CSSProperties = { ...btnBase, background: "#333" };
  const btnRed: React.CSSProperties = { ...btnBase, background: "#ef4444", fontWeight: 900 };
  const btnDisabled: React.CSSProperties = {
    ...btnBase,
    background: "#262626",
    color: "#777",
    cursor: "not-allowed",
  };

  const actionDisabled = side === "home" && (!selectedPlayer || starters.length < 5);

  return (
    <main style={{ padding: 20, background: "#000", minHeight: "100vh", color: "white" }}>
      <h2>系籃比賽記錄</h2>

      <div style={{ marginBottom: 16 }}>
        <Link href="/games/new" style={{ color: "#93c5fd" }}>
          建立新比賽
        </Link>
      </div>

      <div
        style={{
          marginBottom: 18,
          padding: 14,
          borderRadius: 14,
          background: "#111",
          border: "1px solid #222",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginRight: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "white" }}>
            {homeName} {score.home} : {score.away} {awayName}
          </div>
          <div style={{ color: "#bbb", fontSize: 14 }}>
            Q1 {score.byQuarter[1].home}:{score.byQuarter[1].away}　|　Q2 {score.byQuarter[2].home}:
            {score.byQuarter[2].away}　|　Q3 {score.byQuarter[3].home}:{score.byQuarter[3].away}　|　
            Q4 {score.byQuarter[4].home}:{score.byQuarter[4].away}
          </div>
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, minWidth: 140, color: "white" }}>
          Q{clock?.quarter ?? quarter} {formatMMSS(clock?.seconds_left ?? 600)}
        </div>

        <button
          style={clock?.is_running ? btnRed : btnGreen}
          onClick={() => updateClock({ is_running: !(clock?.is_running ?? false) })}
        >
          {clock?.is_running ? "暫停" : "開始"}
        </button>

        <button
          style={btnGray}
          onClick={() =>
            updateClock({ seconds_left: Math.max(0, (clock?.seconds_left ?? 0) + 60) })
          }
        >
          +1分
        </button>
        <button
          style={btnGray}
          onClick={() =>
            updateClock({ seconds_left: Math.max(0, (clock?.seconds_left ?? 0) - 60) })
          }
        >
          -1分
        </button>
        <button
          style={btnGray}
          onClick={() =>
            updateClock({ seconds_left: Math.max(0, (clock?.seconds_left ?? 0) + 10) })
          }
        >
          +10秒
        </button>
        <button
          style={btnGray}
          onClick={() =>
            updateClock({ seconds_left: Math.max(0, (clock?.seconds_left ?? 0) - 10) })
          }
        >
          -10秒
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#bbb" }}>節數</span>
          {[1, 2, 3, 4].map((q) => (
            <button
              key={q}
              onClick={() => {
                setQuarter(q);
                updateClock({ quarter: q });
              }}
              style={clock?.quarter === q ? btnGreen : btnGray}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button style={side === "home" ? btnGreen : btnGray} onClick={() => setSide("home")}>
          {homeName}
        </button>
        <button style={side === "away" ? btnGreen : btnGray} onClick={() => setSide("away")}>
          {awayName}
        </button>
        <button style={btnGray} onClick={undoLast}>
          Undo
        </button>
      </div>

      <div
        style={{
          marginBottom: 18,
          padding: 14,
          borderRadius: 14,
          background: "#111",
          border: "1px solid #222",
        }}
      >
        <h3 style={{ marginTop: 0 }}>先發設定</h3>
        <div style={{ color: "#bbb", marginBottom: 10 }}>請選擇 5 位先發球員</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 10,
            marginBottom: 10,
          }}
        >
          {players.map((p) => {
            const active = starters.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleStarter(p.id)}
                style={active ? btnGreen : btnGray}
              >
                #{p.number ?? "-"} {p.name}
              </button>
            );
          })}
        </div>

        <div style={{ color: starters.length === 5 ? "#22c55e" : "#facc15", fontWeight: 700 }}>
          已選 {starters.length}/5
        </div>
      </div>

      {side === "home" && starters.length < 5 && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(250,204,21,0.08)",
            border: "1px solid rgba(250,204,21,0.3)",
            color: "#fde68a",
          }}
        >
          請先選滿 5 位先發球員，再開始比賽記錄。
        </div>
      )}

      <h3 style={{ marginTop: 8 }}>選擇球員（只在 {homeName} 記錄時需要）</h3>

      <div style={{ marginBottom: 14 }}>
        <div style={{ marginBottom: 8, color: "#ddd", fontWeight: 700 }}>先發球員</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {starterPlayers.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPlayer(p)}
              style={selectedPlayer?.id === p.id ? btnGreen : btnGray}
            >
              #{p.number ?? "-"} {p.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <button style={btnGray} onClick={() => setShowBench((v) => !v)}>
          {showBench ? "收起替補" : "顯示替補"}
        </button>

        {showBench && (
          <div style={{ marginTop: 10 }}>
            <div style={{ marginBottom: 8, color: "#ddd", fontWeight: 700 }}>替補球員</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              {benchPlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlayer(p)}
                  style={selectedPlayer?.id === p.id ? btnGreen : btnGray}
                >
                  #{p.number ?? "-"} {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <h3>快速記錄</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("FG2_MAKE")}>
          +2
        </button>
        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("FG3_MAKE")}>
          +3
        </button>
        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("FT_MAKE")}>
          罰進
        </button>

        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("FG2_MISS")}>
          2分沒進
        </button>
        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("FG3_MISS")}>
          3分沒進
        </button>
        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("FT_MISS")}>
          罰失
        </button>

        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("REB")}>
          籃板
        </button>
        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("AST")}>
          助攻
        </button>
        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("STL")}>
          抄截
        </button>

        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("BLK")}>
          火鍋
        </button>
        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("TOV")}>
          失誤
        </button>
        <button style={actionDisabled ? btnDisabled : btnGray} disabled={actionDisabled} onClick={() => record("PF")}>
          犯規
        </button>
      </div>

      <h3>即時出賽球員數據</h3>
      <div style={{ overflowX: "auto", border: "1px solid #222", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
          <thead style={{ background: "#111" }}>
            <tr>
              {["球員", "PTS", "2PT", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK", "PF"].map((h) => (
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
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const st = statsByPlayer.get(p.id) ?? emptyStat();
              const isSelected = selectedPlayer?.id === p.id;
              const isStarter = starters.includes(p.id);

              return (
                <tr key={p.id} style={{ background: isSelected ? "rgba(34,197,94,0.12)" : "transparent" }}>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "white" }}>
                    #{p.number ?? "-"} {p.name}
                    {isStarter && (
                      <span style={{ marginLeft: 8, color: "#22c55e", fontSize: 12, fontWeight: 700 }}>
                        先發
                      </span>
                    )}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "white", fontWeight: 900 }}>
                    {st.pts}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "#ddd" }}>{st.fg2m}/{st.fg2a}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "#ddd" }}>{st.fg3m}/{st.fg3a}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "#ddd" }}>{st.ftm}/{st.fta}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "white" }}>{st.reb}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "white" }}>{st.ast}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "white" }}>{st.tov}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "white" }}>{st.stl}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "white" }}>{st.blk}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #1f1f1f", color: "white" }}>{st.pf}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {msg && <p style={{ marginTop: 16, color: "#ddd" }}>{msg}</p>}
    </main>
  );
}