"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
};

type LineupRow = {
  id: string;
  game_id: string;
  lineup_key: string;
  player_ids: string[];
  player_names: string[];
  seconds_played: number;
  est_possessions: number;
  points_for: number;
  points_against: number;
  plus_minus: number;
  off_rating: number;
};

type ComboRow = {
  id: string;
  game_id: string;
  combo_size: 2 | 3;
  combo_key: string;
  player_ids: string[];
  player_names: string[];
  seconds_played: number;
  est_possessions: number;
  points_for: number;
  points_against: number;
  plus_minus: number;
  off_rating: number;
};

function formatSeconds(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function joinNames(names?: string[]) {
  return (names ?? []).join(" / ");
}

function sortByPerformance<
  T extends { plus_minus: number; off_rating: number; seconds_played: number }
>(rows: T[]) {
  return [...rows].sort((a, b) => {
    if (b.plus_minus !== a.plus_minus) return b.plus_minus - a.plus_minus;
    if (b.off_rating !== a.off_rating) return b.off_rating - a.off_rating;
    return b.seconds_played - a.seconds_played;
  });
}

export default function GameLineupsPage() {
  const params = useParams();
  const gameId = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [game, setGame] = useState<GameRow | null>(null);
  const [lineups, setLineups] = useState<LineupRow[]>([]);
  const [combos, setCombos] = useState<ComboRow[]>([]);

  useEffect(() => {
    if (!gameId) {
      setLoading(false);
      setError("找不到比賽 ID");
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const [
          { data: gameData, error: gameError },
          { data: lineupData, error: lineupError },
          { data: comboData, error: comboError },
        ] = await Promise.all([
          supabase.from("games").select("id,teamA,teamB").eq("id", gameId).single(),
          supabase.from("lineup_stats").select("*").eq("game_id", gameId),
          supabase.from("lineup_combo_stats").select("*").eq("game_id", gameId),
        ]);

        if (gameError) throw gameError;
        if (lineupError) throw lineupError;
        if (comboError) throw comboError;

        setGame((gameData as GameRow) ?? null);
        setLineups(sortByPerformance((lineupData as LineupRow[]) ?? []));
        setCombos(sortByPerformance((comboData as ComboRow[]) ?? []));
      } catch (err) {
        const message = err instanceof Error ? err.message : "載入失敗";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [gameId]);

  const bestLineup = useMemo(
    () => sortByPerformance(lineups.filter((r) => r.seconds_played >= 60))[0] ?? null,
    [lineups]
  );

  const worstLineup = useMemo(
    () =>
      [...lineups]
        .filter((r) => r.seconds_played >= 60)
        .sort((a, b) => {
          if (a.plus_minus !== b.plus_minus) return a.plus_minus - b.plus_minus;
          if (a.off_rating !== b.off_rating) return a.off_rating - b.off_rating;
          return b.seconds_played - a.seconds_played;
        })[0] ?? null,
    [lineups]
  );

  const bestPair = useMemo(
    () =>
      sortByPerformance(
        combos.filter((r) => r.combo_size === 2 && r.seconds_played >= 60)
      )[0] ?? null,
    [combos]
  );

  const bestTrio = useMemo(
    () =>
      sortByPerformance(
        combos.filter((r) => r.combo_size === 3 && r.seconds_played >= 60)
      )[0] ?? null,
    [combos]
  );

  const suggestions = useMemo(() => {
    const list: string[] = [];

    if (bestLineup) {
      list.push(
        `本場最穩定的五人組為 ${joinNames(bestLineup.player_names)}，上場 ${formatSeconds(
          bestLineup.seconds_played
        )}，正負值 ${bestLineup.plus_minus >= 0 ? "+" : ""}${bestLineup.plus_minus}，進攻效率 ${bestLineup.off_rating.toFixed(1)}。`
      );
    }

    if (bestPair) {
      list.push(
        `最佳雙人核心為 ${joinNames(bestPair.player_names)}，共同上場 ${formatSeconds(
          bestPair.seconds_played
        )}，可優先保留此搭配。`
      );
    }

    if (bestTrio) {
      list.push(
        `最佳三人骨幹為 ${joinNames(bestTrio.player_names)}，建議優先作為主要輪替核心。`
      );
    }

    if (worstLineup) {
      list.push(
        `效果較差的五人組為 ${joinNames(worstLineup.player_names)}，上場 ${formatSeconds(
          worstLineup.seconds_played
        )}，正負值 ${worstLineup.plus_minus >= 0 ? "+" : ""}${worstLineup.plus_minus}，建議降低長時間重疊。`
      );
    }

    return list;
  }, [bestLineup, bestPair, bestTrio, worstLineup]);

  const pairs = useMemo(
    () => sortByPerformance(combos.filter((r) => r.combo_size === 2)),
    [combos]
  );

  const trios = useMemo(
    () => sortByPerformance(combos.filter((r) => r.combo_size === 3)),
    [combos]
  );

  const summaryCards = [
    { title: "最強 LINEUP", item: bestLineup },
    { title: "最爛 LINEUP", item: worstLineup },
    { title: "黃金雙人", item: bestPair },
    { title: "黃金三人", item: bestTrio },
  ];

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 text-xs tracking-[0.4em] text-orange-300/90">
                LINEUP ANALYSIS
              </div>
              <h1 className="text-4xl font-bold">
                {game?.teamA ?? "Team A"} vs {game?.teamB ?? "Team B"}
              </h1>
              <p className="mt-3 text-white/65">
                單場陣容分析：找出本場最佳五人組、雙人組、三人組與輪替問題
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/games/lineups"
                className="rounded-full border border-orange-300/20 bg-orange-300/10 px-5 py-3 text-sm transition hover:bg-orange-300/15"
              >
                選擇其他比賽
              </Link>
              <Link
                href={`/games/${gameId}/live`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm transition hover:bg-white/10"
              >
                返回紀錄頁
              </Link>
              <Link
                href={`/games/${gameId}/box`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm transition hover:bg-white/10"
              >
                Box 數據
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
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map(({ title, item }) => (
                <div
                  key={title}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
                >
                  <div className="mb-3 text-sm tracking-[0.25em] text-orange-300">
                    {title}
                  </div>

                  <div className="min-h-[72px] text-2xl font-semibold leading-snug">
                    {item ? joinNames(item.player_names) : "暫無資料"}
                  </div>

                  {item ? (
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="text-xs text-white/45">上場時間</div>
                        <div className="mt-2 text-2xl font-bold">
                          {formatSeconds(item.seconds_played)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-3">
                        <div className="text-xs text-white/45">+/-</div>
                        <div className="mt-2 text-2xl font-bold">
                          {item.plus_minus >= 0 ? "+" : ""}
                          {item.plus_minus}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="text-xs text-white/45">進攻效率</div>
                        <div className="mt-2 text-2xl font-bold">
                          {item.off_rating.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-white/55">
                      尚未累積足夠樣本
                    </div>
                  )}
                </div>
              ))}
            </section>

            <section className="mt-6 rounded-3xl border border-orange-400/25 bg-white/[0.03] p-5">
              <div className="mb-2 text-sm tracking-[0.25em] text-orange-300">
                STRATEGY SUGGESTIONS
              </div>
              <h2 className="mb-4 text-3xl font-bold">自動建議 / 比賽策略</h2>

              <div className="space-y-3">
                {suggestions.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-white/65">
                    尚無足夠資料產生建議
                  </div>
                ) : (
                  suggestions.map((text, idx) => (
                    <div
                      key={`${idx}-${text}`}
                      className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-400/15 text-orange-300">
                        {idx + 1}
                      </div>
                      <div className="text-white/85">{text}</div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 xl:col-span-1">
                <h3 className="mb-4 text-2xl font-bold">五人組列表</h3>

                <div className="space-y-3">
                  {lineups.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-white/60">
                      這場目前沒有五人組資料
                    </div>
                  ) : (
                    lineups.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                      >
                        <div className="text-lg font-semibold">
                          {joinNames(row.player_names)}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-white/75">
                          <div>時間：{formatSeconds(row.seconds_played)}</div>
                          <div>
                            +/-：{row.plus_minus >= 0 ? "+" : ""}
                            {row.plus_minus}
                          </div>
                          <div>OffRtg：{row.off_rating.toFixed(1)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-2xl font-bold">雙人組</h3>

                <div className="space-y-3">
                  {pairs.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-white/60">
                      這場目前沒有雙人組資料
                    </div>
                  ) : (
                    pairs.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                      >
                        <div className="text-lg font-semibold">
                          {joinNames(row.player_names)}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-white/75">
                          <div>時間：{formatSeconds(row.seconds_played)}</div>
                          <div>
                            +/-：{row.plus_minus >= 0 ? "+" : ""}
                            {row.plus_minus}
                          </div>
                          <div>OffRtg：{row.off_rating.toFixed(1)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-2xl font-bold">三人組</h3>

                <div className="space-y-3">
                  {trios.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-white/60">
                      這場目前沒有三人組資料
                    </div>
                  ) : (
                    trios.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                      >
                        <div className="text-lg font-semibold">
                          {joinNames(row.player_names)}
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-white/75">
                          <div>時間：{formatSeconds(row.seconds_played)}</div>
                          <div>
                            +/-：{row.plus_minus >= 0 ? "+" : ""}
                            {row.plus_minus}
                          </div>
                          <div>OffRtg：{row.off_rating.toFixed(1)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}