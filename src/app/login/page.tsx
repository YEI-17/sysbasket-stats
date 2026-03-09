"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { setRole, setViewerName } from "@/lib/roles";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"choose" | "staff" | "viewer">("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [viewerName, setViewerNameState] = useState("");
  const [gameId, setGameId] = useState("");
  const [msg, setMsg] = useState("");

  async function handleStaffLogin() {
    setMsg("");

    if (!email.trim()) return setMsg("請輸入 Email");
    if (!password.trim()) return setMsg("請輸入 Password");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setRole("staff");

    if (gameId.trim()) {
      router.push(`/games/${gameId.trim()}/live`);
    } else {
      router.push("/games/new");
    }
  }

  function handleViewerEnter() {
    setMsg("");

    if (!viewerName.trim()) return setMsg("請輸入名字");
    if (!gameId.trim()) return setMsg("請輸入 gameId");

    setViewerName(viewerName.trim());
    setRole("viewer");
    router.push(`/games/${gameId.trim()}/board`);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
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
          maxWidth: 460,
          background: "#0f0f0f",
          border: "1px solid #222",
          borderRadius: 18,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 10, fontSize: 28 }}>系籃比賽系統</h1>
        <p style={{ color: "#aaa", marginTop: 0, marginBottom: 20 }}>
          選擇身份後進入系統
        </p>

        {mode === "choose" && (
          <div style={{ display: "grid", gap: 12 }}>
            <button onClick={() => setMode("staff")} style={btnGreen}>
              我是工作人員
            </button>

            <button onClick={() => setMode("viewer")} style={btnGray}>
              我是觀眾
            </button>
          </div>
        )}

        {mode === "staff" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ color: "#bbb", fontWeight: 700 }}>工作人員登入</div>

            <input
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />

            <input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />

            <input
              placeholder="要進入的 gameId（可先貼上）"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              style={inputStyle}
            />

            <button onClick={handleStaffLogin} style={btnGreen}>
              登入
            </button>

            <button onClick={() => setMode("choose")} style={btnGray}>
              返回
            </button>
          </div>
        )}

        {mode === "viewer" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ color: "#bbb", fontWeight: 700 }}>觀眾模式</div>

            <input
              placeholder="你的名字"
              value={viewerName}
              onChange={(e) => setViewerNameState(e.target.value)}
              style={inputStyle}
            />

            <input
              placeholder="要觀看的 gameId"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              style={inputStyle}
            />

            <button onClick={handleViewerEnter} style={btnGreen}>
              進入觀看
            </button>

            <button onClick={() => setMode("choose")} style={btnGray}>
              返回
            </button>
          </div>
        )}

        {msg && <p style={{ marginTop: 16, color: "#ddd" }}>{msg}</p>}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "#111",
  color: "white",
  outline: "none",
};

const btnBase: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontSize: 16,
};

const btnGreen: React.CSSProperties = {
  ...btnBase,
  background: "#22c55e",
  color: "#052e12",
  fontWeight: 800,
};

const btnGray: React.CSSProperties = {
  ...btnBase,
  background: "#333",
  color: "white",
};