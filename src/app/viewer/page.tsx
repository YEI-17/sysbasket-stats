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
};

type PlayerImpactCard = {
  id: string;
  name: string;
  number: number | null;
  position: string;
  games: number;
  avgPts: number;
  avgReb: number;
  avgAst: number;
  avgPlusMinus: number;
  impactScore: number;
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

function formatGameDate(game?: GameRow | null) {
  const raw = game?.game_date || game?.created_at;
  if (!raw) return "未提供日期";

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "未提供日期";

  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function getMatchName(game?: GameRow | null) {
  if (!game) return "尚無比賽資料";
  return `${game.teamA || "我方"} vs ${game.teamB || "對手"}`;
}

function safeNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function getTrendLabel(diff: number) {
  if (diff > 0.8) return "上升中";
  if (diff < -0.8) return "需要調整";
  return "穩定";
}

export default function ViewerGamesPage() {
  const router = useRouter();

  const [games, setGames] = useState<GameRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playerGameStats, setPlayerGameStats] = useState<PlayerGameStatsRow[]>([]);
  const [teamGameStats, setTeamGameStats] = useState<TeamGameStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState("");

  const fetchAll = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setMsg("");

    const [gamesRes, playersRes, pgsRes, tgsRes] = await Promise.all([
      supabase
        .from("games")
        .select("id, teamA, teamB, status, game_date, created_at")
        .order("game_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),

      supabase
        .from("players")
        .select("id, name, number, position, active")
        .eq("active", true)
        .order("number", { ascending: true }),

      supabase
        .from("player_game_stats")
        .select("player_id, game_id, pts, reb, ast, stl, blk, plus_minus"),

      supabase
        .from("team_game_stats")
        .select("game_id, team_side, pts, opp_pts, reb, ast, stl, blk"),
    ]);

    if (gamesRes.error) {
      console.error(gamesRes.error);
      setMsg("讀取比賽資料失敗");
      if (showLoading) setLoading(false);
      else setRefreshing(false);
      return;
    }

    if (playersRes.error) {
      console.error(playersRes.error);
      setMsg("讀取球員資料失敗");
      if (showLoading) setLoading(false);
      else setRefreshing(false);
      return;
    }

    if (pgsRes.error) {
      console.error("player_game_stats 讀取失敗：", pgsRes.error);
    }

    if (tgsRes.error) {
      console.error("team_game_stats 讀取失敗：", tgsRes.error);
    }

    setGames((gamesRes.data as GameRow[]) || []);
    setPlayers((playersRes.data as PlayerRow[]) || []);
    setPlayerGameStats((pgsRes.data as PlayerGameStatsRow[]) || []);
    setTeamGameStats((tgsRes.data as TeamGameStatsRow[]) || []);

    if (showLoading) {
      setLoading(false);
    } else {
      setRefreshing(false);
    }
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

    const now = new Date().toISOString();

    await supabase
      .from("user_sessions")
      .update({
        last_seen_at: now,
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

    void fetchAll(true);
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
      } else if (document.visibilityState === "visible") {
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

  async function handleRefresh() {
    await updateSessionHeartbeat();
    await fetchAll(false);
  }

  function handleBack() {
    router.push("/viewer");
  }

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

  const viewerName = useMemo(() => getViewerName() || "觀眾", []);
  const liveGames = useMemo(
    () => games.filter((game) => normalizeStatus(game.status) === "直播中"),
    [games]
  );
  const finishedGames = useMemo(
    () => games.filter((game) => normalizeStatus(game.status) === "已結束"),
    [games]
  );
  const upcomingGames = useMemo(
    () => games.filter((game) => normalizeStatus(game.status) === "未開始"),
    [games]
  );

  const liveGamesCount = liveGames.length;
  const totalGames = games.length;
  const totalPlayers = players.length;

  const latestLiveGame = liveGames[0] || null;
  const latestFinishedGame = finishedGames[0] || null;
  const latestUpcomingGame = upcomingGames[0] || null;

  const latestFinishedTeamStats = useMemo(() => {
    if (!latestFinishedGame) return null;
    return (
      teamGameStats.find((row) => row.game_id === latestFinishedGame.id) || null
    );
  }, [latestFinishedGame, teamGameStats]);

  const playerImpactTop3 = useMemo<PlayerImpactCard[]>(() => {
    const map = new Map<
      string,
      {
        player: PlayerRow;
        games: number;
        pts: number;
        reb: number;
        ast: number;
        plusMinus: number;
        impactTotal: number;
      }
    >();

    for (const player of players) {
      map.set(player.id, {
        player,
        games: 0,
        pts: 0,
        reb: 0,
        ast: 0,
        plusMinus: 0,
        impactTotal: 0,
      });
    }

    for (const row of playerGameStats) {
      const entry = map.get(row.player_id);
      if (!entry) continue;

      const pts = safeNumber(row.pts);
      const reb = safeNumber(row.reb);
      const ast = safeNumber(row.ast);
      const stl = safeNumber(row.stl);
      const blk = safeNumber(row.blk);
      const plusMinus = safeNumber(row.plus_minus);

      const impact =
        pts * 1 +
        reb * 1.2 +
        ast * 1.5 +
        stl * 2 +
        blk * 2 +
        plusMinus * 0.8;

      entry.games += 1;
      entry.pts += pts;
      entry.reb += reb;
      entry.ast += ast;
      entry.plusMinus += plusMinus;
      entry.impactTotal += impact;
    }

    return Array.from(map.values())
      .filter((entry) => entry.games > 0)
      .map((entry) => ({
        id: entry.player.id,
        name: entry.player.name,
        number: entry.player.number,
        position: entry.player.position || "未設定",
        games: entry.games,
        avgPts: round1(entry.pts / entry.games),
        avgReb: round1(entry.reb / entry.games),
        avgAst: round1(entry.ast / entry.games),
        avgPlusMinus: round1(entry.plusMinus / entry.games),
        impactScore: round1(entry.impactTotal / entry.games),
      }))
      .sort((a, b) => b.impactScore - a.impactScore)
      .slice(0, 3);
  }, [players, playerGameStats]);

  const recentFinishedGameStats = useMemo(() => {
    const recentFinished = finishedGames.slice(0, 6);

    return recentFinished
      .map((game) => {
        const stats = teamGameStats.find((row) => row.game_id === game.id);
        return {
          game,
          stats,
        };
      })
      .filter((item) => item.stats);
  }, [finishedGames, teamGameStats]);

  const growthSummary = useMemo(() => {
    const latest3 = recentFinishedGameStats.slice(0, 3);
    const previous3 = recentFinishedGameStats.slice(3, 6);

    const average = (
      rows: { stats: TeamGameStatsRow | undefined | null }[],
      key: keyof TeamGameStatsRow
    ) => {
      if (!rows.length) return 0;
      const sum = rows.reduce((acc, row) => acc + safeNumber(row.stats?.[key] as number), 0);
      return sum / rows.length;
    };

    const latestPts = average(latest3, "pts");
    const previousPts = average(previous3, "pts");
    const latestAst = average(latest3, "ast");
    const previousAst = average(previous3, "ast");
    const latestReb = average(latest3, "reb");
    const previousReb = average(previous3, "reb");

    return {
      latestPts: round1(latestPts),
      previousPts: round1(previousPts),
      ptsDiff: round1(latestPts - previousPts),
      latestAst: round1(latestAst),
      previousAst: round1(previousAst),
      astDiff: round1(latestAst - previousAst),
      latestReb: round1(latestReb),
      previousReb: round1(previousReb),
      rebDiff: round1(latestReb - previousReb),
    };
  }, [recentFinishedGameStats]);

  const postGameSummary = useMemo(() => {
    if (!latestFinishedGame || !latestFinishedTeamStats) {
      return {
        title: "尚未建立賽後報告",
        description: "目前還沒有可分析的已結束比賽資料。",
        resultLabel: "等待資料",
      };
    }

    const ourPts = safeNumber(latestFinishedTeamStats.pts);
    const oppPts = safeNumber(latestFinishedTeamStats.opp_pts);
    const diff = ourPts - oppPts;

    let resultLabel = "平手";
    if (diff > 0) resultLabel = "贏球";
    if (diff < 0) resultLabel = "落敗";

    let description = `最近一場比賽為 ${getMatchName(latestFinishedGame)}，比數 ${ourPts} : ${oppPts}。`;

    if (diff >= 10) {
      description += " 這是一場整體掌控度不錯的比賽，代表團隊表現穩定。";
    } else if (diff > 0) {
      description += " 這場比賽成功拿下勝利，代表關鍵球處理有發揮。";
    } else if (diff <= -10) {
      description += " 分差較大，建議從防守輪轉與失分來源去檢查。";
    } else if (diff < 0) {
      description += " 比賽差距不大，代表還有很高的調整空間。";
    } else {
      description += " 雙方表現接近，適合回頭檢查關鍵時段內容。";
    }

    return {
      title: `${formatGameDate(latestFinishedGame)} 賽後摘要`,
      description,
      resultLabel,
    };
  }, [latestFinishedGame, latestFinishedTeamStats]);

  return (
    <main className="page">
      <div className="bg-overlay" />
      <div className="court-lines" />
      <div className="mesh-layer" />
      <div className="glow glow-left" />
      <div className="glow glow-right" />
      <div className="basketball basketball-1" />
      <div className="basketball basketball-2" />

      <div className="shell">
        <section className="hero-card">
          <div className="hero-panel">
            <div className="hero-panel-label">目前使用者</div>
            <div className="hero-panel-main">{viewerName}</div>
          </div>

          <div className="hero-top">
            <div className="hero-copy">
              <div className="badge">觀賽首頁</div>
              <h1>快速查看比賽、洞察與成長趨勢</h1>

              <div className="hero-stats three-stats">
                <div className="hero-stat">
                  <span className="hero-stat-label">直播中</span>
                  <strong>{liveGamesCount}</strong>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-label">全部賽事</span>
                  <strong>{totalGames}</strong>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-label">球員人數</span>
                  <strong>{totalPlayers}</strong>
                </div>
              </div>
            </div>

            <div className="action-group">
              <button
                onClick={() => void handleRefresh()}
                className="refresh-btn"
                disabled={refreshing}
              >
                {refreshing ? "重新整理中..." : "重新整理"}
              </button>
              <button onClick={handleBack} className="back-btn">
                返回
              </button>
            </div>
          </div>
        </section>

        {loading && <div className="info-card">讀取中...</div>}

        {!loading && msg && <div className="error-card">{msg}</div>}

        {!loading && !msg && (
          <>
            <section className="insight-grid">
              <div className="panel-card insight-card wide">
                <div className="panel-head">
                  <span className="panel-badge">即時洞察</span>
                  <span className="panel-kicker orange-text">01</span>
                </div>

                <h2>目前比賽重點</h2>

                <div className="insight-list">
                  <div className="insight-item">
                    <div className="insight-label">直播焦點</div>
                    <div className="insight-value">
                      {latestLiveGame
                        ? `${getMatchName(latestLiveGame)}`
                        : "目前沒有直播中的比賽"}
                    </div>
                    <div className="insight-sub">
                      {latestLiveGame
                        ? `${formatGameDate(latestLiveGame)}｜狀態：${normalizeStatus(
                            latestLiveGame.status
                          )}`
                        : "可在賽事中心查看全部賽況"}
                    </div>
                  </div>

                  <div className="insight-item">
                    <div className="insight-label">最新結束比賽</div>
                    <div className="insight-value">
                      {latestFinishedGame
                        ? `${getMatchName(latestFinishedGame)}`
                        : "尚無已結束比賽"}
                    </div>
                    <div className="insight-sub">
                      {latestFinishedGame
                        ? `${formatGameDate(latestFinishedGame)}｜可查看賽後摘要`
                        : "結束後會自動出現在這裡"}
                    </div>
                  </div>

                  <div className="insight-item">
                    <div className="insight-label">下一場賽事</div>
                    <div className="insight-value">
                      {latestUpcomingGame
                        ? `${getMatchName(latestUpcomingGame)}`
                        : "目前沒有待開打賽事"}
                    </div>
                    <div className="insight-sub">
                      {latestUpcomingGame
                        ? `${formatGameDate(latestUpcomingGame)}｜狀態：${normalizeStatus(
                            latestUpcomingGame.status
                          )}`
                        : "有新比賽時會顯示在這裡"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel-card impact-summary-card">
                <div className="panel-head">
                  <span className="panel-badge">球員影響力</span>
                  <span className="panel-kicker violet-text">02</span>
                </div>

                <h2>本季最有影響力球員</h2>

                {playerImpactTop3.length > 0 ? (
                  <div className="leader-box">
                    <div className="leader-name">
                      #{playerImpactTop3[0].number ?? "-"} {playerImpactTop3[0].name}
                    </div>
                    <div className="leader-score">
                      影響力分數 {playerImpactTop3[0].impactScore}
                    </div>
                    <div className="leader-meta">
                      {playerImpactTop3[0].position}・{playerImpactTop3[0].games} 場
                    </div>
                  </div>
                ) : (
                  <div className="empty-note">尚無球員數據可分析</div>
                )}

                <button className="mini-link violet-text" onClick={handleOpenPlayers}>
                  前往球員頁 →
                </button>
              </div>
            </section>

            <section className="card-grid">
              <button className="feature-card primary-card" onClick={handleOpenMatches}>
                <div className="feature-card-glow orange" />
                <div className="feature-card-number">01</div>
                <div className="feature-badge">賽事</div>
                <div className="feature-icon">🏀</div>
                <h2>賽事中心</h2>

                <div className="feature-tags">
                  <span>直播中 {liveGamesCount}</span>
                  <span>全部 {totalGames}</span>
                  <span>最新賽況</span>
                </div>

                <div className="feature-footer">
                  <span>查看賽事</span>
                  <span className="arrow">→</span>
                </div>
              </button>

              <button className="feature-card" onClick={handleOpenTeamStats}>
                <div className="feature-card-glow blue" />
                <div className="feature-card-number">02</div>
                <div className="feature-badge">團隊</div>
                <div className="feature-icon">📊</div>
                <h2>團隊數據</h2>

                <div className="feature-tags">
                  <span>整體表現</span>
                  <span>近期趨勢</span>
                  <span>賽後分析</span>
                </div>

                <div className="feature-footer blue-text">
                  <span>查看數據</span>
                  <span className="arrow">→</span>
                </div>
              </button>

              <button className="feature-card" onClick={handleOpenPlayers}>
                <div className="feature-card-glow violet" />
                <div className="feature-card-number">03</div>
                <div className="feature-badge">球員</div>
                <div className="feature-icon">👤</div>
                <h2>球員數據</h2>

                <div className="feature-tags">
                  <span>球員 {totalPlayers}</span>
                  <span>影響力評分</span>
                  <span>個人成長</span>
                </div>

                <div className="feature-footer violet-text">
                  <span>查看球員</span>
                  <span className="arrow">→</span>
                </div>
              </button>

              <button className="feature-card" onClick={handleOpenRankings}>
                <div className="feature-card-glow emerald" />
                <div className="feature-card-number">04</div>
                <div className="feature-badge">排行</div>
                <div className="feature-icon">🏆</div>
                <h2>數據排行榜</h2>

                <div className="feature-tags">
                  <span>得分</span>
                  <span>籃板</span>
                  <span>助攻</span>
                  <span>影響力</span>
                </div>

                <div className="feature-footer emerald-text">
                  <span>查看排行</span>
                  <span className="arrow">→</span>
                </div>
              </button>
            </section>

            <section className="lower-grid">
              <div className="panel-card">
                <div className="panel-head">
                  <span className="panel-badge">球員影響力排行</span>
                  <span className="panel-kicker violet-text">Top 3</span>
                </div>

                <h2>首頁重點球員</h2>

                {playerImpactTop3.length > 0 ? (
                  <div className="rank-list">
                    {playerImpactTop3.map((player, index) => (
                      <div className="rank-row" key={player.id}>
                        <div className="rank-left">
                          <div className="rank-index">{index + 1}</div>
                          <div>
                            <div className="rank-name">
                              #{player.number ?? "-"} {player.name}
                            </div>
                            <div className="rank-sub">
                              {player.position}｜{player.games} 場
                            </div>
                          </div>
                        </div>

                        <div className="rank-right">
                          <div className="rank-score">{player.impactScore}</div>
                          <div className="rank-meta">
                            {player.avgPts} 分 / {player.avgReb} 籃板 / {player.avgAst} 助攻
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-note">目前沒有可顯示的球員影響力資料。</div>
                )}
              </div>

              <div className="panel-card">
                <div className="panel-head">
                  <span className="panel-badge">賽後報告</span>
                  <span className="panel-kicker blue-text">最近一場</span>
                </div>

                <h2>{postGameSummary.title}</h2>

                <div className="summary-box">
                  <div className="summary-result">{postGameSummary.resultLabel}</div>
                  <p>{postGameSummary.description}</p>
                </div>

                {latestFinishedTeamStats && (
                  <div className="summary-stats">
                    <div className="mini-stat">
                      <span>得分</span>
                      <strong>{safeNumber(latestFinishedTeamStats.pts)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>失分</span>
                      <strong>{safeNumber(latestFinishedTeamStats.opp_pts)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>助攻</span>
                      <strong>{safeNumber(latestFinishedTeamStats.ast)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>籃板</span>
                      <strong>{safeNumber(latestFinishedTeamStats.reb)}</strong>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="growth-grid">
              <div className="panel-card growth-card">
                <div className="panel-head">
                  <span className="panel-badge">成長追蹤</span>
                  <span className="panel-kicker emerald-text">近期趨勢</span>
                </div>

                <h2>團隊近期變化</h2>

                <div className="growth-stats">
                  <div className="growth-item">
                    <div className="growth-title">平均得分</div>
                    <div className="growth-main">{growthSummary.latestPts}</div>
                    <div
                      className={`growth-diff ${
                        growthSummary.ptsDiff > 0
                          ? "up"
                          : growthSummary.ptsDiff < 0
                          ? "down"
                          : ""
                      }`}
                    >
                      {growthSummary.ptsDiff >= 0 ? "+" : ""}
                      {growthSummary.ptsDiff}｜{getTrendLabel(growthSummary.ptsDiff)}
                    </div>
                  </div>

                  <div className="growth-item">
                    <div className="growth-title">平均助攻</div>
                    <div className="growth-main">{growthSummary.latestAst}</div>
                    <div
                      className={`growth-diff ${
                        growthSummary.astDiff > 0
                          ? "up"
                          : growthSummary.astDiff < 0
                          ? "down"
                          : ""
                      }`}
                    >
                      {growthSummary.astDiff >= 0 ? "+" : ""}
                      {growthSummary.astDiff}｜{getTrendLabel(growthSummary.astDiff)}
                    </div>
                  </div>

                  <div className="growth-item">
                    <div className="growth-title">平均籃板</div>
                    <div className="growth-main">{growthSummary.latestReb}</div>
                    <div
                      className={`growth-diff ${
                        growthSummary.rebDiff > 0
                          ? "up"
                          : growthSummary.rebDiff < 0
                          ? "down"
                          : ""
                      }`}
                    >
                      {growthSummary.rebDiff >= 0 ? "+" : ""}
                      {growthSummary.rebDiff}｜{getTrendLabel(growthSummary.rebDiff)}
                    </div>
                  </div>
                </div>

                <div className="growth-note">
                  以上是最近 3 場相較前 3 場的團隊表現變化，能讓首頁直接顯示「有沒有進步」。
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <style jsx>{`
        .page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          padding: 24px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255, 140, 0, 0.18), transparent 30%),
            radial-gradient(circle at 0% 100%, rgba(255, 98, 0, 0.12), transparent 30%),
            radial-gradient(circle at 100% 100%, rgba(96, 165, 250, 0.08), transparent 28%),
            linear-gradient(180deg, #0b0b0d 0%, #101014 55%, #060606 100%);
          color: #fff;
        }

        .bg-overlay {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 20%),
            radial-gradient(circle at center, transparent 45%, rgba(0,0,0,0.28) 100%);
          pointer-events: none;
        }

        .mesh-layer {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: radial-gradient(circle at center, black 30%, transparent 85%);
          opacity: 0.24;
          pointer-events: none;
        }

        .court-lines {
          position: absolute;
          inset: 0;
          opacity: 0.18;
          pointer-events: none;
        }

        .court-lines::before,
        .court-lines::after {
          content: "";
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          border: 2px solid rgba(255, 255, 255, 0.1);
        }

        .court-lines::before {
          top: 8%;
          width: 72vw;
          max-width: 980px;
          height: 72vw;
          max-height: 980px;
          border-radius: 999px;
        }

        .court-lines::after {
          top: 0;
          bottom: 0;
          width: 0;
          border-left: 2px solid rgba(255,255,255,0.08);
          border-top: none;
          border-right: none;
          border-bottom: none;
        }

        .glow {
          position: absolute;
          border-radius: 999px;
          filter: blur(100px);
          pointer-events: none;
        }

        .glow-left {
          width: 340px;
          height: 340px;
          left: -60px;
          top: 120px;
          background: rgba(255, 119, 0, 0.22);
        }

        .glow-right {
          width: 340px;
          height: 340px;
          right: -60px;
          bottom: 60px;
          background: rgba(96, 165, 250, 0.12);
        }

        .basketball {
          position: absolute;
          border-radius: 50%;
          background:
            radial-gradient(circle at 30% 30%, #ffb347 0%, #f48c06 38%, #d96a00 70%, #9a4d00 100%);
          box-shadow:
            inset -18px -18px 40px rgba(0, 0, 0, 0.25),
            inset 10px 10px 20px rgba(255,255,255,0.08),
            0 20px 50px rgba(0,0,0,0.35);
          opacity: 0.12;
          pointer-events: none;
        }

        .basketball::before,
        .basketball::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50%;
        }

        .basketball::before {
          border-left: 3px solid rgba(35, 20, 5, 0.65);
          border-right: 3px solid rgba(35, 20, 5, 0.65);
          left: 28%;
          right: 28%;
        }

        .basketball::after {
          border-top: 3px solid rgba(35, 20, 5, 0.65);
          border-bottom: 3px solid rgba(35, 20, 5, 0.65);
          top: 28%;
          bottom: 28%;
        }

        .basketball-1 {
          width: 210px;
          height: 210px;
          top: 90px;
          right: 70px;
          transform: rotate(-16deg);
          animation: floatBall1 8s ease-in-out infinite;
        }

        .basketball-2 {
          width: 160px;
          height: 160px;
          bottom: 90px;
          left: 60px;
          transform: rotate(18deg);
          animation: floatBall2 10s ease-in-out infinite;
        }

        .shell {
          position: relative;
          z-index: 2;
          max-width: 1260px;
          margin: 0 auto;
        }

        .hero-card {
          position: relative;
          overflow: hidden;
          border-radius: 32px;
          padding: 32px;
          margin-bottom: 22px;
          background:
            linear-gradient(180deg, rgba(24, 24, 28, 0.96) 0%, rgba(10, 10, 12, 0.98) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 30px 80px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 140, 0, 0.08);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .hero-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(135deg, rgba(255,140,0,0.12), transparent 28%, transparent 70%, rgba(255,140,0,0.08)),
            linear-gradient(180deg, rgba(255,255,255,0.04), transparent 18%);
          pointer-events: none;
        }

        .hero-card::after {
          content: "HOME";
          position: absolute;
          right: 28px;
          bottom: -10px;
          font-size: clamp(54px, 10vw, 120px);
          font-weight: 1000;
          letter-spacing: -0.06em;
          color: rgba(255,255,255,0.04);
          pointer-events: none;
          user-select: none;
        }

        .hero-panel {
          position: absolute;
          top: 24px;
          right: 24px;
          z-index: 1;
          padding: 14px 16px;
          border-radius: 20px;
          background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow:
            0 16px 34px rgba(0,0,0,0.26),
            inset 0 1px 0 rgba(255,255,255,0.08);
          text-align: right;
        }

        .hero-panel-label {
          font-size: 11px;
          font-weight: 900;
          color: rgba(255, 210, 160, 0.72);
        }

        .hero-panel-main {
          margin-top: 4px;
          font-size: 20px;
          font-weight: 1000;
          color: #fff;
        }

        .hero-top {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          flex-wrap: wrap;
        }

        .hero-copy {
          max-width: 760px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          padding: 8px 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          color: #fff7ed;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          margin-bottom: 16px;
        }

        .hero-top h1 {
          margin: 0;
          font-size: clamp(34px, 6vw, 56px);
          line-height: 1.05;
          font-weight: 1000;
          letter-spacing: -0.04em;
          color: #ffffff;
        }

        .hero-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 20px;
        }

        .three-stats .hero-stat {
          min-width: 140px;
        }

        .hero-stat {
          padding: 12px 14px;
          border-radius: 18px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }

        .hero-stat-label {
          display: block;
          font-size: 11px;
          font-weight: 900;
          color: rgba(255, 214, 170, 0.72);
          margin-bottom: 6px;
        }

        .hero-stat strong {
          font-size: 18px;
          font-weight: 1000;
          color: white;
        }

        .action-group {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          position: relative;
          z-index: 1;
        }

        .refresh-btn,
        .back-btn {
          height: 46px;
          padding: 0 18px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.1);
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            border-color 0.2s ease,
            opacity 0.2s ease;
        }

        .refresh-btn {
          color: #fff;
          background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
          box-shadow: 0 14px 30px rgba(234, 88, 12, 0.22);
        }

        .refresh-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 18px 34px rgba(234, 88, 12, 0.3);
        }

        .refresh-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .back-btn {
          color: #fff;
          background: rgba(255,255,255,0.06);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .back-btn:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.1);
        }

        .insight-grid {
          display: grid;
          grid-template-columns: 1.4fr 0.8fr;
          gap: 18px;
          margin-bottom: 18px;
        }

        .panel-card {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          padding: 26px;
          background:
            linear-gradient(180deg, rgba(18,18,20,0.96) 0%, rgba(8,8,10,0.98) 100%);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow:
            0 18px 40px rgba(0,0,0,0.34),
            0 0 0 1px rgba(255,255,255,0.03);
        }

        .panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .panel-badge {
          display: inline-flex;
          align-items: center;
          padding: 8px 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          color: #ffffff;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.06em;
        }

        .panel-kicker {
          font-size: 14px;
          font-weight: 1000;
        }

        .panel-card h2 {
          margin: 0 0 18px;
          font-size: 26px;
          font-weight: 1000;
          letter-spacing: -0.03em;
        }

        .insight-list {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .insight-item {
          border-radius: 20px;
          padding: 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .insight-label {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 214, 170, 0.72);
          margin-bottom: 10px;
        }

        .insight-value {
          font-size: 18px;
          line-height: 1.35;
          font-weight: 900;
          color: #fff;
        }

        .insight-sub {
          margin-top: 8px;
          font-size: 13px;
          line-height: 1.5;
          color: rgba(255,255,255,0.66);
        }

        .impact-summary-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .leader-box {
          border-radius: 20px;
          padding: 18px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .leader-name {
          font-size: 22px;
          font-weight: 1000;
          line-height: 1.3;
        }

        .leader-score {
          margin-top: 10px;
          font-size: 16px;
          font-weight: 900;
          color: #c4b5fd;
        }

        .leader-meta {
          margin-top: 8px;
          font-size: 13px;
          color: rgba(255,255,255,0.68);
        }

        .mini-link {
          margin-top: 16px;
          padding: 0;
          border: none;
          background: transparent;
          text-align: left;
          cursor: pointer;
          font-size: 14px;
          font-weight: 900;
        }

        .card-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .feature-card {
          position: relative;
          overflow: hidden;
          text-align: left;
          width: 100%;
          min-height: 260px;
          padding: 28px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 28px;
          background:
            linear-gradient(180deg, rgba(18,18,20,0.96) 0%, rgba(8,8,10,0.98) 100%);
          color: white;
          cursor: pointer;
          transition:
            transform 0.24s ease,
            box-shadow 0.24s ease,
            border-color 0.24s ease;
          box-shadow:
            0 18px 40px rgba(0,0,0,0.34),
            0 0 0 1px rgba(255,255,255,0.03);
        }

        .feature-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255,255,255,0.14);
          box-shadow:
            0 26px 52px rgba(0,0,0,0.42),
            0 0 28px rgba(255,255,255,0.04);
        }

        .primary-card {
          border-color: rgba(244, 140, 6, 0.2);
          box-shadow:
            0 20px 44px rgba(0,0,0,0.38),
            0 0 28px rgba(244,140,6,0.08);
        }

        .feature-card-glow {
          position: absolute;
          width: 220px;
          height: 220px;
          right: -70px;
          top: -70px;
          border-radius: 999px;
          pointer-events: none;
        }

        .feature-card-glow.orange {
          background: radial-gradient(circle, rgba(244,140,6,0.22) 0%, transparent 72%);
        }

        .feature-card-glow.blue {
          background: radial-gradient(circle, rgba(96,165,250,0.22) 0%, transparent 72%);
        }

        .feature-card-glow.violet {
          background: radial-gradient(circle, rgba(168,85,247,0.22) 0%, transparent 72%);
        }

        .feature-card-glow.emerald {
          background: radial-gradient(circle, rgba(52,211,153,0.22) 0%, transparent 72%);
        }

        .feature-card-number {
          position: absolute;
          top: 24px;
          right: 24px;
          font-size: 20px;
          font-weight: 1000;
          letter-spacing: -0.03em;
          color: rgba(255, 214, 170, 0.5);
        }

        .feature-badge {
          display: inline-flex;
          align-items: center;
          padding: 8px 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          color: #ffffff;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.06em;
        }

        .feature-icon {
          margin-top: 24px;
          font-size: 42px;
          line-height: 1;
        }

        .feature-card h2 {
          margin: 18px 0 0;
          font-size: 24px;
          font-weight: 1000;
          letter-spacing: -0.03em;
          color: #fff;
        }

        .feature-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 24px;
        }

        .feature-tags span {
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.78);
          font-size: 12px;
          font-weight: 800;
        }

        .feature-footer {
          margin-top: 26px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: #ffbe6b;
          font-weight: 900;
          font-size: 14px;
        }

        .blue-text {
          color: #93c5fd;
        }

        .violet-text {
          color: #c4b5fd;
        }

        .emerald-text {
          color: #86efac;
        }

        .orange-text {
          color: #fdba74;
        }

        .arrow {
          transition: transform 0.2s ease;
        }

        .feature-card:hover .arrow {
          transform: translateX(4px);
        }

        .lower-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-top: 18px;
        }

        .rank-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .rank-row {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 18px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .rank-left {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .rank-index {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: rgba(168,85,247,0.14);
          border: 1px solid rgba(196,181,253,0.22);
          font-weight: 1000;
          color: #ddd6fe;
          flex-shrink: 0;
        }

        .rank-name {
          font-size: 16px;
          font-weight: 900;
          color: #fff;
          line-height: 1.3;
        }

        .rank-sub,
        .rank-meta {
          margin-top: 5px;
          font-size: 12px;
          color: rgba(255,255,255,0.66);
        }

        .rank-right {
          text-align: right;
          flex-shrink: 0;
        }

        .rank-score {
          font-size: 22px;
          font-weight: 1000;
          color: #c4b5fd;
        }

        .summary-box {
          border-radius: 20px;
          padding: 18px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .summary-box p {
          margin: 10px 0 0;
          font-size: 14px;
          line-height: 1.7;
          color: rgba(255,255,255,0.78);
        }

        .summary-result {
          font-size: 14px;
          font-weight: 1000;
          color: #93c5fd;
        }

        .summary-stats {
          margin-top: 14px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .mini-stat {
          padding: 14px 12px;
          border-radius: 16px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .mini-stat span {
          display: block;
          font-size: 12px;
          font-weight: 900;
          color: rgba(255,255,255,0.62);
          margin-bottom: 8px;
        }

        .mini-stat strong {
          font-size: 20px;
          font-weight: 1000;
          color: #fff;
        }

        .growth-grid {
          margin-top: 18px;
        }

        .growth-card {
          padding-bottom: 24px;
        }

        .growth-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .growth-item {
          border-radius: 20px;
          padding: 18px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
        }

        .growth-title {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255,255,255,0.62);
          margin-bottom: 10px;
        }

        .growth-main {
          font-size: 30px;
          font-weight: 1000;
          color: #fff;
          line-height: 1;
        }

        .growth-diff {
          margin-top: 10px;
          font-size: 13px;
          font-weight: 900;
          color: rgba(255,255,255,0.66);
        }

        .growth-diff.up {
          color: #86efac;
        }

        .growth-diff.down {
          color: #fca5a5;
        }

        .growth-note {
          margin-top: 16px;
          font-size: 13px;
          line-height: 1.7;
          color: rgba(255,255,255,0.68);
        }

        .empty-note {
          padding: 14px 0;
          color: rgba(255,255,255,0.66);
          font-size: 14px;
          line-height: 1.6;
        }

        .info-card,
        .error-card {
          border-radius: 20px;
          padding: 18px 20px;
          margin-bottom: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .info-card {
          background: rgba(16,16,18,0.95);
          color: #d4d4d8;
        }

        .error-card {
          background: rgba(127, 29, 29, 0.2);
          border: 1px solid rgba(248, 113, 113, 0.22);
          color: #fecaca;
        }

        @keyframes floatBall1 {
          0%, 100% {
            transform: translateY(0px) rotate(-16deg);
          }
          50% {
            transform: translateY(-16px) rotate(-10deg);
          }
        }

        @keyframes floatBall2 {
          0%, 100% {
            transform: translateY(0px) rotate(18deg);
          }
          50% {
            transform: translateY(14px) rotate(24deg);
          }
        }

        @media (max-width: 1100px) {
          .insight-grid,
          .lower-grid {
            grid-template-columns: 1fr;
          }

          .insight-list {
            grid-template-columns: 1fr;
          }

          .growth-stats {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 980px) {
          .card-grid {
            grid-template-columns: 1fr;
          }

          .summary-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 768px) {
          .page {
            padding: 16px;
          }

          .hero-card,
          .feature-card,
          .panel-card {
            border-radius: 24px;
          }

          .hero-card {
            padding: 24px;
          }

          .feature-card,
          .panel-card {
            padding: 22px;
          }

          .feature-card {
            min-height: 240px;
          }

          .hero-card::after {
            font-size: 64px;
            right: 18px;
            bottom: 6px;
          }

          .hero-panel {
            position: static;
            margin-bottom: 18px;
            text-align: left;
          }

          .basketball-1 {
            width: 150px;
            height: 150px;
            top: 70px;
            right: -20px;
          }

          .basketball-2 {
            width: 120px;
            height: 120px;
            bottom: 70px;
            left: -10px;
          }

          .hero-stats {
            gap: 10px;
          }

          .hero-stat {
            min-width: calc(50% - 8px);
          }

          .three-stats .hero-stat {
            min-width: calc(50% - 8px);
          }

          .feature-card h2,
          .panel-card h2 {
            font-size: 22px;
          }
        }

        @media (max-width: 520px) {
          .page {
            padding: 14px;
          }

          .hero-card {
            padding: 20px;
          }

          .feature-card,
          .panel-card {
            padding: 20px;
          }

          .hero-top h1 {
            font-size: 32px;
          }

          .hero-stat,
          .three-stats .hero-stat {
            min-width: 100%;
          }

          .action-group {
            width: 100%;
          }

          .refresh-btn,
          .back-btn {
            flex: 1;
          }

          .summary-stats {
            grid-template-columns: 1fr;
          }

          .rank-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .rank-right {
            text-align: left;
          }
        }
      `}</style>
    </main>
  );
}