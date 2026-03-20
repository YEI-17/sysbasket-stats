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

export default function ViewerGamesPage() {
  const router = useRouter();

  const [games, setGames] = useState<GameRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
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

    const [gamesRes, playersRes] = await Promise.all([
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

    setGames((gamesRes.data as GameRow[]) || []);
    setPlayers((playersRes.data as PlayerRow[]) || []);

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
  const liveGamesCount = useMemo(
    () => games.filter((game) => normalizeStatus(game.status) === "直播中").length,
    [games]
  );
  const totalGames = games.length;
  const totalPlayers = players.length;

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
              <h1>快速查看比賽與數據</h1>

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
                <span>命中率</span>
                <span>平均數據</span>
                <span>整體表現</span>
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
                <span>個人成績</span>
                <span>數據查看</span>
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
              </div>

              <div className="feature-footer emerald-text">
                <span>查看排行</span>
                <span className="arrow">→</span>
              </div>
            </button>
          </section>
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

        .arrow {
          transition: transform 0.2s ease;
        }

        .feature-card:hover .arrow {
          transform: translateX(4px);
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

        @media (max-width: 980px) {
          .card-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .page {
            padding: 16px;
          }

          .hero-card,
          .feature-card {
            border-radius: 24px;
          }

          .hero-card {
            padding: 24px;
          }

          .feature-card {
            padding: 22px;
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

          .feature-card h2 {
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

          .feature-card {
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
        }
      `}</style>
    </main>
  );
} 