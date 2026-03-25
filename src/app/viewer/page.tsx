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
  target_score?: number | null;
  game_format?: string | null;
};

type PlayerRow = {
  id: string;
  name: string;
  number: number | null;
  position?: string | null;
  active?: boolean | null;
};

type PlayerGameStatsRow = {
  player_id: string;
  game_id: string;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  plus_minus?: number | null;
  minutes_played?: number | null;
  pts_per_10_min?: number | null;
  reb_per_10_min?: number | null;
  ast_per_10_min?: number | null;
};

type TeamGameStatsRow = {
  game_id: string;
  team_side?: string | null;
  pts?: number | null;
  opp_pts?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
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
  event_type: string;
  team_side?: string | null;
  is_undone?: boolean | null;
  created_at?: string | null;
};

type LineupStatsRow = {
  id?: string;
  game_id: string;
  lineup_key?: string | null;
  player_ids?: string[] | null;
  player_names?: string[] | null;
  appearances?: number | null;
  seconds_played?: number | null;
  plus_minus?: number | null;
  possessions?: number | null;
  points_for?: number | null;
  points_against?: number | null;
  off_rating?: number | null;
  is_official?: boolean | null;
};

type PlayerCard = {
  id: string;
  name: string;
  number: number | null;
  plusMinus: number;
  pts: number;
  reb: number;
  ast: number;
  minutes: number;
  pts10: number;
  reb10: number;
  ast10: number;
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

function safeNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
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

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
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

  return t;
}

