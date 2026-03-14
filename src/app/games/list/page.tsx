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
};

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "未設定日期";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatTime(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
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

function getStatusText(game: GameRow) {
  if (game.is_live) return "直播中";
  if (game.status === "finished") return "已結束";
  if (game.status === "scheduled") return "尚未開始";
  if (game.status === "live") return "直播中";
  return "未分類";
}

function getStatusStyle(game: GameRow) {
  if (game.is_live || game.status === "live") {
    return "bg-red-500/20 text-red-300 border border-red-500/40";
  }
  if (game.status === "finished") {
    return "bg-zinc-700/40 text-zinc-300 border border-zinc-600";
  }
  if (game.status === "scheduled") {
    return "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40";
  }
  return "bg-zinc-800 text-zinc-300 border border-zinc-700";
}

export default function GamesPage() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");

  async function loadGames() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, status, is_live, created_at, game_date")
      .order("game_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(`讀取比賽列表失敗：${error.message}`);
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

  const filteredGames = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return games;

    return games.filter((g) => {
      const a = (g.teamA || "").toLowerCase();
      const b = (g.teamB || "").toLowerCase();
      const status = (g.status || "").toLowerCase();
      return a.includes(keyword) || b.includes(keyword) || status.includes(keyword);
    });
  }, [games, search]);

  const liveGames = useMemo(
    () => filteredGames.filter((g) => g.is_live || g.status === "live"),
    [filteredGames]
  );

  const todayGames = useMemo(
    () =>
      filteredGames.filter(
        (g) => isToday(g.game_date) && !(g.is_live || g.status === "live")
      ),
    [filteredGames]
  );

  const recentGames = useMemo(
    () => filteredGames.filter((g) => g.status === "finished").slice(0, 5),
    [filteredGames]
  );

  return (
    <main className="min-h-screen bg-black text-white px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              比賽列表
            </h1>
          </div>

          <LogoutButton />
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋隊伍名稱或比賽狀態"
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-zinc-500"
          />

          <Link
            href="/games/new"
            className="inline-flex items-center justify-center rounded-2xl bg-zinc-200 px-6 py-3 text-lg font-semibold text-black hover:bg-zinc-100 transition"
          >
            ＋ 建立新比賽
          </Link>
        </div>

        {msg ? (
          <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300">
            {msg}
          </div>
        ) : null}

        <section className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-4 text-2xl font-bold">目前直播中的比賽</h2>

          {loading ? (
            <p className="text-zinc-400">載入中...</p>
          ) : liveGames.length === 0 ? (
            <p className="text-zinc-500">目前沒有直播中的比賽</p>
          ) : (
            <div className="grid gap-4">
              {liveGames.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="mb-4 text-2xl font-bold">全部比賽</h2>

          {loading ? (
            <p className="text-zinc-400">載入中...</p>
          ) : filteredGames.length === 0 ? (
            <p className="text-zinc-500">找不到符合條件的比賽</p>
          ) : (
            <div className="grid gap-4">
              {filteredGames.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );

  function GameCard({ game }: { game: GameRow }) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl md:text-2xl font-semibold">
              {game.teamA || "隊伍A"} vs {game.teamB || "隊伍B"}
            </div>
            <div className="mt-1 text-sm text-zinc-400">
              日期：{formatDate(game.game_date)}{" "}
              {game.game_date ? formatTime(game.game_date) : ""}
            </div>
          </div>

          <div
            className={`inline-flex w-fit rounded-full px-3 py-1 text-sm font-medium ${getStatusStyle(
              game
            )}`}
          >
            {getStatusText(game)}
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <Link
            href={`/games/${game.id}/live`}
            className="rounded-xl bg-zinc-700 px-4 py-3 text-center font-semibold text-white hover:bg-zinc-600 transition"
          >
            進入紀錄
          </Link>

          <Link
            href={`/games/${game.id}/box`}
            className="rounded-xl bg-zinc-700 px-4 py-3 text-center font-semibold text-white hover:bg-zinc-600 transition"
          >
            完整數據
          </Link>

          
        </div>
      </div>
    );
  }
}