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
    if (b.seconds_played !== a.seconds_played) return b.seconds_played - a.seconds_played;
    return b.off_rating - a.off_rating;
  });
}

function getSampleLabel(seconds: number) {
  if (seconds >= 480) return "高樣本";
  if (seconds >= 240) return "中樣本";
  return "低樣本";
}

function getPlusMinusText(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
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

  const lineupCandidates = useMemo(
    () => sortByPerformance(lineups.filter((r) => r.seconds_played >= 60)),
    [lineups]
  );

  const pairCandidates = useMemo(
    () => sortByPerformance(combos.filter((r) => r.combo_size === 2 && r.seconds_played >= 60)),
    [combos]
  );

  const trioCandidates = useMemo(
    () => sortByPerformance(combos.filter((r) => r.combo_size === 3 && r.seconds_played >= 60)),
    [combos]
  );

  const bestLineup = lineupCandidates[0] ?? null;
  const bestPair = pairCandidates[0] ?? null;
  const bestTrio = trioCandidates[0] ?? null;

  const topLineups = useMemo(() => lineupCandidates.slice(0, 5), [lineupCandidates]);
  const topPairs = useMemo(() => pairCandidates.slice(0, 5), [pairCandidates]);
  const topTrios = useMemo(() => trioCandidates.slice(0, 5), [trioCandidates]);

  const weakHighSampleLineup = useMemo(() => {
    return [...lineups]
      .filter((r) => r.seconds_played >= 240)
      .sort((a, b) => {
        if (a.plus_minus !== b.plus_minus) return a.plus_minus - b.plus_minus;
        return b.seconds_played - a.seconds_played;
      })[0] ?? null;
  }, [lineups]);

  const suggestions = useMemo(() => {
    const list: string[] = [];

    if (bestLineup) {
      list.push(
        `優先延續 ${joinNames(bestLineup.player_names)} 這組五人，上場 ${formatSeconds(
          bestLineup.seconds_played
        )}、正負值 ${getPlusMinusText(bestLineup.plus_minus)}。`
      );
    }

    if (bestPair) {
      list.push(
        `${joinNames(bestPair.player_names)} 可作為優先保留的雙人搭配，正負值 ${getPlusMinusText(
          bestPair.plus_minus
        )}。`
      );
    }

    if (weakHighSampleLineup && weakHighSampleLineup.plus_minus < 0) {
      list.push(
        `${joinNames(
          weakHighSampleLineup.player_names
        )} 屬於高樣本但效果偏差的組合，輪替可優先考慮拆開或縮短重疊時間。`
      );
    }

    return list;
  }, [bestLineup, bestPair, weakHighSampleLineup]);

  const summaryCards = [
    { title: "最佳五人組", item: bestLineup },
    { title: "最佳雙人組", item: bestPair },
    { title: "最佳三人組", item: bestTrio },
  ];

  return (
    <main className="min-h-screen bg-black text-white">
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
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/games/lineups"
                className="rounded-full border border-orange-300/20 bg-orange-300/10 px-5 py-3 text-sm transition hover:bg-orange-300/15"
              >
                選擇其他比賽
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
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                        <div className="text-xs text-white/45">正負值</div>
                        <div className="mt-2 text-3xl font-bold">
                          {getPlusMinusText(item.plus_minus)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-xs text-white/45">上場時間</div>
                        <div className="mt-2 text-3xl font-bold">
                          {formatSeconds(item.seconds_played)}
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
                DECISION NOTES
              </div>
              <h2 className="mb-4 text-3xl font-bold">輪替重點</h2>

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
              <TopListCard title="五人組 Top 5" rows={topLineups} />
              <TopListCard title="雙人組 Top 5" rows={topPairs} />
              <TopListCard title="三人組 Top 5" rows={topTrios} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function TopListCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: string;
    player_names: string[];
    seconds_played: number;
    plus_minus: number;
  }>;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="mb-4 text-2xl font-bold">{title}</h3>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-white/60">
            目前沒有資料
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={row.id}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-orange-400/15 px-2 text-sm font-bold text-orange-300">
                      {index + 1}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/65">
                      {getSampleLabel(row.seconds_played)}
                    </span>
                  </div>

                  <div className="text-lg font-semibold leading-snug">
                    {joinNames(row.player_names)}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-xs text-white/45">正負值</div>
                  <div className="text-2xl font-bold text-emerald-300">
                    {getPlusMinusText(row.plus_minus)}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-sm text-white/70">
                上場時間：{formatSeconds(row.seconds_played)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}