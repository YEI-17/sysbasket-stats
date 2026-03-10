"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function NewGamePage() {
  const router = useRouter();

  const [teamA, setTeamA] = useState("資工");
  const [teamB, setTeamB] = useState("");
  const [location, setLocation] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    setGameDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  async function handleCreateGame(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    if (!teamA.trim() || !teamB.trim()) {
      setMsg("請輸入雙方隊名");
      return;
    }

    setLoading(true);

    try {
      let start_time: string | null = null;

      if (gameDate && startTime) {
        start_time = new Date(`${gameDate}T${startTime}:00`).toISOString();
      }

      const { data, error } = await supabase
        .from("games")
        .insert({
          game_date: gameDate,
          start_time,
          location: location || null,
          status: "scheduled",
          teamA: teamA.trim(),
          teamB: teamB.trim(),
        })
        .select('id, game_date, start_time, location, status, "teamA", "teamB"')
        .single();

      if (error) throw error;
      if (!data?.id) throw new Error("建立比賽失敗，沒有取得比賽 ID");

      router.push(`/games/${data.id}/live`);
    } catch (err: any) {
      setMsg(err.message || "建立比賽失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-6">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold mb-6">新增比賽</h1>

        <form onSubmit={handleCreateGame} className="space-y-4">
          <div>
            <label className="block mb-1">我方隊名</label>
            <input
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2"
              value={teamA}
              onChange={(e) => setTeamA(e.target.value)}
              placeholder="例如：資工"
            />
          </div>

          <div>
            <label className="block mb-1">對手隊名</label>
            <input
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2"
              value={teamB}
              onChange={(e) => setTeamB(e.target.value)}
              placeholder="例如：機械"
            />
          </div>

          <div>
            <label className="block mb-1">日期</label>
            <input
              type="date"
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2"
              value={gameDate}
              onChange={(e) => setGameDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1">開始時間</label>
            <input
              type="time"
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1">地點</label>
            <input
              className="w-full rounded border border-white/20 bg-white/5 px-3 py-2"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="例如：體育館"
            />
          </div>

          {msg && (
            <div className="rounded bg-red-500/20 border border-red-500/40 px-3 py-2 text-sm">
              {msg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
          >
            {loading ? "建立中..." : "建立比賽"}
          </button>
        </form>
      </div>
    </main>
  );
}