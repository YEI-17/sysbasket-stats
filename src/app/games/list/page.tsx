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
  if (["finished", "ended", "done", "complete"].includes(s)) {
    return "finished";
  }
  if (["scheduled", "upcoming", "pending"].includes(s)) {
    return "scheduled";
  }
  return "unknown";
}

function getStatusText(game: GameRow) {
  const s = normalizeStatus(game.status);
  if (game.is_live || s === "live") return "直播中";
  if (s === "finished") return "已結束";
  if (s === "scheduled") return "尚未開始";
  return "未分類";
}

function getStatusEnglish(game: GameRow) {
  const s = normalizeStatus(game.status);
  if (game.is_live || s === "live") return "LIVE";
  if (s === "finished") return "FINAL";
  if (s === "scheduled") return "SCHEDULED";
  return "UNKNOWN";
}

function getStatusClass(game: GameRow) {
  const s = normalizeStatus(game.status);

  if (game.is_live || s === "live") {
    return "border-red-500/40 bg-red-500/15 text-red-200";
  }
  if (s === "finished") {
    return "border-zinc-700 bg-zinc-800/80 text-zinc-200";
  }
  if (s === "scheduled") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-200";
  }
  return "border-zinc-700 bg-zinc-800/80 text-zinc-300";
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
  return `${game.teamA || "隊伍A"} vs ${game.teamB || "隊伍B"}`;
}

