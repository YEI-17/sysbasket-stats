"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import { calcPlayerStats, pct, type EventRow } from "@/lib/stats";

type Player = { id: string; name: string; number: number | null };

export default function BoxPage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const router = useRouter();

  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      setMsg("");

      const { data: gp } = await supabase
        .from("game_players")
        .select("player_id, players(id,name,number)")
        .eq("game_id", gameId);

      const roster =
        (gp ?? []).map((r: any) => r.players).filter(Boolean) as Player[];

      const sorted = roster.sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
      setPlayers(sorted);

      const { data: ev, error } = await supabase
        .from("events")
        .select("player_id,event_type")
        .eq("game_id", gameId);

      if (error) setMsg(error.message);
      setEvents((ev as any) ?? []);
    })();
  }, [gameId]);

  const rows = useMemo(() => {
    return players.map(p => {
      const ev = events.filter(e => e.player_id === p.id);
      const s = calcPlayerStats(ev);
      return { p, s };
    });
  }, [players, events]);

  const team = useMemo(() => {
    const all = calcPlayerStats(events);
    return all;
  }, [events]);

  return (
    <main style={{ padding: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Box Score</h2>
        <button onClick={() => router.push(`/games/${gameId}/live`)}>回記錄頁</button>
      </div>

      {msg && <p>{msg}</p>}

      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
          <thead>
            <tr>
              {["球員","PTS","2FG","3FG","FT","REB","AST","STL","BLK","TOV","PF","2%","3%","FT%"].map(h => (
                <th key={h} style={{ borderBottom: "1px solid #ddd", padding: 8, textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, s }) => (
              <tr key={p.id}>
                <td style={{ padding: 8 }}>#{p.number ?? "-"} {p.name}</td>
                <td style={{ padding: 8 }}>{s.pts}</td>
                <td style={{ padding: 8 }}>{s.fg2m}/{s.fg2a}</td>
                <td style={{ padding: 8 }}>{s.fg3m}/{s.fg3a}</td>
                <td style={{ padding: 8 }}>{s.ftm}/{s.fta}</td>
                <td style={{ padding: 8 }}>{s.reb}</td>
                <td style={{ padding: 8 }}>{s.ast}</td>
                <td style={{ padding: 8 }}>{s.stl}</td>
                <td style={{ padding: 8 }}>{s.blk}</td>
                <td style={{ padding: 8 }}>{s.tov}</td>
                <td style={{ padding: 8 }}>{s.pf}</td>
                <td style={{ padding: 8 }}>{pct(s.fg2m, s.fg2a)}</td>
                <td style={{ padding: 8 }}>{pct(s.fg3m, s.fg3a)}</td>
                <td style={{ padding: 8 }}>{pct(s.ftm, s.fta)}</td>
              </tr>
            ))}

            <tr>
              <td style={{ padding: 8, fontWeight: 700 }}>TEAM</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{team.pts}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{team.fg2m}/{team.fg2a}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{team.fg3m}/{team.fg3a}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{team.ftm}/{team.fta}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{team.reb}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{team.ast}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{team.stl}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{team.blk}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{team.tov}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{team.pf}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{pct(team.fg2m, team.fg2a)}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{pct(team.fg3m, team.fg3a)}</td>
              <td style={{ padding: 8, fontWeight: 700 }}>{pct(team.ftm, team.fta)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}