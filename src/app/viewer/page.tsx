"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearRole, getViewerName } from "@/lib/roles";

export default function ViewerPage() {
  const router = useRouter();
  const [viewerName, setViewerName] = useState("");

  useEffect(() => {
    const name = getViewerName();

    if (!name) {
      router.push("/");
      return;
    }

    setViewerName(name);
  }, [router]);

  function handleLogout() {
    clearRole();
    router.push("/");
  }

  function handleOpenGameList() {
    router.push("/games/viewer");
  }

  function handleOpenStatsCenter() {
    router.push("/games/box");
  }

  return (
    <main className="viewer-page">
      <div className="bg-overlay" />
      <div className="court-lines" />
      <div className="mesh-layer" />
      <div className="glow glow-left" />
      <div className="glow glow-right" />
      <div className="basketball basketball-1" />
      <div className="basketball basketball-2" />

      <div className="viewer-shell">
        <section className="hero-card">
          <div className="hero-panel">
            <div className="hero-panel-label">COURTSIDE</div>
            <div className="hero-panel-main">VIEWER</div>
            <div className="hero-panel-sub">LIVE / STATS / HISTORY</div>
          </div>

          <div className="hero-top">
            <div className="hero-copy">
              <div className="badge">VIEWER MODE</div>

              <h1>
                歡迎回來，
                <span>{viewerName || "Viewer"}</span>
              </h1>

              <p>
                從這裡快速進入比賽列表與數據中心，查看即時賽況、歷史賽事與統計內容。
              </p>

              <div className="hero-stats">
                <div className="hero-stat">
                  <span className="hero-stat-label">ACCESS</span>
                  <strong>LIVE GAMES</strong>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-label">DATA</span>
                  <strong>TEAM STATS</strong>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat-label">MODE</span>
                  <strong>VIEWER</strong>
                </div>
              </div>
            </div>

            <button onClick={handleLogout} className="logout-btn">
              LOGOUT
            </button>
          </div>

          <div className="hero-strip">
            <div className="strip-dot" />
            <span>COURTSIDE VIEWER DASHBOARD</span>
          </div>
        </section>

        <section className="grid-area">
          <button
            onClick={handleOpenGameList}
            className="feature-card feature-card-orange"
          >
            <div className="card-glow" />
            <div className="card-shine" />

            <div className="feature-top">
              <div className="feature-tag">MATCHES</div>
              <div className="feature-index">01</div>
            </div>

            <div className="feature-icon">🏀</div>
            <div className="feature-title">比賽列表</div>
            <div className="feature-desc">
              進入直播中的比賽與歷史比賽頁面，快速查看目前可觀看的所有賽事。
            </div>

            <div className="feature-mini-row">
              <span>LIVE</span>
              <span>HISTORY</span>
              <span>WATCH</span>
            </div>

            <div className="feature-action">
              <span>ENTER</span>
              <span className="arrow">→</span>
            </div>
          </button>

          <button
            onClick={handleOpenStatsCenter}
            className="feature-card feature-card-blue"
          >
            <div className="card-glow" />
            <div className="card-shine" />

            <div className="feature-top">
              <div className="feature-tag">STATS</div>
              <div className="feature-index">02</div>
            </div>

            <div className="feature-icon">📊</div>
            <div className="feature-title">數據中心</div>
            <div className="feature-desc">
              查看球員數據、團隊統計、排行榜，以及之後延伸的更多分析內容。
            </div>

            <div className="feature-mini-row">
              <span>PLAYER</span>
              <span>TEAM</span>
              <span>RANK</span>
            </div>

            <div className="feature-action">
              <span>ENTER</span>
              <span className="arrow">→</span>
            </div>
          </button>
        </section>
      </div>

      <style jsx>{`
        .viewer-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          padding: 24px;
          background:
            radial-gradient(circle at 50% 0%, rgba(255, 140, 0, 0.18), transparent 30%),
            radial-gradient(circle at 0% 100%, rgba(255, 98, 0, 0.12), transparent 30%),
            radial-gradient(circle at 100% 100%, rgba(85, 140, 255, 0.08), transparent 28%),
            linear-gradient(180deg, #0b0b0d 0%, #101014 55%, #060606 100%);
          color: #fff;
        }

        .bg-overlay {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03), transparent 20%),
            radial-gradient(circle at center, transparent 45%, rgba(0, 0, 0, 0.3) 100%);
          pointer-events: none;
        }

        .mesh-layer {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: radial-gradient(circle at center, black 30%, transparent 85%);
          opacity: 0.28;
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
          border-left: 2px solid rgba(255, 255, 255, 0.08);
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
            inset 10px 10px 20px rgba(255, 255, 255, 0.08),
            0 20px 50px rgba(0, 0, 0, 0.35);
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

        .viewer-shell {
          position: relative;
          z-index: 2;
          max-width: 1180px;
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
            linear-gradient(
              135deg,
              rgba(255, 140, 0, 0.12),
              transparent 28%,
              transparent 70%,
              rgba(255, 140, 0, 0.08)
            ),
            linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 18%);
          pointer-events: none;
        }

        .hero-card::after {
          content: "VIEWER";
          position: absolute;
          right: 28px;
          bottom: -8px;
          font-size: clamp(60px, 10vw, 120px);
          font-weight: 1000;
          letter-spacing: -0.06em;
          color: rgba(255, 255, 255, 0.04);
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
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 16px 34px rgba(0, 0, 0, 0.26),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          text-align: right;
        }

        .hero-panel-label {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.16em;
          color: rgba(255, 210, 160, 0.64);
        }

        .hero-panel-main {
          margin-top: 4px;
          font-size: 20px;
          font-weight: 1000;
          letter-spacing: 0.08em;
          color: #fff;
        }

        .hero-panel-sub {
          margin-top: 4px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.52);
          letter-spacing: 0.12em;
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
          max-width: 720px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          padding: 8px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #fff7ed;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
          margin-bottom: 16px;
        }

        .hero-top h1 {
          margin: 0;
          font-size: clamp(34px, 6vw, 58px);
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -0.04em;
          color: #ffffff;
        }

        .hero-top h1 span {
          margin-left: 10px;
          background: linear-gradient(135deg, #ffcc80 0%, #f48c06 60%, #ffb347 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-top p {
          margin: 14px 0 0;
          max-width: 660px;
          color: rgba(255, 245, 235, 0.76);
          font-size: 15px;
          line-height: 1.8;
        }

        .hero-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 20px;
        }

        .hero-stat {
          min-width: 120px;
          padding: 12px 14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        .hero-stat-label {
          display: block;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.14em;
          color: rgba(255, 214, 170, 0.62);
          margin-bottom: 6px;
        }

        .hero-stat strong {
          font-size: 14px;
          font-weight: 900;
          color: white;
          letter-spacing: 0.04em;
        }

        .logout-btn {
          border: none;
          border-radius: 16px;
          padding: 14px 18px;
          min-width: 120px;
          cursor: pointer;
          background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
          color: white;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.14em;
          box-shadow:
            0 16px 32px rgba(185, 28, 28, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.18);
          transition: all 0.22s ease;
        }

        .logout-btn:hover {
          transform: translateY(-2px);
          box-shadow:
            0 22px 40px rgba(185, 28, 28, 0.34),
            0 0 22px rgba(239, 68, 68, 0.18);
        }

        .hero-strip {
          position: relative;
          z-index: 1;
          margin-top: 22px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(255, 230, 205, 0.52);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.14em;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 18px;
        }

        .strip-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: linear-gradient(135deg, #ffb347 0%, #f48c06 100%);
          box-shadow: 0 0 16px rgba(244, 140, 6, 0.4);
        }

        .grid-area {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }

        .feature-card {
          position: relative;
          overflow: hidden;
          text-align: left;
          width: 100%;
          padding: 28px;
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            linear-gradient(180deg, rgba(22, 22, 24, 0.96) 0%, rgba(8, 8, 10, 0.98) 100%);
          color: white;
          cursor: pointer;
          transition:
            transform 0.24s ease,
            box-shadow 0.24s ease,
            border-color 0.24s ease;
        }

        .feature-card:hover {
          transform: translateY(-6px);
        }

        .feature-card-orange {
          box-shadow:
            0 18px 40px rgba(0, 0, 0, 0.38),
            0 0 0 1px rgba(255, 140, 0, 0.05);
        }

        .feature-card-orange:hover {
          border-color: rgba(255, 166, 0, 0.22);
          box-shadow:
            0 28px 54px rgba(0, 0, 0, 0.45),
            0 0 30px rgba(244, 140, 6, 0.14);
        }

        .feature-card-blue {
          box-shadow:
            0 18px 40px rgba(0, 0, 0, 0.38),
            0 0 0 1px rgba(96, 165, 250, 0.05);
        }

        .feature-card-blue:hover {
          border-color: rgba(96, 165, 250, 0.24);
          box-shadow:
            0 28px 54px rgba(0, 0, 0, 0.45),
            0 0 30px rgba(96, 165, 250, 0.16);
        }

        .card-glow {
          position: absolute;
          width: 180px;
          height: 180px;
          right: -40px;
          top: -40px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(244, 140, 6, 0.22) 0%, transparent 70%);
          pointer-events: none;
        }

        .feature-card-blue .card-glow {
          background: radial-gradient(circle, rgba(96, 165, 250, 0.24) 0%, transparent 70%);
        }

        .card-shine {
          content: "";
          position: absolute;
          top: -120%;
          left: -35%;
          width: 40%;
          height: 260%;
          transform: rotate(18deg);
          background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(255, 255, 255, 0.07) 45%,
            transparent 100%
          );
          pointer-events: none;
          transition: transform 0.5s ease;
        }

        .feature-card:hover .card-shine {
          transform: translateX(220%) rotate(18deg);
        }

        .feature-top {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 18px;
        }

        .feature-tag {
          display: inline-flex;
          align-items: center;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #fff7ed;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
        }

        .feature-index {
          color: rgba(255, 210, 160, 0.34);
          font-size: 22px;
          font-weight: 1000;
          letter-spacing: -0.03em;
        }

        .feature-icon {
          position: relative;
          z-index: 1;
          font-size: 34px;
          margin-bottom: 14px;
        }

        .feature-title {
          position: relative;
          z-index: 1;
          font-size: 30px;
          font-weight: 1000;
          color: #ffffff;
          margin-bottom: 12px;
          letter-spacing: -0.04em;
        }

        .feature-desc {
          position: relative;
          z-index: 1;
          color: #b8b8be;
          line-height: 1.8;
          font-size: 15px;
          min-height: 84px;
          max-width: 460px;
        }

        .feature-mini-row {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 16px;
        }

        .feature-mini-row span {
          padding: 7px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.07);
          color: rgba(255, 255, 255, 0.72);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .feature-action {
          position: relative;
          z-index: 1;
          margin-top: 24px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: #ffbe6b;
          font-weight: 900;
          font-size: 13px;
          letter-spacing: 0.16em;
        }

        .feature-card-blue .feature-action {
          color: #93c5fd;
        }

        .arrow {
          transition: transform 0.2s ease;
        }

        .feature-card:hover .arrow {
          transform: translateX(4px);
        }

        @keyframes floatBall1 {
          0%,
          100% {
            transform: translateY(0px) rotate(-16deg);
          }
          50% {
            transform: translateY(-16px) rotate(-10deg);
          }
        }

        @keyframes floatBall2 {
          0%,
          100% {
            transform: translateY(0px) rotate(18deg);
          }
          50% {
            transform: translateY(14px) rotate(24deg);
          }
        }

        @media (max-width: 768px) {
          .viewer-page {
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

          .feature-title {
            font-size: 26px;
          }

          .feature-desc {
            min-height: auto;
          }

          .hero-stats {
            gap: 10px;
          }

          .hero-stat {
            min-width: calc(50% - 8px);
          }
        }

        @media (max-width: 520px) {
          .viewer-page {
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

          .hero-top p {
            font-size: 14px;
            line-height: 1.7;
          }

          .hero-stat {
            min-width: 100%;
          }

          .logout-btn {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}