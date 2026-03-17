"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

type RankCategory = "pts" | "reb" | "ast" | "stl" | "blk";
type RankMode = "avg" | "total";

type PlayerRank = {
  id: string;
  name: string;
  number: number;
  position: string;
  value: number;
  games: number;
  minutes: string;
};

type CategoryConfig = {
  key: RankCategory;
  label: string;
  short: string;
  icon: string;
  unitAvg: string;
  unitTotal: string;
  accent: string;
};

const categoryList: CategoryConfig[] = [
  {
    key: "pts",
    label: "得分",
    short: "PTS",
    icon: "🏀",
    unitAvg: "AVG PTS",
    unitTotal: "TOTAL PTS",
    accent: "#ff6b4a",
  },
  {
    key: "reb",
    label: "籃板",
    short: "REB",
    icon: "🧱",
    unitAvg: "AVG REB",
    unitTotal: "TOTAL REB",
    accent: "#4ade80",
  },
  {
    key: "ast",
    label: "助攻",
    short: "AST",
    icon: "🎯",
    unitAvg: "AVG AST",
    unitTotal: "TOTAL AST",
    accent: "#60a5fa",
  },
  {
    key: "stl",
    label: "抄截",
    short: "STL",
    icon: "⚡",
    unitAvg: "AVG STL",
    unitTotal: "TOTAL STL",
    accent: "#a78bfa",
  },
  {
    key: "blk",
    label: "阻攻",
    short: "BLK",
    icon: "🛑",
    unitAvg: "AVG BLK",
    unitTotal: "TOTAL BLK",
    accent: "#f59e0b",
  },
];

const mockData: Record<RankMode, Record<RankCategory, PlayerRank[]>> = {
  avg: {
    pts: [
      { id: "1", name: "陳冠宇", number: 7, position: "PG", value: 18.5, games: 6, minutes: "28:40" },
      { id: "2", name: "林子豪", number: 11, position: "SG", value: 16.2, games: 6, minutes: "26:10" },
      { id: "3", name: "王柏翔", number: 23, position: "SF", value: 14.8, games: 6, minutes: "24:55" },
    ],
    reb: [
      { id: "4", name: "黃奕翔", number: 34, position: "C", value: 11.4, games: 6, minutes: "29:02" },
      { id: "5", name: "吳承翰", number: 15, position: "PF", value: 9.1, games: 6, minutes: "25:14" },
      { id: "6", name: "張育誠", number: 23, position: "SF", value: 7.6, games: 6, minutes: "23:47" },
    ],
    ast: [
      { id: "7", name: "李承恩", number: 3, position: "PG", value: 7.8, games: 6, minutes: "30:10" },
      { id: "8", name: "陳冠宇", number: 7, position: "PG", value: 5.9, games: 6, minutes: "28:40" },
      { id: "9", name: "林子豪", number: 11, position: "SG", value: 4.3, games: 6, minutes: "26:10" },
    ],
    stl: [
      { id: "10", name: "周宇辰", number: 9, position: "SG", value: 2.8, games: 6, minutes: "22:31" },
      { id: "11", name: "李承恩", number: 3, position: "PG", value: 2.1, games: 6, minutes: "30:10" },
      { id: "12", name: "張育誠", number: 23, position: "SF", value: 1.9, games: 6, minutes: "23:47" },
    ],
    blk: [
      { id: "13", name: "黃奕翔", number: 34, position: "C", value: 2.4, games: 6, minutes: "29:02" },
      { id: "14", name: "吳承翰", number: 15, position: "PF", value: 1.8, games: 6, minutes: "25:14" },
      { id: "15", name: "許哲維", number: 21, position: "C", value: 1.2, games: 5, minutes: "19:38" },
    ],
  },
  total: {
    pts: [
      { id: "1", name: "陳冠宇", number: 7, position: "PG", value: 111, games: 6, minutes: "28:40" },
      { id: "2", name: "林子豪", number: 11, position: "SG", value: 97, games: 6, minutes: "26:10" },
      { id: "3", name: "王柏翔", number: 23, position: "SF", value: 89, games: 6, minutes: "24:55" },
    ],
    reb: [
      { id: "4", name: "黃奕翔", number: 34, position: "C", value: 68, games: 6, minutes: "29:02" },
      { id: "5", name: "吳承翰", number: 15, position: "PF", value: 55, games: 6, minutes: "25:14" },
      { id: "6", name: "張育誠", number: 23, position: "SF", value: 46, games: 6, minutes: "23:47" },
    ],
    ast: [
      { id: "7", name: "李承恩", number: 3, position: "PG", value: 47, games: 6, minutes: "30:10" },
      { id: "8", name: "陳冠宇", number: 7, position: "PG", value: 35, games: 6, minutes: "28:40" },
      { id: "9", name: "林子豪", number: 11, position: "SG", value: 26, games: 6, minutes: "26:10" },
    ],
    stl: [
      { id: "10", name: "周宇辰", number: 9, position: "SG", value: 17, games: 6, minutes: "22:31" },
      { id: "11", name: "李承恩", number: 3, position: "PG", value: 13, games: 6, minutes: "30:10" },
      { id: "12", name: "張育誠", number: 23, position: "SF", value: 11, games: 6, minutes: "23:47" },
    ],
    blk: [
      { id: "13", name: "黃奕翔", number: 34, position: "C", value: 14, games: 6, minutes: "29:02" },
      { id: "14", name: "吳承翰", number: 15, position: "PF", value: 11, games: 6, minutes: "25:14" },
      { id: "15", name: "許哲維", number: 21, position: "C", value: 6, games: 5, minutes: "19:38" },
    ],
  },
};

