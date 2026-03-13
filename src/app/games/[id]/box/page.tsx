"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  useCallback,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams } from "next/navigation";
import { calcPlayerStats, calcTeamStats, pct, type EventRow } from "@/lib/stats";

type Player = {
  id: string;
  name: string;
  number: number | null;
  active?: boolean | null;
};

type EventDbRow = {
  player_id: string | null;
  event_type: EventRow["event_type"];
  team_side?: "A" | "B" | null;
  is_undone?: boolean | null;
};

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  status?: string | null;
  game_date?: string | null;
  created_at?: string | null;
};

type PlayerRow = {
  player: Player;
  stat: ReturnType<typeof calcPlayerStats>;
  hasPlayed: boolean;
};

function normalizeStatus(status?: string | null) {
  const s = (status ?? "").trim().toLowerCase();

  if (!s) return "未設定";
  if (["finished", "final", "ended", "done", "completed", "closed"].includes(s)) {
    return "已結束";
  }
  if (["live", "playing", "in_progress", "ongoing", "running"].includes(s)) {
    return "進行中";
  }
  if (["scheduled", "upcoming", "pending"].includes(s)) {
    return "未開始";
  }

  return status ?? "未設定";
}

function getStatusStyle(status: string): CSSProperties {
  if (status === "已結束") {
    return {
      color: "#d1fae5",
      background: "rgba(16, 185, 129, 0.14)",
      border: "1px solid rgba(16, 185, 129, 0.28)",
    };
  }

  if (status === "進行中") {
    return {
      color: "#fde68a",
      background: "rgba(245, 158, 11, 0.14)",
      border: "1px solid rgba(245, 158, 11, 0.28)",
    };
  }

  return {
    color: "#d4d4d8",
    background: "rgba(161, 161, 170, 0.12)",
    border: "1px solid rgba(161, 161, 170, 0.2)",
  };
}

function formatGameDate(game: GameRow | null) {
  if (!game) return "未提供日期";

  const raw = game.game_date ?? game.created_at ?? null;
  if (!raw) return "未提供日期";

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);

  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: raw.includes("T") ? "2-digit" : undefined,
    minute: raw.includes("T") ? "2-digit" : undefined,
    hour12: false,
  });
}

function getLeader(
  rows: PlayerRow[],
  key: keyof ReturnType<typeof calcPlayerStats>
): PlayerRow | null {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    const aValue = Number(a.stat[key] ?? 0);
    const bValue = Number(b.stat[key] ?? 0);
    return bValue - aValue;
  });

  const best = sorted[0];
  return Number(best.stat[key] ?? 0) > 0 ? best : null;
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 20,
        background: "rgba(12, 12, 12, 0.96)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 14px 30px rgba(0,0,0,0.28)",
      }}
    >
      <div style={{ color: "#71717a", fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ color: "#fafafa", fontSize: 24, fontWeight: 900 }}>{value}</div>
      {sub ? (
        <div style={{ color: "#d4d4d8", fontSize: 13, marginTop: 8 }}>{sub}</div>
      ) : null}
    </div>
  );
}

