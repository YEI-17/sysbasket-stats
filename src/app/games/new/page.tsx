"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function NewGamePage() {
  const router = useRouter();

  const [opponent, setOpponent] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function createGame() {
    setError("");
    setLoading(true);

    try {
      // 1️⃣ 先把舊的 live 比賽關閉
      const { error: closeError } = await supabase
        .from("games")
        .update({ status: "ended" })
        .eq("status", "live");

      if (closeError) {
        setError("關閉舊比賽失敗：" + closeError.message);
        setLoading(false);
        return;
      }

      // 2️⃣ 建立新的 live 比賽
      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          teamA: "我們",
          teamB: opponent || "對手",
          location: location || null,
          game_date: date || null,
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

      // 3️⃣ 建立第一節比賽時間
      const { error: clockError } = await supabase
        .from("game_clock")
        .insert({
          game_id: game.id,
          quarter: 1,
          seconds_left: 600,
          is_running: false,
        });

      if (clockError) {
        setError("建立比賽時間失敗：" + clockError.message);
        setLoading(false);
        return;
      }

      // 4️⃣ 跳轉到 live 比賽頁面
      router.push("/games/live");
    } catch (err: any) {
      setError(err.message);
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">

        <h1 className="text-xl font-bold">建立新比賽</h1>

        <div>
          <label className="text-sm text-white/60">對手</label>
          <input
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="例如：資工系"
            className="w-full mt-1 px-3 py-2 bg-neutral-900 border border-white/10 rounded-lg outline-none"
          />
        </div>

        <div>
          <label className="text-sm text-white/60">地點</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="例如：學校體育館"
            className="w-full mt-1 px-3 py-2 bg-neutral-900 border border-white/10 rounded-lg outline-none"
          />
        </div>

        <div>
          <label className="text-sm text-white/60">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full mt-1 px-3 py-2 bg-neutral-900 border border-white/10 rounded-lg outline-none"
          />
        </div>

        {error && (
          <div className="text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={createGame}
          disabled={loading}
          className="w-full py-3 bg-emerald-600 rounded-xl font-semibold hover:bg-emerald-700"
        >
          {loading ? "建立中..." : "建立比賽"}
        </button>

      </div>
    </div>
  );
}