"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  status: string | null;
  is_live: boolean | null;
  created_at?: string | null;
  game_date?: string | null;
  start_time?: string | null;
};

type FilterType = "all" | "today" | "live" | "scheduled" | "finished";
type SortType = "dateDesc" | "dateAsc" | "createdDesc" | "nameAsc";

function normalizeStatus(status?: string | null) {
  const s = (status || "").trim().toLowerCase();

  if (["live", "playing", "in_progress", "ongoing", "running"].includes(s)) {
    return "live";
  }
  if (["finished", "ended", "done", "complete", "completed", "final"].includes(s)) {
    return "finished";
  }
  if (["scheduled", "upcoming", "pending"].includes(s)) {
    return "scheduled";
  }
  return "unknown";
}

function isLiveGame(game: GameRow) {
  const s = normalizeStatus(game.status);
  if (s === "finished") return false;
  return Boolean(game.is_live) || s === "live";
}

function getStatusText(game: GameRow) {
  const s = normalizeStatus(game.status);

  if (s === "finished") return "已結束";
  if (isLiveGame(game)) return "直播中";
  if (s === "scheduled") return "尚未開始";
  return "未設定";
}

function getStatusClass(game: GameRow) {
  const s = normalizeStatus(game.status);

  if (s === "finished") {
    return "border-zinc-700 bg-zinc-800 text-zinc-200";
  }
  if (isLiveGame(game)) {
    return "border-red-500/40 bg-red-500/15 text-red-200";
  }
  if (s === "scheduled") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-200";
  }
  return "border-zinc-700 bg-zinc-800 text-zinc-300";
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "未設定日期";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
}

function formatShortDate(dateStr?: string | null) {
  if (!dateStr) return "--/--";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  });
}

