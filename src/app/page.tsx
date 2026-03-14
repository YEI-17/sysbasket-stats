"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { setRole, setViewerName } from "@/lib/roles";
import { supabase } from "@/lib/supabaseClient";

const STAFF_NAME = "YEI";
const STAFF_PASSWORD = "!we are the best!";
const VIEWER_PASSWORD = "CSE12345";

type SessionInsertResult = {
  id: string;
};

export default function Page() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  function saveSessionId(sessionId: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem("session_id", sessionId);
  }

  function clearOldSessionId() {
    if (typeof window === "undefined") return;
    localStorage.removeItem("session_id");
  }

  async function createUserSession(
    loginName: string,
    role: "staff" | "viewer"
  ) {
    const { data, error } = await supabase
      .from("user_sessions")
      .insert({
        viewer_name: loginName,
        role,
        is_online: true,
        last_seen_at: new Date().toISOString(),
      })
      .select("id")
      .single<SessionInsertResult>();

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.id) {
      throw new Error("建立登入 session 失敗");
    }

    return data.id;
  }

  async function handleLogin() {
    setMsg("");

    const trimmedName = name.trim();
    const trimmedPassword = password.trim();

    if (!trimmedName) {
      setMsg("請輸入名稱");
      return;
    }

    if (!trimmedPassword) {
      setMsg("請輸入密碼");
      return;
    }

    setLoading(true);

    try {
      clearOldSessionId();

      if (
        trimmedName === STAFF_NAME &&
        trimmedPassword === STAFF_PASSWORD
      ) {
        const sessionId = await createUserSession(trimmedName, "staff");

        saveSessionId(sessionId);
        setRole("staff");
        setViewerName("");
        router.push("/staff");
        return;
      }

      if (trimmedPassword === VIEWER_PASSWORD) {
        const sessionId = await createUserSession(trimmedName, "viewer");

        saveSessionId(sessionId);
        setViewerName(trimmedName);
        setRole("viewer");
        router.push("/viewer");
        return;
      }

      setMsg("名稱或密碼錯誤");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "未知錯誤";
      setMsg(`登入失敗：${message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      void handleLogin();
    }
  }

  return (
    <main className="page">
      <div className="background" />
      <div className="court">
        <div className="center-line" />
        <div className="center-circle" />

        <div className="left-half">
          <div className="paint" />
          <div className="free-throw-circle" />
          <div className="three-point-arc" />
          <div className="rim" />
          <div className="backboard" />
        </div>

        <div className="right-half">
          <div className="paint" />
          <div className="free-throw-circle" />
          <div className="three-point-arc" />
          <div className="rim" />
          <div className="backboard" />
        </div>
      </div>

      <section className="login-shell">
        <div className="login-card">
          <div className="brand">CSE Basketball</div>
          <h1>Login</h1>
          <p className="subtitle">系籃紀錄系統</p>

          <div className="form-area">
            <div className="field">
              <label>USER</label>
              <input
                className="input"
                placeholder="輸入名稱"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="username"
              />
            </div>

            <div className="field">
              <label>PASSWORD</label>
              <input
                className="input"
                type="password"
                placeholder="輸入密碼"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="current-password"
              />
            </div>

            <button
              className="login-btn"
              onClick={() => void handleLogin()}
              disabled={loading}
            >
              {loading ? "登入中..." : "登入"}
            </button>

            {msg ? <div className="error-box">{msg}</div> : null}
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
          background: #0a0a0c;
          color: #ffffff;
        }

        .background {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at top, rgba(255, 140, 0, 0.14), transparent 32%),
            radial-gradient(circle at bottom, rgba(255, 140, 0, 0.08), transparent 28%),
            linear-gradient(180deg, #111214 0%, #0b0b0d 45%, #060607 100%);
          pointer-events: none;
        }

        .court {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.14;
        }

        .center-line {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 50%;
          width: 1.5px;
          transform: translateX(-50%);
          background: rgba(255, 255, 255, 0.24);
        }

        .center-circle {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(30vw, 280px);
          height: min(30vw, 280px);
          transform: translate(-50%, -50%);
          border: 2px solid rgba(255, 255, 255, 0.24);
          border-radius: 999px;
        }

        .left-half,
        .right-half {
          position: absolute;
          top: 50%;
          width: 50%;
          height: 100%;
          transform: translateY(-50%);
        }

        .left-half {
          left: 0;
        }

        .right-half {
          right: 0;
        }

        .paint {
          position: absolute;
          top: 50%;
          width: 18%;
          height: 28%;
          transform: translateY(-50%);
          border: 2px solid rgba(255, 255, 255, 0.22);
        }

        .left-half .paint {
          left: 0;
          border-left: none;
        }

        .right-half .paint {
          right: 0;
          border-right: none;
        }

        .free-throw-circle {
          position: absolute;
          top: 50%;
          width: min(12vw, 140px);
          height: min(12vw, 140px);
          transform: translateY(-50%);
          border: 2px solid rgba(255, 255, 255, 0.22);
          border-radius: 999px;
        }

        .left-half .free-throw-circle {
          left: calc(18% - min(6vw, 70px));
        }

        .right-half .free-throw-circle {
          right: calc(18% - min(6vw, 70px));
        }

        .three-point-arc {
          position: absolute;
          top: 50%;
          width: min(42vw, 520px);
          height: min(42vw, 520px);
          transform: translateY(-50%);
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-radius: 999px;
        }

        .left-half .three-point-arc {
          left: -28%;
          clip-path: inset(0 0 0 50%);
        }

        .right-half .three-point-arc {
          right: -28%;
          clip-path: inset(0 50% 0 0);
        }

        .rim {
          position: absolute;
          top: 50%;
          width: 14px;
          height: 14px;
          transform: translateY(-50%);
          border: 2px solid rgba(255, 255, 255, 0.26);
          border-radius: 999px;
        }

        .left-half .rim {
          left: 6%;
        }

        .right-half .rim {
          right: 6%;
        }

        .backboard {
          position: absolute;
          top: 50%;
          width: 2px;
          height: 70px;
          transform: translateY(-50%);
          background: rgba(255, 255, 255, 0.24);
        }

        .left-half .backboard {
          left: 3%;
        }

        .right-half .backboard {
          right: 3%;
        }

        .login-shell {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 420px;
        }

        .login-card {
          position: relative;
          padding: 32px 28px 28px;
          border-radius: 28px;
          background: rgba(16, 16, 18, 0.82);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 24px 60px rgba(0, 0, 0, 0.45),
            0 0 0 1px rgba(255, 140, 0, 0.06);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        .brand {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: rgba(255, 245, 235, 0.92);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          margin-bottom: 18px;
        }

        h1 {
          margin: 0;
          font-size: 42px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.04em;
        }

        .subtitle {
          margin: 10px 0 0;
          color: rgba(255, 255, 255, 0.62);
          font-size: 14px;
          line-height: 1.5;
        }

        .form-area {
          margin-top: 26px;
          display: grid;
          gap: 16px;
        }

        .field {
          display: grid;
          gap: 8px;
        }

        .field label {
          color: rgba(255, 237, 213, 0.9);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.12em;
        }

        .input {
          width: 100%;
          height: 54px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          outline: none;
          border-radius: 16px;
          padding: 0 16px;
          box-sizing: border-box;
          background: rgba(255, 255, 255, 0.04);
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }

        .input::placeholder {
          color: rgba(255, 220, 180, 0.34);
        }

        .input:focus {
          border-color: rgba(255, 166, 0, 0.42);
          box-shadow: 0 0 0 4px rgba(255, 140, 0, 0.1);
          transform: translateY(-1px);
        }

        .login-btn {
          height: 56px;
          margin-top: 4px;
          border: none;
          border-radius: 16px;
          cursor: pointer;
          background: linear-gradient(135deg, #ffb347 0%, #f48c06 60%, #d96a00 100%);
          color: #ffffff;
          font-size: 15px;
          font-weight: 900;
          letter-spacing: 0.08em;
          box-shadow: 0 16px 30px rgba(244, 140, 6, 0.26);
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }

        .login-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 20px 36px rgba(244, 140, 6, 0.32);
        }

        .login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .error-box {
          border-radius: 14px;
          padding: 12px 14px;
          background: rgba(127, 29, 29, 0.2);
          border: 1px solid rgba(248, 113, 113, 0.2);
          color: #fecaca;
          font-size: 14px;
          line-height: 1.5;
        }

        @media (max-width: 640px) {
          .page {
            padding: 16px;
          }

          .login-shell {
            max-width: 100%;
          }

          .login-card {
            padding: 24px 20px 20px;
            border-radius: 22px;
          }

          h1 {
            font-size: 34px;
          }

          .subtitle {
            font-size: 13px;
          }

          .center-circle {
            width: 180px;
            height: 180px;
          }

          .free-throw-circle {
            width: 84px;
            height: 84px;
          }

          .three-point-arc {
            width: 320px;
            height: 320px;
          }

          .backboard {
            height: 56px;
          }

          .rim {
            width: 12px;
            height: 12px;
          }
        }
      `}</style>
    </main>
  );
}