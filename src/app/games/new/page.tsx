"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Player = { id: string; name: string; number: number | null };

export default function NewGamePage() {
  const router = useRouter();

  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadPlayers() {
      const { data, error } = await supabase
        .from("players")
        .select("id, name, number")
        .eq("active", true)
        .order("number", { ascending: true });

      if (error) {
        setMsg(error.message);
        return;
      }

      setPlayers((data as Player[]) || []);
    }

    loadPlayers();
  }, []);

  function togglePlayer(playerId: string) {
    setSelectedPlayers((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      return [...prev, playerId];
    });
  }

  async function handleCreateGame() {
    setMsg("");

    if (!teamA.trim()) return setMsg("請輸入主場隊名");
    if (!teamB.trim()) return setMsg("請輸入客場隊名");

    setCreating(true);

    try {
      // 先把其他 live 比賽全部關掉
      const { error: closeError } = await supabase
        .from("games")
        .update({ is_live: false })
        .eq("is_live", true);

      if (closeError) {
        setCreating(false);
        return setMsg(closeError.message);
      }

      // 建立新比賽，直接設為 live
      const insertPayload: Record<string, unknown> = {
        teamA: teamA.trim(),
        teamB: teamB.trim(),
        is_live: true,
      };

      if (location.trim()) insertPayload.location = location.trim();
      if (date.trim()) insertPayload.date = date;

      const { data: gameData, error: gameError } = await supabase
        .from("games")
        .insert(insertPayload)
        .select("id")
        .single();

      if (gameError || !gameData) {
        setCreating(false);
        return setMsg(gameError?.message || "建立比賽失敗");
      }

      const gameId = gameData.id as string;

      // 建立比賽時順便建立計時器
      const { error: clockError } = await supabase.from("game_clock").upsert({
        game_id: gameId,
        quarter: 1,
        seconds_left: 600,
        is_running: false,
      });

      if (clockError) {
        setCreating(false);
        return setMsg(clockError.message);
      }

      // 如果你有 game_players 關聯表，就把勾選球員加進去
      if (selectedPlayers.length > 0) {
        const rows = selectedPlayers.map((playerId) => ({
          game_id: gameId,
          player_id: playerId,
        }));

        const { error: gpError } = await supabase.from("game_players").insert(rows);

        if (gpError) {
          setCreating(false);
          return setMsg(gpError.message);
        }
      }

      router.push(`/games/${gameId}/live`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "建立比賽失敗");
      setCreating(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "white",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: "#0f0f0f",
          border: "1px solid #222",
          borderRadius: 18,
          padding: 24,
          display: "grid",
          gap: 14,
        }}
      >
        <h1 style={{ margin: 0 }}>建立新比賽</h1>

        <input
          placeholder="主場隊名"
          value={teamA}
          onChange={(e) => setTeamA(e.target.value)}
          style={inputStyle}
        />

        <input
          placeholder="客場隊名"
          value={teamB}
          onChange={(e) => setTeamB(e.target.value)}
          style={inputStyle}
        />

        <input
          placeholder="比賽地點（可不填）"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={inputStyle}
        />

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={inputStyle}
        />

        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 10, fontWeight: 800 }}>選擇本隊球員（可不選）</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
            }}
          >
            {players.map((p) => {
              const active = selectedPlayers.includes(p.id);

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlayer(p.id)}
                  style={active ? btnGreen : btnGray}
                >
                  #{p.number ?? "-"} {p.name}
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={handleCreateGame} style={creating ? btnDisabled : btnGreen} disabled={creating}>
          {creating ? "建立中..." : "建立比賽"}
        </button>

        {msg && <div style={{ color: "#ddd" }}>{msg}</div>}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "#111",
  color: "white",
  outline: "none",
  fontSize: 16,
};

const btnBase: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontSize: 16,
};

const btnGreen: React.CSSProperties = {
  ...btnBase,
  background: "#22c55e",
  color: "#052e12",
  fontWeight: 800,
};

const btnGray: React.CSSProperties = {
  ...btnBase,
  background: "#333",
  color: "white",
};

const btnDisabled: React.CSSProperties = {
  ...btnBase,
  background: "#262626",
  color: "#777",
  cursor: "not-allowed",
};