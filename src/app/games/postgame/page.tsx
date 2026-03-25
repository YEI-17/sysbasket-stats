"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getViewerName } from "@/lib/roles";

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  status?: string | null;
  game_date?: string | null;
  created_at?: string | null;
  game_category?: string | null;
  game_format?: string | null;
  target_score?: number | null;
};

type TeamGameStatsRow = {
  game_id: string;
  team_side?: string | null;
  pts?: number | null;
  opp_pts?: number | null;
  off_rating?: number | null;
  def_rating?: number | null;
  net_rating?: number | null;
  reb_rate?: number | null;
  tov_rate?: number | null;
  result?: string | null;
};

type InsightRow = {
  game_id: string;
  summary?: string | null;
  key_problem_1?: string | null;
  key_problem_2?: string | null;
  key_problem_3?: string | null;
  positive_1?: string | null;
  positive_2?: string | null;
  positive_3?: string | null;
  focus_1?: string | null;
  focus_2?: string | null;
  focus_3?: string | null;
};

type EventRow = {
  id: string;
  game_id: string;
  player_id?: string | null;
  quarter?: number | null;
  event_type: string;
  team_side?: string | null;
  is_undone?: boolean | null;
  created_at?: string | null;
  clock_seconds_left?: number | null;
};

type PlayerRow = {
  id: string;
  name: string;
  number?: number | null;
};

type GamePlayerRow = {
  game_id: string;
  player_id: string;
  is_starter?: boolean | null;
  team_side?: string | null;
};

type PlayerShiftRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: string;
  quarter: number;
  in_seconds_left: number;
  out_seconds_left?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ComputedTeamMetrics = {
  points: number;
  possessions: number;
  offRating: number;
  turnoverRate: number;
  emptyRate: number;
  ppp: number;
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  shotMix2: number;
  shotMix3: number;
};


type CollapseWindow = {
  quarter: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  startTime: string | null;
  endTime: string | null;
  ourPoints: number;
  oppPoints: number;
  diff: number;
  ourTurnovers: number;
  ourMisses: number;
  eventCount: number;
  lineupNames: string[];
  summary: string;
  severity: "high" | "medium" | "low";
};

function safeNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeStatus(status?: string | null) {
  const s = (status ?? "").trim().toLowerCase();

  if (!s) return "未設定";
  if (["live", "playing", "in_progress", "ongoing", "running"].includes(s)) {
    return "直播中";
  }
  if (
    ["finished", "final", "ended", "done", "completed", "closed"].includes(s)
  ) {
    return "已結束";
  }
  if (["scheduled", "upcoming", "pending"].includes(s)) {
    return "未開始";
  }

  return status ?? "未設定";
}

function getMatchName(game?: GameRow | null) {
  if (!game) return "尚無比賽";
  return `${game.teamA || "我方"} vs ${game.teamB || "對手"}`;
}

