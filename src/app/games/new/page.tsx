"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

type PlayerPosition = "PG" | "SG" | "SF" | "PF" | "C";

type Player = {
  id: string;
  name: string;
  number: number | null;
  active?: boolean;
  position?: string | null;
};

const POSITION_ORDER: PlayerPosition[] = ["PG", "SG", "SF", "PF", "C"];

const POSITION_LABEL: Record<PlayerPosition, string> = {
  PG: "PG 控球後衛",
  SG: "SG 得分後衛",
  SF: "SF 小前鋒",
  PF: "PF 大前鋒",
  C: "C 中鋒",
};

function normalizePosition(position?: string | null): PlayerPosition | "OTHER" {
  const value = String(position || "")
    .trim()
    .toUpperCase();

  if (value === "PG") return "PG";
  if (value === "SG") return "SG";
  if (value === "SF") return "SF";
  if (value === "PF") return "PF";
  if (value === "C") return "C";

  return "OTHER";
}

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
      .select("id, name, number, active, position")
      .eq("active", true)
      .order("number", { ascending: true });

    if (error) {
      setError(`讀取球員失敗：${error.message}`);
      return;
    }

    const list = ((data as Player[]) || []).sort((a, b) => {
      const posA = normalizePosition(a.position);
      const posB = normalizePosition(b.position);

      const indexA =
        posA === "OTHER" ? 999 : POSITION_ORDER.indexOf(posA as PlayerPosition);
      const indexB =
        posB === "OTHER" ? 999 : POSITION_ORDER.indexOf(posB as PlayerPosition);

      if (indexA !== indexB) return indexA - indexB;

      const numA = a.number ?? 999;
      const numB = b.number ?? 999;
      if (numA !== numB) return numA - numB;

      return a.name.localeCompare(b.name, "zh-Hant");
    });

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

        setSelectedStarterIds((starterPrev) =>
          starterPrev.filter((id) => id !== playerId)
        );

        return nextRoster;
      }

      return [...prev, playerId];
    });
  }

  function toggleStarter(playerId: string) {
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

  const starterPlayers = useMemo(
    () => players.filter((p) => selectedStarterIds.includes(p.id)),
    [players, selectedStarterIds]
  );

  const groupedPlayers = useMemo(() => {
    const groups: Record<PlayerPosition | "OTHER", Player[]> = {
      PG: [],
      SG: [],
      SF: [],
      PF: [],
      C: [],
      OTHER: [],
    };

    for (const player of players) {
      groups[normalizePosition(player.position)].push(player);
    }

    return groups;
  }, [players]);

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

      const { error: closeError } = await supabase
        .from("games")
        .update({ status: "finished" })
        .eq("status", "live");

      if (closeError) {
        setError("關閉舊比賽失敗：" + closeError.message);
        setLoading(false);
        return;
      }

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

      const gamePlayersPayload = selectedRosterIds.map((playerId) => {
  const player = players.find((p) => p.id === playerId);

  return {
    game_id: game.id,
    player_id: playerId,
    team_side: "A",
    is_starter: selectedStarterIds.includes(playerId),
    position: player?.position ?? null,
  };
});

      const { error: gamePlayersError } = await supabase
        .from("game_players")
        .insert(gamePlayersPayload);

      if (gamePlayersError) {
        setError("寫入登入名單失敗：" + gamePlayersError.message);
        setLoading(false);
        return;
      }

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

      const starterShiftsPayload = selectedStarterIds.map((playerId) => ({
  game_id: game.id,
  player_id: playerId,
  team_side: "A",
  quarter: 1,
  in_seconds_left: 600,
  out_seconds_left: null,
}));

const { error: starterShiftsError } = await supabase
  .from("player_shifts")
  .insert(starterShiftsPayload);

if (starterShiftsError) {
  setError("寫入先發上場時間失敗：" + starterShiftsError.message);
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
      <div className="max-w-6xl mx-auto space-y-6">
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

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-lg font-bold">依位置選擇登入名單與先發五人</div>
              <div className="text-sm text-white/60 mt-1">
                先勾選登入名單，再從登入名單中選 5 位先發
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <div className="rounded-xl bg-black/20 px-3 py-2 border border-white/10">
                登入名單 {selectedRosterIds.length} 人
              </div>
              <div className="rounded-xl bg-black/20 px-3 py-2 border border-white/10">
                先發 {selectedStarterIds.length}/5
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-white/50 mb-2">目前先發</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {starterPlayers.length === 0 ? (
                  <div className="text-sm text-white/40">尚未選擇先發</div>
                ) : (
                  starterPlayers.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2"
                    >
                      <div className="font-semibold">
                        #{p.number ?? "-"} {p.name}
                      </div>
                      <div className="text-xs text-emerald-200/80 mt-1">
                        {p.position || "未設定位置"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-white/50 mb-2">目前登入名單</div>
              <div className="flex flex-wrap gap-2">
                {rosterPlayers.length === 0 ? (
                  <div className="text-sm text-white/40">尚未選擇登入名單</div>
                ) : (
                  rosterPlayers.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm"
                    >
                      #{p.number ?? "-"} {p.name}
                      <span className="ml-2 text-white/45">
                        {p.position || "未設定"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {POSITION_ORDER.map((position) => {
            const positionPlayers = groupedPlayers[position];

            return (
              <div
                key={position}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-base font-bold">
                      {POSITION_LABEL[position]}
                    </div>
                    <div className="text-xs text-white/45 mt-1">
                      {positionPlayers.length} 人
                    </div>
                  </div>

                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                    {position}
                  </div>
                </div>

                {positionPlayers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/35">
                    此位置目前沒有球員
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {positionPlayers.map((p) => {
                      const inRoster = selectedRosterIds.includes(p.id);
                      const isStarter = selectedStarterIds.includes(p.id);

                      return (
                        <div
                          key={p.id}
                          className={`rounded-2xl border p-4 transition ${
                            inRoster
                              ? "border-white/20 bg-white/10"
                              : "border-white/10 bg-neutral-900/80"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-bold text-base">
                                #{p.number ?? "-"} {p.name}
                              </div>
                              <div className="text-xs text-white/50 mt-1">
                                {p.position || "未設定位置"}
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
                )}
              </div>
            );
          })}

          {groupedPlayers.OTHER.length > 0 && (
            <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-base font-bold text-yellow-200">
                    未設定位置
                  </div>
                  <div className="text-xs text-yellow-200/70 mt-1">
                    建議回 players table 補上 position
                  </div>
                </div>

                <div className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-200/80">
                  OTHER
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {groupedPlayers.OTHER.map((p) => {
                  const inRoster = selectedRosterIds.includes(p.id);
                  const isStarter = selectedStarterIds.includes(p.id);

                  return (
                    <div
                      key={p.id}
                      className={`rounded-2xl border p-4 transition ${
                        inRoster
                          ? "border-white/20 bg-white/10"
                          : "border-white/10 bg-neutral-900/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-base">
                            #{p.number ?? "-"} {p.name}
                          </div>
                          <div className="text-xs text-white/50 mt-1">
                            未設定位置
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
          )}
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