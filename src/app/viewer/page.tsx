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
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(255,255,255,0.06) 0%, #000000 28%, #000000 100%)",
        color: "white",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            background: "rgba(10, 10, 10, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 28,
            padding: 28,
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            marginBottom: 22,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#d4d4d8",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 1,
                  marginBottom: 14,
                }}
              >
                VIEWER MODE
              </div>

              <div
                style={{
                  fontSize: 34,
                  fontWeight: 900,
                  color: "#ffffff",
                  letterSpacing: -0.5,
                }}
              >
                歡迎，{viewerName}
              </div>

              <div
                style={{
                  marginTop: 10,
                  color: "#a1a1aa",
                  fontSize: 15,
                  lineHeight: 1.7,
                  maxWidth: 620,
                }}
              >
                從這裡快速進入比賽列表與數據中心，查看即時比賽、歷史賽事與統計內容。
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={handleLogout} style={btnRed}>
                登出
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 18,
          }}
        >
          <button onClick={handleOpenGameList} style={featureCardStyle}>
            <div style={featureTopRowStyle}>
              <div style={featureTagStyle}>MATCHES</div>
            </div>

            <div style={featureTitleStyle}>比賽列表</div>

            <div style={featureDescStyle}>
              進入直播中的比賽與歷史比賽頁面，快速查看目前可觀看的所有賽事。
            </div>

            <div style={featureActionStyle}>點擊進入</div>
          </button>

          <button onClick={handleOpenStatsCenter} style={featureCardStyle}>
            <div style={featureTopRowStyle}>
              <div style={featureTagStyle}>STATS</div>
            </div>

            <div style={featureTitleStyle}>數據中心</div>

            <div style={featureDescStyle}>
              查看球員數據、團隊統計、排行榜與之後延伸的更多分析內容。
            </div>

            <div style={featureActionStyle}>點擊進入</div>
          </button>
        </div>
      </div>
    </main>
  );
}

const btnBase: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 800,
  transition: "all 0.2s ease",
};

const btnRed: React.CSSProperties = {
  ...btnBase,
  background: "#dc2626",
  color: "white",
};

const featureCardStyle: React.CSSProperties = {
  textAlign: "left",
  width: "100%",
  padding: 24,
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.08)",
  background:
    "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(7,7,7,0.98) 100%)",
  color: "white",
  cursor: "pointer",
  boxShadow: "0 18px 40px rgba(0,0,0,0.38)",
};

const featureTopRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const featureTagStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#d4d4d8",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1,
};

const featureTitleStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 900,
  color: "#ffffff",
  marginBottom: 10,
};

const featureDescStyle: React.CSSProperties = {
  color: "#a1a1aa",
  lineHeight: 1.7,
  fontSize: 14,
  minHeight: 52,
};

const featureActionStyle: React.CSSProperties = {
  marginTop: 18,
  color: "#ffffff",
  fontWeight: 800,
  fontSize: 14,
};