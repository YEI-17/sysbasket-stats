"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { setRole, setViewerName } from "@/lib/roles";

type LiveGame = {
  id: string;
  teamA: string | null;
  teamB: string | null;
};

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"choose" | "staff" | "viewer">("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [viewerName, setViewerNameState] = useState("");
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    async function fetchLiveGames() {
      setLoadingGames(true);
      setMsg("");

      const { data, error } = await supabase
        .from("games")
        .select("id, teamA, teamB")
        .eq("status", "live")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setMsg("讀取目前比賽失敗");
        setLoadingGames(false);
        return;
      }

      setLiveGames((data as LiveGame[]) || []);
      setLoadingGames(false);
    }

    fetchLiveGames();
  }, []);

  async function handleStaffLogin() {
    setMsg("");

    if (!email.trim()) {
      setMsg("請輸入 Email");
      return;
    }

    if (!password.trim()) {
      setMsg("請輸入 Password");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setRole("staff");
    router.push("/staff");
  }

  function handleViewerGameClick(gameId: string) {
    setMsg("");

    if (!viewerName.trim()) {
      setMsg("請先輸入名字");
      return;
    }

    setViewerName(viewerName.trim());
    setRole("viewer");
    router.push(`/games/${gameId}/board`);
  }

  function renderViewerLiveGames() {
    if (loadingGames) {
      return <div style={{ color: "#888" }}>正在讀取目前比賽...</div>;
    }

    if (liveGames.length === 0) {
      return <div style={{ color: "#888" }}>目前沒有正在進行的比賽</div>;
    }

    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ color: "#bbb", fontWeight: 700 }}>目前正在進行的比賽</div>

        {liveGames.map((game) => {
          const label = `${game.teamA || "未命名主隊"} vs ${game.teamB || "未命名客隊"}`;

          return (
            <button
              key={game.id}
              onClick={() => handleViewerGameClick(game.id)}
              style={gameBtn}
            >
              <div style={{ fontWeight: 800, fontSize: 16 }}>{label}</div>
              <div style={{ color: "#8f8f8f", fontSize: 12, marginTop: 4 }}>
                點擊直接進入觀看
              </div>
            </button>
          );
        })}
      </div>
    );
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

            {renderViewerLiveGames()}

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

const gameBtn: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "14px 16px",
  borderRadius: 12,
  color: "white",
  cursor: "pointer",
  border: "1px solid #333",
  background: "#161616",
};