export default function BoxPage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!gameId) return;

    setMsg("");

    try {
      const { data: gameData, error: gameError } = await supabase
        .from("games")
        .select("id, teamA, teamB, status, game_date, created_at")
        .eq("id", gameId)
        .maybeSingle();

      if (gameError) {
        throw new Error(`讀取比賽資料失敗：${gameError.message}`);
      }

      setGame((gameData as GameRow | null) ?? null);

      const { data: ev, error: evError } = await supabase
        .from("events")
        .select("player_id, event_type, team_side, is_undone")
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });

      if (evError) {
        throw new Error(`讀取事件失敗：${evError.message}`);
      }

      const normalizedEvents: EventRow[] = ((ev ?? []) as EventDbRow[]).map((e) => ({
        player_id: e.player_id,
        event_type: e.event_type,
        team_side: e.team_side ?? null,
        is_undone: e.is_undone ?? false,
      }));

      setEvents(normalizedEvents);

      // 直接抓所有啟用中的球員，確保沒出場、沒數據的人也會顯示
      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("id, name, number, active")
        .eq("active", true)
        .order("number", { ascending: true });

      if (playerError) {
        throw new Error(`讀取球員詳細資料失敗：${playerError.message}`);
      }

      setPlayers((playerData ?? []) as Player[]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "讀取資料失敗";
      setMsg(message);
      setGame(null);
      setPlayers([]);
      setEvents([]);
    }
  }, [gameId]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!gameId) return;
      setLoading(true);
      await loadData();
      if (mounted) setLoading(false);
    }

    init();

    return () => {
      mounted = false;
    };
  }, [gameId, loadData]);

  useEffect(() => {
    if (!gameId) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReload = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        loadData();
      }, 150);
    };

    const channel = supabase
      .channel(`box-realtime-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          scheduleReload();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        () => {
          scheduleReload();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
        },
        () => {
          scheduleReload();
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [gameId, loadData]);

  const rows = useMemo<PlayerRow[]>(() => {
    const mapped = players.map((player) => {
      const playerEvents = events.filter(
        (e) => e.team_side === "A" && e.player_id === player.id
      );

      const stat = calcPlayerStats(playerEvents);

      const hasPlayed =
        stat.pts > 0 ||
        stat.fg2a > 0 ||
        stat.fg3a > 0 ||
        stat.fta > 0 ||
        stat.reb > 0 ||
        stat.ast > 0 ||
        stat.stl > 0 ||
        stat.blk > 0 ||
        stat.tov > 0 ||
        stat.pf > 0;

      return { player, stat, hasPlayed };
    });

    return mapped.sort((a, b) => {
      if (a.hasPlayed !== b.hasPlayed) return a.hasPlayed ? -1 : 1;
      return (a.player.number ?? 999) - (b.player.number ?? 999);
    });
  }, [players, events]);

  const team = useMemo(() => calcTeamStats(events, "A"), [events]);
  const opponent = useMemo(() => calcTeamStats(events, "B"), [events]);

  const scoringLeader = useMemo(() => getLeader(rows, "pts"), [rows]);
  const reboundLeader = useMemo(() => getLeader(rows, "reb"), [rows]);
  const assistLeader = useMemo(() => getLeader(rows, "ast"), [rows]);

  const gameTitleA = game?.teamA?.trim() || "我方";
  const gameTitleB = game?.teamB?.trim() || "對手";
  const statusText = normalizeStatus(game?.status);
  const statusStyle = getStatusStyle(statusText);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(255,255,255,0.05) 0%, #000000 24%, #000000 100%)",
        color: "#f5f5f5",
        padding: "24px 16px 40px",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: "#71717a", fontSize: 13, marginBottom: 8 }}>
            單場數據頁
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              lineHeight: 1.2,
              color: "#ffffff",
              fontWeight: 900,
              letterSpacing: -0.4,
            }}
          >
            Box Score
          </h1>
        </div>

        <div
          style={{
            marginBottom: 18,
            padding: 20,
            borderRadius: 24,
            background: "rgba(10, 10, 10, 0.96)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap",
              alignItems: "flex-start",
              marginBottom: 18,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: "#ffffff",
                  lineHeight: 1.3,
                  wordBreak: "break-word",
                }}
              >
                {gameTitleA}
                <span style={{ color: "#52525b", margin: "0 8px" }}>VS</span>
                {gameTitleB}
              </div>
              <div
                style={{
                  marginTop: 10,
                  color: "#a1a1aa",
                  fontSize: 14,
                }}
              >
                比賽日期：{formatGameDate(game)}
              </div>
            </div>

            <span
              style={{
                ...statusStyle,
                padding: "7px 12px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 800,
                whiteSpace: "nowrap",
              }}
            >
              {statusText}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              gap: 12,
              alignItems: "center",
              padding: "16px 18px",
              borderRadius: 20,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#71717a", fontSize: 12, marginBottom: 6 }}>
                我方
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#ffffff",
                  wordBreak: "break-word",
                }}
              >
                {gameTitleA}
              </div>
            </div>

            <div
              style={{
                fontSize: 36,
                fontWeight: 900,
                color: "#ffffff",
                letterSpacing: 1,
                whiteSpace: "nowrap",
              }}
            >
              {team.pts} : {opponent.pts}
            </div>

            <div style={{ minWidth: 0, textAlign: "right" }}>
              <div style={{ color: "#71717a", fontSize: 12, marginBottom: 6 }}>
                對手
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#ffffff",
                  wordBreak: "break-word",
                }}
              >
                {gameTitleB}
              </div>
            </div>
          </div>
        </div>

        {loading && <div style={infoCardStyle}>讀取中...</div>}

        {!loading && msg && (
          <div
            style={{
              borderRadius: 18,
              padding: 18,
              background: "rgba(127, 29, 29, 0.2)",
              border: "1px solid rgba(248, 113, 113, 0.24)",
              color: "#fecaca",
            }}
          >
            {msg}
          </div>
        )}

        {!loading && !msg && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginBottom: 18,
              }}
            >
              <SummaryCard
                label="得分王"
                value={
                  scoringLeader
                    ? `#${scoringLeader.player.number ?? "-"} ${scoringLeader.player.name}`
                    : "—"
                }
                sub={scoringLeader ? `${scoringLeader.stat.pts} 分` : "尚無資料"}
              />

              <SummaryCard
                label="籃板王"
                value={
                  reboundLeader
                    ? `#${reboundLeader.player.number ?? "-"} ${reboundLeader.player.name}`
                    : "—"
                }
                sub={reboundLeader ? `${reboundLeader.stat.reb} 籃板` : "尚無資料"}
              />

              <SummaryCard
                label="助攻王"
                value={
                  assistLeader
                    ? `#${assistLeader.player.number ?? "-"} ${assistLeader.player.name}`
                    : "—"
                }
                sub={assistLeader ? `${assistLeader.stat.ast} 助攻` : "尚無資料"}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
                marginBottom: 18,
              }}
            >
              <div style={panelStyle}>
                <div style={panelTitleStyle}>{gameTitleA} 團隊摘要</div>
                <div style={summaryGridStyle}>
                  <div style={miniStatStyle}><span>PTS</span><strong>{team.pts}</strong></div>
                  <div style={miniStatStyle}><span>2FG</span><strong>{team.fg2m}/{team.fg2a}</strong></div>
                  <div style={miniStatStyle}><span>3FG</span><strong>{team.fg3m}/{team.fg3a}</strong></div>
                  <div style={miniStatStyle}><span>FT</span><strong>{team.ftm}/{team.fta}</strong></div>
                  <div style={miniStatStyle}><span>2%</span><strong>{pct(team.fg2m, team.fg2a)}</strong></div>
                  <div style={miniStatStyle}><span>3%</span><strong>{pct(team.fg3m, team.fg3a)}</strong></div>
                  <div style={miniStatStyle}><span>FT%</span><strong>{pct(team.ftm, team.fta)}</strong></div>
                  <div style={miniStatStyle}><span>REB</span><strong>{team.reb}</strong></div>
                  <div style={miniStatStyle}><span>AST</span><strong>{team.ast}</strong></div>
                  <div style={miniStatStyle}><span>STL</span><strong>{team.stl}</strong></div>
                  <div style={miniStatStyle}><span>BLK</span><strong>{team.blk}</strong></div>
                  <div style={miniStatStyle}><span>TOV</span><strong>{team.tov}</strong></div>
                </div>
              </div>

              <div style={panelStyle}>
                <div style={panelTitleStyle}>{gameTitleB} 團隊摘要</div>
                <div style={summaryGridStyle}>
                  <div style={miniStatStyle}><span>PTS</span><strong>{opponent.pts}</strong></div>
                  <div style={miniStatStyle}><span>2FG</span><strong>{opponent.fg2m}/{opponent.fg2a}</strong></div>
                  <div style={miniStatStyle}><span>3FG</span><strong>{opponent.fg3m}/{opponent.fg3a}</strong></div>
                  <div style={miniStatStyle}><span>FT</span><strong>{opponent.ftm}/{opponent.fta}</strong></div>
                  <div style={miniStatStyle}><span>2%</span><strong>{pct(opponent.fg2m, opponent.fg2a)}</strong></div>
                  <div style={miniStatStyle}><span>3%</span><strong>{pct(opponent.fg3m, opponent.fg3a)}</strong></div>
                  <div style={miniStatStyle}><span>FT%</span><strong>{pct(opponent.ftm, opponent.fta)}</strong></div>
                  <div style={miniStatStyle}><span>REB</span><strong>{opponent.reb}</strong></div>
                  <div style={miniStatStyle}><span>AST</span><strong>{opponent.ast}</strong></div>
                  <div style={miniStatStyle}><span>STL</span><strong>{opponent.stl}</strong></div>
                  <div style={miniStatStyle}><span>BLK</span><strong>{opponent.blk}</strong></div>
                  <div style={miniStatStyle}><span>TOV</span><strong>{opponent.tov}</strong></div>
                </div>
              </div>
            </div>

            {rows.length === 0 ? (
              <div style={infoCardStyle}>目前這場比賽還沒有球員資料。</div>
            ) : (
              <div
                style={{
                  overflowX: "auto",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 20,
                  background: "rgba(10, 10, 10, 0.96)",
                  boxShadow: "0 14px 30px rgba(0,0,0,0.28)",
                }}
              >
                <table
                  style={{
                    borderCollapse: "collapse",
                    width: "100%",
                    minWidth: 980,
                    fontSize: 14,
                  }}
                >
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                      {[
                        "球員",
                        "PTS",
                        "2FG",
                        "3FG",
                        "FT",
                        "REB",
                        "AST",
                        "STL",
                        "BLK",
                        "TOV",
                        "PF",
                        "2%",
                        "3%",
                        "FT%",
                      ].map((header) => (
                        <th
                          key={header}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.08)",
                            padding: 12,
                            textAlign: "left",
                            whiteSpace: "nowrap",
                            color: "#d4d4d8",
                            fontWeight: 800,
                          }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map(({ player, stat, hasPlayed }) => (
                      <tr
                        key={player.id}
                        style={{
                          background: hasPlayed
                            ? "transparent"
                            : "rgba(255,255,255,0.025)",
                        }}
                      >
                        <td
                          style={{
                            padding: 12,
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                            whiteSpace: "nowrap",
                            color: "#fafafa",
                            fontWeight: 700,
                          }}
                        >
                          #{player.number ?? "-"} {player.name}
                          {!hasPlayed && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 12,
                                color: "#71717a",
                                fontWeight: 600,
                              }}
                            >
                              DNP
                            </span>
                          )}
                        </td>

                        <td style={cellStyle}>{stat.pts}</td>
                        <td style={cellStyle}>{stat.fg2m}/{stat.fg2a}</td>
                        <td style={cellStyle}>{stat.fg3m}/{stat.fg3a}</td>
                        <td style={cellStyle}>{stat.ftm}/{stat.fta}</td>
                        <td style={cellStyle}>{stat.reb}</td>
                        <td style={cellStyle}>{stat.ast}</td>
                        <td style={cellStyle}>{stat.stl}</td>
                        <td style={cellStyle}>{stat.blk}</td>
                        <td style={cellStyle}>{stat.tov}</td>
                        <td style={cellStyle}>{stat.pf}</td>
                        <td style={cellStyle}>{pct(stat.fg2m, stat.fg2a)}</td>
                        <td style={cellStyle}>{pct(stat.fg3m, stat.fg3a)}</td>
                        <td style={cellStyle}>{pct(stat.ftm, stat.fta)}</td>
                      </tr>
                    ))}

                    <tr style={{ background: "rgba(255,255,255,0.05)" }}>
                      <td
                        style={{
                          padding: 12,
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                          color: "#ffffff",
                          borderTop: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        TEAM
                      </td>
                      <td style={teamCellStyle}>{team.pts}</td>
                      <td style={teamCellStyle}>{team.fg2m}/{team.fg2a}</td>
                      <td style={teamCellStyle}>{team.fg3m}/{team.fg3a}</td>
                      <td style={teamCellStyle}>{team.ftm}/{team.fta}</td>
                      <td style={teamCellStyle}>{team.reb}</td>
                      <td style={teamCellStyle}>{team.ast}</td>
                      <td style={teamCellStyle}>{team.stl}</td>
                      <td style={teamCellStyle}>{team.blk}</td>
                      <td style={teamCellStyle}>{team.tov}</td>
                      <td style={teamCellStyle}>{team.pf}</td>
                      <td style={teamCellStyle}>{pct(team.fg2m, team.fg2a)}</td>
                      <td style={teamCellStyle}>{pct(team.fg3m, team.fg3a)}</td>
                      <td style={teamCellStyle}>{pct(team.ftm, team.fta)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

const infoCardStyle: CSSProperties = {
  borderRadius: 18,
  padding: 24,
  background: "rgba(10, 10, 10, 0.96)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#e4e4e7",
};

const panelStyle: CSSProperties = {
  padding: 18,
  borderRadius: 20,
  background: "rgba(10, 10, 10, 0.96)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 12px 28px rgba(0,0,0,0.24)",
};

const panelTitleStyle: CSSProperties = {
  color: "#ffffff",
  fontSize: 18,
  fontWeight: 900,
  marginBottom: 14,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const miniStatStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.05)",
  color: "#d4d4d8",
};

const cellStyle: CSSProperties = {
  padding: 12,
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  color: "#e5e7eb",
};

const teamCellStyle: CSSProperties = {
  padding: 12,
  fontWeight: 900,
  color: "#ffffff",
  borderTop: "1px solid rgba(255,255,255,0.08)",
};