function medalLabel(index: number) {
  if (index === 0) return "TOP 1";
  if (index === 1) return "TOP 2";
  return "TOP 3";
}

function formatValue(value: number, mode: RankMode) {
  return mode === "avg" ? value.toFixed(1) : String(value);
}

function diffFromFirst(first: number, current: number, mode: RankMode) {
  const diff = first - current;
  if (diff <= 0) return "領先";
  return mode === "avg" ? `-${diff.toFixed(1)}` : `-${diff}`;
}

function rankGlow(index: number) {
  if (index === 0) return "0 0 0 1px rgba(255,215,0,0.35), 0 18px 45px rgba(255,215,0,0.18)";
  if (index === 1) return "0 0 0 1px rgba(255,255,255,0.18), 0 16px 38px rgba(255,255,255,0.08)";
  return "0 0 0 1px rgba(255,140,90,0.22), 0 16px 38px rgba(255,140,90,0.10)";
}

export default function RankingsPage() {
  const [mode, setMode] = useState<RankMode>("avg");
  const [activeCategory, setActiveCategory] = useState<RankCategory>("pts");

  const activeConfig = useMemo(
    () => categoryList.find((c) => c.key === activeCategory)!,
    [activeCategory]
  );

  const currentTop3 = useMemo(() => {
    return mockData[mode][activeCategory];
  }, [mode, activeCategory]);

  return (
    <main
      style={{
        minHeight: "100vh",
        color: "#fff",
        background:
          "radial-gradient(circle at top, rgba(255,120,60,0.18) 0%, rgba(16,16,16,0.98) 22%, #050505 100%)",
        padding: "20px 16px 40px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1240,
          margin: "0 auto",
          display: "grid",
          gap: 20,
        }}
      >
        {/* Header */}
        <section
          style={{
            borderRadius: 28,
            padding: "24px 20px",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
            display: "grid",
            gap: 18,
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
            <div style={{ display: "grid", gap: 8 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  width: "fit-content",
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                TEAM LEADERBOARD
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(28px, 5vw, 44px)",
                  lineHeight: 1.05,
                  fontWeight: 900,
                  letterSpacing: -1.2,
                }}
              >
                數據排行榜
              </h1>

              <p
                style={{
                  margin: 0,
                  color: "rgba(255,255,255,0.72)",
                  fontSize: 14,
                  lineHeight: 1.7,
                  maxWidth: 700,
                }}
              >
                聚焦全隊五大數據前三名，快速查看目前最具影響力的球員表現。
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <Link
                href="/"
                style={{
                  textDecoration: "none",
                  color: "#fff",
                  padding: "10px 14px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                回首頁
              </Link>

              <button
                type="button"
                style={{
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  padding: "10px 14px",
                  borderRadius: 14,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                匯出圖片
              </button>
            </div>
          </div>

          {/* Mode Switch */}
          <div
            style={{
              display: "inline-flex",
              width: "fit-content",
              flexWrap: "wrap",
              gap: 8,
              padding: 6,
              borderRadius: 16,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {[
              { key: "avg" as RankMode, label: "場均" },
              { key: "total" as RankMode, label: "總數" },
            ].map((item) => {
              const active = mode === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMode(item.key)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 12,
                    padding: "10px 18px",
                    fontSize: 14,
                    fontWeight: 800,
                    color: active ? "#111" : "#fff",
                    background: active ? "#fff" : "transparent",
                    transition: "0.2s ease",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Category Tabs */}
        <section
          style={{
            borderRadius: 24,
            padding: "14px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            overflowX: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              minWidth: "max-content",
            }}
          >
            {categoryList.map((item) => {
              const active = activeCategory === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveCategory(item.key)}
                  style={{
                    border: active
                      ? `1px solid ${item.accent}`
                      : "1px solid rgba(255,255,255,0.08)",
                    background: active
                      ? `linear-gradient(135deg, ${item.accent}, rgba(255,255,255,0.08))`
                      : "rgba(255,255,255,0.03)",
                    color: "#fff",
                    borderRadius: 16,
                    padding: "12px 16px",
                    minWidth: 118,
                    display: "grid",
                    gap: 4,
                    cursor: "pointer",
                    textAlign: "left",
                    boxShadow: active ? `0 12px 30px ${item.accent}33` : "none",
                  }}
                >
                  <div style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</div>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>{item.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.82 }}>{item.short} LEADER</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Current Category Summary */}
        <section
          style={{
            display: "grid",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "end",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.62)",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                }}
              >
                CURRENT CATEGORY
              </div>
              <div
                style={{
                  fontSize: "clamp(22px, 4vw, 30px)",
                  fontWeight: 900,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span>{activeConfig.icon}</span>
                <span>{activeConfig.label} 前三名</span>
              </div>
            </div>

            <div
              style={{
                padding: "10px 14px",
                borderRadius: 16,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 13,
                color: "rgba(255,255,255,0.78)",
                fontWeight: 700,
              }}
            >
              顯示模式：{mode === "avg" ? activeConfig.unitAvg : activeConfig.unitTotal}
            </div>
          </div>

          {/* Top 3 Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {currentTop3.map((player, index) => {
              const firstValue = currentTop3[0]?.value ?? 0;
              const isFirst = index === 0;

              return (
                <div
                  key={player.id}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 28,
                    padding: isFirst ? "24px 22px" : "20px 18px",
                    background: isFirst
                      ? `linear-gradient(145deg, ${activeConfig.accent}33, rgba(255,255,255,0.06))`
                      : "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
                    border: isFirst
                      ? `1px solid ${activeConfig.accent}`
                      : "1px solid rgba(255,255,255,0.08)",
                    boxShadow: rankGlow(index),
                    minHeight: isFirst ? 260 : 230,
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -28,
                      right: -20,
                      width: 120,
                      height: 120,
                      borderRadius: "50%",
                      background: `${activeConfig.accent}22`,
                      filter: "blur(8px)",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 12px",
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.28)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        fontSize: 12,
                        fontWeight: 900,
                        letterSpacing: 0.6,
                      }}
                    >
                      {index === 0 ? "👑" : index === 1 ? "🥈" : "🥉"} {medalLabel(index)}
                    </div>

                    <div
                      style={{
                        fontSize: 48,
                        fontWeight: 900,
                        lineHeight: 1,
                        opacity: 0.14,
                      }}
                    >
                      #{index + 1}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr",
                      gap: 14,
                      alignItems: "center",
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 22,
                        background: "rgba(255,255,255,0.12)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 24,
                        fontWeight: 900,
                      }}
                    >
                      {player.number}
                    </div>

                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontSize: 22, fontWeight: 900 }}>
                        {player.name}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "rgba(255,255,255,0.72)",
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>#{player.number}</span>
                        <span>{player.position}</span>
                        <span>GP {player.games}</span>
                        <span>MIN {player.minutes}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: isFirst ? 44 : 36,
                        fontWeight: 900,
                        lineHeight: 1,
                        letterSpacing: -1,
                      }}
                    >
                      {formatValue(player.value, mode)}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "rgba(255,255,255,0.72)",
                        letterSpacing: 0.7,
                      }}
                    >
                      {mode === "avg" ? activeConfig.unitAvg : activeConfig.unitTotal}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "auto",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {index === 0 ? "目前榜首" : `與第1差距 ${diffFromFirst(firstValue, player.value, mode)}`}
                    </div>

                    <button
                      type="button"
                      style={{
                        border: "none",
                        cursor: "pointer",
                        borderRadius: 12,
                        padding: "10px 14px",
                        background: "#fff",
                        color: "#111",
                        fontSize: 13,
                        fontWeight: 900,
                      }}
                    >
                      查看球員
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Other Categories Preview */}
        <section
          style={{
            borderRadius: 28,
            padding: "20px 18px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "grid",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900 }}>其他排行榜快速預覽</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: 700 }}>
              點上方分類可切換完整前三名卡片
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            {categoryList.map((cat) => {
              const top = mockData[mode][cat.key][0];
              const isActive = cat.key === activeCategory;

              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  style={{
                    textAlign: "left",
                    borderRadius: 22,
                    padding: "16px",
                    border: isActive
                      ? `1px solid ${cat.accent}`
                      : "1px solid rgba(255,255,255,0.08)",
                    background: isActive
                      ? `linear-gradient(145deg, ${cat.accent}20, rgba(255,255,255,0.04))`
                      : "rgba(255,255,255,0.03)",
                    color: "#fff",
                    cursor: "pointer",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 900 }}>
                      {cat.icon} {cat.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "rgba(255,255,255,0.62)",
                      }}
                    >
                      LEADER
                    </div>
                  </div>

                  <div style={{ fontSize: 20, fontWeight: 900 }}>{top.name}</div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "end",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>
                      #{top.number} · {top.position}
                    </div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 900,
                        lineHeight: 1,
                      }}
                    >
                      {formatValue(top.value, mode)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}