function getShortDate(raw?: string | null) {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getGameTypeLabel(game?: GameRow | null) {
  if (!game) return "";
  if (game.game_format === "target_score" && game.target_score) {
    return `${game.target_score}分制`;
  }
  if (game.game_category === "friendly") return "友誼賽";
  if (game.game_category === "scrimmage") return "對抗賽";
  return "正式賽";
}

function normalizeEventType(type?: string | null) {
  const t = (type ?? "").trim().toLowerCase();

  if (["fg2_make", "fg2_made", "2pt_make", "2pt_made"].includes(t)) {
    return "fg2_make";
  }
  if (["fg2_miss", "fg2_missed", "2pt_miss", "2pt_missed"].includes(t)) {
    return "fg2_miss";
  }
  if (["fg3_make", "fg3_made", "3pt_make", "3pt_made"].includes(t)) {
    return "fg3_make";
  }
  if (["fg3_miss", "fg3_missed", "3pt_miss", "3pt_missed"].includes(t)) {
    return "fg3_miss";
  }
  if (["ft_make", "ft_made", "free_throw_make", "free_throw_made"].includes(t)) {
    return "ft_make";
  }
  if (["ft_miss", "ft_missed", "free_throw_miss", "free_throw_missed"].includes(t)) {
    return "ft_miss";
  }
  if (["tov", "turnover"].includes(t)) {
    return "tov";
  }
  if (["oreb", "orb", "off_reb", "offensive_rebound"].includes(t)) {
    return "oreb";
  }
  if (["dreb", "drb", "def_reb", "defensive_rebound"].includes(t)) {
    return "dreb";
  }
  if (["reb", "rebound"].includes(t)) {
    return "reb";
  }
  if (["sub_in", "subin", "sub-in"].includes(t)) {
    return "sub_in";
  }
  if (["sub_out", "subout", "sub-out"].includes(t)) {
    return "sub_out";
  }

  return t;
}

function isOurTeamEvent(teamSide?: string | null) {
  const side = (teamSide ?? "").trim().toLowerCase();
  if (!side) return true;
  if (["teama", "a", "our", "self", "home"].includes(side)) return true;
  if (["teamb", "b", "opponent", "away"].includes(side)) return false;
  return true;
}

function isOurTeamSide(teamSide?: string | null) {
  const side = (teamSide ?? "").trim().toLowerCase();
  return ["teama", "a", "our", "self", "home"].includes(side);
}

function pointsFromType(eventType: string) {
  const t = normalizeEventType(eventType);
  if (t === "fg2_make") return 2;
  if (t === "fg3_make") return 3;
  if (t === "ft_make") return 1;
  return 0;
}

function quarterDuration(quarter: number) {
  return quarter <= 4 ? 600 : 300;
}

function formatClock(secondsLeft: number) {
  const sec = Math.max(0, Math.floor(secondsLeft));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function calcMetricsFromEvents(events: EventRow[]): ComputedTeamMetrics {
  let fg2m = 0;
  let fg2a = 0;
  let fg3m = 0;
  let fg3a = 0;
  let ftm = 0;
  let fta = 0;
  let tov = 0;
  let oreb = 0;

  const usable = events.filter(
    (e) => !e.is_undone && isOurTeamEvent(e.team_side)
  );

  for (const e of usable) {
    const t = normalizeEventType(e.event_type);

    if (t === "fg2_make") {
      fg2m += 1;
      fg2a += 1;
    } else if (t === "fg2_miss") {
      fg2a += 1;
    } else if (t === "fg3_make") {
      fg3m += 1;
      fg3a += 1;
    } else if (t === "fg3_miss") {
      fg3a += 1;
    } else if (t === "ft_make") {
      ftm += 1;
      fta += 1;
    } else if (t === "ft_miss") {
      fta += 1;
    } else if (t === "tov") {
      tov += 1;
    } else if (t === "oreb") {
      oreb += 1;
    }
  }

  const points = fg2m * 2 + fg3m * 3 + ftm;
  const fga = fg2a + fg3a;
  const possessionsRaw = fga + tov + 0.44 * fta - oreb;
  const possessions = possessionsRaw > 0 ? possessionsRaw : 0;

  const offRating = possessions > 0 ? (points / possessions) * 100 : 0;
  const turnoverRate = possessions > 0 ? (tov / possessions) * 100 : 0;

  const estimatedScoringPossessions =
    fg2m + fg3m + Math.min(ftm * 0.44, fta * 0.44);
  const emptyPossessions = Math.max(0, possessions - estimatedScoringPossessions);
  const emptyRate = possessions > 0 ? (emptyPossessions / possessions) * 100 : 0;
  const ppp = possessions > 0 ? points / possessions : 0;

  const totalFgAttempts = fg2a + fg3a;
  const shotMix2 = totalFgAttempts > 0 ? (fg2a / totalFgAttempts) * 100 : 0;
  const shotMix3 = totalFgAttempts > 0 ? (fg3a / totalFgAttempts) * 100 : 0;

  return {
    points: round1(points),
    possessions: round1(possessions),
    offRating: round1(offRating),
    turnoverRate: round1(turnoverRate),
    emptyRate: round1(emptyRate),
    ppp: round1(ppp),
    fg2m,
    fg2a,
    fg3m,
    fg3a,
    ftm,
    fta,
    shotMix2: round1(shotMix2),
    shotMix3: round1(shotMix3),
  };
}

function getPlayerMap(players: PlayerRow[]) {
  const map = new Map<string, PlayerRow>();
  for (const p of players) map.set(p.id, p);
  return map;
}

function playerLabel(player?: PlayerRow | null) {
  if (!player) return "未知球員";
  return `${player.number ? `#${player.number} ` : ""}${player.name}`;
}

function getStarterIdsForGame(gameId: string, gamePlayers: GamePlayerRow[]) {
  return gamePlayers
    .filter(
      (gp) =>
        gp.game_id === gameId &&
        gp.is_starter === true &&
        ["teama", "a", ""].includes((gp.team_side ?? "teamA").toLowerCase())
    )
    .map((gp) => gp.player_id);
}

function sortEventsForGameFlow(events: EventRow[]) {
  return [...events].sort((a, b) => {
    const qa = typeof a.quarter === "number" ? a.quarter : 1;
    const qb = typeof b.quarter === "number" ? b.quarter : 1;
    if (qa !== qb) return qa - qb;

    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();

    if (ta !== tb) return ta - tb;

    const sa =
      typeof a.clock_seconds_left === "number"
        ? a.clock_seconds_left
        : quarterDuration(qa);
    const sb =
      typeof b.clock_seconds_left === "number"
        ? b.clock_seconds_left
        : quarterDuration(qb);

    return sb - sa;
  });
}

function getLineupNamesFromShiftsForWindow(
  gameId: string,
  quarter: number,
  startSec: number,
  endSec: number,
  playerShifts: PlayerShiftRow[],
  playerMap: Map<string, PlayerRow>
) {
  const relevant = playerShifts.filter((shift) => {
    if (shift.game_id !== gameId) return false;
    if (!isOurTeamSide(shift.team_side)) return false;
    if (shift.quarter !== quarter) return false;

    const shiftStart = shift.in_seconds_left;
    const shiftEnd =
      typeof shift.out_seconds_left === "number" ? shift.out_seconds_left : 0;

    // 有重疊就算
    return Math.min(shiftStart, startSec) > Math.max(shiftEnd, endSec);
  });

  const playerOverlapMap = new Map<string, number>();

  for (const shift of relevant) {
    const shiftStart = shift.in_seconds_left;
    const shiftEnd =
      typeof shift.out_seconds_left === "number" ? shift.out_seconds_left : 0;

    const overlap = Math.max(
      0,
      Math.min(shiftStart, startSec) - Math.max(shiftEnd, endSec)
    );

    if (overlap <= 0) continue;

    playerOverlapMap.set(
      shift.player_id,
      (playerOverlapMap.get(shift.player_id) ?? 0) + overlap
    );
  }

  return Array.from(playerOverlapMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([playerId]) => playerLabel(playerMap.get(playerId)));
}

function toMs(value?: string | null) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function getQuarterStintWindows(
  gameId: string,
  quarter: number,
  playerShifts: PlayerShiftRow[],
  players: PlayerRow[]
) {
  const playerMap = getPlayerMap(players);

  const shifts = playerShifts
    .filter(
      (shift) =>
        shift.game_id === gameId &&
        shift.quarter === quarter &&
        isOurTeamSide(shift.team_side)
    )
    .filter((shift) => toMs(shift.created_at) != null)
    .sort((a, b) => {
      const aTime = toMs(a.created_at) ?? 0;
      const bTime = toMs(b.created_at) ?? 0;
      return aTime - bTime;
    });

  if (!shifts.length) return [];

  const points = new Set<number>();

  for (const shift of shifts) {
    const inMs = toMs(shift.created_at);
    const outMs =
      toMs(shift.updated_at) ??
      toMs(shift.created_at);

    if (inMs != null) points.add(inMs);
    if (outMs != null && outMs >= inMs!) points.add(outMs);
  }

  const timeline = Array.from(points).sort((a, b) => a - b);
  if (timeline.length < 2) return [];

  const windows: Array<{
    quarter: number;
    startMs: number;
    endMs: number;
    startSec: number;
    endSec: number;
    lineupNames: string[];
  }> = [];

  for (let i = 0; i < timeline.length - 1; i += 1) {
    const startMs = timeline[i];
    const endMs = timeline[i + 1];
    if (endMs <= startMs) continue;

    const activeShifts = shifts.filter((shift) => {
      const inMs = toMs(shift.created_at);
      const outMs =
        toMs(shift.updated_at) ??
        toMs(shift.created_at);

      if (inMs == null || outMs == null) return false;
      return inMs < endMs && outMs > startMs;
    });

    const overlapMap = new Map<string, number>();

    for (const shift of activeShifts) {
      const inMs = toMs(shift.created_at)!;
      const outMs =
        toMs(shift.updated_at) ??
        inMs;

      const overlap = Math.max(0, Math.min(outMs, endMs) - Math.max(inMs, startMs));
      if (overlap <= 0) continue;

      overlapMap.set(
        shift.player_id,
        (overlapMap.get(shift.player_id) ?? 0) + overlap
      );
    }

    const lineupNames = Array.from(overlapMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([playerId]) => playerLabel(playerMap.get(playerId)));

    if (!lineupNames.length) continue;

    const refShift = activeShifts[0];
    const startSec =
      typeof refShift?.in_seconds_left === "number"
        ? refShift.in_seconds_left
        : quarterDuration(quarter);

    const endSec =
      typeof refShift?.out_seconds_left === "number"
        ? refShift.out_seconds_left
        : 0;

    windows.push({
      quarter,
      startMs,
      endMs,
      startSec,
      endSec,
      lineupNames,
    });
  }

  return windows;
}

function getEventsInTimeRange(
  events: EventRow[],
  quarter: number,
  startMs: number,
  endMs: number
) {
  return events.filter((e) => {
    if (e.is_undone) return false;
    const q = typeof e.quarter === "number" ? e.quarter : 1;
    if (q !== quarter) return false;

    const eventMs = toMs(e.created_at);
    if (eventMs == null) return false;

    return eventMs >= startMs && eventMs < endMs;
  });
}



function buildCollapseWindows(
  events: EventRow[],
  gameId: string,
  playerShifts: PlayerShiftRow[],
  players: PlayerRow[]
): CollapseWindow[] {
  const cleanEvents = sortEventsForGameFlow(events.filter((e) => !e.is_undone));

  const maxQuarter =
    Math.max(
      1,
      ...cleanEvents.map((e) => (typeof e.quarter === "number" ? e.quarter : 1)),
      ...playerShifts
        .filter((s) => s.game_id === gameId)
        .map((s) => (typeof s.quarter === "number" ? s.quarter : 1))
    ) || 4;

  const rawWindows: CollapseWindow[] = [];

  // 可自行調整：想切更細可加 45、30
  const windowSizes = [120, 90, 75, 60];
  const stepSec = 15;

  for (let quarter = 1; quarter <= maxQuarter; quarter += 1) {
    const qDuration = quarterDuration(quarter);

    for (const windowSize of windowSizes) {
      for (
        let startSec = qDuration;
        startSec - windowSize >= 0;
        startSec -= stepSec
      ) {
        const endSec = startSec - windowSize;

        const winEvents = cleanEvents.filter((e) => {
          if (e.is_undone) return false;
          const q = typeof e.quarter === "number" ? e.quarter : 1;
          if (q !== quarter) return false;

          const sec =
            typeof e.clock_seconds_left === "number"
              ? e.clock_seconds_left
              : null;

          if (sec == null) return false;

          // 例如 08:45 → 07:15，會抓 startSec >= sec > endSec
          return sec <= startSec && sec > endSec;
        });

        if (!winEvents.length) continue;

        let ourPoints = 0;
        let oppPoints = 0;
        let ourTurnovers = 0;
        let ourMisses = 0;

        for (const ev of winEvents) {
          const t = normalizeEventType(ev.event_type);
          const pts = pointsFromType(t);

          if (isOurTeamEvent(ev.team_side)) {
            if (pts > 0) ourPoints += pts;
            if (t === "tov") ourTurnovers += 1;
            if (["fg2_miss", "fg3_miss", "ft_miss"].includes(t)) ourMisses += 1;
          } else {
            if (pts > 0) oppPoints += pts;
          }
        }

        const diff = ourPoints - oppPoints;

        // 崩盤條件：你可以再調
        const isCollapse =
          diff <= -4 &&
          (
            oppPoints >= 6 ||
            ourTurnovers >= 1 ||
            (ourPoints === 0 && oppPoints >= 4)
          );

        if (!isCollapse) continue;

        let severity: "high" | "medium" | "low" = "low";
        if (diff <= -8) severity = "high";
        else if (diff <= -6) severity = "medium";
        else severity = "low";

        const lineupNames = getLineupNamesFromShiftsForWindow(
          gameId,
          quarter,
          startSec,
          endSec,
          playerShifts,
          getPlayerMap(players)
        );

        const reasonBits: string[] = [];
        if (ourTurnovers > 0) reasonBits.push(`失誤 ${ourTurnovers} 次`);
        if (ourMisses > 0) reasonBits.push(`打鐵 ${ourMisses} 次`);
        if (ourPoints === 0 && oppPoints >= 4) reasonBits.push("這段沒有得分");

        const summary =
          reasonBits.length > 0
            ? `${formatClock(startSec)} - ${formatClock(endSec)} 被打出 ${oppPoints} 比 ${ourPoints}，主因包含 ${reasonBits.join("、")}`
            : `${formatClock(startSec)} - ${formatClock(endSec)} 被打出 ${oppPoints} 比 ${ourPoints}`;

        rawWindows.push({
          quarter,
          startSec,
          endSec,
          durationSec: startSec - endSec,
          startTime: null,
          endTime: null,
          ourPoints,
          oppPoints,
          diff,
          ourTurnovers,
          ourMisses,
          eventCount: winEvents.length,
          lineupNames,
          summary,
          severity,
        });
      }
    }
  }

  // 去重：避免很多高度重疊視窗都被留下
  const deduped: CollapseWindow[] = [];

  const sorted = rawWindows.sort((a, b) => {
    if (a.quarter !== b.quarter) return a.quarter - b.quarter;
    if (a.diff !== b.diff) return a.diff - b.diff; // 更負的優先
    if (a.oppPoints !== b.oppPoints) return b.oppPoints - a.oppPoints;
    return a.startSec - b.startSec;
  });

  for (const curr of sorted) {
    const hasHeavyOverlap = deduped.some((prev) => {
      if (prev.quarter !== curr.quarter) return false;

      const overlap =
        Math.max(0, Math.min(prev.startSec, curr.startSec) - Math.max(prev.endSec, curr.endSec));

      const smaller = Math.min(
        prev.startSec - prev.endSec,
        curr.startSec - curr.endSec
      );

      return smaller > 0 && overlap / smaller >= 0.7;
    });

    if (!hasHeavyOverlap) {
      deduped.push(curr);
    }
  }

  return deduped
    .sort((a, b) => {
      if (a.diff !== b.diff) return a.diff - b.diff;
      if (a.oppPoints !== b.oppPoints) return b.oppPoints - a.oppPoints;
      if (a.quarter !== b.quarter) return a.quarter - b.quarter;
      return b.startSec - a.startSec;
    })
    .slice(0, 10); // 這裡改成你想顯示的數量，例如 6 / 8 / 10
}

function starterNamesForGame(
  gameId: string,
  gamePlayers: GamePlayerRow[],
  players: PlayerRow[]
) {
  const playerMap = getPlayerMap(players);
  const starterIds = getStarterIdsForGame(gameId, gamePlayers);
  return starterIds.map((id) => playerLabel(playerMap.get(id)));
}

export default function PostgameOverviewPage() {
  const router = useRouter();

  const [games, setGames] = useState<GameRow[]>([]);
  const [teamGameStats, setTeamGameStats] = useState<TeamGameStatsRow[]>([]);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);
  const [playerShifts, setPlayerShifts] = useState<PlayerShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [selectedGameId, setSelectedGameId] = useState<string>("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setMsg("");

    const [
      gamesRes,
      teamStatsRes,
      insightsRes,
      eventsRes,
      playersRes,
      gamePlayersRes,
      playerShiftsRes,
    ] = await Promise.all([
      supabase
        .from("games")
        .select(
          "id, teamA, teamB, status, game_date, created_at, game_category, game_format, target_score"
        )
        .order("game_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),

      supabase
        .from("team_game_stats")
        .select(
          "game_id, team_side, pts, opp_pts, off_rating, def_rating, net_rating, reb_rate, tov_rate, result"
        ),

      supabase
        .from("game_insights")
        .select(
          "game_id, summary, key_problem_1, key_problem_2, key_problem_3, positive_1, positive_2, positive_3, focus_1, focus_2, focus_3"
        ),

      supabase
        .from("events")
        .select(
          "id, game_id, player_id, quarter, event_type, team_side, is_undone, created_at, clock_seconds_left"
        ),

      supabase.from("players").select("id, name, number"),
      supabase
        .from("game_players")
        .select("game_id, player_id, is_starter, team_side"),

        supabase
            .from("player_shifts")
            .select(
                 "id, game_id, player_id, team_side, quarter, in_seconds_left, out_seconds_left, created_at, updated_at"
                 ),
    ]);

    if (gamesRes.error) {
      console.error(gamesRes.error);
      setMsg("讀取失敗");
      setLoading(false);
      return;
    }

    if (playerShiftsRes.error) console.error(playerShiftsRes.error);
    if (teamStatsRes.error) console.error(teamStatsRes.error);
    if (insightsRes.error) console.error(insightsRes.error);
    if (eventsRes.error) console.error(eventsRes.error);
    if (playersRes.error) console.error(playersRes.error);
    if (gamePlayersRes.error) console.error(gamePlayersRes.error);

    
    setGames((gamesRes.data as GameRow[]) || []);
    setTeamGameStats((teamStatsRes.data as TeamGameStatsRow[]) || []);
    setInsights((insightsRes.data as InsightRow[]) || []);
    setEvents((eventsRes.data as EventRow[]) || []);
    setPlayers((playersRes.data as PlayerRow[]) || []);
    setGamePlayers((gamePlayersRes.data as GamePlayerRow[]) || []);
    setPlayerShifts((playerShiftsRes.data as PlayerShiftRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const viewerName = getViewerName();
    if (!viewerName) {
      router.push("/");
      return;
    }
    void fetchAll();
  }, [fetchAll, router]);

  const finishedGames = useMemo(() => {
    return games.filter((g) => normalizeStatus(g.status) === "已結束");
  }, [games]);

  useEffect(() => {
    if (!finishedGames.length) return;
    if (!selectedGameId) {
      setSelectedGameId(finishedGames[0].id);
      return;
    }
    const exists = finishedGames.some((g) => g.id === selectedGameId);
    if (!exists) setSelectedGameId(finishedGames[0].id);
  }, [finishedGames, selectedGameId]);

  const selectedGame = useMemo(() => {
    return finishedGames.find((g) => g.id === selectedGameId) || null;
  }, [finishedGames, selectedGameId]);

  const selectedTeamStats = useMemo(() => {
    if (!selectedGame) return null;
    return teamGameStats.find((row) => row.game_id === selectedGame.id) || null;
  }, [selectedGame, teamGameStats]);

  const selectedInsight = useMemo(() => {
    if (!selectedGame) return null;
    return insights.find((row) => row.game_id === selectedGame.id) || null;
  }, [selectedGame, insights]);

  const selectedEvents = useMemo(() => {
    if (!selectedGame) return [];
    return events.filter((e) => e.game_id === selectedGame.id && !e.is_undone);
  }, [selectedGame, events]);

  const computed = useMemo(() => {
    return calcMetricsFromEvents(selectedEvents);
  }, [selectedEvents]);

  const collapseWindows = useMemo(() => {
  if (!selectedGame) return [];
  return buildCollapseWindows(
    selectedEvents,
    selectedGame.id,
    playerShifts,
    players
  );
}, [selectedEvents, selectedGame, playerShifts, players]);

  const starters = useMemo(() => {
    if (!selectedGame) return [];
    return starterNamesForGame(selectedGame.id, gamePlayers, players);
  }, [selectedGame, gamePlayers, players]);

  const summaryLines = useMemo(() => {
    if (!selectedGame) return [];

    const ourPts = safeNumber(selectedTeamStats?.pts ?? computed.points);
    const oppPts = safeNumber(selectedTeamStats?.opp_pts);
    const margin = ourPts - oppPts;
    const resultText =
      margin > 0 ? "拿下勝利" : margin < 0 ? "吞下敗仗" : "與對手戰平";

    const lines: string[] = [];
    lines.push(
      `${getMatchName(selectedGame)} 最終比分 ${ourPts}：${oppPts}，本場 ${resultText}。`
    );

    if (selectedInsight?.summary?.trim()) {
      lines.push(selectedInsight.summary.trim());
    } else {
      if (computed.offRating >= 100) {
        lines.push(`進攻效率 ${computed.offRating}，整體進攻品質不差。`);
      } else {
        lines.push(`進攻效率 ${computed.offRating}，進攻端仍有提升空間。`);
      }
    }

    if (safeNumber(selectedTeamStats?.tov_rate) >= 18 || computed.turnoverRate >= 18) {
      lines.push("失誤偏高，這場最傷的是把回合直接送掉。");
    } else if (computed.shotMix3 >= 40) {
      lines.push("外線出手占比偏高，出手選擇還可以再篩。");
    } else if (computed.shotMix2 >= 60) {
      lines.push("出手有成功往禁區集中，這點值得延續。");
    } else {
      lines.push("出手結構中性，下一場可再提高高價值出手比例。");
    }

    if (starters.length) {
      lines.push(`先發組合：${starters.join(" / ")}。`);
    }

    return lines.slice(0, 4);
  }, [selectedGame, selectedTeamStats, selectedInsight, computed, starters]);

  const positives = useMemo(() => {
    const arr = [
      selectedInsight?.positive_1,
      selectedInsight?.positive_2,
      selectedInsight?.positive_3,
    ]
      .map((v) => (v ?? "").trim())
      .filter(Boolean);

    if (arr.length) return arr;

    const fallback: string[] = [];

    if (computed.offRating >= 95) {
      fallback.push(`進攻效率 ${computed.offRating}，代表本場仍有穩定得分能力。`);
    }
    if (computed.shotMix2 >= 55) {
      fallback.push(`二分出手占比 ${computed.shotMix2}% ，代表攻框意識不差。`);
    }
    if (safeNumber(selectedTeamStats?.reb_rate) >= 50) {
      fallback.push(`籃板率 ${safeNumber(selectedTeamStats?.reb_rate)}%，籃板控制有一定表現。`);
    }

    if (!fallback.length) {
      fallback.push("仍有可延續的比賽內容，建議從高品質出手與穩定持球開始建立。");
    }

    return fallback.slice(0, 3);
  }, [selectedInsight, computed, selectedTeamStats]);

  const problems = useMemo(() => {
    const arr = [
      selectedInsight?.key_problem_1,
      selectedInsight?.key_problem_2,
      selectedInsight?.key_problem_3,
    ]
      .map((v) => (v ?? "").trim())
      .filter(Boolean);

    if (arr.length) return arr;

    const fallback: string[] = [];

    if (computed.turnoverRate >= 18) {
      fallback.push(`失誤率 ${computed.turnoverRate}% 偏高，回合管理需要優先修正。`);
    }
    if (computed.offRating < 90) {
      fallback.push(`進攻效率 ${computed.offRating} 偏低，代表得分品質不足。`);
    }
    if (collapseWindows.length) {
      fallback.push("比賽中段有明顯失分波，代表節奏控制不穩。");
    }

    if (!fallback.length) {
      fallback.push("目前尚未抓到明顯單一弱點，建議持續累積更多正式賽樣本。");
    }

    return fallback.slice(0, 3);
  }, [selectedInsight, computed, collapseWindows]);

  const nextFocus = useMemo(() => {
    const arr = [
      selectedInsight?.focus_1,
      selectedInsight?.focus_2,
      selectedInsight?.focus_3,
    ]
      .map((v) => (v ?? "").trim())
      .filter(Boolean);

    if (arr.length) return arr;

    const fallback: string[] = [];

    if (computed.turnoverRate >= 18) {
      fallback.push("下一場優先把失誤壓低到可控範圍。");
    }
    if (computed.shotMix3 >= 40) {
      fallback.push("下一場先提升外線出手品質，不要急著投。");
    }
    if (computed.offRating < 95) {
      fallback.push("增加禁區終結與罰球製造，先把進攻底盤拉上來。");
    }

    if (!fallback.length) {
      fallback.push("延續這場有效內容，優先建立穩定先發節奏。");
    }

    return fallback.slice(0, 3);
  }, [selectedInsight, computed]);

  const offRatingValue = round1(
    safeNumber(selectedTeamStats?.off_rating ?? computed.offRating)
  );

  const pppValue = round1(computed.ppp);

  const turnoverRateValue = round1(
    safeNumber(selectedTeamStats?.tov_rate ?? computed.turnoverRate)
  );

  const netRatingValue = round1(
    selectedTeamStats?.net_rating != null
      ? safeNumber(selectedTeamStats.net_rating)
      : safeNumber(selectedTeamStats?.off_rating) - safeNumber(selectedTeamStats?.def_rating)
  );

  const statCards = useMemo(() => {
    return [
      {
        label: "最終比分",
        value: `${safeNumber(selectedTeamStats?.pts ?? computed.points)} - ${safeNumber(
          selectedTeamStats?.opp_pts
        )}`,
        sub: selectedGame ? getMatchName(selectedGame) : "—",
      },
      {
        label: "進攻效率",
        value: `${offRatingValue}`,
        sub: `PPP ${pppValue}`,
      },
      {
        label: "失誤率",
        value: `${turnoverRateValue}%`,
        sub: "每 100 回合失誤占比",
      },
      {
        label: "淨效率",
        value: `${netRatingValue}`,
        sub: "進攻效率 - 防守效率",
      },
    ];
  }, [
    selectedTeamStats,
    computed,
    selectedGame,
    offRatingValue,
    pppValue,
    turnoverRateValue,
    netRatingValue,
  ]);

  return (
    <main className="page">
      <div className="shell">
        <section className="topbar">
          <div>
            <div className="eyebrow">POSTGAME CENTER</div>
            <h1>賽後分析總覽</h1>
            <p>先選比賽，再看單場賽後報告與崩盤時段分析</p>
          </div>

          <button className="back-btn" onClick={() => router.push("/games/viewer")}>
            返回首頁
          </button>
        </section>

        {loading && <div className="panel center">讀取中</div>}
        {!loading && msg && <div className="panel center">{msg}</div>}

        {!loading && !msg && (
          <section className="layout">
            <aside className="left-panel">
              <div className="section-kicker">GAMES</div>
              <div className="left-title">已結束比賽</div>

              <div className="game-list">
                {finishedGames.length ? (
                  finishedGames.map((game) => {
                    const stats =
                      teamGameStats.find((row) => row.game_id === game.id) || null;
                    const isActive = selectedGameId === game.id;

                    return (
                      <button
                        key={game.id}
                        className={`game-item ${isActive ? "active" : ""}`}
                        onClick={() => setSelectedGameId(game.id)}
                      >
                        <div className="game-item-top">
                          <span>{getMatchName(game)}</span>
                          <span>{getShortDate(game.game_date || game.created_at)}</span>
                        </div>
                        <div className="game-item-score">
                          {safeNumber(stats?.pts)} - {safeNumber(stats?.opp_pts)}
                        </div>
                        <div className="game-item-sub">
                          {getGameTypeLabel(game)}｜{normalizeStatus(game.status)}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="empty-box">尚無已結束比賽</div>
                )}
              </div>
            </aside>

            <section className="right-panel">
              {selectedGame ? (
                <>
                  <div className="hero-card">
                    <div className="hero-top">
                      <div>
                        <div className="section-kicker">SELECTED GAME</div>
                        <h2>{getMatchName(selectedGame)}</h2>
                        <div className="hero-sub">
                          {getShortDate(selectedGame.game_date || selectedGame.created_at)}｜
                          {getGameTypeLabel(selectedGame)}
                        </div>
                      </div>

                      <div className="hero-score">
                        {safeNumber(selectedTeamStats?.pts ?? computed.points)} -{" "}
                        {safeNumber(selectedTeamStats?.opp_pts)}
                      </div>
                    </div>

                    <div className="stat-grid">
                      {statCards.map((card) => (
                        <div className="stat-card" key={card.label}>
                          <div className="stat-label">{card.label}</div>
                          <div className="stat-value">{card.value}</div>
                          <div className="stat-sub">{card.sub}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="content-grid">
                    <div className="panel">
                      <div className="section-kicker">REPORT</div>
                      <h3>單場賽後報告</h3>

                      <div className="report-block">
                        <div className="report-subtitle">比賽總結</div>
                        <div className="bullet-list">
                          {summaryLines.map((line, idx) => (
                            <div className="bullet-item" key={`${line}-${idx}`}>
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="triple-grid">
                        <div className="mini-panel">
                          <div className="mini-title">做得好的地方</div>
                          <div className="bullet-list small">
                            {positives.map((item, idx) => (
                              <div className="bullet-item" key={`${item}-${idx}`}>
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mini-panel">
                          <div className="mini-title">主要問題</div>
                          <div className="bullet-list small">
                            {problems.map((item, idx) => (
                              <div className="bullet-item" key={`${item}-${idx}`}>
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="mini-panel">
                          <div className="mini-title">下一場重點</div>
                          <div className="bullet-list small">
                            {nextFocus.map((item, idx) => (
                              <div className="bullet-item" key={`${item}-${idx}`}>
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="panel">
                      <div className="section-kicker">COLLAPSE WINDOW</div>
                      <h3>崩盤時段分析</h3>

                      {collapseWindows.length ? (
                        <div className="collapse-list">
                          {collapseWindows.map((item, idx) => {
                            const total = Math.max(1, item.ourPoints + item.oppPoints);
                            const ourPct = (item.ourPoints / total) * 100;
                            const oppPct = (item.oppPoints / total) * 100;

                            return (
                              <div className="collapse-card" key={`${item.quarter}-${idx}`}>
                                <div className="collapse-head">
                                  <span>第 {item.quarter} 節</span>
                                  <span>
                                    {formatClock(item.startSec)} → {formatClock(item.endSec)}
                                  </span>
                                </div>

                                <div className="collapse-score">
                                  我方 {item.ourPoints} ： 對手 {item.oppPoints}
                                </div>

                                <div
                                  className={`collapse-diff ${
                                    item.severity === "high"
                                      ? "high"
                                      : item.severity === "medium"
                                      ? "medium"
                                      : "low"
                                  }`}
                                >
                                  淨分 {item.diff}
                                </div>

                                <div className="bar-wrap">
                                  <div className="bar-label-row">
                                    <span>我方得分</span>
                                    <span>{item.ourPoints}</span>
                                  </div>
                                  <div className="bar-track">
                                    <div className="bar-fill our" style={{ width: `${ourPct}%` }} />
                                  </div>

                                  <div className="bar-label-row">
                                    <span>對手得分</span>
                                    <span>{item.oppPoints}</span>
                                  </div>
                                  <div className="bar-track">
                                    <div className="bar-fill opp" style={{ width: `${oppPct}%` }} />
                                  </div>
                                </div>

                                <div className="collapse-meta-grid">
                                  <div className="meta-pill">失誤 {item.ourTurnovers}</div>
                                  <div className="meta-pill">打鐵 {item.ourMisses}</div>
                                  <div className="meta-pill">事件 {item.eventCount}</div>
                                </div>
                                    <div className="meta-pill">區間 {Math.floor(item.durationSec / 60)}分{String(item.durationSec % 60).padStart(2, "0")}秒</div>
                                <div className="collapse-summary">{item.summary}</div>

                                <div className="lineup-block">
                                  <div className="lineup-title">當時主要場上 5 人</div>
                                  {item.lineupNames.length ? (
                                    <div className="lineup-list">
                                      {item.lineupNames.map((name) => (
                                        <span key={name} className="lineup-chip">
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="lineup-empty">目前無法完整還原當時 5 人</div>
                                  )}
                                </div>

                                <div className="collapse-tip">
                                  {item.severity === "high"
                                    ? "這段屬於明顯崩盤，建議先回看這段的持球決策、第一拍出手與是否該更早暫停。"
                                    : item.severity === "medium"
                                    ? "這段已有明顯失控跡象，建議對照輪替與失誤來源。"
                                    : "這段有被壓制，但還不到完全崩盤。"}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-box">尚無足夠事件資料可分析崩盤時段</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="panel center">尚無可查看的已結束比賽</div>
              )}
            </section>
          </section>
        )}
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 24px;
          background:
            radial-gradient(circle at top, rgba(255, 132, 0, 0.14), transparent 28%),
            linear-gradient(180deg, #0b0b0d 0%, #111216 100%);
          color: #fff;
        }

        .shell {
          max-width: 1500px;
          margin: 0 auto;
          display: grid;
          gap: 20px;
        }

        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
        }

        .eyebrow,
        .section-kicker {
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.18em;
          color: rgba(255, 255, 255, 0.58);
        }

        .topbar h1 {
          margin: 6px 0 8px;
          font-size: 40px;
          line-height: 1;
          font-weight: 900;
        }

        .topbar p {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.74);
        }

        .back-btn {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          border-radius: 18px;
          height: 54px;
          padding: 0 22px;
          font-size: 18px;
          font-weight: 900;
          cursor: pointer;
        }

        .layout {
          display: grid;
          grid-template-columns: 340px minmax(0, 1fr);
          gap: 20px;
        }

        .left-panel,
        .panel,
        .hero-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 22px;
        }

        .left-title {
          margin-top: 8px;
          font-size: 28px;
          font-weight: 900;
        }

        .game-list {
          margin-top: 18px;
          display: grid;
          gap: 12px;
        }

        .game-item {
          width: 100%;
          text-align: left;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          color: #fff;
          padding: 16px;
          cursor: pointer;
          display: grid;
          gap: 8px;
        }

        .game-item.active {
          border-color: rgba(255, 166, 77, 0.7);
          background: rgba(255, 166, 77, 0.1);
        }

        .game-item-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-size: 15px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.76);
        }

        .game-item-score {
          font-size: 30px;
          font-weight: 900;
          line-height: 1;
        }

        .game-item-sub {
          font-size: 14px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.62);
        }

        .right-panel {
          display: grid;
          gap: 20px;
        }

        .hero-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
        }

        .hero-card h2 {
          margin: 8px 0;
          font-size: 38px;
          font-weight: 900;
          line-height: 1.05;
        }

        .hero-sub {
          font-size: 17px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.72);
        }

        .hero-score {
          font-size: 52px;
          font-weight: 900;
          line-height: 1;
          color: #ffab3d;
        }

        .stat-grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .stat-card {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 16px;
          display: grid;
          gap: 8px;
        }

        .stat-label {
          font-size: 15px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.62);
        }

        .stat-value {
          font-size: 34px;
          font-weight: 900;
          line-height: 1;
        }

        .stat-sub {
          font-size: 15px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.7);
        }

        .content-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 20px;
        }

        .panel h3 {
          margin: 8px 0 0;
          font-size: 30px;
          font-weight: 900;
          line-height: 1.1;
        }

        .report-block {
          margin-top: 18px;
          display: grid;
          gap: 12px;
        }

        .report-subtitle,
        .mini-title,
        .lineup-title {
          font-size: 19px;
          font-weight: 900;
        }

        .bullet-list {
          display: grid;
          gap: 10px;
        }

        .bullet-list.small {
          gap: 8px;
        }

        .bullet-item {
          font-size: 20px;
          line-height: 1.55;
          font-weight: 800;
        }

        .triple-grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .mini-panel {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 16px;
          display: grid;
          gap: 12px;
        }

        .collapse-list {
          margin-top: 18px;
          display: grid;
          gap: 14px;
        }

        .collapse-card {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 16px;
          display: grid;
          gap: 12px;
        }

        .collapse-head {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-size: 15px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.68);
        }

        .collapse-score {
          font-size: 26px;
          font-weight: 900;
        }

        .collapse-diff {
          font-size: 22px;
          font-weight: 900;
        }

        .collapse-diff.high {
          color: #ff7b7b;
        }

        .collapse-diff.medium {
          color: #ffad66;
        }

        .collapse-diff.low {
          color: #ffd37b;
        }

        .bar-wrap {
          display: grid;
          gap: 8px;
        }

        .bar-label-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.76);
        }

        .bar-track {
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 999px;
        }

        .bar-fill.our {
          background: linear-gradient(90deg, #7cc7ff, #5fa9ff);
        }

        .bar-fill.opp {
          background: linear-gradient(90deg, #ff9d6c, #ff6d6d);
        }

        .collapse-meta-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .meta-pill {
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 14px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.86);
        }

        .collapse-summary {
          font-size: 18px;
          font-weight: 800;
          line-height: 1.5;
        }

        .lineup-block {
          display: grid;
          gap: 10px;
        }

        .lineup-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .lineup-chip {
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(255, 166, 77, 0.12);
          border: 1px solid rgba(255, 166, 77, 0.24);
          font-size: 14px;
          font-weight: 900;
          color: #ffd29d;
        }

        .lineup-empty {
          font-size: 15px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.62);
        }

        .collapse-tip {
          font-size: 16px;
          line-height: 1.5;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.72);
        }

        .empty-box {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px dashed rgba(255, 255, 255, 0.12);
          padding: 22px;
          font-size: 18px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.7);
        }

        .center {
          text-align: center;
        }

        @media (max-width: 1280px) {
          .layout {
            grid-template-columns: 1fr;
          }

          .content-grid {
            grid-template-columns: 1fr;
          }

          .stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .triple-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 900px) {
          .topbar {
            flex-direction: column;
            align-items: stretch;
          }

          .hero-top {
            flex-direction: column;
            align-items: flex-start;
          }

          .hero-score {
            font-size: 42px;
          }

          .stat-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}