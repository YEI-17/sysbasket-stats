"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  game_date?: string | null;
  created_at?: string | null;
  status?: string | null;
};

type LineupStatRow = {
  game_id: string;
  seconds_played: number | null;
};

function formatGameDate(dateStr?: string | null) {
  if (!dateStr) return "未設定日期";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function normalizeStatus(status?: string | null) {
  const s = (status ?? "").trim().toLowerCase();

  if (!s) return "未設定";
  if (["live", "playing", "in_progress", "ongoing", "running"].includes(s)) {
    return "直播中";
  }
  if (["finished", "final", "ended", "done"].includes(s)) {
    return "已結束";
  }
  if (["scheduled", "upcoming", "pending"].includes(s)) {
    return "未開始";
  }
  return status ?? "未設定";
}

export default function LineupsSelectPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [games, setGames] = useState<GameRow[]>([]);
  const [lineupStats, setLineupStats] = useState<LineupStatRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const [
          { data: gamesData, error: gamesError },
          { data: lineupData, error: lineupError },
        ] = await Promise.all([
          supabase
            .from("games")
            .select("id, teamA, teamB, game_date, created_at, status")
            .order("game_date", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase.from("lineup_stats").select("game_id, seconds_played"),
        ]);

        if (gamesError) throw gamesError;
        if (lineupError) throw lineupError;

        setGames((gamesData as GameRow[]) ?? []);
        setLineupStats((lineupData as LineupStatRow[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const statsMap = useMemo(() => {
    const map = new Map<string, { hasLineup: boolean; totalSeconds: number }>();

    for (const row of lineupStats) {
      const prev = map.get(row.game_id) ?? { hasLineup: false, totalSeconds: 0 };
      map.set(row.game_id, {
        hasLineup: true,
        totalSeconds: prev.totalSeconds + Math.max(0, row.seconds_played ?? 0),
      });
    }

    return map;
  }, [lineupStats]);

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 text-xs tracking-[0.4em] text-orange-300/90">
                LINEUP ANALYSIS
              </div>
              <h1 className="text-4xl font-bold">選擇要分析的比賽</h1>
              <p className="mt-3 text-white/65">
                先選一場比賽，再進入單場陣容分析頁
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/games"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm transition hover:bg-white/10"
              >
                返回首頁
              </Link>
              <Link
                href="/lineups"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm transition hover:bg-white/10"
              >
                綜合 Lineup
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
            載入中...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-400/30 bg-red-400/10 p-8 text-red-200">
            {error}
          </div>
        ) : games.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
            目前沒有比賽資料
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {games.map((game) => {
              const stat = statsMap.get(game.id);
              const hasLineup = !!stat?.hasLineup;

              return (
                <Link
                  key={game.id}
                  href={`/games/${game.id}/lineups`}
                  className="group rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-orange-300/30 hover:bg-white/[0.06]"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-xs tracking-[0.25em] text-orange-300">
                      SINGLE GAME
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                      {normalizeStatus(game.status)}
                    </div>
                  </div>

                  <div className="text-2xl font-bold leading-snug">
                    {game.teamA ?? "Team A"} vs {game.teamB ?? "Team B"}
                  </div>

                  <div className="mt-3 text-sm text-white/60">
                    比賽日期：{formatGameDate(game.game_date ?? game.created_at)}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-xs text-white/45">陣容資料</div>
                      <div className="mt-2 text-xl font-bold">
                        {hasLineup ? "可分析" : "尚未補算"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-xs text-white/45">總樣本秒數</div>
                      <div className="mt-2 text-xl font-bold">
                        {Math.floor((stat?.totalSeconds ?? 0) / 60)} 分
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 text-sm text-orange-300 transition group-hover:translate-x-1">
                    進入單場陣容分析 →
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}