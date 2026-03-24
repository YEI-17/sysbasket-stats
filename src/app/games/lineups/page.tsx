"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

/** ===== 型別 ===== */

type Game = {
  id: string;
  teamA: string | null;
  teamB: string | null;
};

type LineupStat = {
  id: string;
  game_id: string;
  lineup_key: string; // 例如 "A-B-C-D-E"
  players: string[]; // json array
  minutes: number;
  possessions: number;
  points_for: number;
  points_against: number;
};

/** ===== Page ===== */

export default function Page() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [lineups, setLineups] = useState<LineupStat[]>([]);
  const [loading, setLoading] = useState(false);

  /** ===== 取得比賽 ===== */
  useEffect(() => {
    fetchGames();
  }, []);

  async function fetchGames() {
    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setGames(data);
      if (data.length > 0) {
        setSelectedGameId(data[0].id);
      }
    }
  }

  /** ===== 取得 lineup ===== */
  useEffect(() => {
    if (!selectedGameId) return;
    fetchLineups(selectedGameId);
  }, [selectedGameId]);

  async function fetchLineups(gameId: string) {
    setLoading(true);

    const { data, error } = await supabase
      .from("lineup_stats")
      .select("*")
      .eq("game_id", gameId);

    if (!error && data) {
      setLineups(data);
    } else {
      console.error("lineup fetch error:", error);
    }

    setLoading(false);
  }

  /** ===== 計算衍生數據 ===== */
  const enriched = useMemo(() => {
    return lineups.map((l) => {
      const plusMinus = l.points_for - l.points_against;

      const offRating =
        l.possessions > 0 ? (l.points_for / l.possessions) * 100 : 0;

      return {
        ...l,
        plusMinus,
        offRating,
      };
    });
  }, [lineups]);

  /** ===== 排序 ===== */
  const bestLineups = useMemo(() => {
    return [...enriched]
      .filter((l) => l.minutes > 1) // 過濾垃圾時間
      .sort((a, b) => b.plusMinus - a.plusMinus)
      .slice(0, 5);
  }, [enriched]);

  const worstLineups = useMemo(() => {
    return [...enriched]
      .filter((l) => l.minutes > 1)
      .sort((a, b) => a.plusMinus - b.plusMinus)
      .slice(0, 5);
  }, [enriched]);

  /** ===== UI ===== */

  return (
    <main className="min-h-screen bg-black text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">LINEUP 分析</h1>
        <Link href="/" className="text-sm text-white/70 hover:text-white">
          返回首頁
        </Link>
      </div>

      {/* Game selector */}
      <div className="mb-6">
        <select
          value={selectedGameId ?? ""}
          onChange={(e) => setSelectedGameId(e.target.value)}
          className="bg-black border border-white/20 px-4 py-2 rounded"
        >
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.teamA} vs {g.teamB}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && <div>載入中...</div>}

      {/* Best lineup */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">🔥 最強 Lineup</h2>
        <div className="space-y-3">
          {bestLineups.map((l) => (
            <LineupCard key={l.id} lineup={l} />
          ))}
        </div>
      </section>

      {/* Worst lineup */}
      <section>
        <h2 className="text-xl font-semibold mb-3">❌ 最差 Lineup</h2>
        <div className="space-y-3">
          {worstLineups.map((l) => (
            <LineupCard key={l.id} lineup={l} />
          ))}
        </div>
      </section>
    </main>
  );
}

/** ===== Card ===== */

function LineupCard({ lineup }: { lineup: any }) {
  return (
    <div className="border border-white/10 rounded-lg p-4 bg-white/5">
      {/* 球員 */}
      <div className="text-lg font-semibold mb-2">
        {Array.isArray(lineup.players)
          ? lineup.players.join(" / ")
          : lineup.lineup_key}
      </div>

      {/* 數據 */}
      <div className="grid grid-cols-4 gap-4 text-sm text-white/80">
        <div>
          <div>+/-</div>
          <div className="text-white font-bold">
            {lineup.plusMinus.toFixed(1)}
          </div>
        </div>

        <div>
          <div>OffRtg</div>
          <div className="text-white font-bold">
            {lineup.offRating.toFixed(1)}
          </div>
        </div>

        <div>
          <div>時間</div>
          <div className="text-white font-bold">
            {lineup.minutes.toFixed(1)} min
          </div>
        </div>

        <div>
          <div>回合</div>
          <div className="text-white font-bold">
            {lineup.possessions}
          </div>
        </div>
      </div>
    </div>
  );
}