function sectionEmpty(
  title: string,
  subtitle: string,
  actionHref?: string,
  actionLabel?: string
) {
  return (
    <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-950/60 px-6 py-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-2xl">
        🏀
      </div>
      <div className="text-xl font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm text-zinc-400">{subtitle}</div>

      {actionHref && actionLabel ? (
        <div className="mt-5">
          <Link
            href={actionHref}
            className="inline-flex items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/15 px-5 py-2.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20"
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
    const live = games.filter(
      (g) => g.is_live || normalizeStatus(g.status) === "live"
    ).length;
    const today = games.filter((g) => isToday(g.game_date)).length;
    const finished = games.filter(
      (g) => normalizeStatus(g.status) === "finished"
    ).length;

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
      result = result.filter(
        (g) => g.is_live || normalizeStatus(g.status) === "live"
      );
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

  const liveGames = useMemo(
    () =>
      filteredGames.filter(
        (g) => g.is_live || normalizeStatus(g.status) === "live"
      ),
    [filteredGames]
  );

  const todayGames = useMemo(
    () =>
      filteredGames.filter(
        (g) =>
          isToday(g.game_date) &&
          !(g.is_live || normalizeStatus(g.status) === "live")
      ),
    [filteredGames]
  );

  const scheduleGames = useMemo(() => {
    return filteredGames.filter(
      (g) => !(g.is_live || normalizeStatus(g.status) === "live")
    );
  }, [filteredGames]);

  const recentFinished = useMemo(() => {
    return [...games]
      .filter((g) => normalizeStatus(g.status) === "finished")
      .sort((a, b) => {
        const bTime = getTimestamp(b.start_time) || getTimestamp(b.game_date);
        const aTime = getTimestamp(a.start_time) || getTimestamp(a.game_date);
        return bTime - aTime;
      })
      .slice(0, 5);
  }, [games]);

  const filterTabs: { key: FilterType; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "today", label: "今日" },
    { key: "live", label: "直播中" },
    { key: "scheduled", label: "即將開始" },
    { key: "finished", label: "已結束" },
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(249,115,22,0.12),transparent_24%),linear-gradient(to_bottom,rgba(24,24,27,1),rgba(0,0,0,1))]" />
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          <section className="mb-6 rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-xl md:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-amber-200">
                  SCHEDULE CENTER
                </div>

                <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
                  賽程中心
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
                  管理近期賽程、掌握直播中比賽、快速進入紀錄與完整數據頁，
                  讓整個系統更像正式球隊或聯盟的賽程中心。
                </p>
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
            <SummaryCard
              title="總比賽數"
              value={summary.total}
              sub="Total Games"
              accent="orange"
              icon="📅"
            />
            <SummaryCard
              title="直播中"
              value={summary.live}
              sub="Live Now"
              accent="red"
              icon="🔴"
            />
            <SummaryCard
              title="今日賽程"
              value={summary.today}
              sub="Today's Games"
              accent="amber"
              icon="🕒"
            />
            <SummaryCard
              title="已結束"
              value={summary.finished}
              sub="Completed"
              accent="zinc"
              icon="✅"
            />
          </section>

          <section className="mb-8 rounded-[28px] border border-white/10 bg-zinc-950/80 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur xl:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="w-full xl:max-w-md">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Search Schedule
                </label>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜尋對手、狀態、日期、時間"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-orange-400/60 focus:bg-zinc-900"
                />
              </div>

              <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Filters
                  </div>
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
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Sort
                  </label>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortType)}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white outline-none transition focus:border-orange-400/60"
                  >
                    <option value="dateDesc">日期由近到遠</option>
                    <option value="dateAsc">日期由遠到近</option>
                    <option value="createdDesc">建立時間最新</option>
                    <option value="nameAsc">隊名排序 A-Z</option>
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
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-red-300/80">
                  Live Games
                </div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">
                  直播中賽事
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  正在進行中的比賽會優先顯示在這裡。
                </p>
              </div>
            </div>

            {loading ? (
              <LoadingBlock />
            ) : liveGames.length === 0 ? (
              sectionEmpty(
                "目前沒有直播中的比賽",
                "當有賽事進入直播狀態時，這裡會優先顯示。",
                "/games/new",
                "建立新比賽"
              )
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {liveGames.map((game) => (
                  <LiveGameCard key={game.id} game={game} />
                ))}
              </div>
            )}
          </section>

          <section className="mb-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300/80">
                  Today's Schedule
                </div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">
                  今日賽程
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  今天安排的比賽會集中顯示，方便快速掌握。
                </p>
              </div>
            </div>

            {loading ? (
              <LoadingBlock />
            ) : todayGames.length === 0 ? (
              sectionEmpty(
                "今天沒有其他賽程",
                "目前今日賽程為空，或符合條件的比賽已經在直播中。"
              )
            ) : (
              <div className="grid gap-3">
                {todayGames.map((game) => (
                  <ScheduleRow key={game.id} game={game} />
                ))}
              </div>
            )}
          </section>

          <section className="mb-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-300/80">
                  Full Schedule
                </div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">
                  完整賽程
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  依照你的篩選與排序條件顯示全部賽事。
                </p>
              </div>

              <div className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300">
                共 {filteredGames.length} 場
              </div>
            </div>

            {loading ? (
              <LoadingBlock />
            ) : scheduleGames.length === 0 && liveGames.length === 0 ? (
              sectionEmpty(
                "找不到符合條件的賽程",
                "你可以調整搜尋、篩選條件，或直接建立新比賽。",
                "/games/new",
                "建立新比賽"
              )
            ) : (
              <div className="grid gap-3">
                {filteredGames.map((game) => (
                  <ScheduleRow key={game.id} game={game} />
                ))}
              </div>
            )}
          </section>

          <section className="pb-4">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
                  Recent Results
                </div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">
                  近期完賽
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  快速回顧最近結束的比賽。
                </p>
              </div>
            </div>

            {loading ? (
              <LoadingBlock />
            ) : recentFinished.length === 0 ? (
              sectionEmpty("目前沒有完賽資料", "結束的比賽會自動出現在這裡。")
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
  sub,
  accent,
  icon,
}: {
  title: string;
  value: number;
  sub: string;
  accent: "orange" | "red" | "amber" | "zinc";
  icon: string;
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
      <div className="mb-5 flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-300">{title}</div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg">
          {icon}
        </div>
      </div>

      <div className="text-4xl font-black tracking-tight text-white">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.22em] text-zinc-400">
        {sub}
      </div>
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
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/35 bg-red-500/15 px-3 py-1 text-xs font-bold tracking-[0.2em] text-red-200">
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-400" />
            LIVE
          </div>

          <div
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getStatusClass(
              game
            )}`}
          >
            {getStatusText(game)}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-400">
            NOW PLAYING
          </div>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-white md:text-3xl">
            {game.teamA || "隊伍A"}
            <span className="mx-2 text-orange-300">vs</span>
            {game.teamB || "隊伍B"}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {formatDate(game.game_date)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              開賽 {formatTime(game.start_time)}
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
            完整數據
          </Link>
        </div>
      </div>
    </div>
  );
}

function ScheduleRow({ game }: { game: GameRow }) {
  const isLive = game.is_live || normalizeStatus(game.status) === "live";
  const isGameToday = isToday(game.game_date);

  return (
    <div className="group rounded-[28px] border border-zinc-800 bg-[linear-gradient(180deg,rgba(24,24,27,0.95),rgba(16,16,20,0.95))] p-4 transition hover:border-orange-400/30 hover:bg-[linear-gradient(180deg,rgba(28,28,34,0.98),rgba(18,18,22,0.98))] md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center">
          <div className="flex w-full shrink-0 items-center gap-3 md:w-[150px]">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <div className="text-[11px] font-bold tracking-[0.15em] text-zinc-400">
                DATE
              </div>
              <div className="text-sm font-black text-white">
                {formatShortDate(game.game_date)}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Tip Off
              </div>
              <div className="text-lg font-black text-white">
                {formatTime(game.start_time)}
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isLive ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-red-500/35 bg-red-500/15 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-red-200">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
                  LIVE
                </span>
              ) : null}

              {isGameToday && !isLive ? (
                <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/15 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-amber-200">
                  TODAY
                </span>
              ) : null}
            </div>

            <div className="mt-2 truncate text-xl font-black tracking-tight text-white md:text-2xl">
              {game.teamA || "隊伍A"}
              <span className="mx-2 text-orange-300">vs</span>
              {game.teamB || "隊伍B"}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              <span>{formatDate(game.game_date)}</span>
              <span className="text-zinc-600">•</span>
              <span>{formatTime(game.start_time)}</span>
              <span className="text-zinc-600">•</span>
              <span>建立於 {formatCreatedAt(game.created_at)}</span>
              <span className="text-zinc-600">•</span>
              <span>{getStatusEnglish(game)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          <div
            className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-bold tracking-[0.16em] ${getStatusClass(
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
              完整數據
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
        <div className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-zinc-300">
          FINAL
        </div>
        <div className="text-xs text-zinc-500">
          {formatShortDate(game.game_date)}
        </div>
      </div>

      <div className="text-lg font-black tracking-tight text-white">
        {game.teamA || "隊伍A"}
        <span className="mx-2 text-orange-300">vs</span>
        {game.teamB || "隊伍B"}
      </div>

      <div className="mt-2 text-sm text-zinc-400">
        {formatDate(game.game_date)} · {formatTime(game.start_time)}
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
          完整數據
        </Link>
      </div>
    </div>
  );
}