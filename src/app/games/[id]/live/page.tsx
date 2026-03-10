"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type GameRow = {
  id: string;
  game_date: string;
  start_time: string | null;
  location: string | null;
  status: string;
  teamA: string | null;
  teamB: string | null;
};

export default function LiveGamesPage() {
  const [game, setGame] = useState<GameRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  async function fetchLiveGame() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("games")
      .select('id, game_date, start_time, location, status, "teamA", "teamB"')
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      setMsg(error.message);
      setGame(null);
      setLoading(false);
      return;
    }

    const row = data?.[0] ?? null;
    setGame(row);
    setLoading(false);
  }

  useEffect(() => {
    fetchLiveGame();

    const channel = supabase
      .channel("public:games-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => {
          fetchLiveGame();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="min-h-screen bg-black text-white px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">目前比賽</h1>

        {loading && <p>載入中...</p>}

        {!loading && msg && (
          <div className="rounded bg-red-500/20 border border-red-500/40 px-3 py-2">
            {msg}
          </div>
        )}

        {!loading && !msg && !game && (
          <div className="rounded border border-white/10 bg-white/5 px-4 py-6">
            目前沒有進行中的比賽
          </div>
        )}

        {!loading && game && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
            <div className="text-xl font-bold">
              {game.teamA ?? "隊伍A"} vs {game.teamB ?? "隊伍B"}
            </div>

            <div className="text-white/70">
              日期：{game.game_date || "-"}
            </div>

            <div className="text-white/70">
              地點：{game.location || "-"}
            </div>

            <div className="text-white/70">
              狀態：{game.status}
            </div>

            <Link
              href={`/games/${game.id}/view`}
              className="inline-block rounded bg-white text-black px-4 py-2 font-semibold"
            >
              進入觀眾畫面
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}