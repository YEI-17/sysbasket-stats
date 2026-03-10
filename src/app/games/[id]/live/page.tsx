"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

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

export default function LiveGamePage() {
  const params = useParams();
  const gameId = String(params.id);

  const [game, setGame] = useState<GameRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [quarter, setQuarter] = useState(1);

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
      await Promise.all([fetchGame(), fetchEvents()]);
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
      .channel(`live-game-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        async () => {
          try {
            await fetchGame();
          } catch {}
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          try {
            await fetchEvents();
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const activeEvents = useMemo(() => {
    return events.filter((e) => !e.is_undone);
  }, [events]);

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

  async function startGame() {
    try {
      setSaving(true);
      setMsg("");

      const { error } = await supabase
        .from("games")
        .update({ status: "live" })
        .eq("id", gameId);

      if (error) throw error;

      await fetchGame();
    } catch (err: any) {
      setMsg(err.message || "開始比賽失敗");
    } finally {
      setSaving(false);
    }
  }

  async function finishGame() {
    try {
      setSaving(true);
      setMsg("");

      const { error } = await supabase
        .from("games")
        .update({ status: "finished" })
        .eq("id", gameId);

      if (error) throw error;

      await fetchGame();
    } catch (err: any) {
      setMsg(err.message || "結束比賽失敗");
    } finally {
      setSaving(false);
    }
  }

  async function addEvent(eventType: string) {
    try {
      setSaving(true);
      setMsg("");

      const { error } = await supabase.from("events").insert({
        game_id: gameId,
        player_id: null,
        quarter,
        event_type: eventType,
      });

      if (error) throw error;

      await fetchEvents();
    } catch (err: any) {
      setMsg(err.message || "新增事件失敗");
    } finally {
      setSaving(false);
    }
  }

  async function undoLastEvent() {
    try {
      setSaving(true);
      setMsg("");

      const lastEvent = [...activeEvents].reverse()[0];
      if (!lastEvent) {
        setMsg("目前沒有可復原的事件");
        return;
      }

      const { error } = await supabase
        .from("events")
        .update({
          is_undone: true,
          undone_at: new Date().toISOString(),
        })
        .eq("id", lastEvent.id);

      if (error) throw error;

      await fetchEvents();
    } catch (err: any) {
      setMsg(err.message || "Undo 失敗");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white px-4 py-6">
        <div className="mx-auto max-w-4xl">載入中...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">比賽記錄</h1>
          <Link
            href={`/games/${gameId}/view`}
            className="rounded bg-white px-4 py-2 text-black font-semibold"
          >
            觀眾畫面
          </Link>
        </div>

        {msg && (
          <div className="rounded border border-red-500/40 bg-red-500/20 px-3 py-2 text-sm">
            {msg}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-center text-3xl font-bold">
            {game?.teamA ?? "隊伍A"} {score.a} : {score.b} {game?.teamB ?? "隊伍B"}
          </div>

          <div className="mt-3 text-center text-white/70">
            狀態：{game?.status ?? "-"} ｜ 日期：{game?.game_date ?? "-"} ｜ 地點：
            {game?.location || "-"}
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={startGame}
              disabled={saving || game?.status === "live"}
              className="rounded bg-green-600 px-4 py-2 font-semibold disabled:opacity-50"
            >
              開始比賽
            </button>

            <button
              onClick={finishGame}
              disabled={saving || game?.status === "finished"}
              className="rounded bg-red-600 px-4 py-2 font-semibold disabled:opacity-50"
            >
              結束比賽
            </button>

            <button
              onClick={undoLastEvent}
              disabled={saving}
              className="rounded bg-yellow-500 px-4 py-2 font-semibold text-black disabled:opacity-50"
            >
              Undo 最後一筆
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center gap-3">
            <label className="font-semibold">目前節次</label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              className="rounded border border-white/20 bg-black px-3 py-2"
            >
              <option value={1}>第 1 節</option>
              <option value={2}>第 2 節</option>
              <option value={3}>第 3 節</option>
              <option value={4}>第 4 節</option>
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <h2 className="mb-3 text-lg font-bold">{game?.teamA ?? "隊伍A"}</h2>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => addEvent("teamA_1pt")}
                  disabled={saving}
                  className="rounded bg-white px-3 py-3 text-black font-semibold disabled:opacity-50"
                >
                  +1
                </button>
                <button
                  onClick={() => addEvent("teamA_2pt")}
                  disabled={saving}
                  className="rounded bg-white px-3 py-3 text-black font-semibold disabled:opacity-50"
                >
                  +2
                </button>
                <button
                  onClick={() => addEvent("teamA_3pt")}
                  disabled={saving}
                  className="rounded bg-white px-3 py-3 text-black font-semibold disabled:opacity-50"
                >
                  +3
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <h2 className="mb-3 text-lg font-bold">{game?.teamB ?? "隊伍B"}</h2>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => addEvent("teamB_1pt")}
                  disabled={saving}
                  className="rounded bg-white px-3 py-3 text-black font-semibold disabled:opacity-50"
                >
                  +1
                </button>
                <button
                  onClick={() => addEvent("teamB_2pt")}
                  disabled={saving}
                  className="rounded bg-white px-3 py-3 text-black font-semibold disabled:opacity-50"
                >
                  +2
                </button>
                <button
                  onClick={() => addEvent("teamB_3pt")}
                  disabled={saving}
                  className="rounded bg-white px-3 py-3 text-black font-semibold disabled:opacity-50"
                >
                  +3
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-lg font-bold">事件紀錄</h2>

          {activeEvents.length === 0 ? (
            <p className="text-white/60">目前還沒有事件</p>
          ) : (
            <div className="space-y-2">
              {[...activeEvents].reverse().map((e) => (
                <div
                  key={e.id}
                  className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm"
                >
                  Q{e.quarter} ｜ {e.event_type} ｜{" "}
                  {new Date(e.created_at).toLocaleTimeString()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}