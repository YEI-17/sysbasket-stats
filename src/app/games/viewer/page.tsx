"use client";

import React, { useEffect, useMemo, useState } from "react";
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

function formatGameDate(game: GameRow) {
  const raw = game.game_date ?? game.created_at ?? null;
  if (!raw) return "未提供日期";

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);

  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: raw.includes("T") ? "2-digit" : undefined,
    minute: raw.includes("T") ? "2-digit" : undefined,
    hour12: false,
  });
}

export default function ViewerGamesPage() {
  const router = useRouter();

  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const name = getViewerName();

    if (!name) {
      router.push("/");
      return;
    }

    fetchGames();
  }, [router]);

  async function fetchGames() {
    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, status, game_date, created_at")
      .order("game_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setMsg("讀取比賽資料失敗");
      setLoading(false);
      return;
    }

    setGames((data as GameRow[]) || []);
    setLoading(false);
  }

  function handleBack() {
    router.push("/viewer");
  }

  function handleOpenGame(gameId: string) {
    router.push(`/games/${gameId}/board`);
  }

  const liveGames = useMemo(() => {
    return games.filter((game) => normalizeStatus(game.status) === "直播中");
  }, [games]);

  const historyGames = useMemo(() => {
    return games.filter((game) => normalizeStatus(game.status) !== "直播中");
  }, [games]);

  return (
    <main className="page">
      <div className="bg-overlay" />
      <div className="court-lines" />
      <div className="glow glow-left" />
      <div className="glow glow-right" />
      <div className="basketball basketball-1" />
      <div className="basketball basketball-2" />

      <div className="shell">
        <section className="hero-card">
          <div className="hero-top">
            <div>
              <div className="badge">MATCH LIST</div>
              <h1>比賽列表</h1>
              <p>觀看直播中的比賽，或查看歷史比賽資料。</p>
            </div>

            <div className="action-group">
              <button onClick={fetchGames} className="refresh-btn">
                REFRESH
              </button>
              <button onClick={handleBack} className="back-btn">
                BACK
              </button>
            </div>
          </div>

          <div className="hero-strip">
            <div className="strip-dot" />
            <span>COURTSIDE MATCH CENTER</span>
          </div>
        </section>

        {loading && <div className="info-card">讀取中...</div>}

        {!loading && msg && <div className="error-card">{msg}</div>}

        {!loading && !msg && (
          <>
            <section className="section-block">
              <div className="section-header">
                <h2>直播中的比賽</h2>
                <div className="section-count">{liveGames.length}</div>
              </div>

              {liveGames.length === 0 ? (
                <div className="info-card">目前沒有進行中的比賽</div>
              ) : (
                <div className="game-list">
                  {liveGames.map((game, index) => (
                    <button
                      key={game.id}
                      onClick={() => handleOpenGame(game.id)}
                      className="game-card live-card"
                    >
                      <div className="card-glow" />
                      <div className="game-top">
                        <div className="team-wrap">
                          <div className="game-index">
                            {String(index + 1).padStart(2, "0")}
                          </div>
                          <div className="team-title">
                            {game.teamA || "主隊"} <span>vs</span> {game.teamB || "客隊"}
                          </div>
                          <div className="game-date">{formatGameDate(game)}</div>
                        </div>

                        <div className="live-badge">直播中</div>
                      </div>

                      <div className="game-bottom">
                        <span>ENTER LIVE VIEW</span>
                        <span className="arrow">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="section-block">
              <div className="section-header">
                <h2>歷史比賽</h2>
                <div className="section-count">{historyGames.length}</div>
              </div>

              {historyGames.length === 0 ? (
                <div className="info-card">目前還沒有歷史比賽資料</div>
              ) : (
                <div className="game-list">
                  {historyGames.map((game, index) => (
                    <button
                      key={game.id}
                      onClick={() => handleOpenGame(game.id)}
                      className="game-card"
                    >
                      <div className="card-glow" />
                      <div className="game-top">
                        <div className="team-wrap">
                          <div className="game-index">
                            {String(index + 1).padStart(2, "0")}
                          </div>
                          <div className="team-title small">
                            {game.teamA || "主隊"} <span>vs</span> {game.teamB || "客隊"}
                          </div>
                          <div className="game-date">{formatGameDate(game)}</div>
                        </div>

                        <div className={statusBadgeClass(normalizeStatus(game.status))}>
                          {normalizeStatus(game.status)}
                        </div>
                      </div>

                      <div className="game-bottom history">
                        <span>OPEN MATCH</span>
                        <span className="arrow">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
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
            radial-gradient(circle at 100% 100%, rgba(255, 180, 80, 0.08), transparent 28%),
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
          filter: blur(90px);
          pointer-events: none;
        }

        .glow-left {
          width: 320px;
          height: 320px;
          left: -60px;
          top: 120px;
          background: rgba(255, 119, 0, 0.22);
        }

        .glow-right {
          width: 320px;
          height: 320px;
          right: -60px;
          bottom: 60px;
          background: rgba(255, 170, 60, 0.16);
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
        }

        .basketball-2 {
          width: 160px;
          height: 160px;
          bottom: 90px;
          left: 60px;
          transform: rotate(18deg);
        }

        .shell {
          position: relative;
          z-index: 2;
          max-width: 1100px;
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

        .hero-top {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          flex-wrap: wrap;
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
          letter-spacing: 0.14em;
          margin-bottom: 16px;
        }

        .hero-top h1 {
          margin: 0;
          font-size: clamp(34px, 6vw, 56px);
          line-height: 1;
          font-weight: 1000;
          letter-spacing: -0.04em;
          color: #ffffff;
        }

        .hero-top p {
          margin: 14px 0 0;
          color: rgba(255, 245, 235, 0.76);
          font-size: 15px;
          line-height: 1.8;
        }

        .action-group {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .refresh-btn,
        .back-btn {
          border: none;
          border-radius: 16px;
          padding: 14px 18px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.14em;
          transition: all 0.22s ease;
        }

        .refresh-btn {
          background: linear-gradient(135deg, #ffb347 0%, #f48c06 55%, #d96a00 100%);
          color: white;
          box-shadow:
            0 18px 34px rgba(244, 140, 6, 0.28),
            inset 0 1px 0 rgba(255,255,255,0.24);
        }

        .back-btn {
          background: linear-gradient(180deg, rgba(36,36,40,0.96) 0%, rgba(15,15,18,0.98) 100%);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 14px 28px rgba(0,0,0,0.24);
        }

        .refresh-btn:hover,
        .back-btn:hover {
          transform: translateY(-2px);
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
          border-top: 1px solid rgba(255,255,255,0.08);
          padding-top: 18px;
        }

        .strip-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: linear-gradient(135deg, #ffb347 0%, #f48c06 100%);
          box-shadow: 0 0 16px rgba(244, 140, 6, 0.4);
        }

        .section-block {
          margin-bottom: 28px;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .section-header h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 1000;
          color: #fff;
          letter-spacing: -0.03em;
        }

        .section-count {
          min-width: 42px;
          height: 42px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          color: #ffddb4;
          font-size: 14px;
          font-weight: 900;
        }

        .game-list {
          display: grid;
          gap: 14px;
        }

        .game-card {
          position: relative;
          overflow: hidden;
          width: 100%;
          text-align: left;
          padding: 22px 24px;
          border-radius: 24px;
          color: white;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,0.08);
          background:
            linear-gradient(180deg, rgba(18,18,20,0.96) 0%, rgba(8,8,10,0.98) 100%);
          box-shadow:
            0 16px 34px rgba(0,0,0,0.34),
            0 0 0 1px rgba(255,140,0,0.04);
          transition:
            transform 0.24s ease,
            box-shadow 0.24s ease,
            border-color 0.24s ease;
        }

        .live-card {
          border-color: rgba(239, 68, 68, 0.18);
          box-shadow:
            0 18px 40px rgba(0,0,0,0.36),
            0 0 28px rgba(239, 68, 68, 0.08);
        }

        .game-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 166, 0, 0.18);
          box-shadow:
            0 24px 46px rgba(0,0,0,0.42),
            0 0 26px rgba(244, 140, 6, 0.12);
        }

        .card-glow {
          position: absolute;
          width: 180px;
          height: 180px;
          right: -50px;
          top: -50px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(244,140,6,0.2) 0%, transparent 70%);
          pointer-events: none;
        }

        .game-top {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .team-wrap {
          min-width: 0;
        }

        .game-index {
          margin-bottom: 10px;
          color: rgba(255, 210, 160, 0.34);
          font-size: 13px;
          font-weight: 1000;
          letter-spacing: 0.18em;
        }

        .team-title {
          font-size: 24px;
          font-weight: 1000;
          color: #ffffff;
          letter-spacing: -0.04em;
          line-height: 1.2;
        }

        .team-title.small {
          font-size: 22px;
        }

        .team-title span {
          color: #ffbe6b;
          font-weight: 800;
        }

        .game-date {
          margin-top: 10px;
          color: #b9b9c0;
          font-size: 14px;
          line-height: 1.6;
        }

        .live-badge,
        .status-badge,
        .status-finished,
        .status-upcoming,
        .status-other {
          padding: 8px 13px;
          border-radius: 999px;
          font-weight: 900;
          font-size: 13px;
          white-space: nowrap;
          letter-spacing: 0.04em;
        }

        .live-badge {
          background: rgba(239, 68, 68, 0.18);
          border: 1px solid rgba(239, 68, 68, 0.32);
          color: #fecaca;
          box-shadow: 0 0 18px rgba(239, 68, 68, 0.08);
        }

        .status-finished {
          background: rgba(34, 197, 94, 0.16);
          border: 1px solid rgba(34, 197, 94, 0.28);
          color: #dcfce7;
        }

        .status-upcoming {
          background: rgba(161, 161, 170, 0.14);
          border: 1px solid rgba(161, 161, 170, 0.22);
          color: #f4f4f5;
        }

        .status-other {
          background: rgba(245, 158, 11, 0.18);
          border: 1px solid rgba(245, 158, 11, 0.28);
          color: #fde68a;
        }

        .game-bottom {
          position: relative;
          z-index: 1;
          margin-top: 18px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: #ffbe6b;
          font-weight: 900;
          font-size: 13px;
          letter-spacing: 0.16em;
        }

        .game-bottom.history {
          color: #ffd6a4;
        }

        .arrow {
          transition: transform 0.2s ease;
        }

        .game-card:hover .arrow {
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

        @media (max-width: 768px) {
          .page {
            padding: 16px;
          }

          .hero-card,
          .game-card {
            border-radius: 24px;
          }

          .hero-card {
            padding: 24px;
          }

          .game-card {
            padding: 20px;
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

          .team-title {
            font-size: 20px;
          }

          .team-title.small {
            font-size: 18px;
          }

          .section-header h2 {
            font-size: 22px;
          }
        }
      `}</style>
    </main>
  );
}

function statusBadgeClass(status: string) {
  if (status === "已結束") return "status-finished";
  if (status === "未開始") return "status-upcoming";
  return "status-other";
}