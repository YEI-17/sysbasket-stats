"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

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
  is_official: boolean;
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
  is_official: boolean;
};

type AggregatedRow = {
  key: string;
  names: string[];
  total_seconds: number;
  total_points_for: number;
  total_points_against: number;
  total_est_possessions: number;
  total_plus_minus: number;
  games: number;
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

function aggregateRows<
  T extends {
    game_id: string;
    player_names: string[];
    seconds_played: number;
    points_for: number;
    points_against: number;
    est_possessions: number;
    plus_minus: number;
  }
>(rows: T[], keyGetter: (row: T) => string) {
  const map = new Map<string, AggregatedRow>();
  const gameSetMap = new Map<string, Set<string>>();

  for (const row of rows) {
    const key = keyGetter(row);

    if (!map.has(key)) {
      map.set(key, {
        key,
        names: row.player_names,
        total_seconds: 0,
        total_points_for: 0,
        total_points_against: 0,
        total_est_possessions: 0,
        total_plus_minus: 0,
        games: 0,
        off_rating: 0,
      });
      gameSetMap.set(key, new Set());
    }

    const acc = map.get(key)!;
    acc.total_seconds += row.seconds_played;
    acc.total_points_for += row.points_for;
    acc.total_points_against += row.points_against;
    acc.total_est_possessions += row.est_possessions;
    acc.total_plus_minus += row.plus_minus;

    gameSetMap.get(key)!.add(row.game_id);
  }

  for (const [key, acc] of map.entries()) {
    const games = gameSetMap.get(key)?.size ?? 0;
    acc.games = games;
    acc.off_rating =
      acc.total_est_possessions > 0
        ? Number(((acc.total_points_for / acc.total_est_possessions) * 100).toFixed(2))
        : 0;
  }

  return [...map.values()];
}

function cardMetricLabel(label: string, value: string) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

export default function LineupsOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [lineups, setLineups] = useState<LineupRow[]>([]);
  const [combos, setCombos] = useState<ComboRow[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [{ data: lineupData, error: lineupError }, { data: comboData, error: comboError }] =
        await Promise.all([
          supabase.from("lineup_stats").select("*").eq("is_official", true),
          supabase.from("lineup_combo_stats").select("*").eq("is_official", true),
        ]);

      if (lineupError) {
        console.error("讀取 lineup_stats 失敗：", lineupError.message);
      }

      if (comboError) {
        console.error("讀取 lineup_combo_stats 失敗：", comboError.message);
      }

      setLineups((lineupData as LineupRow[]) ?? []);
      setCombos((comboData as ComboRow[]) ?? []);
      setLoading(false);
    };

    load();
  }, []);

  const aggregatedLineups = useMemo(() => {
    return aggregateRows(lineups, (r) => r.lineup_key)
      .filter((r) => r.total_seconds >= 180)
      .sort((a, b) => {
        if (b.total_plus_minus !== a.total_plus_minus) return b.total_plus_minus - a.total_plus_minus;
        if (b.off_rating !== a.off_rating) return b.off_rating - a.off_rating;
        return b.total_seconds - a.total_seconds;
      });
  }, [lineups]);

  const aggregatedPairs = useMemo(() => {
    return aggregateRows(
      combos.filter((r) => r.combo_size === 2),
      (r) => r.combo_key
    )
      .filter((r) => r.total_seconds >= 180)
      .sort((a, b) => {
        if (b.total_plus_minus !== a.total_plus_minus) return b.total_plus_minus - a.total_plus_minus;
        if (b.off_rating !== a.off_rating) return b.off_rating - a.off_rating;
        return b.total_seconds - a.total_seconds;
      });
  }, [combos]);

  const aggregatedTrios = useMemo(() => {
    return aggregateRows(
      combos.filter((r) => r.combo_size === 3),
      (r) => r.combo_key
    )
      .filter((r) => r.total_seconds >= 180)
      .sort((a, b) => {
        if (b.total_plus_minus !== a.total_plus_minus) return b.total_plus_minus - a.total_plus_minus;
        if (b.off_rating !== a.off_rating) return b.off_rating - a.off_rating;
        return b.total_seconds - a.total_seconds;
      });
  }, [combos]);

  const bestLineup = aggregatedLineups[0] ?? null;
  const worstLineup =
    [...aggregatedLineups]
      .sort((a, b) => {
        if (a.total_plus_minus !== b.total_plus_minus) return a.total_plus_minus - b.total_plus_minus;
        if (a.off_rating !== b.off_rating) return a.off_rating - b.off_rating;
        return b.total_seconds - a.total_seconds;
      })[0] ?? null;

  const bestPair = aggregatedPairs[0] ?? null;
  const bestTrio = aggregatedTrios[0] ?? null;
  const mostUsedLineup =
    [...aggregatedLineups].sort((a, b) => b.total_seconds - a.total_seconds)[0] ?? null;

  const strategyTexts = useMemo(() => {
    const texts: string[] = [];

    if (bestLineup) {
      texts.push(
        `整體最強五人組為 ${joinNames(bestLineup.names)}，累計上場 ${formatSeconds(
          bestLineup.total_seconds
        )}，總正負值 ${bestLineup.total_plus_minus >= 0 ? "+" : ""}${bestLineup.total_plus_minus}。`
      );
    }

    if (mostUsedLineup) {
      texts.push(
        `最常使用的五人組為 ${joinNames(mostUsedLineup.names)}，累計上場 ${formatSeconds(
          mostUsedLineup.total_seconds
        )}，代表這組最接近你的主輪替。`
      );
    }

    if (bestPair) {
      texts.push(
        `黃金雙人組為 ${joinNames(bestPair.names)}，共同上場 ${formatSeconds(
          bestPair.total_seconds
        )}，可優先保留。`
      );
    }

    if (bestTrio) {
      texts.push(
        `黃金三人組為 ${joinNames(bestTrio.names)}，建議作為主要輪替骨幹。`
      );
    }

    if (worstLineup) {
      texts.push(
        `整體效果較差的五人組為 ${joinNames(worstLineup.names)}，若之後樣本繼續增加仍偏低，可考慮調整搭配。`
      );
    }

    return texts;
  }, [bestLineup, bestPair, bestTrio, mostUsedLineup, worstLineup]);

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 text-xs tracking-[0.4em] text-orange-300/90">
                LINEUP OVERVIEW
              </div>
              <h1 className="text-4xl font-bold">綜合陣容分析</h1>
              <p className="mt-3 text-white/65">
                只統計正式賽，並用樣本門檻過濾掉過短上場時間，讓最強 lineup /
                雙人組 / 三人組更有決策價值。
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/viewer"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm"
              >
                返回首頁
              </Link>
              <Link
                href="/games/viewer"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm"
              >
                賽事中心
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
            載入中...
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-3 text-sm tracking-[0.25em] text-orange-300">最強 LINEUP</div>
                <div className="min-h-[72px] text-2xl font-semibold leading-snug">
                  {bestLineup ? joinNames(bestLineup.names) : "暫無資料"}
                </div>
                {bestLineup && (
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {cardMetricLabel("上場時間", formatSeconds(bestLineup.total_seconds))}
                    {cardMetricLabel(
                      "+/-",
                      `${bestLineup.total_plus_minus >= 0 ? "+" : ""}${bestLineup.total_plus_minus}`
                    )}
                    {cardMetricLabel("進攻效率", bestLineup.off_rating.toFixed(1))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-3 text-sm tracking-[0.25em] text-orange-300">最常用 LINEUP</div>
                <div className="min-h-[72px] text-2xl font-semibold leading-snug">
                  {mostUsedLineup ? joinNames(mostUsedLineup.names) : "暫無資料"}
                </div>
                {mostUsedLineup && (
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {cardMetricLabel("上場時間", formatSeconds(mostUsedLineup.total_seconds))}
                    {cardMetricLabel(
                      "場次",
                      String(mostUsedLineup.games)
                    )}
                    {cardMetricLabel("進攻效率", mostUsedLineup.off_rating.toFixed(1))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-3 text-sm tracking-[0.25em] text-orange-300">黃金雙人</div>
                <div className="min-h-[72px] text-2xl font-semibold leading-snug">
                  {bestPair ? joinNames(bestPair.names) : "暫無資料"}
                </div>
                {bestPair && (
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {cardMetricLabel("上場時間", formatSeconds(bestPair.total_seconds))}
                    {cardMetricLabel(
                      "+/-",
                      `${bestPair.total_plus_minus >= 0 ? "+" : ""}${bestPair.total_plus_minus}`
                    )}
                    {cardMetricLabel("進攻效率", bestPair.off_rating.toFixed(1))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-3 text-sm tracking-[0.25em] text-orange-300">黃金三人</div>
                <div className="min-h-[72px] text-2xl font-semibold leading-snug">
                  {bestTrio ? joinNames(bestTrio.names) : "暫無資料"}
                </div>
                {bestTrio && (
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {cardMetricLabel("上場時間", formatSeconds(bestTrio.total_seconds))}
                    {cardMetricLabel(
                      "+/-",
                      `${bestTrio.total_plus_minus >= 0 ? "+" : ""}${bestTrio.total_plus_minus}`
                    )}
                    {cardMetricLabel("進攻效率", bestTrio.off_rating.toFixed(1))}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-orange-400/25 bg-white/[0.03] p-5">
              <div className="mb-2 text-sm tracking-[0.25em] text-orange-300">
                STRATEGY SUGGESTIONS
              </div>
              <h2 className="mb-4 text-3xl font-bold">自動建議 / 輪替方向</h2>

              <div className="space-y-3">
                {strategyTexts.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-white/65">
                    尚無足夠正式賽資料產生建議
                  </div>
                ) : (
                  strategyTexts.map((text, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-400/15 text-orange-300">
                        {idx + 1}
                      </div>
                      <div className="text-white/85">{text}</div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-2xl font-bold">五人組排行</h3>
                <div className="space-y-3">
                  {aggregatedLineups.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-white/65">
                      尚無足夠資料
                    </div>
                  ) : (
                    aggregatedLineups.map((row) => (
                      <div
                        key={row.key}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                      >
                        <div className="text-lg font-semibold">{joinNames(row.names)}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white/75">
                          <div>時間：{formatSeconds(row.total_seconds)}</div>
                          <div>場次：{row.games}</div>
                          <div>
                            +/-：{row.total_plus_minus >= 0 ? "+" : ""}
                            {row.total_plus_minus}
                          </div>
                          <div>OffRtg：{row.off_rating.toFixed(1)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-2xl font-bold">雙人組排行</h3>
                <div className="space-y-3">
                  {aggregatedPairs.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-white/65">
                      尚無足夠資料
                    </div>
                  ) : (
                    aggregatedPairs.map((row) => (
                      <div
                        key={row.key}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                      >
                        <div className="text-lg font-semibold">{joinNames(row.names)}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white/75">
                          <div>時間：{formatSeconds(row.total_seconds)}</div>
                          <div>場次：{row.games}</div>
                          <div>
                            +/-：{row.total_plus_minus >= 0 ? "+" : ""}
                            {row.total_plus_minus}
                          </div>
                          <div>OffRtg：{row.off_rating.toFixed(1)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-2xl font-bold">三人組排行</h3>
                <div className="space-y-3">
                  {aggregatedTrios.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-white/65">
                      尚無足夠資料
                    </div>
                  ) : (
                    aggregatedTrios.map((row) => (
                      <div
                        key={row.key}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                      >
                        <div className="text-lg font-semibold">{joinNames(row.names)}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white/75">
                          <div>時間：{formatSeconds(row.total_seconds)}</div>
                          <div>場次：{row.games}</div>
                          <div>
                            +/-：{row.total_plus_minus >= 0 ? "+" : ""}
                            {row.total_plus_minus}
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