"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  is_undone?: boolean;
  undone_at?: string | null;
};

export default function GameViewerPage() {
  const params = useParams();
  const gameId = String(params.id);

  const [game, setGame] = useState<GameRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  async function fetchGame() {
    const { data, error } = await supabase
      .from("games")
      .select('id, game_date, start_time, location, status, "teamA", "teamB"')
      .eq("id", gameId)
      .single();

    if (error) throw error;
    setGame(data);
  }

  async function fetchEvents() {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    setEvents(data ?? []);
  }

  async function loadAll() {
    try {
      setLoading(true);
      setMsg("");
      await fetchGame();

      try {
        await fetchEvents();
      } catch (err: any) {
        setMsg(`比賽主資料已載入，但事件資料讀取失敗：${err.message}`);
      }
    } catch (err: any) {
      setMsg(err.message || "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!gameId) return;
    loadAll();

    const channel = supabase
      .channel(`viewer-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => {
          fetchGame().catch(() => {});
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `game_id=eq.${gameId}` },
        () => {
          fetchEvents().catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const activeEvents = useMemo(
    () => events.filter((e) => !e.is_undone),
    [events]
  );

  const score = useMemo(() => {
    let a = 0;
    let b = 0;

    for (const e of activeEvents) {
      if (e.event_type === "teamA_1pt") a += 1;
      if (e.event_type === "teamA_2pt") a += 2;
      if (e.event_type === "teamA_3pt") a += 3;
      if (e.event_type === "teamB_1pt") b += 1;
      if (e.event_type === "teamB_2pt") b += 2;
      if (e.event_type === "teamB_3pt") b += 3;
    }

    return { a, b };
  }, [activeEvents]);

  return (
    <main className="min-h-screen bg-black text-white px-4 py-6">
      <div className="mx-auto max-w-3xl">
        {loading && <p>載入中...</p>}

        {!loading && msg && (
          <div className="mb-4 rounded border border-red-500/40 bg-red-500/20 px-3 py-2">
            {msg}
          </div>
        )}

        {!loading && game && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 mb-4">
              <div className="text-2xl font-bold text-center">
                {game.teamA ?? "隊伍A"} {score.a} : {score.b} {game.teamB ?? "隊伍B"}
              </div>

              <div className="mt-3 text-center text-white/70">
                {game.status}｜{game.game_date}｜{game.location || "-"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-bold mb-3">事件紀錄</h2>

              {activeEvents.length === 0 ? (
                <p className="text-white/60">目前還沒有事件</p>
              ) : (
                <div className="space-y-2">
                  {activeEvents.slice().reverse().map((e) => (
                    <div
                      key={e.id}
                      className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm"
                    >
                      Q{e.quarter}｜{e.event_type}｜{new Date(e.created_at).toLocaleTimeString()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}