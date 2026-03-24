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

type GameRow = {
  id: string;
  game_date?: string | null;
  start_time?: string | null;
  created_at?: string | null;
};

type GamePlayerRow = {
  player_id: string;
  is_starter?: boolean | null;
  team_side?: string | null;
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

function getTodayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCurrentTimeInputValue() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function buildStartTimeISO(gameDate: string, gameTime: string) {
  const safeDate = gameDate.trim();
  const safeTime = gameTime.trim();

  if (!safeDate || !safeTime) return null;

  return `${safeDate}T${safeTime}:00+08:00`;
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

export default function NewGamePage() {
  const router = useRouter();
  const [quarters, setQuarters] = useState(4);
  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState(getTodayDateInputValue());
  const [gameTime, setGameTime] = useState(getCurrentTimeInputValue());
  const [location, setLocation] = useState("");

  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedRosterIds, setSelectedRosterIds] = useState<string[]>([]);
  const [selectedStarterIds, setSelectedStarterIds] = useState<string[]>([]);

  const [lastGameRosterIds, setLastGameRosterIds] = useState<string[]>([]);
  const [lastGameStarterIds, setLastGameStarterIds] = useState<string[]>([]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  function sortPlayers(list: Player[]) {
    return [...list].sort((a, b) => {
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
  }

  function getFallbackSelections(activePlayers: Player[]) {
    const sorted = sortPlayers(activePlayers);
    return {
      rosterIds: sorted.map((p) => p.id),
      starterIds: sorted.slice(0, 5).map((p) => p.id),
    };
  }

  async function loadPlayersAndDefaults() {
    setPageLoading(true);
    setError("");

    try {
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select("id, name, number, active, position")
        .eq("active", true)
        .order("number", { ascending: true });

      if (playersError) {
        setError(`讀取球員失敗：${playersError.message}`);
        setPageLoading(false);
        return;
      }

      const list = sortPlayers((playersData as Player[]) || []);
      setPlayers(list);

      const activePlayerIdSet = new Set(list.map((p) => p.id));
      const fallback = getFallbackSelections(list);

      const { data: latestGame, error: latestGameError } = await supabase
        .from("games")
        .select("id, game_date, start_time, created_at")
        .order("game_date", { ascending: false })
        .order("start_time", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<GameRow>();

      if (latestGameError || !latestGame?.id) {
        setLastGameRosterIds(fallback.rosterIds);
        setLastGameStarterIds(fallback.starterIds);
        setSelectedRosterIds(fallback.rosterIds);
        setSelectedStarterIds(fallback.starterIds);
        setPageLoading(false);
        return;
      }

      const { data: previousGamePlayers, error: previousGamePlayersError } =
        await supabase
          .from("game_players")
          .select("player_id, is_starter, team_side")
          .eq("game_id", latestGame.id)
          .eq("team_side", "teamA");

      if (previousGamePlayersError) {
        setLastGameRosterIds(fallback.rosterIds);
        setLastGameStarterIds(fallback.starterIds);
        setSelectedRosterIds(fallback.rosterIds);
        setSelectedStarterIds(fallback.starterIds);
        setPageLoading(false);
        return;
      }

      const previousRows = (previousGamePlayers as GamePlayerRow[]) || [];

      if (previousRows.length === 0) {
        setLastGameRosterIds(fallback.rosterIds);
        setLastGameStarterIds(fallback.starterIds);
        setSelectedRosterIds(fallback.rosterIds);
        setSelectedStarterIds(fallback.starterIds);
        setPageLoading(false);
        return;
      }

      const previousRosterIdSet = new Set(
        previousRows
          .map((row) => row.player_id)
          .filter((id): id is string => !!id && activePlayerIdSet.has(id))
      );

      const previousStarterIdSet = new Set(
        previousRows
          .filter((row) => row.is_starter)
          .map((row) => row.player_id)
          .filter((id): id is string => !!id && activePlayerIdSet.has(id))
      );

      const previousRosterIds = list
        .filter((p) => previousRosterIdSet.has(p.id))
        .map((p) => p.id);

      let previousStarterIds = list
        .filter((p) => previousStarterIdSet.has(p.id))
        .map((p) => p.id)
        .filter((id) => previousRosterIds.includes(id));

      if (previousStarterIds.length > 5) {
        previousStarterIds = previousStarterIds.slice(0, 5);
      }

      if (previousStarterIds.length < 5) {
        const fillCandidates = previousRosterIds.filter(
          (id) => !previousStarterIds.includes(id)
        );
        previousStarterIds = [
          ...previousStarterIds,
          ...fillCandidates.slice(0, 5 - previousStarterIds.length),
        ];
      }

      const finalRosterIds =
        previousRosterIds.length >= 5 ? previousRosterIds : fallback.rosterIds;

      const finalStarterIds =
        previousStarterIds.length === 5
          ? previousStarterIds
          : finalRosterIds.slice(0, 5);

      const safeRosterIds = uniqueIds(finalRosterIds);
      const safeStarterIds = uniqueIds(finalStarterIds);

      setLastGameRosterIds(safeRosterIds);
      setLastGameStarterIds(safeStarterIds);
      setSelectedRosterIds(safeRosterIds);
      setSelectedStarterIds(safeStarterIds);
    } catch (err: any) {
      setError(err?.message || "讀取預設名單時發生未知錯誤");

      const fallback = getFallbackSelections(players);
      setLastGameRosterIds(fallback.rosterIds);
      setLastGameStarterIds(fallback.starterIds);
      setSelectedRosterIds(fallback.rosterIds);
      setSelectedStarterIds(fallback.starterIds);
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    loadPlayersAndDefaults();
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

  function clearSelections() {
    setSelectedRosterIds([]);
    setSelectedStarterIds([]);
  }

  function applyLastGameSelection() {
    setSelectedRosterIds(uniqueIds(lastGameRosterIds));
    setSelectedStarterIds(uniqueIds(lastGameStarterIds));
  }

  function selectAllRoster() {
    const allIds = players.map((p) => p.id);
    setSelectedRosterIds(allIds);

    setSelectedStarterIds((prev) => {
      const validPrev = prev.filter((id) => allIds.includes(id)).slice(0, 5);

      if (validPrev.length === 5) return validPrev;

      const fillIds = allIds.filter((id) => !validPrev.includes(id));
      return [...validPrev, ...fillIds.slice(0, 5 - validPrev.length)];
    });
  }

  function autoPickStarters() {
    const rosterPlayers = players.filter((p) => selectedRosterIds.includes(p.id));

    if (rosterPlayers.length === 0) {
      setSelectedStarterIds([]);
      return;
    }

    const picked: string[] = [];

    for (const position of POSITION_ORDER) {
      const player = rosterPlayers.find(
        (p) =>
          normalizePosition(p.position) === position && !picked.includes(p.id)
      );

      if (player) {
        picked.push(player.id);
      }
    }

    if (picked.length < 5) {
      for (const player of rosterPlayers) {
        if (!picked.includes(player.id)) {
          picked.push(player.id);
        }
        if (picked.length === 5) break;
      }
    }

    setSelectedStarterIds(picked.slice(0, 5));
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

  const readyToStart =
    !!gameDate &&
    !!gameTime &&
    selectedRosterIds.length >= 5 &&
    selectedStarterIds.length === 5 &&
    selectedStarterIds.every((id) => selectedRosterIds.includes(id));

  async function createGame() {
  setLoading(true);
  setError("");

  try {
    if (!gameDate) {
      setError("請選擇比賽日期");
      setLoading(false);
      return;
    }

    if (!gameTime) {
      setError("請選擇比賽時間");
      setLoading(false);
      return;
    }

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

    const startTimeISO = buildStartTimeISO(gameDate, gameTime);

    if (!startTimeISO) {
      setError("比賽時間格式錯誤");
      setLoading(false);
      return;
    }

    const { error: closeError } = await supabase
      .from("games")
      .update({ status: "finished", is_live: false })
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
  game_date: gameDate,
  start_time: startTimeISO,
  location: location.trim() || null,

  status: "live",
  is_live: true,

  home_score: 0,
  away_score: 0,
  current_quarter: 1,

  // 🔥 核心新增
  quarters: quarters,
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
        team_side: "teamA",
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
      team_side: "teamA",
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
      team_side: "teamA",
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

    const initPlayerStatsPayload = selectedRosterIds.map((playerId) => ({
      game_id: game.id,
      player_id: playerId,
      team_side: "teamA",
      gp: selectedStarterIds.includes(playerId) ? 1 : 0,
      pts: 0,
      fg2m: 0,
      fg2a: 0,
      fg3m: 0,
      fg3a: 0,
      ftm: 0,
      fta: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      pf: 0,
      plus_minus: 0,
      minutes_played: 0,
      pts_per_10_min: 0,
      reb_per_10_min: 0,
      ast_per_10_min: 0,
      stl_per_10_min: 0,
      blk_per_10_min: 0,
      tov_per_10_min: 0,
      scoring_share: 0,
      reb_share: 0,
      ast_share: 0,
    }));

    const { error: initPlayerStatsError } = await supabase
      .from("player_game_stats")
      .upsert(initPlayerStatsPayload, { onConflict: "game_id,player_id" });

    if (initPlayerStatsError) {
      setError("建立球員統計初始資料失敗：" + initPlayerStatsError.message);
      setLoading(false);
      return;
    }

    const initTeamStatsPayload = {
      game_id: game.id,
      team_side: "teamA",
      pts: 0,
      fg2m: 0,
      fg2a: 0,
      fg3m: 0,
      fg3a: 0,
      ftm: 0,
      fta: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      tov: 0,
      pf: 0,
      opp_pts: 0,
      team_possessions: 0,
      opp_possessions: 0,
      off_rating: 0,
      def_rating: 0,
      net_rating: 0,
      off_reb: 0,
      def_reb: 0,
      total_reb: 0,
      opp_off_reb: 0,
      opp_def_reb: 0,
      opp_total_reb: 0,
      reb_rate: 0,
      opp_reb_rate: 0,
      opp_tov: 0,
      tov_rate: 0,
      opp_tov_rate: 0,
      result: null,
    };

    const { error: initTeamStatsError } = await supabase
      .from("team_game_stats")
      .upsert(initTeamStatsPayload, { onConflict: "game_id,team_side" });

    if (initTeamStatsError) {
      setError("建立團隊統計初始資料失敗：" + initTeamStatsError.message);
      setLoading(false);
      return;
    }

    const { error: initInsightError } = await supabase
      .from("game_insights")
      .upsert(
        {
          game_id: game.id,
          summary: null,
          key_problem_1: null,
          key_problem_2: null,
          key_problem_3: null,
          positive_1: null,
          positive_2: null,
          positive_3: null,
          focus_1: null,
          focus_2: null,
          focus_3: null,
        },
        { onConflict: "game_id" }
      );

    if (initInsightError) {
      setError("建立首頁洞察初始資料失敗：" + initInsightError.message);
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
    <div className="min-h-screen bg-neutral-950 p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">建立新比賽</h1>
            <div className="mt-1 text-sm text-white/55">
              盡量讓你少點幾下，快速進入主紀錄頁
            </div>
          </div>
          <LogoutButton />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <div className="mb-2 text-sm text-white/60">對手名稱</div>
              <input
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="輸入對手"
                className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none"
              />
            </div>

            <div>
              <div className="mb-2 text-sm text-white/60">比賽日期</div>
              <input
                type="date"
                value={gameDate}
                onChange={(e) => setGameDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none"
              />
            </div>

            <div>
              <div className="mb-2 text-sm text-white/60">比賽時間</div>
              <input
                type="time"
                value={gameTime}
                onChange={(e) => setGameTime(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm text-white/60">比賽地點</div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="例如：學校體育館"
              className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
  <div style={{ fontWeight: 800, marginBottom: 6 }}>比賽類型</div>

  <div style={{ display: "flex", gap: 10 }}>
    <button
      onClick={() => setQuarters(4)}
      style={{
        padding: "8px 14px",
        borderRadius: 12,
        background: quarters === 4 ? "#f97316" : "#eee",
        color: quarters === 4 ? "#fff" : "#333",
        fontWeight: 800,
      }}
    >
      正式賽（4節）
    </button>

    <button
      onClick={() => setQuarters(1)}
      style={{
        padding: "8px 14px",
        borderRadius: 12,
        background: quarters !== 4 ? "#f97316" : "#eee",
        color: quarters !== 4 ? "#fff" : "#333",
        fontWeight: 800,
      }}
    >
      非正式（不計入數據）
    </button>
  </div>
</div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-emerald-300">
                  快速確認
                </div>
                <div className="mt-1 text-sm text-white/70">
                  {readyToStart
                    ? "已可直接建立比賽並進入主紀錄頁"
                    : "尚未完成開賽前設定"}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-sm">
                <div
                  className={`rounded-full px-3 py-1.5 ${
                    selectedRosterIds.length >= 5
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-white/10 text-white/60"
                  }`}
                >
                  登入 {selectedRosterIds.length} 人
                </div>
                <div
                  className={`rounded-full px-3 py-1.5 ${
                    selectedStarterIds.length === 5
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-white/10 text-white/60"
                  }`}
                >
                  先發 {selectedStarterIds.length}/5
                </div>
                <div
                  className={`rounded-full px-3 py-1.5 ${
                    opponent.trim()
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-white/10 text-white/60"
                  }`}
                >
                  對手 {opponent.trim() ? "已填寫" : "未填"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-lg font-bold">依位置選擇登入名單與先發五人</div>
              <div className="mt-1 text-sm text-white/60">
                先勾選登入名單，再從登入名單中選 5 位先發
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                登入名單 {selectedRosterIds.length} 人
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                先發 {selectedStarterIds.length}/5
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyLastGameSelection}
              disabled={pageLoading}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              套用上一場
            </button>

            <button
              type="button"
              onClick={selectAllRoster}
              disabled={pageLoading || players.length === 0}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              全部登入
            </button>

            <button
              type="button"
              onClick={autoPickStarters}
              disabled={pageLoading || selectedRosterIds.length === 0}
              className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              自動先發
            </button>

            <button
              type="button"
              onClick={clearSelections}
              disabled={pageLoading}
              className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              清空重選
            </button>
          </div>

          {pageLoading && (
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
              正在載入上一場預設名單...
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 text-sm text-white/50">目前先發</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                      <div className="mt-1 text-xs text-emerald-200/80">
                        {p.position || "未設定位置"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 text-sm text-white/50">目前登入名單</div>
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
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-base font-bold">
                      {POSITION_LABEL[position]}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                              <div className="text-base font-bold">
                                #{p.number ?? "-"} {p.name}
                              </div>
                              <div className="mt-1 text-xs text-white/50">
                                {p.position || "未設定位置"}
                              </div>
                              <div className="mt-1 text-xs text-white/50">
                                {inRoster
                                  ? isStarter
                                    ? "已登入｜先發"
                                    : "已登入｜未先發"
                                  : "未登入"}
                              </div>
                            </div>

                            {isStarter && (
                              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300">
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
                                  ? "border border-blue-400/30 bg-blue-500/20 text-blue-200"
                                  : "border border-white/10 bg-white/5 text-white"
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
                                  ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/40"
                                  : isStarter
                                  ? "border border-emerald-400/30 bg-emerald-500/20 text-emerald-200"
                                  : "border border-white/10 bg-white/5 text-white"
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
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-base font-bold text-yellow-200">
                    未設定位置
                  </div>
                  <div className="mt-1 text-xs text-yellow-200/70">
                    建議回 players table 補上 position
                  </div>
                </div>

                <div className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-200/80">
                  OTHER
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                          <div className="text-base font-bold">
                            #{p.number ?? "-"} {p.name}
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            未設定位置
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            {inRoster
                              ? isStarter
                                ? "已登入｜先發"
                                : "已登入｜未先發"
                              : "未登入"}
                          </div>
                        </div>

                        {isStarter && (
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300">
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
                              ? "border border-blue-400/30 bg-blue-500/20 text-blue-200"
                              : "border border-white/10 bg-white/5 text-white"
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
                              ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/40"
                              : isStarter
                              ? "border border-emerald-400/30 bg-emerald-500/20 text-emerald-200"
                              : "border border-white/10 bg-white/5 text-white"
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
          disabled={loading || pageLoading || !readyToStart}
          className="w-full rounded-2xl bg-green-600 px-6 py-4 text-lg font-bold disabled:opacity-60"
        >
          {loading ? "建立中..." : "建立比賽並進入主紀錄頁"}
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