function isOurTeamEvent(teamSide?: string | null) {
  const side = (teamSide ?? "").trim().toLowerCase();
  if (!side) return true;
  if (["teama", "a", "our", "self", "home"].includes(side)) return true;
  if (["teamb", "b", "opponent", "away"].includes(side)) return false;
  return true;
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

function formatMinutes(seconds?: number | null) {
  const sec = Math.max(0, Math.floor(safeNumber(seconds)));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function shortNames(names?: string[] | null) {
  if (!names || !names.length) return "尚無陣容資料";
  return names.map((n) => `#${n}`).join(" / ");
}

function getGoalTone(current: number, target: number, higherIsBetter = true) {
  if (higherIsBetter) {
    if (current >= target) return "延續";
    return "提升";
  }
  if (current <= target) return "維持";
  return "壓低";
}

export default function ViewerGamesPage() {
  const router = useRouter();

  const [games, setGames] = useState<GameRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerGameStats, setPlayerGameStats] = useState<PlayerGameStatsRow[]>([]);
  const [teamGameStats, setTeamGameStats] = useState<TeamGameStatsRow[]>([]);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [lineupStats, setLineupStats] = useState<LineupStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setMsg("");

    const [
      gamesRes,
      playersRes,
      pgsRes,
      tgsRes,
      insightsRes,
      eventsRes,
      lineupStatsRes,
    ] = await Promise.all([
      supabase
        .from("games")
        .select(
          "id, teamA, teamB, status, game_date, created_at, game_category, target_score, game_format"
        )
        .order("game_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),

      supabase
        .from("players")
        .select("id, name, number, position, active")
        .eq("active", true)
        .order("number", { ascending: true }),

      supabase
        .from("player_game_stats")
        .select(
          "player_id, game_id, pts, reb, ast, stl, blk, plus_minus, minutes_played, pts_per_10_min, reb_per_10_min, ast_per_10_min"
        ),

      supabase
        .from("team_game_stats")
        .select(
          "game_id, team_side, pts, opp_pts, reb, ast, stl, blk, off_rating, def_rating, net_rating, reb_rate, tov_rate, result"
        ),

      supabase
        .from("game_insights")
        .select(
          "game_id, summary, key_problem_1, key_problem_2, key_problem_3, positive_1, positive_2, positive_3, focus_1, focus_2, focus_3"
        ),

      supabase
        .from("events")
        .select("id, game_id, player_id, event_type, team_side, is_undone, created_at"),

      supabase
        .from("lineup_stats")
        .select(
          "id, game_id, lineup_key, player_ids, player_names, appearances, seconds_played, plus_minus, possessions, points_for, points_against, off_rating, is_official"
        ),
    ]);

    if (gamesRes.error) {
      console.error(gamesRes.error);
      setMsg("讀取失敗");
      setLoading(false);
      return;
    }

    if (playersRes.error) console.error(playersRes.error);
    if (pgsRes.error) console.error(pgsRes.error);
    if (tgsRes.error) console.error(tgsRes.error);
    if (insightsRes.error) console.error(insightsRes.error);
    if (eventsRes.error) console.error(eventsRes.error);
    if (lineupStatsRes.error) console.error(lineupStatsRes.error);

    setGames((gamesRes.data as GameRow[]) || []);
    setPlayers((playersRes.data as PlayerRow[]) || []);
    setPlayerGameStats((pgsRes.data as PlayerGameStatsRow[]) || []);
    setTeamGameStats((tgsRes.data as TeamGameStatsRow[]) || []);
    setInsights((insightsRes.data as InsightRow[]) || []);
    setEvents((eventsRes.data as EventRow[]) || []);
    setLineupStats((lineupStatsRes.data as LineupStatsRow[]) || []);
    setLoading(false);
  }, []);

  const updateSessionHeartbeat = useCallback(async () => {
    if (typeof window === "undefined") return;
    const sessionId = localStorage.getItem("session_id");
    if (!sessionId) return;

    await supabase
      .from("user_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        is_online: true,
      })
      .eq("id", sessionId);
  }, []);

  const markSessionOffline = useCallback(async () => {
    if (typeof window === "undefined") return;
    const sessionId = localStorage.getItem("session_id");
    if (!sessionId) return;

    await supabase
      .from("user_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        is_online: false,
      })
      .eq("id", sessionId);
  }, []);

  useEffect(() => {
    const name = getViewerName();
    if (!name) {
      router.push("/");
      return;
    }
    void fetchAll();
    void updateSessionHeartbeat();
  }, [router, fetchAll, updateSessionHeartbeat]);

  useEffect(() => {
    const timer = setInterval(() => {
      void updateSessionHeartbeat();
    }, 20000);

    return () => clearInterval(timer);
  }, [updateSessionHeartbeat]);

  useEffect(() => {
    const handlePageHide = () => {
      void markSessionOffline();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void markSessionOffline();
      } else {
        void updateSessionHeartbeat();
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [markSessionOffline, updateSessionHeartbeat]);

  const viewerName = useMemo(() => getViewerName() || "觀眾", []);

  const finishedGames = useMemo(
    () => games.filter((g) => normalizeStatus(g.status) === "已結束"),
    [games]
  );

  const latestGame = useMemo(() => {
    if (!finishedGames.length) return null;
    return (
      finishedGames.find((game) =>
        teamGameStats.some((row) => row.game_id === game.id)
      ) || finishedGames[0] || null
    );
  }, [finishedGames, teamGameStats]);

  const latestTeamStats = useMemo<TeamGameStatsRow | null>(() => {
    if (!latestGame) return null;
    return teamGameStats.find((row) => row.game_id === latestGame.id) || null;
  }, [latestGame, teamGameStats]);

  const latestInsight = useMemo(() => {
    if (!latestGame) return null;
    return insights.find((row) => row.game_id === latestGame.id) || null;
  }, [latestGame, insights]);

  const computedByGame = useMemo(() => {
    const map = new Map<string, ComputedTeamMetrics>();

    for (const game of finishedGames) {
      const gameEvents = events.filter((e) => e.game_id === game.id && !e.is_undone);
      map.set(game.id, calcMetricsFromEvents(gameEvents));
    }

    return map;
  }, [finishedGames, events]);

  const recentGames = useMemo(() => finishedGames.slice(0, 5), [finishedGames]);

  const recentThreeStats = useMemo(() => {
    return recentGames.slice(0, 3).map((game) => ({
      game,
      stats: teamGameStats.find((row) => row.game_id === game.id) || null,
      computed: computedByGame.get(game.id) || null,
    }));
  }, [recentGames, teamGameStats, computedByGame]);

  const latestComputed = useMemo(() => {
    if (!latestGame) return null;
    return computedByGame.get(latestGame.id) || null;
  }, [latestGame, computedByGame]);

  const recentRecord = useMemo(() => {
    let win = 0;
    let lose = 0;

    recentThreeStats.forEach(({ stats, computed }) => {
      const pts =
        stats?.pts != null ? safeNumber(stats.pts) : safeNumber(computed?.points);
      const oppPts = safeNumber(stats?.opp_pts);

      if (pts > oppPts) win += 1;
      else if (pts < oppPts) lose += 1;
    });

    return `${win}勝${lose}敗`;
  }, [recentThreeStats]);

  const latestPlayers = useMemo<PlayerCard[]>(() => {
    if (!latestGame) return [];

    return playerGameStats
      .filter((row) => row.game_id === latestGame.id)
      .map((row) => {
        const player = players.find((p) => p.id === row.player_id);
        const minutes = safeNumber(row.minutes_played);
        const pts = safeNumber(row.pts);
        const reb = safeNumber(row.reb);
        const ast = safeNumber(row.ast);

        return {
          id: row.player_id,
          name: player?.name || "未命名",
          number: player?.number ?? null,
          plusMinus: safeNumber(row.plus_minus),
          pts,
          reb,
          ast,
          minutes: round1(minutes),
          pts10: round1(
            row.pts_per_10_min != null
              ? safeNumber(row.pts_per_10_min)
              : minutes > 0
              ? (pts / minutes) * 10
              : 0
          ),
          reb10: round1(
            row.reb_per_10_min != null
              ? safeNumber(row.reb_per_10_min)
              : minutes > 0
              ? (reb / minutes) * 10
              : 0
          ),
          ast10: round1(
            row.ast_per_10_min != null
              ? safeNumber(row.ast_per_10_min)
              : minutes > 0
              ? (ast / minutes) * 10
              : 0
          ),
        };
      })
      .sort((a, b) => b.plusMinus - a.plusMinus);
  }, [latestGame, playerGameStats, players]);

  const bestPlayer = useMemo(() => latestPlayers[0] || null, [latestPlayers]);

  const bestLineup = useMemo(() => {
    if (!latestGame) return null;

    const rows = lineupStats
      .filter((row) => row.game_id === latestGame.id)
      .sort((a, b) => {
        const pmDiff = safeNumber(b.plus_minus) - safeNumber(a.plus_minus);
        if (pmDiff !== 0) return pmDiff;
        return safeNumber(b.seconds_played) - safeNumber(a.seconds_played);
      });

    const picked =
      rows.find((row) => safeNumber(row.seconds_played) >= 120) || rows[0] || null;

    if (!picked) return null;

    const plus = safeNumber(picked.plus_minus);
    const pf = safeNumber(picked.points_for);
    const pa = safeNumber(picked.points_against);
    const secs = safeNumber(picked.seconds_played);
    const poss = safeNumber(picked.possessions);
    const off = safeNumber(picked.off_rating);

    let summary = "整體表現穩定";
    if (plus >= 10) summary = "這組陣容明顯拉開比賽";
    else if (plus >= 5) summary = "這組陣容攻守效率最好";
    else if (off >= 100) summary = "這組陣容進攻品質不錯";
    else if (pf > pa) summary = "這組陣容整體略佔優勢";

    return {
      names: picked.player_names || [],
      plusMinus: plus,
      secondsPlayed: secs,
      pointsFor: pf,
      pointsAgainst: pa,
      possessions: poss,
      offRating: off,
      summary,
    };
  }, [latestGame, lineupStats]);

  const nextGameGoals = useMemo(() => {
    const current3ptPct =
      latestComputed && latestComputed.fg3a > 0
        ? round1((latestComputed.fg3m / latestComputed.fg3a) * 100)
        : 0;

    const currentTov =
      latestComputed && latestComputed.possessions > 0
        ? round1((latestComputed.turnoverRate / 100) * latestComputed.possessions)
        : 0;

    const currentFta = safeNumber(latestComputed?.fta);
    const currentOff = safeNumber(latestComputed?.offRating);

    const target3ptPct = current3ptPct >= 32 ? current3ptPct : 32;
    const targetTov = currentTov <= 10 && currentTov > 0 ? Math.floor(currentTov) : 10;
    const targetFta = currentFta >= 8 ? currentFta : 8;
    const targetOff = currentOff >= 95 ? round1(currentOff) : 95;

    return [
      {
        title: "三分球命中率",
        current: `${current3ptPct}%`,
        target: `${target3ptPct}%`,
        tone: getGoalTone(current3ptPct, target3ptPct, true),
      },
      {
        title: "失誤次數",
        current: `${round1(currentTov)}次`,
        target: `${targetTov}次以下`,
        tone: getGoalTone(currentTov, targetTov, false),
      },
      {
        title: "罰球出手",
        current: `${currentFta}次`,
        target: `${targetFta}次以上`,
        tone: getGoalTone(currentFta, targetFta, true),
      },
      {
        title: "進攻效率",
        current: `${round1(currentOff)}`,
        target: `${targetOff}`,
        tone: getGoalTone(currentOff, targetOff, true),
      },
    ];
  }, [latestComputed]);

  const postgameAnalysis = useMemo(() => {
    if (!latestGame || !latestComputed) {
      return [
        "目前尚無可生成的賽後分析。",
        "完成一場正式比賽後，首頁會自動整理重點。",
        "這裡會優先顯示對下一場調整最有幫助的內容。",
      ];
    }

    const ourPts = safeNumber(latestTeamStats?.pts ?? latestComputed.points);
    const oppPts = safeNumber(latestTeamStats?.opp_pts);
    const resultText =
      ourPts > oppPts
        ? "拿下勝利"
        : ourPts < oppPts
        ? "以些微差距落敗"
        : "與對手戰平";

    const lines: string[] = [];
    lines.push(`${getMatchName(latestGame)} 最終 ${ourPts}：${oppPts}，本場 ${resultText}。`);

    if (latestInsight?.summary?.trim()) {
      lines.push(latestInsight.summary.trim());
    } else if (latestComputed.offRating >= 100) {
      lines.push(`進攻效率 ${latestComputed.offRating}，代表本場進攻回合品質不差。`);
    } else {
      lines.push(`進攻效率 ${latestComputed.offRating}，進攻端還有明顯提升空間。`);
    }

    if (latestComputed.turnoverRate >= 18) {
      lines.push(`失誤率 ${latestComputed.turnoverRate}% 偏高，下一場應優先處理控球與決策。`);
    } else if (latestComputed.shotMix2 >= 60) {
      lines.push(`二分出手占比 ${latestComputed.shotMix2}% ，進攻重心有成功往籃下集中。`);
    } else if (latestComputed.shotMix3 >= 38) {
      lines.push(`三分出手占比 ${latestComputed.shotMix3}% ，外線選擇需要再過濾。`);
    } else {
      lines.push("整體出手結構中性，下一場可再提升高價值出手比例。");
    }

    if (bestLineup) {
      lines.push(`最佳陣容為 ${shortNames(bestLineup.names)}，可作為下一場優先延續的主軸。`);
    } else {
      lines.push("目前尚未抓到穩定優勢陣容，建議持續累積正式賽樣本。");
    }

    return lines.slice(0, 4);
  }, [latestGame, latestComputed, latestTeamStats, latestInsight, bestLineup]);

  const overviewCards = useMemo(() => {
    const latestPoints = safeNumber(latestTeamStats?.pts ?? latestComputed?.points);
    const latestOppPoints = safeNumber(latestTeamStats?.opp_pts);
    const result =
      latestPoints > latestOppPoints ? "勝" : latestPoints < latestOppPoints ? "敗" : "平";

    return [
      {
        label: "最近3場",
        value: recentRecord,
        sub:
          recentThreeStats.length > 0
            ? `近3場正式賽整體走勢`
            : "尚無近3場資料",
      },
      {
        label: "最新賽果",
        value: latestGame ? `${latestPoints} - ${latestOppPoints}` : "—",
        sub: latestGame
          ? `${getMatchName(latestGame)}｜${result}｜${getShortDate(
              latestGame.game_date || latestGame.created_at
            )}`
          : "尚無比賽",
      },
      {
        label: "進攻效率",
        value: latestComputed ? `${round1(latestComputed.offRating)}` : "—",
        sub: latestComputed
          ? `失誤率 ${round1(latestComputed.turnoverRate)}%`
          : "尚無進攻資料",
      },
      {
        label: "主力陣容",
        value: bestLineup ? `${bestLineup.plusMinus >= 0 ? "+" : ""}${bestLineup.plusMinus}` : "—",
        sub: bestLineup
          ? `${shortNames(bestLineup.names)}`
          : "尚無陣容資料",
      },
    ];
  }, [recentRecord, recentThreeStats, latestGame, latestTeamStats, latestComputed, bestLineup]);

  function handleOpenMatches() {
    router.push("/games/list");
  }

  function handleOpenTeamStats() {
    router.push("/games/box");
  }

  function handleOpenPlayers() {
    router.push("/games/players");
  }

  function handleOpenRankings() {
    router.push("/games/rank");
  }

  function handleOpenLineups() {
    router.push("/games/lineups");
  }

  function handleOpenPostgameAnalysis() {
    if (latestGame) {
      router.push(`/games/postgame`);
      return;
    }
    router.push("/games/list");
  }

  return (
    <main className="page">
      <div className="shell">
        <section className="top-header">
          <div className="title-wrap">
            <div className="eyebrow">TEAM DASHBOARD</div>
            <h1>{viewerName}</h1>
          </div>
        </section>

        <section className="overview-grid">
          {overviewCards.map((card) => (
            <div className="overview-card" key={card.label}>
              <div className="overview-label">{card.label}</div>
              <div className="overview-value">{card.value}</div>
              <div className="overview-sub">{card.sub}</div>
            </div>
          ))}
        </section>

        {loading && <div className="simple-card center">讀取中</div>}
        {!loading && msg && <div className="simple-card center">{msg}</div>}

        {!loading && !msg && (
          <>
            <section className="feature-grid">
              <div className="feature-card">
                <div className="card-kicker">NEXT GAME</div>
                <h2>下一場目標</h2>
                <div className="goal-list">
                  {nextGameGoals.map((goal) => (
                    <div className="goal-item" key={goal.title}>
                      <div className="goal-top">
                        <span className="goal-name">{goal.title}</span>
                        <span className="goal-badge">{goal.tone}</span>
                      </div>
                      <div className="goal-values">
                        <span>目前 {goal.current}</span>
                        <span>→</span>
                        <span>目標 {goal.target}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="feature-card">
                <div className="card-kicker">BEST LINEUP</div>
                <h2>最佳陣容</h2>
                {bestLineup ? (
                  <div className="stack">
                    <div className="lineup-names">{shortNames(bestLineup.names)}</div>
                    <div className="lineup-main-row">
                      <div className="metric-box">
                        <div className="metric-label">正負值</div>
                        <div className="metric-value plus">
                          {bestLineup.plusMinus >= 0 ? "+" : ""}
                          {bestLineup.plusMinus}
                        </div>
                      </div>
                      <div className="metric-box">
                        <div className="metric-label">上場時間</div>
                        <div className="metric-value">
                          {formatMinutes(bestLineup.secondsPlayed)}
                        </div>
                      </div>
                    </div>
                    <div className="mini-grid">
                      <div className="mini-card">
                        <div className="mini-label">得分 / 失分</div>
                        <div className="mini-value">
                          {bestLineup.pointsFor} / {bestLineup.pointsAgainst}
                        </div>
                      </div>
                      <div className="mini-card">
                        <div className="mini-label">進攻效率</div>
                        <div className="mini-value">{bestLineup.offRating}</div>
                      </div>
                    </div>
                    <div className="card-note">{bestLineup.summary}</div>
                  </div>
                ) : (
                  <div className="empty-text">尚無陣容資料</div>
                )}
              </div>

              <div className="feature-card">
                <div className="card-kicker">POSTGAME</div>
                <h2>賽後分析</h2>
                <div className="paragraph-list">
                  {postgameAnalysis.map((line, idx) => (
                    <div className="paragraph-item" key={`${line}-${idx}`}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="menu-grid">
              <button className="menu-btn" onClick={handleOpenMatches}>
                賽事中心
              </button>
              <button className="menu-btn" onClick={handleOpenTeamStats}>
                團隊數據
              </button>
              <button className="menu-btn" onClick={handleOpenPlayers}>
                球員數據
              </button>
              <button className="menu-btn" onClick={handleOpenRankings}>
                排行榜
              </button>
              <button className="menu-btn" onClick={handleOpenLineups}>
                陣容分析
              </button>
              <button className="menu-btn" onClick={handleOpenPostgameAnalysis}>
                賽後分析
              </button>
            </section>
          </>
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
          max-width: 1400px;
          margin: 0 auto;
          display: grid;
          gap: 22px;
        }

        .top-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          padding: 10px 4px 0;
        }

        .title-wrap {
          display: grid;
          gap: 8px;
        }

        .eyebrow {
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.18em;
          color: rgba(255, 255, 255, 0.56);
        }

        .title-wrap h1 {
          margin: 0;
          font-size: 42px;
          font-weight: 900;
          line-height: 1;
        }

        .title-wrap p {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.7);
        }

        .overview-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }

        .overview-card {
          min-height: 168px;
          border-radius: 26px;
          padding: 22px;
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
          display: grid;
          align-content: space-between;
          gap: 12px;
        }

        .overview-label {
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 0.08em;
          color: rgba(255, 255, 255, 0.62);
        }

        .overview-value {
          font-size: 44px;
          font-weight: 900;
          line-height: 1.05;
          color: #fff;
        }

        .overview-sub {
          font-size: 17px;
          line-height: 1.45;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.78);
          word-break: break-word;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .feature-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 24px;
          display: grid;
          gap: 18px;
          min-height: 320px;
        }

        .feature-card h2 {
          margin: 0;
          font-size: 30px;
          font-weight: 900;
          line-height: 1.1;
        }

        .card-kicker {
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.18em;
          color: rgba(255, 255, 255, 0.6);
        }

        .goal-list {
          display: grid;
          gap: 14px;
        }

        .goal-item {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 14px 16px;
          display: grid;
          gap: 10px;
        }

        .goal-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .goal-name {
          font-size: 20px;
          font-weight: 900;
        }

        .goal-badge {
          font-size: 14px;
          font-weight: 900;
          color: #ffb74d;
        }

        .goal-values {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          font-size: 18px;
          font-weight: 800;
          opacity: 0.96;
        }

        .stack {
          display: grid;
          gap: 14px;
        }

        .lineup-names {
          font-size: 24px;
          font-weight: 900;
          line-height: 1.35;
        }

        .lineup-main-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .metric-box,
        .mini-card {
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 16px;
          display: grid;
          gap: 6px;
        }

        .metric-label,
        .mini-label {
          font-size: 16px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.72);
        }

        .metric-value {
          font-size: 34px;
          font-weight: 900;
          line-height: 1;
        }

        .metric-value.plus {
          color: #c084fc;
        }

        .mini-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .mini-value {
          font-size: 24px;
          font-weight: 900;
          line-height: 1.1;
        }

        .card-note {
          font-size: 20px;
          font-weight: 800;
          line-height: 1.5;
          color: #ffb74d;
        }

        .paragraph-list {
          display: grid;
          gap: 14px;
        }

        .paragraph-item {
          font-size: 22px;
          font-weight: 800;
          line-height: 1.55;
        }

        .empty-text {
          font-size: 22px;
          font-weight: 800;
          opacity: 0.75;
        }

        .menu-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .menu-btn {
          min-height: 110px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          border-radius: 24px;
          font-size: 26px;
          font-weight: 900;
          cursor: pointer;
          transition: 0.18s ease;
        }

        .menu-btn:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.08);
        }

        .simple-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 28px;
          font-size: 24px;
          font-weight: 900;
        }

        .center {
          text-align: center;
        }

        @media (max-width: 1200px) {
          .overview-grid,
          .feature-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .overview-grid,
          .feature-grid,
          .menu-grid,
          .lineup-main-row,
          .mini-grid {
            grid-template-columns: 1fr;
          }

          .title-wrap h1 {
            font-size: 34px;
          }

          .overview-value {
            font-size: 36px;
          }

          .paragraph-item {
            font-size: 20px;
          }
        }
      `}</style>
    </main>
  );
}