function formatTime(dateStr?: string | null) {
  if (!dateStr) return "--:--";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "--:--";

  return d.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateTime(dateStr?: string | null, timeStr?: string | null) {
  const dateText = formatDate(dateStr);
  const timeText = formatTime(timeStr);
  return `${dateText} ${timeText}`;
}

function formatCreatedAt(dateStr?: string | null) {
  if (!dateStr) return "未知";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function isToday(dateStr?: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;

  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function getTimestamp(dateStr?: string | null) {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function getMatchLabel(game: GameRow) {
  return `${game.teamA || "我們"} vs ${game.teamB || "對手"}`;
}

function EmptyState({
  title,
  actionHref,
  actionLabel,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-950/70 px-6 py-12 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-3xl">
        🏀
      </div>
      <div className="mt-4 text-xl font-bold text-white">{title}</div>

      {actionHref && actionLabel ? (
        <div className="mt-6">
          <Link
            href={actionHref}
            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-orange-400 to-amber-300 px-5 py-3 text-sm font-bold text-black transition hover:scale-[1.02]"
          >
            {actionLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default function GamesPage() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("dateDesc");

  async function loadGames() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, status, is_live, created_at, game_date, start_time")
      .order("game_date", { ascending: false, nullsFirst: false })
      .order("start_time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(`讀取賽程失敗：${error.message}`);
      setGames([]);
      setLoading(false);
      return;
    }

    setGames((data || []) as GameRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadGames();

    const channel = supabase
      .channel("games-page-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => {
          loadGames();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const summary = useMemo(() => {
    const total = games.length;
    const live = games.filter((g) => isLiveGame(g)).length;
    const today = games.filter((g) => isToday(g.game_date)).length;
    const finished = games.filter((g) => normalizeStatus(g.status) === "finished").length;

    return { total, live, today, finished };
  }, [games]);

  const searchedGames = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return games;

    return games.filter((g) => {
      const a = (g.teamA || "").toLowerCase();
      const b = (g.teamB || "").toLowerCase();
      const statusText = getStatusText(g).toLowerCase();
      const statusRaw = (g.status || "").toLowerCase();
      const dateText = formatDate(g.game_date).toLowerCase();
      const timeText = formatTime(g.start_time).toLowerCase();

      return (
        a.includes(keyword) ||
        b.includes(keyword) ||
        statusText.includes(keyword) ||
        statusRaw.includes(keyword) ||
        dateText.includes(keyword) ||
        timeText.includes(keyword)
      );
    });
  }, [games, search]);

  const filteredGames = useMemo(() => {
    let result = [...searchedGames];

    if (filter === "today") {
      result = result.filter((g) => isToday(g.game_date));
    } else if (filter === "live") {
      result = result.filter((g) => isLiveGame(g));
    } else if (filter === "scheduled") {
      result = result.filter((g) => normalizeStatus(g.status) === "scheduled");
    } else if (filter === "finished") {
      result = result.filter((g) => normalizeStatus(g.status) === "finished");
    }

    result.sort((a, b) => {
      if (sort === "dateDesc") {
        const bTime = getTimestamp(b.start_time) || getTimestamp(b.game_date);
        const aTime = getTimestamp(a.start_time) || getTimestamp(a.game_date);
        return bTime - aTime;
      }

      if (sort === "dateAsc") {
        const aTime = getTimestamp(a.start_time) || getTimestamp(a.game_date);
        const bTime = getTimestamp(b.start_time) || getTimestamp(b.game_date);
        return aTime - bTime;
      }

      if (sort === "createdDesc") {
        return getTimestamp(b.created_at) - getTimestamp(a.created_at);
      }

      return getMatchLabel(a).localeCompare(getMatchLabel(b), "zh-Hant");
    });

    return result;
  }, [searchedGames, filter, sort]);

  const liveGames = useMemo(() => {
    return filteredGames.filter((g) => isLiveGame(g));
  }, [filteredGames]);

  const todayGames = useMemo(() => {
    return filteredGames.filter((g) => isToday(g.game_date) && !isLiveGame(g));
  }, [filteredGames]);

  const recentFinished = useMemo(() => {
    return [...games]
      .filter((g) => normalizeStatus(g.status) === "finished")
      .sort((a, b) => {
        const bTime = getTimestamp(b.start_time) || getTimestamp(b.game_date);
        const aTime = getTimestamp(a.start_time) || getTimestamp(a.game_date);
        return bTime - aTime;
      })
      .slice(0, 6);
  }, [games]);

  const filterTabs: { key: FilterType; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "today", label: "今天" },
    { key: "live", label: "直播中" },
    { key: "scheduled", label: "未開始" },
    { key: "finished", label: "已結束" },
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.16),transparent_26%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_22%),linear-gradient(to_bottom,rgba(24,24,27,1),rgba(0,0,0,1))]" />
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          <section className="mb-6 rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-xl md:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
                  賽事中心
                </h1>
                <div className="mt-3 text-base text-zinc-300">
                  快速查看今天比賽、直播狀態、完整賽程與近期完賽
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/games/new"
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-orange-400 to-amber-300 px-5 py-3 text-sm font-bold text-black shadow-lg shadow-orange-500/20 transition hover:scale-[1.02] hover:from-orange-300 hover:to-amber-200"
                >
                  ＋ 建立新比賽
                </Link>
                <LogoutButton />
              </div>
            </div>
          </section>

          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="全部比賽" value={summary.total} icon="📅" accent="orange" />
            <SummaryCard title="直播中" value={summary.live} icon="🔴" accent="red" />
            <SummaryCard title="今天比賽" value={summary.today} icon="🕒" accent="amber" />
            <SummaryCard title="已結束" value={summary.finished} icon="✅" accent="zinc" />
          </section>

          <section className="mb-8 rounded-[28px] border border-white/10 bg-zinc-950/80 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur xl:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="w-full xl:max-w-md">
                <div className="mb-2 text-sm font-bold text-zinc-200">搜尋賽事</div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜尋隊名、狀態、日期、時間"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-orange-400/60"
                />
              </div>

              <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
                <div>
                  <div className="mb-2 text-sm font-bold text-zinc-200">篩選</div>
                  <div className="flex flex-wrap gap-2">
                    {filterTabs.map((tab) => {
                      const active = filter === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setFilter(tab.key)}
                          className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                            active
                              ? "border border-orange-400/40 bg-orange-500/15 text-orange-200 shadow-[0_0_0_1px_rgba(251,146,60,0.12)]"
                              : "border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800"
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-bold text-zinc-200">排序</div>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortType)}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400/60"
                  >
                    <option value="dateDesc">日期由近到遠</option>
                    <option value="dateAsc">日期由遠到近</option>
                    <option value="createdDesc">最近建立</option>
                    <option value="nameAsc">隊名排序</option>
                  </select>
                </div>
              </div>
            </div>

            {msg ? (
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {msg}
              </div>
            ) : null}
          </section>

          <section className="mb-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                直播中
              </h2>
            </div>

            {loading ? (
              <LoadingBlock />
            ) : liveGames.length === 0 ? (
              <EmptyState
                title="目前沒有直播中的比賽"
                actionHref="/games/new"
                actionLabel="建立新比賽"
              />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {liveGames.map((game) => (
                  <LiveGameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </section>

          <section className="mb-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                今天比賽
              </h2>
            </div>

            {loading ? (
              <LoadingBlock />
            ) : todayGames.length === 0 ? (
              <EmptyState title="今天沒有其他比賽" />
            ) : (
              <div className="grid gap-3">
                {todayGames.map((game) => (
                  <ScheduleRow key={game.id} game={game} />
                ))}
              </div>
            )}
          </section>

          <section className="mb-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                全部賽程
              </h2>

              <div className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200">
                共 {filteredGames.length} 場
              </div>
            </div>

            {loading ? (
              <LoadingBlock />
            ) : filteredGames.length === 0 ? (
              <EmptyState
                title="找不到符合條件的賽程"
                actionHref="/games/new"
                actionLabel="建立新比賽"
              />
            ) : (
              <div className="grid gap-3">
                {filteredGames.map((game) => (
                  <ScheduleRow key={game.id} game={game} />
                ))}
              </div>
            )}
          </section>

          <section className="pb-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black tracking-tight text-white md:text-3xl">
                近期完賽
              </h2>
            </div>

            {loading ? (
              <LoadingBlock />
            ) : recentFinished.length === 0 ? (
              <EmptyState title="目前沒有完賽資料" />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {recentFinished.map((game) => (
                  <ResultMiniCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  accent,
}: {
  title: string;
  value: number;
  icon: string;
  accent: "orange" | "red" | "amber" | "zinc";
}) {
  const accentMap = {
    orange:
      "from-orange-500/20 to-orange-300/5 border-orange-500/20 text-orange-200",
    red: "from-red-500/20 to-red-300/5 border-red-500/20 text-red-200",
    amber:
      "from-amber-500/20 to-amber-300/5 border-amber-500/20 text-amber-200",
    zinc: "from-zinc-500/15 to-zinc-300/5 border-zinc-700 text-zinc-200",
  };

  return (
    <div
      className={`rounded-[28px] border bg-gradient-to-br p-5 shadow-[0_10px_40px_rgba(0,0,0,0.25)] ${accentMap[accent]}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="text-base font-bold text-white">{title}</div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg">
          {icon}
        </div>
      </div>

      <div className="text-4xl font-black tracking-tight text-white">{value}</div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="grid gap-3">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-[28px] border border-zinc-800 bg-zinc-900/70"
        />
      ))}
    </div>
  );
}

function LiveGameCard({ game }: { game: GameRow }) {
  return (
    <div className="group relative overflow-hidden rounded-[30px] border border-red-500/25 bg-[linear-gradient(135deg,rgba(40,40,48,0.95),rgba(24,24,27,0.95))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.16),transparent_28%)]" />

      <div className="relative">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/35 bg-red-500/15 px-3 py-1.5 text-sm font-bold text-red-200">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" />
            直播中
          </div>

          <div
            className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-bold ${getStatusClass(
              game
            )}`}
          >
            {getStatusText(game)}
          </div>
        </div>

        <div className="mb-4">
          <h3 className="text-2xl font-black tracking-tight text-white md:text-3xl">
            {game.teamA || "我們"}
            <span className="mx-2 text-orange-300">vs</span>
            {game.teamB || "對手"}
          </h3>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-200">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              {formatDate(game.game_date)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              {formatTime(game.start_time)} 開始
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/games/${game.id}/live`}
            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-orange-400 to-amber-300 px-4 py-3 text-sm font-bold text-black transition hover:scale-[1.01]"
          >
            進入紀錄
          </Link>

          <Link
            href={`/games/${game.id}/board`}
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            查看完整數據
          </Link>
        </div>
      </div>
    </div>
  );
}

function ScheduleRow({ game }: { game: GameRow }) {
  const live = isLiveGame(game);
  const today = isToday(game.game_date);

  return (
    <div className="group rounded-[28px] border border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.95),rgba(16,16,20,0.95))] p-4 transition hover:border-orange-400/30 hover:bg-[linear-gradient(180deg,rgba(28,28,34,0.98),rgba(18,18,22,0.98))] md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center">
          <div className="flex w-full shrink-0 items-center gap-3 md:w-[150px]">
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <div className="text-base font-black text-white">
                {formatShortDate(game.game_date)}
              </div>
            </div>

            <div>
              <div className="text-xl font-black text-white">
                {formatTime(game.start_time)}
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {live ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-red-500/35 bg-red-500/15 px-3 py-1.5 text-sm font-bold text-red-200">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
                  直播中
                </span>
              ) : null}

              {today && !live ? (
                <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/15 px-3 py-1.5 text-sm font-bold text-amber-200">
                  今天
                </span>
              ) : null}
            </div>

            <div className="mt-2 truncate text-xl font-black tracking-tight text-white md:text-2xl">
              {game.teamA || "我們"}
              <span className="mx-2 text-orange-300">vs</span>
              {game.teamB || "對手"}
            </div>

            <div className="mt-2 text-sm text-zinc-300">
              {formatDateTime(game.game_date, game.start_time)}
            </div>

            <div className="mt-1 text-sm text-zinc-500">
              建立日期：{formatCreatedAt(game.created_at)}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          <div
            className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-sm font-bold ${getStatusClass(
              game
            )}`}
          >
            {getStatusText(game)}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:flex">
            <Link
              href={`/games/${game.id}/live`}
              className="inline-flex items-center justify-center rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
            >
              進入紀錄
            </Link>
            <Link
              href={`/games/${game.id}/board`}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-orange-400/30 hover:text-white"
            >
              查看完整數據
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultMiniCard({ game }: { game: GameRow }) {
  return (
    <div className="rounded-[26px] border border-zinc-800 bg-zinc-950/90 p-5 transition hover:border-zinc-700">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-bold text-zinc-200">
          已結束
        </div>
        <div className="text-sm text-zinc-400">{formatShortDate(game.game_date)}</div>
      </div>

      <div className="text-lg font-black tracking-tight text-white">
        {game.teamA || "我們"}
        <span className="mx-2 text-orange-300">vs</span>
        {game.teamB || "對手"}
      </div>

      <div className="mt-3 text-sm text-zinc-300">
        {formatDateTime(game.game_date, game.start_time)}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Link
          href={`/games/${game.id}/live`}
          className="inline-flex items-center justify-center rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
        >
          進入紀錄
        </Link>
        <Link
          href={`/games/${game.id}/board`}
          className="inline-flex items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-orange-400/30 hover:text-white"
        >
          查看完整數據
        </Link>
      </div>
    </div>
  );
}