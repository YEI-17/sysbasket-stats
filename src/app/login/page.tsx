"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { setRole, setViewerName } from "@/lib/roles";

const STAFF_NAME = "YEI";
const STAFF_PASSWORD = "!we are the best!";
const VIEWER_PASSWORD = "CSE12345";

export default function LoginPage() {
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
    <main className="login-page">
      <div className="bg-orb orb-1" />
      <div className="bg-orb orb-2" />
      <div className="bg-grid" />
      <div className="bg-noise" />

      <section className="login-shell">
        <div className="login-card">
          <div className="brand-wrap">
            <div className="brand-badge">CSE BASKETBALL SYSTEM</div>
            <div className="brand-line" />
          </div>

          <div className="title-wrap">
            <h1>LOGIN</h1>
            <p>Access the basketball record system.</p>
          </div>

          <div className="form-area">
            <div className="field">
              <label>USER</label>
              <div className="input-wrap">
                <input
                  placeholder="ENTER USER"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="input"
                />
              </div>
            </div>

            <div className="field">
              <label>PASSWORD</label>
              <div className="input-wrap">
                <input
                  placeholder="ENTER PASSWORD"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="input"
                />
              </div>
            </div>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="login-btn"
            >
              <span>{loading ? "LOADING..." : "LOGIN"}</span>
            </button>
          </div>

          {msg ? <div className="error-box">{msg}</div> : null}
        </div>
      </section>

      <style jsx>{`
        .login-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.12), transparent 28%),
            radial-gradient(circle at 80% 30%, rgba(99, 102, 241, 0.14), transparent 30%),
            radial-gradient(circle at 50% 100%, rgba(168, 85, 247, 0.12), transparent 35%),
            linear-gradient(135deg, #020617 0%, #050816 45%, #020617 100%);
        }

        .bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(circle at center, black 35%, transparent 100%);
          opacity: 0.22;
          pointer-events: none;
        }

        .bg-noise {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(rgba(255,255,255,0.04) 0.8px, transparent 0.8px);
          background-size: 18px 18px;
          opacity: 0.08;
          pointer-events: none;
        }

        .bg-orb {
          position: absolute;
          border-radius: 9999px;
          filter: blur(70px);
          pointer-events: none;
        }

        .orb-1 {
          width: 340px;
          height: 340px;
          background: rgba(56, 189, 248, 0.18);
          top: -80px;
          left: -40px;
          animation: floatA 8s ease-in-out infinite;
        }

        .orb-2 {
          width: 360px;
          height: 360px;
          background: rgba(139, 92, 246, 0.16);
          right: -60px;
          bottom: -80px;
          animation: floatB 10s ease-in-out infinite;
        }

        .login-shell {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 560px;
        }

        .login-card {
          position: relative;
          padding: 34px;
          border-radius: 32px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 100%);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow:
            0 30px 80px rgba(0, 0, 0, 0.55),
            inset 0 1px 0 rgba(255,255,255,0.08);
          backdrop-filter: blur(26px);
          -webkit-backdrop-filter: blur(26px);
        }

        .login-card::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 32px;
          padding: 1px;
          background: linear-gradient(
            135deg,
            rgba(255,255,255,0.28),
            rgba(255,255,255,0.08),
            rgba(56,189,248,0.35),
            rgba(168,85,247,0.25)
          );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }

        .brand-wrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 28px;
        }

        .brand-badge {
          display: inline-flex;
          align-items: center;
          padding: 8px 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.1);
          color: #e2e8f0;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.8px;
          white-space: nowrap;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .brand-line {
          height: 1px;
          flex: 1;
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.18),
            rgba(56,189,248,0.28),
            rgba(168,85,247,0.18),
            transparent
          );
        }

        .title-wrap {
          margin-bottom: 30px;
        }

        .title-wrap h1 {
          margin: 0;
          font-size: clamp(42px, 7vw, 68px);
          line-height: 0.95;
          font-weight: 1000;
          letter-spacing: -0.05em;
          color: #ffffff;
          text-shadow:
            0 0 24px rgba(255,255,255,0.08),
            0 0 40px rgba(56,189,248,0.08);
        }

        .title-wrap p {
          margin: 14px 0 0;
          color: rgba(226, 232, 240, 0.72);
          font-size: 14px;
          letter-spacing: 0.04em;
        }

        .form-area {
          display: grid;
          gap: 18px;
        }

        .field label {
          display: block;
          margin-bottom: 10px;
          color: #f8fafc;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.18em;
        }

        .input-wrap {
          position: relative;
          border-radius: 18px;
          padding: 1px;
          background: linear-gradient(
            135deg,
            rgba(255,255,255,0.14),
            rgba(255,255,255,0.05)
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
            linear-gradient(180deg, rgba(2,6,23,0.9) 0%, rgba(15,23,42,0.88) 100%);
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.03em;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            background 0.2s ease;
        }

        .input::placeholder {
          color: rgba(148, 163, 184, 0.68);
          letter-spacing: 0.08em;
        }

        .input:focus {
          transform: translateY(-1px);
          background:
            linear-gradient(180deg, rgba(2,6,23,0.96) 0%, rgba(15,23,42,0.94) 100%);
          box-shadow:
            0 0 0 1px rgba(56,189,248,0.22),
            0 0 0 6px rgba(56,189,248,0.08);
        }

        .login-btn {
          position: relative;
          overflow: hidden;
          height: 60px;
          margin-top: 6px;
          border: none;
          border-radius: 18px;
          cursor: pointer;
          background:
            linear-gradient(135deg, #ffffff 0%, #cbd5e1 45%, #ffffff 100%);
          color: #020617;
          font-size: 15px;
          font-weight: 1000;
          letter-spacing: 0.18em;
          box-shadow:
            0 18px 40px rgba(255,255,255,0.12),
            inset 0 1px 0 rgba(255,255,255,0.9);
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            opacity 0.2s ease;
        }

        .login-btn::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            120deg,
            transparent 0%,
            rgba(255,255,255,0.55) 25%,
            transparent 50%
          );
          transform: translateX(-130%);
          transition: transform 0.7s ease;
        }

        .login-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow:
            0 24px 50px rgba(255,255,255,0.16),
            0 0 30px rgba(56,189,248,0.12);
        }

        .login-btn:hover:not(:disabled)::before {
          transform: translateX(130%);
        }

        .login-btn:disabled {
          cursor: not-allowed;
          opacity: 0.75;
        }

        .login-btn span {
          position: relative;
          z-index: 1;
        }

        .error-box {
          margin-top: 18px;
          border-radius: 18px;
          padding: 14px 16px;
          background: rgba(127, 29, 29, 0.18);
          border: 1px solid rgba(248, 113, 113, 0.22);
          color: #fecaca;
          font-size: 14px;
          line-height: 1.6;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        @keyframes floatA {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(30px, 20px) scale(1.08);
          }
        }

        @keyframes floatB {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-20px, -24px) scale(1.06);
          }
        }

        @media (max-width: 640px) {
          .login-page {
            padding: 16px;
          }

          .login-card {
            padding: 24px;
            border-radius: 24px;
          }

          .login-card::before {
            border-radius: 24px;
          }

          .brand-wrap {
            margin-bottom: 20px;
          }

          .title-wrap {
            margin-bottom: 22px;
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