"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import { calcPlayerStats, calcTeamStats, pct, type EventRow } from "@/lib/stats";

type Player = {
  id: string;
  name: string;
  number: number | null;
};

type GamePlayerRow = {
  player_id: string;
  team_side: "A" | "B";
};

type EventDbRow = {
  player_id: string | null;
  event_type: EventRow["event_type"];
  team_side?: "A" | "B" | null;
  is_undone?: boolean | null;
};

export default function BoxPage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const router = useRouter();

  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!gameId) return;

      setLoading(true);
      setMsg("");

      try {
        const { data: ev, error: evError } = await supabase
          .from("events")
          .select("player_id, event_type, team_side, is_undone")
          .eq("game_id", gameId)
          .order("created_at", { ascending: true });

        if (evError) {
          throw new Error(`讀取事件失敗：${evError.message}`);
        }

        const normalizedEvents: EventRow[] = ((ev ?? []) as EventDbRow[]).map((e) => ({
          player_id: e.player_id,
          event_type: e.event_type,
          team_side: e.team_side ?? null,
          is_undone: e.is_undone ?? false,
        }));

        setEvents(normalizedEvents);

        const { data: gp, error: gpError } = await supabase
          .from("game_players")
          .select("player_id, team_side")
          .eq("game_id", gameId)
          .eq("team_side", "A");

        if (gpError) {
          throw new Error(`讀取球員名單失敗：${gpError.message}`);
        }

        let playerIds = ((gp ?? []) as GamePlayerRow[]).map((row) => row.player_id);

        if (playerIds.length === 0) {
          playerIds = Array.from(
            new Set(
              normalizedEvents
                .filter((e) => e.team_side === "A" && e.player_id)
                .map((e) => e.player_id as string)
            )
          );
        }

        if (playerIds.length === 0) {
          setPlayers([]);
          setLoading(false);
          return;
        }

        const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("id, name, number")
          .in("id", playerIds)
          .order("number", { ascending: true });

        if (playerError) {
          throw new Error(`讀取球員詳細資料失敗：${playerError.message}`);
        }

        setPlayers((playerData ?? []) as Player[]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "讀取資料失敗";
        setMsg(message);
        setPlayers([]);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [gameId]);

  const rows = useMemo(() => {
    return players.map((player) => {
      const playerEvents = events.filter(
        (e) => e.team_side === "A" && e.player_id === player.id
      );
      const stat = calcPlayerStats(playerEvents);
      return { player, stat };
    });
  }, [players, events]);

  const team = useMemo(() => {
    return calcTeamStats(events, "A");
  }, [events]);

  return (
    <main style={{ padding: 12, maxWidth: 1400, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Box Score</h2>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => router.push(`/games/${gameId}/live`)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            回記錄頁
          </button>

          <button
            onClick={() => router.push(`/games/${gameId}/view`)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            觀眾頁
          </button>
        </div>
      </div>

      {loading && <p>讀取中...</p>}
      {!loading && msg && <p style={{ color: "crimson" }}>{msg}</p>}

      {!loading && !msg && rows.length === 0 && (
        <p>目前這場比賽還沒有球員資料。</p>
      )}

      {!loading && !msg && rows.length > 0 && (
        <div
          style={{
            overflowX: "auto",
            marginTop: 10,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              minWidth: 980,
              fontSize: 14,
            }}
          >
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {[
                  "球員",
                  "PTS",
                  "2FG",
                  "3FG",
                  "FT",
                  "REB",
                  "AST",
                  "STL",
                  "BLK",
                  "TOV",
                  "PF",
                  "2%",
                  "3%",
                  "FT%",
                ].map((header) => (
                  <th
                    key={header}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                      padding: 10,
                      textAlign: "left",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map(({ player, stat }) => (
                <tr key={player.id}>
                  <td
                    style={{
                      padding: 10,
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    #{player.number ?? "-"} {player.name}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {stat.pts}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {stat.fg2m}/{stat.fg2a}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {stat.fg3m}/{stat.fg3a}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {stat.ftm}/{stat.fta}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {stat.reb}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {stat.ast}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {stat.stl}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {stat.blk}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {stat.tov}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {stat.pf}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {pct(stat.fg2m, stat.fg2a)}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {pct(stat.fg3m, stat.fg3a)}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                    {pct(stat.ftm, stat.fta)}
                  </td>
                </tr>
              ))}

              <tr style={{ background: "#f8fafc" }}>
                <td
                  style={{
                    padding: 10,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  TEAM
                </td>
                <td style={{ padding: 10, fontWeight: 700 }}>{team.pts}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>
                  {team.fg2m}/{team.fg2a}
                </td>
                <td style={{ padding: 10, fontWeight: 700 }}>
                  {team.fg3m}/{team.fg3a}
                </td>
                <td style={{ padding: 10, fontWeight: 700 }}>
                  {team.ftm}/{team.fta}
                </td>
                <td style={{ padding: 10, fontWeight: 700 }}>{team.reb}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>{team.ast}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>{team.stl}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>{team.blk}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>{team.tov}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>{team.pf}</td>
                <td style={{ padding: 10, fontWeight: 700 }}>
                  {pct(team.fg2m, team.fg2a)}
                </td>
                <td style={{ padding: 10, fontWeight: 700 }}>
                  {pct(team.fg3m, team.fg3a)}
                </td>
                <td style={{ padding: 10, fontWeight: 700 }}>
                  {pct(team.ftm, team.fta)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}