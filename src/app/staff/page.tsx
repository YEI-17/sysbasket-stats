"use client";

import React from "react";
import { useRouter } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

export default function StaffHomePage() {
  const router = useRouter();

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(255,255,255,0.05) 0%, #000000 28%, #000000 100%)",
        color: "#fff",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          display: "grid",
          gap: 20,
        }}
      >
        <div
          style={{
            background: "rgba(10, 10, 10, 0.96)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 28,
            padding: 28,
            boxShadow: "0 20px 50px rgba(0,0,0,0.38)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
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
                STAFF DASHBOARD
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: 34,
                  fontWeight: 900,
                  letterSpacing: -0.5,
                  color: "#ffffff",
                }}
              >
                工作人員後台
              </h1>

              <p
                style={{
                  color: "#a1a1aa",
                  marginTop: 10,
                  marginBottom: 0,
                  fontSize: 15,
                  lineHeight: 1.7,
                  maxWidth: 620,
                }}
              >
                從這裡快速進入建立比賽、比賽管理與完整數據頁面。
              </p>
            </div>

            <LogoutButton />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          <button
            style={featureCardStyle}
            onClick={() => router.push("/games/new")}
          >
            <div style={cardTagStyle}>CREATE</div>
            <div style={cardTitleStyle}>建立新比賽</div>
            <div style={cardDescStyle}>
              建立新的賽事，設定對戰資訊並開始後續紀錄流程。
            </div>
            <div style={cardActionStyle}>點擊進入</div>
          </button>

          <button
            style={featureCardStyle}
            onClick={() => router.push("/games/list")}
          >
            <div style={cardTagStyle}>GAMES</div>
            <div style={cardTitleStyle}>進入比賽列表</div>
            <div style={cardDescStyle}>
              查看目前所有比賽，進入即時記錄、觀眾頁與單場數據頁。
            </div>
            <div style={cardActionStyle}>點擊進入</div>
          </button>

          <button
            style={featureCardStyle}
            onClick={() => router.push("/games/box")}
          >
            <div style={cardTagStyle}>STATS</div>
            <div style={cardTitleStyle}>完整數據頁面</div>
            <div style={cardDescStyle}>
              查看整體球隊資料、球員數據與後續延伸統計內容。
            </div>
            <div style={cardActionStyle}>點擊進入</div>
          </button>
        </div>
      </div>
    </main>
  );
}

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
  boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
  display: "grid",
  gap: 12,
};

const cardTagStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#d4d4d8",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  color: "#ffffff",
};

const cardDescStyle: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: 14,
  lineHeight: 1.7,
  minHeight: 72,
};

const cardActionStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 800,
};