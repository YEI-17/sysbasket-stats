"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import LogoutButton from "@/components/LogoutButton";

type OverviewStat = {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
};

type GameItem = {
  id: string;
  date: string;
  opponent: string;
  result: "W" | "L";
  score: string;
};

type TrendItem = {
  label: string;
  value: number;
};

type LeaderItem = {
  title: string;
  name: string;
  number: number;
  value: string;
};

export default function TeamStatsPage() {
  const [selectedRange, setSelectedRange] = useState("全部比賽");

  // 之後把這裡換成資料庫計算結果
  const overviewStats: OverviewStat[] = useMemo(
    () => [
      { label: "團隊場均得分", value: "72.4", sub: "PPG", highlight: true },
      { label: "團隊場均籃板", value: "38.1", sub: "RPG" },
      { label: "團隊場均助攻", value: "15.6", sub: "APG" },
      { label: "團隊場均失誤", value: "12.8", sub: "TOV" },
      { label: "罰球命中率", value: "71.9%", sub: "FT%" },
      { label: "2分命中率", value: "48.6%", sub: "2PT%" },
      { label: "3分命中率", value: "34.2%", sub: "3PT%" },
      { label: "團隊場均失分", value: "67.3", sub: "Opp PPG" },
    ],
    []
  );

  const recentGames: GameItem[] = useMemo(
    () => [
      { id: "1", date: "03/12", opponent: "資工A", result: "W", score: "78 - 66" },
      { id: "2", date: "03/09", opponent: "機械系", result: "L", score: "64 - 69" },
      { id: "3", date: "03/05", opponent: "電機系", result: "W", score: "81 - 73" },
      { id: "4", date: "02/28", opponent: "土木系", result: "W", score: "75 - 61" },
    ],
    []
  );

  const scoreTrend: TrendItem[] = useMemo(
    () => [
      { label: "G1", value: 78 },
      { label: "G2", value: 64 },
      { label: "G3", value: 81 },
      { label: "G4", value: 75 },
      { label: "G5", value: 72 },
    ],
    []
  );

  const leaders: LeaderItem[] = useMemo(
    () => [
      { title: "得分最高", name: "王小明", number: 7, value: "18.4 PPG" },
      { title: "籃板最高", name: "陳冠宇", number: 11, value: "9.2 RPG" },
      { title: "助攻最高", name: "李承恩", number: 3, value: "5.8 APG" },
    ],
    []
  );

  const statRows = useMemo(
    () => [
      { name: "團隊場均得分", value: "72.4" },
      { name: "團隊場均失分", value: "67.3" },
      { name: "團隊場均籃板", value: "38.1" },
      { name: "團隊場均助攻", value: "15.6" },
      { name: "團隊場均失誤", value: "12.8" },
      { name: "罰球命中率", value: "71.9%" },
      { name: "2分命中率", value: "48.6%" },
      { name: "3分命中率", value: "34.2%" },
    ],
    []
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        color: "#fff",
        background:
          "radial-gradient(circle at top, rgba(255,255,255,0.06) 0%, rgba(18,23,35,1) 26%, rgba(7,10,18,1) 100%)",
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          display: "grid",
          gap: 18,
        }}
      >
        {/* Header */}
        <section
          style={{
            background: "rgba(10,14,24,0.86)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 28,
            padding: 22,
            boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
            backdropFilter: "blur(14px)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <div
                style={{
                  fontSize: 14,
                  letterSpacing: 1.2,
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                TEAM PERFORMANCE
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(28px, 4vw, 42px)",
                  lineHeight: 1.05,
                  fontWeight: 900,
                  letterSpacing: -1,
                }}
              >
                團隊數據
              </h1>
              <div
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.62)",
                }}
              >
                檢視整體進攻、防守與命中率表現
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <select
                value={selectedRange}
                onChange={(e) => setSelectedRange(e.target.value)}
                style={{
                  height: 44,
                  borderRadius: 14,
                  padding: "0 14px",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.1)",
                  outline: "none",
                  fontSize: 14,
                }}
              >
                <option style={{ color: "#000" }}>全部比賽</option>
                <option style={{ color: "#000" }}>最近5場</option>
                <option style={{ color: "#000" }}>最近10場</option>
              </select>

              <Link
                href="/staff"
                style={{
                  height: 44,
                  padding: "0 16px",
                  borderRadius: 14,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                  color: "#fff",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontWeight: 700,
                }}
              >
                返回
              </Link>

              <LogoutButton />
            </div>
          </div>
        </section>

        {/* Overview Cards */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          {overviewStats.map((item) => (
            <div
              key={item.sub}
              style={{
                background: item.highlight
                  ? "linear-gradient(180deg, rgba(51,94,255,0.22) 0%, rgba(14,19,31,0.96) 100%)"
                  : "rgba(12,16,27,0.9)",
                border: item.highlight
                  ? "1px solid rgba(88,130,255,0.35)"
                  : "1px solid rgba(255,255,255,0.07)",
                borderRadius: 24,
                padding: 18,
                minHeight: 138,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: "0 14px 30px rgba(0,0,0,0.22)",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.66)",
                  fontWeight: 600,
                  letterSpacing: 0.2,
                }}
              >
                {item.label}
              </div>

              <div
                style={{
                  fontSize: "clamp(28px, 4vw, 38px)",
                  fontWeight: 900,
                  letterSpacing: -1,
                  lineHeight: 1,
                }}
              >
                {item.value}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: item.sub === "Opp PPG" ? "rgba(255,180,180,0.95)" : "rgba(255,255,255,0.48)",
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                {item.sub}
              </div>
            </div>
          ))}
        </section>

        {/* Middle Grid */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.05fr 0.95fr",
            gap: 18,
          }}
        >
          {/* Recent Games */}
          <div
            style={{
              background: "rgba(10,14,24,0.88)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 28,
              padding: 20,
              boxShadow: "0 18px 40px rgba(0,0,0,0.24)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.48)",
                    letterSpacing: 1,
                    marginBottom: 4,
                  }}
                >
                  RECENT GAMES
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: -0.4,
                  }}
                >
                  最近比賽
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {recentGames.map((game) => (
                <div
                  key={game.id}
                  style={{
                    borderRadius: 18,
                    padding: 14,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    display: "grid",
                    gridTemplateColumns: "84px 1fr 90px 70px",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.56)",
                      fontWeight: 700,
                    }}
                  >
                    {game.date}
                  </div>

                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  >
                    vs {game.opponent}
                  </div>

                  <div
                    style={{
                      textAlign: "center",
                      fontWeight: 800,
                      letterSpacing: 0.2,
                    }}
                  >
                    {game.score}
                  </div>

                  <div
                    style={{
                      justifySelf: "end",
                      minWidth: 54,
                      height: 34,
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 800,
                      background:
                        game.result === "W"
                          ? "rgba(51, 214, 121, 0.16)"
                          : "rgba(255, 92, 92, 0.14)",
                      color:
                        game.result === "W"
                          ? "rgba(123,255,173,0.96)"
                          : "rgba(255,146,146,0.96)",
                      border:
                        game.result === "W"
                          ? "1px solid rgba(90,255,154,0.18)"
                          : "1px solid rgba(255,120,120,0.18)",
                    }}
                  >
                    {game.result}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trend / Visual Block */}
          <div
            style={{
              background: "rgba(10,14,24,0.88)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 28,
              padding: 20,
              boxShadow: "0 18px 40px rgba(0,0,0,0.24)",
              display: "grid",
              gap: 18,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.48)",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                TREND
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: -0.4,
                }}
              >
                團隊得分趨勢
              </div>
            </div>

            <div
              style={{
                height: 220,
                borderRadius: 22,
                padding: "18px 16px 14px",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
                border: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "end",
                gap: 14,
              }}
            >
              {scoreTrend.map((item) => {
                const height = Math.max(26, item.value * 2);
                return (
                  <div
                    key={item.label}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "end",
                      gap: 8,
                      height: "100%",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.75)",
                        fontWeight: 700,
                      }}
                    >
                      {item.value}
                    </div>

                    <div
                      style={{
                        width: "100%",
                        maxWidth: 56,
                        height,
                        minHeight: 26,
                        borderRadius: "16px 16px 8px 8px",
                        background:
                          "linear-gradient(180deg, rgba(82,126,255,0.95) 0%, rgba(34,68,170,0.82) 100%)",
                        boxShadow: "0 10px 20px rgba(36,76,190,0.25)",
                      }}
                    />

                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.46)",
                        fontWeight: 700,
                      }}
                    >
                      {item.label}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              <MiniInfoCard title="最高得分" value="81" sub="MAX PTS" />
              <MiniInfoCard title="最低失分" value="61" sub="BEST DEF" />
              <MiniInfoCard title="平均分差" value="+5.1" sub="AVG DIFF" />
            </div>
          </div>
        </section>

        {/* Stats Table + Leaders */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: 18,
          }}
        >
          <div
            style={{
              background: "rgba(10,14,24,0.88)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 28,
              padding: 20,
              boxShadow: "0 18px 40px rgba(0,0,0,0.24)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.48)",
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              TEAM SUMMARY
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: -0.4,
                marginBottom: 16,
              }}
            >
              團隊數據總表
            </div>

            <div
              style={{
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 0.6fr",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.05)",
                  fontSize: 13,
                  fontWeight: 800,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                <div>項目</div>
                <div style={{ textAlign: "right" }}>數值</div>
              </div>

              {statRows.map((row, idx) => (
                <div
                  key={row.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 0.6fr",
                    padding: "15px 16px",
                    background:
                      idx % 2 === 0
                        ? "rgba(255,255,255,0.018)"
                        : "rgba(255,255,255,0.035)",
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.78)",
                      fontWeight: 600,
                    }}
                  >
                    {row.name}
                  </div>

                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 16,
                      fontWeight: 800,
                      letterSpacing: -0.2,
                    }}
                  >
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 18,
            }}
          >
            <div
              style={{
                background: "rgba(10,14,24,0.88)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 18px 40px rgba(0,0,0,0.24)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.48)",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                LEADERS
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: -0.4,
                  marginBottom: 16,
                }}
              >
                團隊王者
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {leaders.map((leader) => (
                  <div
                    key={leader.title}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "54px 1fr auto",
                      gap: 12,
                      alignItems: "center",
                      padding: 14,
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.035)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: 16,
                        background:
                          "linear-gradient(180deg, rgba(73,109,255,0.3) 0%, rgba(255,255,255,0.06) 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        fontSize: 18,
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      #{leader.number}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.5)",
                          fontWeight: 700,
                          marginBottom: 3,
                        }}
                      >
                        {leader.title}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {leader.name}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: "rgba(137,173,255,0.95)",
                      }}
                    >
                      {leader.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                background: "rgba(10,14,24,0.88)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 28,
                padding: 20,
                boxShadow: "0 18px 40px rgba(0,0,0,0.24)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.48)",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                NOTES
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: -0.4,
                  marginBottom: 12,
                }}
              >
                團隊概況
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 10,
                  color: "rgba(255,255,255,0.74)",
                  fontSize: 14,
                  lineHeight: 1.7,
                }}
              >
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  進攻端平均得分穩定，2分命中率優於3分命中率。
                </div>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  場均失分控制在 70 分以下，整體防守表現不錯。
                </div>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  後續可再加入 OREB、DREB、AST/TOV 等進階團隊指標。
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 1080px) {
          section[data-mid-grid],
          section[data-bottom-grid] {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 980px) {
          .team-mid-grid,
          .team-bottom-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 720px) {
          .recent-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

function MiniInfoCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 14,
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "grid",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.52)",
          fontWeight: 700,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: -0.8,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.42)",
          fontWeight: 700,
          letterSpacing: 0.8,
        }}
      >
        {sub}
      </div>
    </div>
  );
}