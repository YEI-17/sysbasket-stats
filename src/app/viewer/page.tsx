"use client";

import { calcTeamStatsFromEvents } from "@/lib/statsFromEvents";
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

type EventFallbackRow = {
  game_id: string;
  event_type: string;
  team_side?: string | null;
  is_undone?: boolean | null;
};

type TeamStatLike = {
  game_id: string;
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

function getArrow(diff: number) {
  if (diff > 0.01) return "↑";
  if (diff < -0.01) return "↓";
  return "—";
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function isUsableTeamStat(stat?: TeamStatLike | null) {
  if (!stat) return false;
  return (
    safeNumber(stat.pts) > 0 ||
    safeNumber(stat.opp_pts) > 0 ||
    safeNumber(stat.reb) > 0 ||
    safeNumber(stat.ast) > 0 ||
    safeNumber(stat.stl) > 0 ||
    safeNumber(stat.blk) > 0
  );
}

function buildFallbackTeamStat(
  gameId: string,
  events: EventFallbackRow[]
): TeamStatLike {
  const base = calcTeamStatsFromEvents(events, gameId);

  return {
    game_id: gameId,
    pts: safeNumber(base?.pts),
    opp_pts: safeNumber(base?.opp_pts),
    reb: safeNumber(base?.reb),
    ast: safeNumber(base?.ast),
    stl: safeNumber(base?.stl),
    blk: safeNumber(base?.blk),
    off_rating: 0,
    def_rating: 0,
    net_rating: 0,
    reb_rate: 0,
    tov_rate: 0,
    result:
      safeNumber(base?.pts) > safeNumber(base?.opp_pts)
        ? "W"
        : safeNumber(base?.pts) < safeNumber(base?.opp_pts)
        ? "L"
        : "D",
  };
}

export default function ViewerGamesPage() {
  const router = useRouter();

  const [games, setGames] = useState<GameRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerGameStats, setPlayerGameStats] = useState<PlayerGameStatsRow[]>(
    []
  );
  const [teamGameStats, setTeamGameStats] = useState<TeamGameStatsRow[]>([]);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<
    { game_id: string; player_id: string; is_starter?: boolean | null }[]
  >([]);
  const [events, setEvents] = useState<EventFallbackRow[]>([]);
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
      gamePlayersRes,
      eventsRes,
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

      supabase.from("game_players").select("game_id, player_id, is_starter"),

      supabase.from("events").select("game_id, event_type, team_side, is_undone"),
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
    if (gamePlayersRes.error) console.error(gamePlayersRes.error);
    if (eventsRes.error) console.error(eventsRes.error);

    setGames((gamesRes.data as GameRow[]) || []);
    setPlayers((playersRes.data as PlayerRow[]) || []);
    setPlayerGameStats((pgsRes.data as PlayerGameStatsRow[]) || []);
    setTeamGameStats((tgsRes.data as TeamGameStatsRow[]) || []);
    setInsights((insightsRes.data as InsightRow[]) || []);
    setGamePlayers(
      (gamePlayersRes.data as {
        game_id: string;
        player_id: string;
        is_starter?: boolean | null;
      }[]) || []
    );
    setEvents((eventsRes.data as EventFallbackRow[]) || []);
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

  const latestGame = finishedGames[0] || games[0] || null;

  const latestTeamStats = useMemo<TeamStatLike | null>(() => {
  if (!latestGame) return null;

  const stat = teamGameStats.find((row) => row.game_id === latestGame.id);

  if (stat && isUsableTeamStat(stat)) {
    return stat;
  }

  return buildFallbackTeamStat(latestGame.id, events);
}, [latestGame, teamGameStats, events]);

  const latestInsight = useMemo(() => {
    if (!latestGame) return null;
    return insights.find((row) => row.game_id === latestGame.id) || null;
  }, [latestGame, insights]);

  const recentFiveStats = useMemo(() => {
    return finishedGames.slice(0, 5).map((game) => {
      const stat = teamGameStats.find((row) => row.game_id === game.id);

      if (isUsableTeamStat(stat)) {
        return { game, stats: stat as TeamStatLike };
      }

      return {
        game,
        stats: buildFallbackTeamStat(game.id, events),
      };
    });
  }, [finishedGames, teamGameStats, events]);

  const recentThreeStats = recentFiveStats.slice(0, 3);
  const previousThreeStats = recentFiveStats.slice(3, 6);

  const recentRecord = useMemo(() => {
    let win = 0;
    let lose = 0;

    recentThreeStats.forEach(({ stats }) => {
      const pts = safeNumber(stats?.pts);
      const oppPts = safeNumber(stats?.opp_pts);
      if (pts > oppPts) win += 1;
      else if (pts < oppPts) lose += 1;
    });

    return `${win}勝${lose}敗`;
  }, [recentThreeStats]);

  const trendCards = useMemo(() => {
    const recentOff = avg(
      recentThreeStats.map((x) => safeNumber(x.stats?.off_rating))
    );
    const prevOff = avg(
      previousThreeStats.map((x) => safeNumber(x.stats?.off_rating))
    );

    const recentDef = avg(
      recentThreeStats.map((x) => safeNumber(x.stats?.def_rating))
    );
    const prevDef = avg(
      previousThreeStats.map((x) => safeNumber(x.stats?.def_rating))
    );

    const recentReb = avg(
      recentThreeStats.map((x) => safeNumber(x.stats?.reb_rate))
    );
    const prevReb = avg(
      previousThreeStats.map((x) => safeNumber(x.stats?.reb_rate))
    );

    const recentTov = avg(
      recentThreeStats.map((x) => safeNumber(x.stats?.tov_rate))
    );
    const prevTov = avg(
      previousThreeStats.map((x) => safeNumber(x.stats?.tov_rate))
    );

    return [
      {
        label: "進攻效率",
        value: round1(recentOff),
        diff: round1(recentOff - prevOff),
      },
      {
        label: "防守效率",
        value: round1(recentDef),
        diff: round1(recentDef - prevDef),
      },
      {
        label: "籃板率",
        value: round1(recentReb * 100),
        diff: round1((recentReb - prevReb) * 100),
        suffix: "%",
      },
      {
        label: "失誤率",
        value: round1(recentTov * 100),
        diff: round1((recentTov - prevTov) * 100),
        suffix: "%",
      },
    ];
  }, [recentThreeStats, previousThreeStats]);

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
      .sort((a, b) => b.plusMinus - a.plusMinus)
      .slice(0, 3);
  }, [latestGame, playerGameStats, players]);

  const rotationSummary = useMemo(() => {
    if (!latestGame) {
      return {
        starters: 0,
        bench: 0,
        topName: "—",
        topValue: 0,
      };
    }

    const starterIds = new Set(
      gamePlayers
        .filter((gp) => gp.game_id === latestGame.id && gp.is_starter)
        .map((gp) => gp.player_id)
    );

    const currentStats = playerGameStats.filter(
      (row) => row.game_id === latestGame.id
    );

    const starterRows = currentStats.filter((row) =>
      starterIds.has(row.player_id)
    );
    const benchRows = currentStats.filter(
      (row) => !starterIds.has(row.player_id)
    );

    const starterAvg = starterRows.length
      ? avg(starterRows.map((row) => safeNumber(row.plus_minus)))
      : 0;

    const benchAvg = benchRows.length
      ? avg(benchRows.map((row) => safeNumber(row.plus_minus)))
      : 0;

    const best = currentStats
      .map((row) => {
        const player = players.find((p) => p.id === row.player_id);
        return {
          name: player?.name || "—",
          value: safeNumber(row.plus_minus),
        };
      })
      .sort((a, b) => b.value - a.value)[0];

    return {
      starters: round1(starterAvg),
      bench: round1(benchAvg),
      topName: best?.name || "—",
      topValue: best?.value || 0,
    };
  }, [latestGame, gamePlayers, playerGameStats, players]);

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

  return (
    <main className="page">
      <div className="shell">
        <section className="hero">
          <div className="hero-main">
            <div className="hero-name">{viewerName}</div>
            <div className="hero-match">{getMatchName(latestGame)}</div>
            <div className="hero-score">
              {latestTeamStats
                ? `${safeNumber(latestTeamStats.pts)} - ${safeNumber(
                    latestTeamStats.opp_pts
                  )}`
                : "—"}
            </div>
            <div className="hero-result">
              {latestTeamStats
                ? safeNumber(latestTeamStats.pts) >
                  safeNumber(latestTeamStats.opp_pts)
                  ? "勝"
                  : safeNumber(latestTeamStats.pts) <
                    safeNumber(latestTeamStats.opp_pts)
                  ? "敗"
                  : "平"
                : "—"}
            </div>
            <div className="hero-date-row">
              <span>
                {getShortDate(latestGame?.game_date || latestGame?.created_at)}
              </span>
              <span>{getGameTypeLabel(latestGame)}</span>
            </div>
          </div>

          <div className="hero-stats">
            <div className="big-stat">
              <div className="big-stat-title">最近3場</div>
              <div className="big-stat-value">{recentRecord}</div>
            </div>
            <div className="big-stat">
              <div className="big-stat-title">進攻效率</div>
              <div className="big-stat-value">
                {round1(
                  avg(
                    recentThreeStats.map((x) =>
                      safeNumber(x.stats?.off_rating)
                    )
                  )
                )}
              </div>
            </div>
            <div className="big-stat">
              <div className="big-stat-title">防守效率</div>
              <div className="big-stat-value">
                {round1(
                  avg(
                    recentThreeStats.map((x) =>
                      safeNumber(x.stats?.def_rating)
                    )
                  )
                )}
              </div>
            </div>
            <div className="big-stat">
              <div className="big-stat-title">淨效率</div>
              <div className="big-stat-value">
                {round1(
                  avg(
                    recentThreeStats.map((x) =>
                      safeNumber(x.stats?.net_rating)
                    )
                  )
                )}
              </div>
            </div>
          </div>
        </section>

        {loading && <div className="simple-card center">讀取中</div>}
        {!loading && msg && <div className="simple-card center">{msg}</div>}

        {!loading && !msg && (
          <>
            <section className="triple-grid">
              <div className="section-card">
                <h2>問題</h2>
                <div className="bullet-list">
                  <div>{latestInsight?.key_problem_1 || "—"}</div>
                  <div>{latestInsight?.key_problem_2 || "—"}</div>
                  <div>{latestInsight?.key_problem_3 || "—"}</div>
                </div>
              </div>

              <div className="section-card">
                <h2>優勢</h2>
                <div className="bullet-list">
                  <div>{latestInsight?.positive_1 || "—"}</div>
                  <div>{latestInsight?.positive_2 || "—"}</div>
                  <div>{latestInsight?.positive_3 || "—"}</div>
                </div>
              </div>

              <div className="section-card">
                <h2>重點</h2>
                <div className="bullet-list">
                  <div>{latestInsight?.focus_1 || "—"}</div>
                  <div>{latestInsight?.focus_2 || "—"}</div>
                  <div>{latestInsight?.focus_3 || "—"}</div>
                </div>
              </div>
            </section>

            <section className="trend-grid">
              {trendCards.map((item) => (
                <div className="trend-card" key={item.label}>
                  <div className="trend-title">{item.label}</div>
                  <div className="trend-value">
                    {item.value}
                    {item.suffix || ""}
                  </div>
                  <div
                    className={`trend-diff ${
                      item.diff > 0 ? "up" : item.diff < 0 ? "down" : ""
                    }`}
                  >
                    {getArrow(item.diff)} {item.diff > 0 ? "+" : ""}
                    {item.diff}
                    {item.suffix || ""}
                  </div>
                </div>
              ))}
            </section>

            <section className="players-grid">
              {latestPlayers.length > 0 ? (
                latestPlayers.map((player) => (
                  <div className="player-card" key={player.id}>
                    <div className="player-name">
                      #{player.number ?? "-"} {player.name}
                    </div>
                    <div className="player-plus">
                      {player.plusMinus >= 0 ? "+" : ""}
                      {player.plusMinus}
                    </div>
                    <div className="player-line">
                      {player.pts}分 {player.reb}板 {player.ast}助
                    </div>
                    <div className="player-line">{player.minutes}分</div>
                    <div className="player-line strong">
                      {player.pts10} / {player.reb10} / {player.ast10}
                    </div>
                  </div>
                ))
              ) : (
                <div className="simple-card center">尚無球員資料</div>
              )}
            </section>

            <section className="rotation-grid">
              <div className="rotation-card">
                <div className="rotation-title">先發</div>
                <div className="rotation-value">
                  {rotationSummary.starters >= 0 ? "+" : ""}
                  {rotationSummary.starters}
                </div>
              </div>
              <div className="rotation-card">
                <div className="rotation-title">替補</div>
                <div className="rotation-value">
                  {rotationSummary.bench >= 0 ? "+" : ""}
                  {rotationSummary.bench}
                </div>
              </div>
              <div className="rotation-card">
                <div className="rotation-title">{rotationSummary.topName}</div>
                <div className="rotation-value">
                  {rotationSummary.topValue >= 0 ? "+" : ""}
                  {rotationSummary.topValue}
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
          max-width: 1280px;
          margin: 0 auto;
          display: grid;
          gap: 22px;
        }

        .hero {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 28px;
          padding: 28px;
          backdrop-filter: blur(10px);
        }

        .hero-main {
          display: grid;
          gap: 10px;
          align-content: center;
        }

        .hero-name {
          font-size: 30px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }

        .hero-match {
          font-size: 34px;
          font-weight: 900;
          line-height: 1.15;
        }

        .hero-score {
          font-size: 64px;
          font-weight: 900;
          line-height: 1;
          color: #ff9d2f;
        }

        .hero-result {
          font-size: 28px;
          font-weight: 800;
        }

        .hero-date-row {
          display: flex;
          gap: 12px;
          font-size: 18px;
          font-weight: 700;
          opacity: 0.9;
        }

        .hero-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .big-stat {
          border-radius: 22px;
          padding: 22px 18px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: grid;
          gap: 8px;
          align-content: center;
          min-height: 132px;
        }

        .big-stat-title {
          font-size: 20px;
          font-weight: 800;
        }

        .big-stat-value {
          font-size: 42px;
          font-weight: 900;
          line-height: 1;
        }

        .triple-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .section-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 24px;
          display: grid;
          gap: 18px;
        }

        .section-card h2 {
          margin: 0;
          font-size: 28px;
          font-weight: 900;
        }

        .bullet-list {
          display: grid;
          gap: 14px;
        }

        .bullet-list div {
          font-size: 24px;
          font-weight: 800;
          line-height: 1.3;
        }

        .trend-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }

        .trend-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 24px;
          display: grid;
          gap: 12px;
        }

        .trend-title {
          font-size: 22px;
          font-weight: 800;
        }

        .trend-value {
          font-size: 44px;
          font-weight: 900;
          line-height: 1;
        }

        .trend-diff {
          font-size: 24px;
          font-weight: 900;
        }

        .trend-diff.up {
          color: #4ade80;
        }

        .trend-diff.down {
          color: #f87171;
        }

        .players-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .player-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 24px;
          display: grid;
          gap: 10px;
        }

        .player-name {
          font-size: 26px;
          font-weight: 900;
        }

        .player-plus {
          font-size: 54px;
          font-weight: 900;
          line-height: 1;
          color: #c084fc;
        }

        .player-line {
          font-size: 22px;
          font-weight: 800;
        }

        .player-line.strong {
          color: #ffb74d;
        }

        .rotation-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .rotation-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 24px;
          display: grid;
          gap: 10px;
          text-align: center;
        }

        .rotation-title {
          font-size: 24px;
          font-weight: 800;
        }

        .rotation-value {
          font-size: 52px;
          font-weight: 900;
          line-height: 1;
        }

        .menu-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
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

        @media (max-width: 1100px) {
          .hero,
          .triple-grid,
          .trend-grid,
          .players-grid,
          .rotation-grid,
          .menu-grid {
            grid-template-columns: 1fr;
          }

          .hero-score {
            font-size: 52px;
          }

          .hero-match {
            font-size: 28px;
          }
        }
      `}</style>
    </main>
  );
}