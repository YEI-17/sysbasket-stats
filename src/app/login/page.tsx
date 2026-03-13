"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { setRole, setViewerName } from "@/lib/roles";

// 這裡改成你要的固定管理者帳密
const STAFF_NAME = "YEI";
const STAFF_PASSWORD = "!we are the best!";

// 一般觀看者固定密碼
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
      setMsg("請輸入名稱");
      return;
    }

    if (!trimmedPassword) {
      setMsg("請輸入密碼");
      return;
    }

    setLoading(true);

    try {
      // 管理者登入
      if (
        trimmedName === STAFF_NAME &&
        trimmedPassword === STAFF_PASSWORD
      ) {
        setRole("staff");
        setViewerName("");
        router.push("/staff");
        return;
      }

      // 一般觀看者登入
      if (trimmedPassword === VIEWER_PASSWORD) {
        setViewerName(trimmedName);
        setRole("viewer");
        router.push("/viewer");
        return;
      }

      setMsg("名稱或密碼錯誤");
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
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(255,255,255,0.08) 0%, #000000 30%, #000000 100%)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1080,
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 24,
        }}
      >
        <section
          style={{
            borderRadius: 32,
            padding: 36,
            background:
              "linear-gradient(180deg, rgba(12,12,12,0.96) 0%, rgba(5,5,5,0.98) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 580,
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#d4d4d8",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1,
                marginBottom: 18,
              }}
            >
              CSE BASKETBALL SYSTEM
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 54,
                lineHeight: 1.05,
                fontWeight: 900,
                letterSpacing: -1.4,
                color: "#ffffff",
              }}
            >
              系籃比賽紀錄系統
            </h1>

            <p
              style={{
                marginTop: 18,
                marginBottom: 0,
                color: "#a1a1aa",
                fontSize: 17,
                lineHeight: 1.8,
                maxWidth: 560,
              }}
            >
              提供工作人員進行比賽管理、即時紀錄與數據整理，
              也讓觀眾能快速進入觀看頁面與查詢比賽資訊。
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 14,
              marginTop: 30,
            }}
          >
            <div style={featureBoxStyle}>
              <div style={featureTitleStyle}>即時紀錄</div>
              <div style={featureDescStyle}>快速記錄比賽事件與比分變化</div>
            </div>

            <div style={featureBoxStyle}>
              <div style={featureTitleStyle}>觀眾觀看</div>
              <div style={featureDescStyle}>可即時查看目前賽況與歷史比賽</div>
            </div>

            <div style={featureBoxStyle}>
              <div style={featureTitleStyle}>數據整理</div>
              <div style={featureDescStyle}>集中管理球員與團隊統計資料</div>
            </div>
          </div>
        </section>

        <section
          style={{
            borderRadius: 32,
            padding: 32,
            background: "rgba(10,10,10,0.96)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 24px 70px rgba(0,0,0,0.42)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: 580,
          }}
        >
          <div
            style={{
              marginBottom: 24,
            }}
          >
            <div
              style={{
                color: "#71717a",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 1,
                marginBottom: 10,
              }}
            >
              LOGIN
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: 34,
                fontWeight: 900,
                color: "#ffffff",
                letterSpacing: -0.6,
              }}
            >
              登入系統
            </h2>

            <p
              style={{
                marginTop: 12,
                marginBottom: 0,
                color: "#a1a1aa",
                fontSize: 15,
                lineHeight: 1.7,
              }}
            >
              管理者請輸入固定名稱與密碼。一般觀看者可輸入任意名稱，
              並使用固定密碼進入。
            </p>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={labelStyle}>名稱</div>
              <input
                placeholder="請輸入名稱"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={labelStyle}>密碼</div>
              <input
                placeholder="請輸入密碼"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                style={inputStyle}
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                ...loginBtnStyle,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "登入中..." : "登入"}
            </button>
          </div>

          {msg ? (
            <div
              style={{
                marginTop: 16,
                borderRadius: 14,
                padding: "12px 14px",
                background: "rgba(127, 29, 29, 0.18)",
                border: "1px solid rgba(248, 113, 113, 0.22)",
                color: "#fecaca",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {msg}
            </div>
          ) : null}

          <div
            style={{
              marginTop: 22,
              paddingTop: 18,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              color: "#71717a",
              fontSize: 13,
              lineHeight: 1.8,
            }}
          >
            觀看者登入方式：名稱可自由輸入，密碼固定為 <strong style={{ color: "#ffffff" }}>CSE12345</strong>
          </div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 920px) {
          main > div {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  color: "#d4d4d8",
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  outline: "none",
  fontSize: 15,
  boxSizing: "border-box",
};

const loginBtnStyle: React.CSSProperties = {
  marginTop: 6,
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "#ffffff",
  color: "#000000",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 900,
};

const featureBoxStyle: React.CSSProperties = {
  borderRadius: 20,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const featureTitleStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 16,
  fontWeight: 800,
  marginBottom: 8,
};

const featureDescStyle: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: 13,
  lineHeight: 1.7,
};