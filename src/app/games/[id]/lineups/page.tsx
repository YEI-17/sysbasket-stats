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
  status?: string | null;
  game_date?: string | null;
  created_at?: string | null;
};

type LineupStatRow = {
  id: string;
  game_id: string;
  lineup_key?: string | null;
  pair_key?: string | null;
  trio_key?: string | null;
  player_ids: string[] | null;
  player_names: string[] | null;
  appearances: number | null;
  seconds_played: number | null;
  plus_minus: number | null;
  possessions: number | null;
  points_for: number | null;
  points_against: number | null;
  off_rating: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SortKey = "plus_minus" | "off_rating" | "seconds_played";

const MIN_SECONDS_FOR_DECISION = 120;

function formatSeconds(totalSeconds?: number | null) {
  const s = Math.max(0, totalSeconds ?? 0);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function formatPM(value?: number | null) {
  const v = value ?? 0;
  return v > 0 ? `+${v}` : `${v}`;
}

function formatRating(value?: number | null) {
  const v = Number(value ?? 0);
  if (!Number.isFinite(v)) return "0.0";
  return v.toFixed(1);
}

function normalizeNames(names?: string[] | null) {
  return (names ?? []).filter(Boolean);
}

function namesText(names?: string[] | null) {
  const arr = normalizeNames(names);
  return arr.length ? arr.join(" / ") : "未命名組合";
}

function sortRows(rows: LineupStatRow[], sortKey: SortKey) {
  return [...rows].sort((a, b) => {
    if (sortKey === "plus_minus") {
      const diff = (b.plus_minus ?? 0) - (a.plus_minus ?? 0);
      if (diff !== 0) return diff;
      return (b.off_rating ?? 0) - (a.off_rating ?? 0);
    }

    if (sortKey === "off_rating") {
      const diff = (b.off_rating ?? 0) - (a.off_rating ?? 0);
      if (diff !== 0) return diff;
      return (b.plus_minus ?? 0) - (a.plus_minus ?? 0);
    }

    const diff = (b.seconds_played ?? 0) - (a.seconds_played ?? 0);
    if (diff !== 0) return diff;
    return (b.plus_minus ?? 0) - (a.plus_minus ?? 0);
  });
}

function getBestRow(rows: LineupStatRow[]) {
  return [...rows]
    .filter((r) => (r.seconds_played ?? 0) >= MIN_SECONDS_FOR_DECISION)
    .sort((a, b) => {
      const diff = (b.plus_minus ?? 0) - (a.plus_minus ?? 0);
      if (diff !== 0) return diff;
      return (b.off_rating ?? 0) - (a.off_rating ?? 0);
    })[0];
}

function getWorstRow(rows: LineupStatRow[]) {
  return [...rows]
    .filter((r) => (r.seconds_played ?? 0) >= MIN_SECONDS_FOR_DECISION)
    .sort((a, b) => {
      const diff = (a.plus_minus ?? 0) - (b.plus_minus ?? 0);
      if (diff !== 0) return diff;
      return (a.off_rating ?? 0) - (b.off_rating ?? 0);
    })[0];
}

function getHighPotentialRow(rows: LineupStatRow[]) {
  return [...rows]
    .filter((r) => (r.seconds_played ?? 0) > 0 && (r.seconds_played ?? 0) < MIN_SECONDS_FOR_DECISION)
    .sort((a, b) => {
      const diff = (b.off_rating ?? 0) - (a.off_rating ?? 0);
      if (diff !== 0) return diff;
      return (b.plus_minus ?? 0) - (a.plus_minus ?? 0);
    })[0];
}

function buildSuggestions(params: {
  bestLineup?: LineupStatRow;
  worstLineup?: LineupStatRow;
  bestPair?: LineupStatRow;
  bestTrio?: LineupStatRow;
  highPotential?: LineupStatRow;
}) {
  const { bestLineup, worstLineup, bestPair, bestTrio, highPotential } = params;
  const suggestions: string[] = [];

  if (bestLineup) {
    suggestions.push(
      `本場最穩定的五人組為 ${namesText(bestLineup.player_names)}，上場 ${formatSeconds(
        bestLineup.seconds_played
      )}，正負值 ${formatPM(bestLineup.plus_minus)}，進攻效率 ${formatRating(bestLineup.off_rating)}。`
    );
  }

  if (bestPair) {
    suggestions.push(
      `最佳雙人核心為 ${namesText(bestPair.player_names)}，共同上場 ${formatSeconds(
        bestPair.seconds_played
      )}，可優先保留這組搭配。`
    );
  }

  if (bestTrio) {
    suggestions.push(
      `最佳三人骨幹為 ${namesText(bestTrio.player_names)}，建議優先作為主要輪替核心。`
    );
  }

  if (worstLineup) {
    suggestions.push(
      `效果較差的五人組為 ${namesText(worstLineup.player_names)}，上場 ${formatSeconds(
        worstLineup.seconds_played
      )}，正負值 ${formatPM(worstLineup.plus_minus)}，建議降低長時間重疊。`
    );
  }

  if (highPotential) {
    suggestions.push(
      `${namesText(highPotential.player_names)} 的進攻效率達 ${formatRating(
        highPotential.off_rating
      )}，但上場僅 ${formatSeconds(highPotential.seconds_played)}，屬於高潛力但樣本不足的組合。`
    );
  }

  return suggestions.slice(0, 5);
}

function MetricBadge({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm ${
        good
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-white/10 bg-white/5 text-white/80"
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">{label}</div>
      <div className="mt-1 text-base font-semibold text-white">{value}</div>
    </div>
  );
}

function SummaryCard({
  title,
  names,
  seconds,
  plusMinus,
  offRating,
  emptyText,
}: {
  title: string;
  names?: string[] | null;
  seconds?: number | null;
  plusMinus?: number | null;
  offRating?: number | null;
  emptyText?: string;
}) {
  const hasData = names && names.length > 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="text-xs uppercase tracking-[0.25em] text-orange-300/80">{title}</div>

      {hasData ? (
        <>
          <div className="mt-3 text-lg font-bold leading-snug text-white">{namesText(names)}</div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MetricBadge label="上場時間" value={formatSeconds(seconds)} />
            <MetricBadge label="+/-" value={formatPM(plusMinus)} good={(plusMinus ?? 0) > 0} />
            <MetricBadge label="進攻效率" value={formatRating(offRating)} />
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-white/50">
          {emptyText ?? "目前沒有足夠資料"}
        </div>
      )}
    </div>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active
          ? "bg-orange-500 text-white shadow-[0_8px_20px_rgba(249,115,22,0.35)]"
          : "border border-white/10 bg-white/5 text-white/75 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function SectionTable({
  title,
  rows,
  sortKey,
  onChangeSort,
  emptyText,
}: {
  title: string;
  rows: LineupStatRow[];
  sortKey: SortKey;
  onChangeSort: (key: SortKey) => void;
  emptyText: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-bold text-white">{title}</div>
          <div className="mt-1 text-sm text-white/55">只顯示已完成重算後的陣容統計資料</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SortButton active={sortKey === "plus_minus"} onClick={() => onChangeSort("plus_minus")}>
            依 +/- 排序
          </SortButton>
          <SortButton active={sortKey === "off_rating"} onClick={() => onChangeSort("off_rating")}>
            依進攻效率排序
          </SortButton>
          <SortButton
            active={sortKey === "seconds_played"}
            onClick={() => onChangeSort("seconds_played")}
          >
            依上場時間排序
          </SortButton>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-sm text-white/50">
          {emptyText}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/45">
                <th className="px-3 py-3 font-medium">排名</th>
                <th className="px-3 py-3 font-medium">組合</th>
                <th className="px-3 py-3 font-medium">上場時間</th>
                <th className="px-3 py-3 font-medium">+/-</th>
                <th className="px-3 py-3 font-medium">進攻效率</th>
                <th className="px-3 py-3 font-medium">出現次數</th>
                <th className="px-3 py-3 font-medium">得分</th>
                <th className="px-3 py-3 font-medium">失分</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isGood = (row.plus_minus ?? 0) > 0;
                const isBad = (row.plus_minus ?? 0) < 0;

                return (
                  <tr
                    key={row.id}
                    className="border-b border-white/5 text-white/85 transition hover:bg-white/5"
                  >
                    <td className="px-3 py-3 font-semibold text-white">{index + 1}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-white">{namesText(row.player_names)}</div>
                      <div className="mt-1 text-xs text-white/40">
                        {(row.seconds_played ?? 0) >= MIN_SECONDS_FOR_DECISION
                          ? "可作為決策參考"
                          : "樣本偏少，建議持續觀察"}
                      </div>
                    </td>
                    <td className="px-3 py-3">{formatSeconds(row.seconds_played)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          isGood
                            ? "bg-emerald-500/15 text-emerald-300"
                            : isBad
                            ? "bg-rose-500/15 text-rose-300"
                            : "bg-white/10 text-white/70"
                        }`}
                      >
                        {formatPM(row.plus_minus)}
                      </span>
                    </td>
                    <td className="px-3 py-3">{formatRating(row.off_rating)}</td>
                    <td className="px-3 py-3">{row.appearances ?? 0}</td>
                    <td className="px-3 py-3">{row.points_for ?? 0}</td>
                    <td className="px-3 py-3">{row.points_against ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function GameLineupsPage() {
  const params = useParams();
  const gameId = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<GameRow | null>(null);
  const [lineups, setLineups] = useState<LineupStatRow[]>([]);
  const [pairs, setPairs] = useState<LineupStatRow[]>([]);
  const [trios, setTrios] = useState<LineupStatRow[]>([]);
  const [error, setError] = useState<string>("");

  const [lineupSort, setLineupSort] = useState<SortKey>("plus_minus");
  const [pairSort, setPairSort] = useState<SortKey>("plus_minus");
  const [trioSort, setTrioSort] = useState<SortKey>("plus_minus");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!gameId) return;

      setLoading(true);
      setError("");

      try {
        const [{ data: gameData, error: gameError }, { data: lineupData, error: lineupError }, { data: pairData, error: pairError }, { data: trioData, error: trioError }] =
          await Promise.all([
            supabase
              .from("games")
              .select("id, teamA, teamB, status, game_date, created_at")
              .eq("id", gameId)
              .single(),
            supabase
              .from("lineup_stats")
              .select("*")
              .eq("game_id", gameId),
            supabase
              .from("lineup_pair_stats")
              .select("*")
              .eq("game_id", gameId),
            supabase
              .from("lineup_trio_stats")
              .select("*")
              .eq("game_id", gameId),
          ]);

        if (gameError) throw gameError;
        if (lineupError) throw lineupError;
        if (pairError) throw pairError;
        if (trioError) throw trioError;

        if (cancelled) return;

        setGame(gameData ?? null);
        setLineups((lineupData ?? []) as LineupStatRow[]);
        setPairs((pairData ?? []) as LineupStatRow[]);
        setTrios((trioData ?? []) as LineupStatRow[]);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "讀取 lineup 資料失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const sortedLineups = useMemo(() => sortRows(lineups, lineupSort), [lineups, lineupSort]);
  const sortedPairs = useMemo(() => sortRows(pairs, pairSort), [pairs, pairSort]);
  const sortedTrios = useMemo(() => sortRows(trios, trioSort), [trios, trioSort]);

  const bestLineup = useMemo(() => getBestRow(lineups), [lineups]);
  const worstLineup = useMemo(() => getWorstRow(lineups), [lineups]);
  const bestPair = useMemo(() => getBestRow(pairs), [pairs]);
  const bestTrio = useMemo(() => getBestRow(trios), [trios]);
  const highPotential = useMemo(() => getHighPotentialRow(lineups), [lineups]);

  const suggestions = useMemo(
    () =>
      buildSuggestions({
        bestLineup,
        worstLineup,
        bestPair,
        bestTrio,
        highPotential,
      }),
    [bestLineup, worstLineup, bestPair, bestTrio, highPotential]
  );

  const gameTitle = useMemo(() => {
    if (!game) return "LINEUP 分析";
    return `${game.teamA ?? "我方"} vs ${game.teamB ?? "對手"}`;
  }, [game]);

  return (
    <main className="min-h-screen bg-[#0a0f1c] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-180px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute bottom-[-120px] left-[-60px] h-[320px] w-[320px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute right-[-40px] top-[20%] h-[280px] w-[280px] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/5" />
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-black/20 p-5 backdrop-blur md:flex-row md:items-center md:justify-between md:p-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-orange-300/80">Lineup Analysis</div>
            <h1 className="mt-2 text-2xl font-black tracking-tight md:text-4xl">{gameTitle}</h1>
            <div className="mt-2 text-sm text-white/55">
              找出本場最強五人組、核心雙人與主要三人骨幹，讓數據真正變成決策工具
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/games/${gameId}/live`}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              返回紀錄頁
            </Link>
            <Link
              href={`/games/${gameId}/box`}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              Box 數據
            </Link>
            <Link
              href="/games"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              賽事中心
            </Link>
            <LogoutButton />
          </div>
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/60">
            讀取 lineup 分析中...
          </div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-200">
            {error}
          </div>
        ) : (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="最強 Lineup"
                names={bestLineup?.player_names}
                seconds={bestLineup?.seconds_played}
                plusMinus={bestLineup?.plus_minus}
                offRating={bestLineup?.off_rating}
                emptyText="目前沒有達到 2 分鐘門檻的五人組資料"
              />
              <SummaryCard
                title="最爛 Lineup"
                names={worstLineup?.player_names}
                seconds={worstLineup?.seconds_played}
                plusMinus={worstLineup?.plus_minus}
                offRating={worstLineup?.off_rating}
                emptyText="目前沒有達到 2 分鐘門檻的五人組資料"
              />
              <SummaryCard
                title="黃金雙人"
                names={bestPair?.player_names}
                seconds={bestPair?.seconds_played}
                plusMinus={bestPair?.plus_minus}
                offRating={bestPair?.off_rating}
                emptyText="目前沒有達到 2 分鐘門檻的雙人組資料"
              />
              <SummaryCard
                title="黃金三人"
                names={bestTrio?.player_names}
                seconds={bestTrio?.seconds_played}
                plusMinus={bestTrio?.plus_minus}
                offRating={bestTrio?.off_rating}
                emptyText="目前沒有達到 2 分鐘門檻的三人組資料"
              />
            </section>

            <section className="mt-6 rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-white/5 p-5">
              <div className="text-xs uppercase tracking-[0.25em] text-orange-300/80">Strategy Suggestions</div>
              <div className="mt-2 text-xl font-bold text-white">自動建議 / 比賽策略</div>

              {suggestions.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-white/50">
                  目前還沒有足夠資料產生策略建議，請先完成該場重算。
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {suggestions.map((text, index) => (
                    <div
                      key={`${text}-${index}`}
                      className="rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-white/85"
                    >
                      <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 text-xs font-bold text-orange-300">
                        {index + 1}
                      </span>
                      {text}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="mt-6 grid gap-6">
              <SectionTable
                title="五人 Lineup 分析"
                rows={sortedLineups}
                sortKey={lineupSort}
                onChangeSort={setLineupSort}
                emptyText="目前沒有五人 lineup 統計資料"
              />

              <SectionTable
                title="雙人組合分析"
                rows={sortedPairs}
                sortKey={pairSort}
                onChangeSort={setPairSort}
                emptyText="目前沒有雙人組合統計資料"
              />

              <SectionTable
                title="三人組合分析"
                rows={sortedTrios}
                sortKey={trioSort}
                onChangeSort={setTrioSort}
                emptyText="目前沒有三人組合統計資料"
              />
            </div>

            <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-lg font-bold text-white">首頁之後建議新增的內容</div>
              <div className="mt-3 grid gap-3 text-sm text-white/75 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="font-semibold text-white">1. 最強陣容摘要卡</div>
                  <div className="mt-1 text-white/60">
                    直接顯示本場最佳五人組，讓首頁從「看數字」變成「看結論」。
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="font-semibold text-white">2. 黃金雙人摘要卡</div>
                  <div className="mt-1 text-white/60">
                    讓隊長一打開首頁就知道哪兩位一起搭配效果最好。
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="font-semibold text-white">3. 問題陣容提醒</div>
                  <div className="mt-1 text-white/60">
                    顯示本場效果最差的五人組，幫助判斷哪些搭配要少用。
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="font-semibold text-white">4. 進入 Lineup 頁的入口</div>
                  <div className="mt-1 text-white/60">
                    首頁放一個「陣容分析」按鈕或卡片，讓使用者知道這是決策頁。
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}