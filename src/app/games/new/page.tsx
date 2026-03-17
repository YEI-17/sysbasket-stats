"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

type Player = {
  id: string;
  name: string;
  number: number | null;
  active?: boolean;
};

export default function NewGamePage() {
  const router = useRouter();

  const [opponent, setOpponent] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedRosterIds, setSelectedRosterIds] = useState<string[]>([]);
  const [selectedStarterIds, setSelectedStarterIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, number, active")
      .eq("active", true)
      .order("number", { ascending: true });

    if (error) {
      setError(`讀取球員失敗：${error.message}`);
      return;
    }

    const list = (data as Player[]) || [];
    setPlayers(list);

    const defaultRosterIds = list.map((p) => p.id);
    const defaultStarterIds = list.slice(0, 5).map((p) => p.id);

    setSelectedRosterIds(defaultRosterIds);
    setSelectedStarterIds(defaultStarterIds);
  }

  useEffect(() => {
    loadPlayers();
  }, []);

  function toggleRoster(playerId: string) {
    setSelectedRosterIds((prev) => {
      const exists = prev.includes(playerId);

      if (exists) {
        const nextRoster = prev.filter((id) => id !== playerId);

        // 若從登入名單移除，也同步從先發移除
        setSelectedStarterIds((starterPrev) =>
          starterPrev.filter((id) => id !== playerId)
        );

        return nextRoster;
      }

      return [...prev, playerId];
    });
  }

  function toggleStarter(playerId: string) {
    // 只能從登入名單中選先發
    if (!selectedRosterIds.includes(playerId)) return;

    setSelectedStarterIds((prev) => {
      const exists = prev.includes(playerId);

      if (exists) {
        return prev.filter((id) => id !== playerId);
      }

      if (prev.length >= 5) {
        return prev;
      }

      return [...prev, playerId];
    });
  }

  const rosterPlayers = useMemo(
    () => players.filter((p) => selectedRosterIds.includes(p.id)),
    [players, selectedRosterIds]
  );

  async function createGame() {
    setLoading(true);
    setError("");

    try {
      if (selectedRosterIds.length < 5) {
        setError("登入名單至少要 5 人");
        setLoading(false);
        return;
      }

      if (selectedStarterIds.length !== 5) {
        setError("請選滿先發五人");
        setLoading(false);
        return;
      }

      const allStartersInRoster = selectedStarterIds.every((id) =>
        selectedRosterIds.includes(id)
      );

      if (!allStartersInRoster) {
        setError("先發五人必須都在登入名單內");
        setLoading(false);
        return;
      }

      // 關閉舊的 live 比賽
      const { error: closeError } = await supabase
        .from("games")
        .update({ status: "finished" })
        .eq("status", "live");

      if (closeError) {
        setError("關閉舊比賽失敗：" + closeError.message);
        setLoading(false);
        return;
      }

      // 建立新比賽
      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          teamA: "我們",
          teamB: opponent.trim() || "對手",
          status: "live",
          home_score: 0,
          away_score: 0,
        })
        .select()
        .single();

      if (gameError || !game) {
        setError("建立比賽失敗：" + (gameError?.message || "無法取得比賽資料"));
        setLoading(false);
        return;
      }

      // 建立比賽時間
      const { error: clockError } = await supabase.from("game_clock").insert({
        game_id: game.id,
        quarter: 1,
        seconds_left: 600,
        is_running: false,
      });

      if (clockError) {
        setError("建立時間失敗：" + clockError.message);
        setLoading(false);
        return;
      }

      /**
       * 1. 寫入登入名單到 game_players
       * 這樣之後該場比賽有哪些可用球員，可以直接從資料庫讀
       *
       * 假設 game_players 至少有：
       * - game_id
       * - player_id
       * - is_starter
       *
       * 若你的 game_players 還有其他必要欄位，再補上去。
       */
      const gamePlayersPayload = selectedRosterIds.map((playerId) => ({
        game_id: game.id,
        player_id: playerId,
        is_starter: selectedStarterIds.includes(playerId),
      }));

      const { error: gamePlayersError } = await supabase
        .from("game_players")
        .insert(gamePlayersPayload);

      if (gamePlayersError) {
        setError("寫入登入名單失敗：" + gamePlayersError.message);
        setLoading(false);
        return;
      }

      /**
       * 2. 把先發五人寫進 events 為 sub_in
       * 這樣後面如果你的上場時間 / 場上五人 / player_shifts / stats
       * 都是根據 events 算，就能直接對應資料庫
       */
      const starterEventsPayload = selectedStarterIds.map((playerId) => ({
        game_id: game.id,
        player_id: playerId,
        quarter: 1,
        event_type: "sub_in",
        team_side: "A",
        clock_seconds_left: 600,
        points_delta: 0,
        note: "starter",
        is_undone: false,
      }));

      const { error: starterEventsError } = await supabase
        .from("events")
        .insert(starterEventsPayload);

      if (starterEventsError) {
        setError("寫入先發事件失敗：" + starterEventsError.message);
        setLoading(false);
        return;
      }

      router.push(`/games/${game.id}/live`);
    } catch (err: any) {
      setError(err?.message || "發生未知錯誤");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">建立新比賽</h1>
          <LogoutButton />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div>
            <div className="text-sm text-white/60 mb-2">對手名稱</div>
            <input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="輸入對手"
              className="w-full rounded-xl bg-neutral-900 border border-white/10 px-4 py-3 outline-none"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-2 mb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-bold">選擇登入名單與先發五人</div>
              <div className="text-sm text-white/60 mt-1">
                先勾選登入名單，再從登入名單中選 5 位先發
              </div>
            </div>

            <div className="flex gap-3 text-sm">
              <div className="rounded-xl bg-black/20 px-3 py-2 border border-white/10">
                登入名單 {selectedRosterIds.length} 人
              </div>
              <div className="rounded-xl bg-black/20 px-3 py-2 border border-white/10">
                先發 {selectedStarterIds.length}/5
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {players.map((p) => {
              const inRoster = selectedRosterIds.includes(p.id);
              const isStarter = selectedStarterIds.includes(p.id);

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-4 transition ${
                    inRoster
                      ? "border-white/20 bg-white/10"
                      : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-base">
                        #{p.number ?? "-"} {p.name}
                      </div>
                      <div className="text-xs text-white/50 mt-1">
                        {inRoster
                          ? isStarter
                            ? "已登入｜先發"
                            : "已登入｜未先發"
                          : "未登入"}
                      </div>
                    </div>

                    {isStarter && (
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300 border border-emerald-400/30">
                        先發
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleRoster(p.id)}
                      className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                        inRoster
                          ? "bg-blue-500/20 text-blue-200 border border-blue-400/30"
                          : "bg-white/5 text-white border border-white/10"
                      }`}
                    >
                      {inRoster ? "已登入" : "加入登入名單"}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleStarter(p.id)}
                      disabled={!inRoster}
                      className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                        !inRoster
                          ? "bg-white/5 text-white/40 border border-white/10 cursor-not-allowed"
                          : isStarter
                          ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
                          : "bg-white/5 text-white border border-white/10"
                      }`}
                    >
                      {isStarter ? "取消先發" : "設為先發"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={createGame}
          disabled={loading}
          className="w-full rounded-2xl bg-green-600 px-6 py-4 text-lg font-bold disabled:opacity-60"
        >
          {loading ? "建立中..." : "建立比賽"}
        </button>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}