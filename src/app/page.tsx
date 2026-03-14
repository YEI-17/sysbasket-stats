"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { setRole, setViewerName } from "@/lib/roles";

const STAFF_NAME = "YEI";
const STAFF_PASSWORD = "!we are the best!";
const VIEWER_PASSWORD = "CSE12345";

export default function Page() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setMsg("");

    const trimmedName = name.trim();
    const trimmedPassword = password.trim();

    if (!trimmedName) {
      setMsg("請輸入 USER");
      return;
    }

    if (!trimmedPassword) {
      setMsg("請輸入 PASSWORD");
      return;
    }

    setLoading(true);

    try {
      if (
        trimmedName === STAFF_NAME &&
        trimmedPassword === STAFF_PASSWORD
      ) {
        setRole("staff");
        setViewerName("");
        router.push("/staff");
        return;
      }

      if (trimmedPassword === VIEWER_PASSWORD) {
        setViewerName(trimmedName);
        setRole("viewer");
        router.push("/viewer");
        return;
      }

      setMsg("USER 或 PASSWORD 錯誤");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleLogin();
    }
  }

  return (
    <main className="page">
      <div className="bg-overlay" />
      <div className="court-lines" />
      <div className="glow glow-left" />
      <div className="glow glow-right" />
      <div className="basketball basketball-1" />
      <div className="basketball basketball-2" />

      <section className="login-shell">
        <div className="login-card">
          <div className="top-row">
            <div className="brand-badge">CSE BASKETBALL SYSTEM</div>
            <div className="score-tag">SEASON ACCESS</div>
          </div>

          <div className="hero">
            <div className="mini-line" />
            <h1>LOGIN</h1>
            <p>Enter the court. Access the game record system.</p>
          </div>

          <div className="form-area">
            <div className="field">
              <label>USER</label>
              <div className="input-wrap">
                <input
                  className="input"
                  placeholder="ENTER USER"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>

            <div className="field">
              <label>PASSWORD</label>
              <div className="input-wrap">
                <input
                  className="input"
                  type="password"
                  placeholder="ENTER PASSWORD"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>

            <button
              className="login-btn"
              onClick={handleLogin}
              disabled={loading}
            >
              <span>{loading ? "LOADING..." : "LOGIN"}</span>
            </button>
          </div>

          {msg ? <div className="error-box">{msg}</div> : null}

          <div className="bottom-strip">
            <div className="strip-dot" />
            <span>COURTSIDE ACCESS PANEL</span>
          </div>
        </div>
      </section>

      <style jsx>{`
        .page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
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
          opacity: 0.14;
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
          width: 220px;
          height: 220px;
          top: 80px;
          right: 80px;
          transform: rotate(-18deg);
        }

        .basketball-2 {
          width: 170px;
          height: 170px;
          bottom: 90px;
          left: 70px;
          transform: rotate(20deg);
        }

        .login-shell {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 560px;
        }

        .login-card {
          position: relative;
          overflow: hidden;
          border-radius: 32px;
          padding: 34px;
          background:
            linear-gradient(180deg, rgba(24, 24, 28, 0.96) 0%, rgba(10, 10, 12, 0.98) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 30px 80px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 140, 0, 0.08);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .login-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(135deg, rgba(255,140,0,0.12), transparent 28%, transparent 70%, rgba(255,140,0,0.08)),
            linear-gradient(180deg, rgba(255,255,255,0.04), transparent 18%);
          pointer-events: none;
        }

        .top-row {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
          flex-wrap: wrap;
        }

        .brand-badge,
        .score-tag {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
        }

        .brand-badge {
          color: #fff7ed;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .score-tag {
          color: #1a0c00;
          background: linear-gradient(135deg, #ffb347 0%, #f48c06 100%);
          box-shadow: 0 10px 24px rgba(244, 140, 6, 0.25);
        }

        .hero {
          position: relative;
          z-index: 1;
          margin-bottom: 28px;
        }

        .mini-line {
          width: 72px;
          height: 6px;
          border-radius: 999px;
          margin-bottom: 18px;
          background: linear-gradient(90deg, #ffb347 0%, #f48c06 100%);
          box-shadow: 0 0 18px rgba(244, 140, 6, 0.45);
        }

        .hero h1 {
          margin: 0;
          font-size: clamp(46px, 8vw, 72px);
          line-height: 0.95;
          font-weight: 1000;
          letter-spacing: -0.05em;
          color: #ffffff;
          text-transform: uppercase;
          text-shadow:
            0 0 20px rgba(255, 140, 0, 0.14),
            0 10px 30px rgba(0,0,0,0.28);
        }

        .hero p {
          margin: 14px 0 0;
          color: rgba(255, 245, 235, 0.72);
          font-size: 14px;
          line-height: 1.7;
          letter-spacing: 0.03em;
        }

        .form-area {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 18px;
        }

        .field label {
          display: block;
          margin-bottom: 10px;
          color: #ffedd5;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.16em;
        }

        .input-wrap {
          position: relative;
          border-radius: 18px;
          padding: 1px;
          background: linear-gradient(
            135deg,
            rgba(255, 170, 80, 0.35),
            rgba(255,255,255,0.06)
          );
        }

        .input {
          width: 100%;
          height: 58px;
          border: none;
          outline: none;
          border-radius: 17px;
          padding: 0 18px;
          box-sizing: border-box;
          background:
            linear-gradient(180deg, rgba(20,20,22,0.96) 0%, rgba(12,12,14,0.96) 100%);
          color: #ffffff;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.03em;
          transition: all 0.2s ease;
        }

        .input::placeholder {
          color: rgba(255, 220, 180, 0.38);
          letter-spacing: 0.08em;
        }

        .input:focus {
          box-shadow:
            0 0 0 1px rgba(255, 166, 0, 0.35),
            0 0 0 6px rgba(255, 140, 0, 0.1);
          transform: translateY(-1px);
        }

        .login-btn {
          position: relative;
          overflow: hidden;
          margin-top: 4px;
          height: 60px;
          border: none;
          border-radius: 18px;
          cursor: pointer;
          background: linear-gradient(135deg, #ffb347 0%, #f48c06 55%, #d96a00 100%);
          color: white;
          font-size: 15px;
          font-weight: 1000;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          box-shadow:
            0 18px 34px rgba(244, 140, 6, 0.28),
            inset 0 1px 0 rgba(255,255,255,0.24);
          transition: all 0.22s ease;
        }

        .login-btn::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            120deg,
            transparent 0%,
            rgba(255,255,255,0.26) 28%,
            transparent 56%
          );
          transform: translateX(-140%);
          transition: transform 0.8s ease;
        }

        .login-btn:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.01);
          box-shadow:
            0 24px 44px rgba(244, 140, 6, 0.32),
            0 0 26px rgba(255, 140, 0, 0.18);
        }

        .login-btn:hover:not(:disabled)::before {
          transform: translateX(140%);
        }

        .login-btn:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }

        .login-btn span {
          position: relative;
          z-index: 1;
        }

        .error-box {
          position: relative;
          z-index: 1;
          margin-top: 18px;
          border-radius: 18px;
          padding: 14px 16px;
          background: rgba(127, 29, 29, 0.2);
          border: 1px solid rgba(248, 113, 113, 0.2);
          color: #fecaca;
          font-size: 14px;
          line-height: 1.6;
        }

        .bottom-strip {
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

        @media (max-width: 640px) {
          .page {
            padding: 16px;
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

          .login-card {
            padding: 24px;
            border-radius: 24px;
          }

          .input {
            height: 54px;
          }

          .login-btn {
            height: 56px;
          }
        }
      `}</style>
    </main>
  );
}