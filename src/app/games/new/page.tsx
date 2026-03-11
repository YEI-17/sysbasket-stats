"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

type Player = {
  id: string;
  name: string;
  number: number | null;
  active?: boolean;
};

export default function NewGamePage() {
  const router = useRouter();

  const [opponent, setOpponent] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedStarterIds, setSelectedStarterIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, number, active")
      .eq("active", true)
      .order("number", { ascending: true });

    if (error) {
      setError(`讀取球員失敗：${error.message}`);
      return;
    }

    const list = (data as Player[]) || [];
    setPlayers(list);
    setSelectedStarterIds(list.slice(0, 5).map((p) => p.id));
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  function toggleStarter(playerId: string) {
    setSelectedStarterIds((prev) => {
      const exists = prev.includes(playerId);

      if (exists) {
        return prev.filter((id) => id !== playerId);
      }

      if (prev.length >= 5) {
        return prev;
      }

      return [...prev, playerId];
    });
  }

  const starters = useMemo(
    () => players.filter((p) => selectedStarterIds.includes(p.id)),
    [players, selectedStarterIds]
  );

  const benchPlayers = useMemo(
    () => players.filter((p) => !selectedStarterIds.includes(p.id)),
    [players, selectedStarterIds]
  );

  async function createGame() {
    setLoading(true);
    setError("");

    try {
      if (selectedStarterIds.length !== 5) {
        setError("請先選滿先發五人");
        setLoading(false);
        return;
      }

      const { error: closeError } = await supabase
        .from("games")
        .update({ status: "finished" })
        .eq("status", "live");

      if (closeError) {
        setError("關閉舊比賽失敗：" + closeError.message);
        setLoading(false);
        return;
      }

      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          teamA: "我們",
          teamB: opponent || "對手",
          status: "live",
          home_score: 0,
          away_score: 0,
        })
        .select()
        .single();

      if (gameError) {
        setError("建立比賽失敗：" + gameError.message);
        setLoading(false);
        return;
      }

      const { error: clockError } = await supabase.from("game_clock").insert({
        game_id: game.id,
        quarter: 1,
        seconds_left: 600,
        is_running: false,
      });

      if (clockError) {
        setError("建立時間失敗：" + clockError.message);
        setLoading(false);
        return;
      }

      router.push(`/games/${game.id}/live`);
    } catch (err: any) {
      setError(err.message || "發生未知錯誤");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">建立新比賽</h1>
          <LogoutButton />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div>
            <div className="text-sm text-white/60 mb-2">對手名稱</div>
            <input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="輸入對手"
              className="w-full rounded-xl bg-neutral-900 border border-white/10 px-4 py-3 outline-none"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-bold">選擇先發五人</div>
            <div className="text-sm text-white/60">
              已選 {selectedStarterIds.length}/5
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {players.map((p) => {
              const selected = selectedStarterIds.includes(p.id);

              return (
                <button
                  key={p.id}
                  onClick={() => toggleStarter(p.id)}
                  className={`rounded-xl border px-4 py-4 text-left transition ${
                    selected
                      ? "border-emerald-400 bg-emerald-500/20"
                      : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="font-bold">
                    #{p.number ?? "-"} {p.name}
                  </div>
                  <div className="text-xs text-white/60">
                    {selected ? "先發" : "未選"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-bold mb-3">先發五人</div>
            <div className="space-y-2">
              {starters.map((p) => (
                <div key={p.id} className="rounded-xl bg-black/20 px-4 py-3">
                  #{p.number ?? "-"} {p.name}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-lg font-bold mb-3">板凳球員</div>
            <div className="space-y-2">
              {benchPlayers.length === 0 ? (
                <div className="text-white/50">目前沒有板凳球員</div>
              ) : (
                benchPlayers.map((p) => (
                  <div key={p.id} className="rounded-xl bg-black/20 px-4 py-3">
                    #{p.number ?? "-"} {p.name}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <button
          onClick={createGame}
          disabled={loading}
          className="w-full rounded-2xl bg-green-600 px-6 py-4 text-lg font-bold disabled:opacity-60"
        >
          {loading ? "建立中..." : "建立比賽"}
        </button>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}