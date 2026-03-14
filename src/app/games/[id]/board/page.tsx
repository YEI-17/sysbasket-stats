"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import LogoutButton from "@/components/LogoutButton";

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  team_side?: "A" | "B" | null;
  is_undone?: boolean;
  undone_at?: string | null;
};

type ClockRow = {
  game_id: string;
  quarter: number;
  seconds_left: number;
  is_running: boolean;
  updated_at?: string;
};

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  is_live?: boolean | null;
  ended_at?: string | null;
  status?: string | null;
};

type Player = {
  id: string;
  name: string;
  number: number | null;
  active?: boolean;
};

type GamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "A" | "B";
  is_starter: boolean;
};

type Stat = {
  pts: number;
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  reb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  pf: number;
  plusMinus: number | null;
};

const CLOCK_TABLE = "game_clock";
const REGULAR_SECONDS = 600;

const emptyStat = (): Stat => ({
  pts: 0,
  fg2m: 0,
  fg2a: 0,
  fg3m: 0,
  fg3a: 0,
  ftm: 0,
  fta: 0,
  reb: 0,
  ast: 0,
  tov: 0,
  stl: 0,
  blk: 0,
  pf: 0,
  plusMinus: null,
});

function formatClock(secondsLeft: number) {
  const safe = Math.max(0, Math.floor(secondsLeft || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMinutesFromSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function applyEvent(stat: Stat, eventType: string) {
  switch (eventType) {
    case "fg2_made":
      stat.pts += 2;
      stat.fg2m += 1;
      stat.fg2a += 1;
      break;
    case "fg2_miss":
      stat.fg2a += 1;
      break;
    case "fg3_made":
      stat.pts += 3;
      stat.fg3m += 1;
      stat.fg3a += 1;
      break;
    case "fg3_miss":
      stat.fg3a += 1;
      break;
    case "ft_made":
      stat.pts += 1;
      stat.ftm += 1;
      stat.fta += 1;
      break;
    case "ft_miss":
      stat.fta += 1;
      break;
    case "reb":
      stat.reb += 1;
      break;
    case "ast":
      stat.ast += 1;
      break;
    case "tov":
      stat.tov += 1;
      break;
    case "stl":
      stat.stl += 1;
      break;
    case "blk":
      stat.blk += 1;
      break;
    case "pf":
      stat.pf += 1;
      break;
    default:
      break;
  }
}

function getPoints(eventType: string) {
  if (eventType === "fg2_made") return 2;
  if (eventType === "fg3_made") return 3;
  if (eventType === "ft_made") return 1;
  return 0;
}

function computeDisplaySeconds(clock: ClockRow | null) {
  if (!clock) return REGULAR_SECONDS;

  const base = Math.max(0, clock.seconds_left ?? 0);

  if (!clock.is_running) return base;
  if (!clock.updated_at) return base;

  const updatedAtMs = new Date(clock.updated_at).getTime();
  if (Number.isNaN(updatedAtMs)) return base;

  const nowMs = Date.now();
  const elapsedSeconds = Math.floor((nowMs - updatedAtMs) / 1000);

  return Math.max(0, base - elapsedSeconds);
}

function getQuarterLabel(quarter: number) {
  if (quarter <= 4) return `Q${quarter}`;
  return `OT${quarter - 4}`;
}

function sortPlayers(list: Player[]) {
  return [...list].sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
}

function getQuarterPlayedSeconds(
  quarter: number,
  currentQuarter: number,
  currentDisplaySeconds: number
) {
  if (quarter < currentQuarter) return REGULAR_SECONDS;
  if (quarter > currentQuarter) return 0;
  return REGULAR_SECONDS - currentDisplaySeconds;
}

function getGameStatusText(game: GameRow | null, clock: ClockRow | null) {
  if (game?.status === "finished") return "比賽已結束";
  if (clock?.is_running) return "計時中";
  return "暫停中";
}

function getGameStatusColors(game: GameRow | null, clock: ClockRow | null) {
  if (game?.status === "finished") {
    return {
      background: "rgba(34,197,94,0.14)",
      color: "#bbf7d0",
      borderColor: "rgba(34,197,94,0.28)",
      dot: "#4ade80",
    };
  }

  if (clock?.is_running) {
    return {
      background: "rgba(239,68,68,0.14)",
      color: "#fecaca",
      borderColor: "rgba(239,68,68,0.30)",
      dot: "#ef4444",
    };
  }

  return {
    background: "rgba(245,158,11,0.14)",
    color: "#fde68a",
    borderColor: "rgba(245,158,11,0.28)",
    dot: "#f59e0b",
  };
}

export default function BoardPage() {
  const params = useParams();
  const gameId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [clock, setClock] = useState<ClockRow | null>(null);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);
  const [displaySeconds, setDisplaySeconds] = useState(REGULAR_SECONDS);
  const [viewerCount, setViewerCount] = useState(1);

  const presenceKeyRef = useRef(`viewer-${Math.random().toString(36).slice(2)}`);

  async function loadGame() {
    const { data, error } = await supabase
      .from("games")
      .select("id, teamA, teamB, is_live, ended_at, status")
      .eq("id", gameId)
      .single();

    if (error) {
      setMsg(`讀取 games 失敗：${error.message}`);
      return;
    }

    setGame(data as GameRow);
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, number, active")
      .eq("active", true)
      .order("number", { ascending: true });

    if (error) {
      setMsg(`讀取 players 失敗：${error.message}`);
      return;
    }

    setPlayers((data as Player[]) || []);
  }

  async function loadGamePlayers() {
    const { data, error } = await supabase
      .from("game_players")
      .select("id, game_id, player_id, team_side, is_starter")
      .eq("game_id", gameId);

    if (error) {
      setMsg(`讀取 game_players 失敗：${error.message}`);
      return;
    }

    setGamePlayers((data as GamePlayerRow[]) || []);
  }

  async function loadEvents() {
    const { data, error } = await supabase
      .from("events")
      .select(
        "id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at"
      )
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (error) {
      setMsg(`讀取 events 失敗：${error.message}`);
      return;
    }

    setEvents((data as EventRow[]) || []);
  }

  async function loadClock() {
    const { data, error } = await supabase
      .from(CLOCK_TABLE)
      .select("game_id, quarter, seconds_left, is_running, updated_at")
      .eq("game_id", gameId)
      .order("quarter", { ascending: false })
      .limit(1);

    if (error) {
      setMsg(`讀取 ${CLOCK_TABLE} 失敗：${error.message}`);
      return;
    }

    const latest = (data as ClockRow[] | null)?.[0] ?? null;

    if (!latest) {
      const { data: inserted, error: insertError } = await supabase
        .from(CLOCK_TABLE)
        .insert({
          game_id: gameId,
          quarter: 1,
          seconds_left: REGULAR_SECONDS,
          is_running: false,
        })
        .select("game_id, quarter, seconds_left, is_running, updated_at")
        .single();

      if (insertError) {
        setMsg(`建立 ${CLOCK_TABLE} 失敗：${insertError.message}`);
        return;
      }

      setClock(inserted as ClockRow);
      return;
    }

    setClock(latest);
  }

  async function loadAll(showLoading = false) {
    if (!gameId) return;
    if (showLoading) setLoading(true);
    setMsg("");

    await Promise.all([
      loadGame(),
      loadPlayers(),
      loadGamePlayers(),
      loadEvents(),
      loadClock(),
    ]);

    if (showLoading) setLoading(false);
  }

  useEffect(() => {
    if (!gameId) return;
    loadAll(true);
  }, [gameId]);

  useEffect(() => {
    setDisplaySeconds(computeDisplaySeconds(clock));

    const timer = setInterval(() => {
      setDisplaySeconds(computeDisplaySeconds(clock));
    }, 250);

    return () => clearInterval(timer);
  }, [clock]);

  useEffect(() => {
    if (!gameId) return;

    const presenceChannel = supabase.channel(`game-presence-${gameId}`, {
      config: {
        presence: { key: presenceKeyRef.current },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const count = Object.keys(state).length;
        setViewerCount(count || 1);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            role: "viewer",
            page: "board",
            gameId,
            joinedAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    const dataChannel = supabase.channel(`game-data-${gameId}`);

    dataChannel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const newRow = payload.new as GameRow | undefined;
          if (newRow && newRow.id) {
            setGame(newRow);
          } else {
            loadGame();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          await loadEvents();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_players",
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          await loadGamePlayers();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: CLOCK_TABLE,
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const newRow = payload.new as ClockRow | undefined;
          if (newRow && newRow.game_id) {
            setClock(newRow);
          } else {
            loadClock();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dataChannel);
    };
  }, [gameId]);

  const validEvents = useMemo(() => {
    return events.filter((e) => !e.is_undone);
  }, [events]);

  const teamAPlayerIds = useMemo(() => {
    const ids = gamePlayers
      .filter((gp) => gp.team_side === "A")
      .map((gp) => gp.player_id);

    if (ids.length > 0) return ids;
    return players.map((p) => p.id);
  }, [gamePlayers, players]);

  const teamAPlayers = useMemo(() => {
    return sortPlayers(players.filter((p) => teamAPlayerIds.includes(p.id)));
  }, [players, teamAPlayerIds]);

  const starterIds = useMemo(() => {
    const ids = gamePlayers
      .filter((gp) => gp.team_side === "A" && gp.is_starter)
      .map((gp) => gp.player_id);

    if (ids.length > 0) return ids;
    return teamAPlayers.slice(0, 5).map((p) => p.id);
  }, [gamePlayers, teamAPlayers]);

  const currentOnCourtIds = useMemo(() => {
    const lineup = new Set<string>(starterIds);

    for (const e of validEvents) {
      if (e.team_side !== "A") continue;
      if (!e.player_id) continue;

      if (e.event_type === "sub_in") lineup.add(e.player_id);
      if (e.event_type === "sub_out") lineup.delete(e.player_id);
    }

    return Array.from(lineup);
  }, [starterIds, validEvents]);

  const statsMap = useMemo(() => {
    const map: Record<string, Stat> = {};

    for (const p of teamAPlayers) {
      map[p.id] = emptyStat();
    }

    for (const e of validEvents) {
      if (e.team_side !== "A") continue;
      if (!e.player_id) continue;
      if (e.event_type === "sub_in" || e.event_type === "sub_out") continue;

      if (!map[e.player_id]) {
        map[e.player_id] = emptyStat();
      }

      applyEvent(map[e.player_id], e.event_type);
    }

    return map;
  }, [teamAPlayers, validEvents]);

  const minutesMap = useMemo(() => {
    const map: Record<string, number> = {};
    const currentQuarter = clock?.quarter ?? 1;

    for (const p of teamAPlayers) {
      map[p.id] = 0;
    }

    for (let q = 1; q <= currentQuarter; q += 1) {
      const playedSecondsThisQuarter = getQuarterPlayedSeconds(
        q,
        currentQuarter,
        displaySeconds
      );

      const lineup = new Set<string>();

      if (q === 1) {
        starterIds.forEach((id) => lineup.add(id));
      } else {
        starterIds.forEach((id) => lineup.add(id));

        for (const e of validEvents) {
          if (e.team_side !== "A") continue;
          if (!e.player_id) continue;
          if (e.quarter >= q) break;

          if (e.event_type === "sub_in") lineup.add(e.player_id);
          if (e.event_type === "sub_out") lineup.delete(e.player_id);
        }
      }

      const activeStartMap: Record<string, number | null> = {};
      for (const p of teamAPlayers) {
        activeStartMap[p.id] = lineup.has(p.id) ? 0 : null;
      }

      const quarterEvents = validEvents
        .filter(
          (e) =>
            e.team_side === "A" &&
            e.quarter === q &&
            !!e.player_id &&
            (e.event_type === "sub_in" || e.event_type === "sub_out")
        )
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

      const totalSubEvents = quarterEvents.length;

      quarterEvents.forEach((e, idx) => {
        const playerId = e.player_id!;
        const eventElapsed = totalSubEvents
          ? Math.floor(((idx + 1) / (totalSubEvents + 1)) * playedSecondsThisQuarter)
          : playedSecondsThisQuarter;

        if (e.event_type === "sub_in") {
          if (activeStartMap[playerId] == null) {
            activeStartMap[playerId] = eventElapsed;
          }
        }

        if (e.event_type === "sub_out") {
          const startedAt = activeStartMap[playerId];
          if (startedAt != null) {
            map[playerId] = (map[playerId] || 0) + Math.max(0, eventElapsed - startedAt);
            activeStartMap[playerId] = null;
          }
        }
      });

      for (const p of teamAPlayers) {
        const startedAt = activeStartMap[p.id];
        if (startedAt != null) {
          map[p.id] = (map[p.id] || 0) + Math.max(0, playedSecondsThisQuarter - startedAt);
        }
      }
    }

    return map;
  }, [teamAPlayers, validEvents, starterIds, clock?.quarter, displaySeconds]);

  const totalScore = useMemo(() => {
    let home = 0;
    let away = 0;

    for (const e of validEvents) {
      const pts = getPoints(e.event_type);
      if (e.team_side === "A") home += pts;
      if (e.team_side === "B") away += pts;
    }

    return { home, away };
  }, [validEvents]);

  const quarterScores = useMemo(() => {
    const maxQuarter = Math.max(clock?.quarter ?? 1, ...validEvents.map((e) => e.quarter), 1);
    const byQuarter: Record<number, { home: number; away: number }> = {};

    for (let q = 1; q <= maxQuarter; q += 1) {
      byQuarter[q] = { home: 0, away: 0 };
    }

    for (const e of validEvents) {
      if (!byQuarter[e.quarter]) {
        byQuarter[e.quarter] = { home: 0, away: 0 };
      }

      const pts = getPoints(e.event_type);
      if (e.team_side === "A") byQuarter[e.quarter].home += pts;
      if (e.team_side === "B") byQuarter[e.quarter].away += pts;
    }

    return byQuarter;
  }, [validEvents, clock?.quarter]);

  const onCourtPlayers = useMemo(() => {
    return teamAPlayers.filter((p) => currentOnCourtIds.includes(p.id));
  }, [teamAPlayers, currentOnCourtIds]);

  const benchPlayers = useMemo(() => {
    return teamAPlayers.filter((p) => !currentOnCourtIds.includes(p.id));
  }, [teamAPlayers, currentOnCourtIds]);

  const statusColors = getGameStatusColors(game, clock);

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={bgGlowTopStyle} />
        <div style={bgGlowBottomStyle} />
        <div style={loadingCardStyle}>載入中...</div>
      </main>
    );
  }

  function renderPlayerRow(p: Player, isOnCourt: boolean) {
    const s = statsMap[p.id] || emptyStat();
    const min = formatMinutesFromSeconds(minutesMap[p.id] || 0);

    return (
      <tr
        key={p.id}
        style={{
          background: isOnCourt ? "rgba(255,255,255,0.02)" : "transparent",
        }}
      >
        <td style={tdNameStyle}>
          <div style={playerCellWrapStyle}>
            <span
              style={{
                ...playerDotStyle,
                background: isOnCourt ? "#f97316" : "#52525b",
                boxShadow: isOnCourt ? "0 0 14px rgba(249,115,22,0.45)" : "none",
              }}
            />
            <span style={playerNameStyle}>
              {p.number ? `#${p.number} ` : ""}
              {p.name}
            </span>
          </div>
        </td>
        <td style={tdStyle}>{min}</td>
        <td style={{ ...tdStyle, color: "#fdba74", fontWeight: 800 }}>{s.pts}</td>
        <td style={tdStyle}>
          {s.fg2m}/{s.fg2a}
        </td>
        <td style={tdStyle}>
          {s.fg3m}/{s.fg3a}
        </td>
        <td style={tdStyle}>
          {s.ftm}/{s.fta}
        </td>
        <td style={tdStyle}>{s.reb}</td>
        <td style={tdStyle}>{s.ast}</td>
        <td style={tdStyle}>{s.tov}</td>
        <td style={tdStyle}>{s.stl}</td>
        <td style={tdStyle}>{s.blk}</td>
        <td style={tdStyle}>{s.pf}</td>
        <td style={tdStyle}>{s.plusMinus ?? "—"}</td>
      </tr>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={bgGlowTopStyle} />
      <div style={bgGlowBottomStyle} />
      <div style={bgBallStyle} />

      <div style={containerStyle}>
        <div style={topBarStyle}>
          <div style={topLeftStyle}>
            <div style={eyebrowStyle}>COURTSIDE LIVE BOARD</div>
            <div style={topButtonRowStyle}>
              <Link href={`/games/${gameId}/box`} style={linkButtonStyle}>
                Box Score
              </Link>
            </div>
          </div>
          <LogoutButton />
        </div>

        <section style={scoreCardStyle}>
          <div style={scoreGlowOverlayStyle} />

          <div style={teamBigBlockStyle}>
            <div style={teamLabelStyle}>{game?.teamA || "主場"}</div>
            <div style={bigScoreStyle}>{totalScore.home}</div>
          </div>

          <div style={centerBlockStyle}>
            <div style={topInfoRowStyle}>
              <div style={quarterBadgeStyle}>{getQuarterLabel(clock?.quarter ?? 1)}</div>

              <div style={viewerPillStyle}>
                <span style={viewerDotStyle} />
                線上觀看 {viewerCount}
              </div>

              <div
                style={{
                  ...statusBadgeStyle,
                  background: statusColors.background,
                  color: statusColors.color,
                  borderColor: statusColors.borderColor,
                }}
              >
                <span
                  style={{
                    ...statusDotStyle,
                    background: statusColors.dot,
                  }}
                />
                {getGameStatusText(game, clock)}
              </div>
            </div>

            <div style={clockStyle}>{formatClock(displaySeconds)}</div>

            <div style={quarterLineWrapStyle}>
              {Object.keys(quarterScores)
                .map(Number)
                .sort((a, b) => a - b)
                .map((q) => (
                  <div key={q} style={quarterItemStyle}>
                    <div style={quarterItemLabelStyle}>{getQuarterLabel(q)}</div>
                    <div style={quarterItemScoreStyle}>
                      {quarterScores[q].home} - {quarterScores[q].away}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div style={teamBigBlockStyle}>
            <div style={teamLabelStyle}>{game?.teamB || "客場"}</div>
            <div style={bigScoreStyle}>{totalScore.away}</div>
          </div>
        </section>

        <section style={tableCardStyle}>
          <div style={tableHeaderStyle}>
            <div>
              <div style={sectionEyebrowStyle}>TEAM A LIVE STATS</div>
              <div style={sectionTitleStyle}>球員數據</div>
            </div>

            <div style={legendWrapStyle}>
              <div style={legendItemStyle}>
                <span style={legendOnStyle} />
                場上球員
              </div>
              <div style={legendItemStyle}>
                <span style={legendBenchStyle} />
                場下球員
              </div>
            </div>
          </div>

          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thNameStyle}>球員</th>
                  <th style={thStyle}>MIN</th>
                  <th style={thStyle}>PTS</th>
                  <th style={thStyle}>2PT</th>
                  <th style={thStyle}>3PT</th>
                  <th style={thStyle}>FT</th>
                  <th style={thStyle}>REB</th>
                  <th style={thStyle}>AST</th>
                  <th style={thStyle}>TOV</th>
                  <th style={thStyle}>STL</th>
                  <th style={thStyle}>BLK</th>
                  <th style={thStyle}>PF</th>
                  <th style={thStyle}>+/-</th>
                </tr>
              </thead>

              <tbody>
                {onCourtPlayers.map((p) => renderPlayerRow(p, true))}

                {benchPlayers.length > 0 && (
                  <tr>
                    <td colSpan={13} style={dividerCellStyle}>
                      <div style={dividerWrapStyle}>
                        <div style={dividerLineStyle} />
                        <div style={dividerLabelStyle}>BENCH</div>
                        <div style={dividerLineStyle} />
                      </div>
                    </td>
                  </tr>
                )}

                {benchPlayers.map((p) => renderPlayerRow(p, false))}
              </tbody>
            </table>
          </div>
        </section>

        {msg ? <div style={msgStyle}>{msg}</div> : null}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 50% 0%, rgba(255,140,0,0.16), transparent 28%), radial-gradient(circle at 0% 100%, rgba(255,98,0,0.10), transparent 30%), radial-gradient(circle at 100% 100%, rgba(255,180,80,0.08), transparent 26%), linear-gradient(180deg, #0b0b0d 0%, #101014 55%, #060606 100%)",
  color: "#fff",
  padding: 16,
  position: "relative",
  overflow: "hidden",
};

const bgGlowTopStyle: React.CSSProperties = {
  position: "absolute",
  left: -80,
  top: 90,
  width: 320,
  height: 320,
  borderRadius: "50%",
  background: "rgba(249,115,22,0.18)",
  filter: "blur(90px)",
  pointerEvents: "none",
};

const bgGlowBottomStyle: React.CSSProperties = {
  position: "absolute",
  right: -80,
  bottom: 60,
  width: 320,
  height: 320,
  borderRadius: "50%",
  background: "rgba(251,191,36,0.14)",
  filter: "blur(90px)",
  pointerEvents: "none",
};

const bgBallStyle: React.CSSProperties = {
  position: "absolute",
  right: 70,
  top: 90,
  width: 210,
  height: 210,
  borderRadius: "50%",
  transform: "rotate(-15deg)",
  background:
    "radial-gradient(circle at 30% 30%, #ffb347 0%, #f48c06 38%, #d96a00 70%, #9a4d00 100%)",
  opacity: 0.12,
  boxShadow:
    "inset -18px -18px 40px rgba(0,0,0,0.24), inset 10px 10px 20px rgba(255,255,255,0.08), 0 20px 50px rgba(0,0,0,0.35)",
  pointerEvents: "none",
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1500,
  margin: "0 auto",
  display: "grid",
  gap: 16,
  position: "relative",
  zIndex: 1,
};

const loadingCardStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "80px auto",
  borderRadius: 28,
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(24,24,28,0.96) 0%, rgba(10,10,12,0.98) 100%)",
  padding: 32,
  textAlign: "center",
  color: "#d4d4d8",
  fontSize: 18,
  backdropFilter: "blur(10px)",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const topLeftStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const eyebrowStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.05)",
  color: "#ffedd5",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.14em",
  width: "fit-content",
};

const topButtonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const linkButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 14,
  background:
    "linear-gradient(135deg, #ffb347 0%, #f48c06 55%, #d96a00 100%)",
  color: "#fff",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 800,
  boxShadow:
    "0 14px 30px rgba(244,140,6,0.28), inset 0 1px 0 rgba(255,255,255,0.22)",
};

const scoreCardStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 30,
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(24,24,28,0.96) 0%, rgba(10,10,12,0.98) 100%)",
  padding: 24,
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr 1.2fr",
  alignItems: "center",
  gap: 20,
  boxShadow:
    "0 30px 80px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,140,0,0.08)",
  backdropFilter: "blur(10px)",
};

const scoreGlowOverlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(135deg, rgba(255,140,0,0.12), transparent 28%, transparent 70%, rgba(255,140,0,0.08)), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 18%)",
  pointerEvents: "none",
};

const teamBigBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  justifyItems: "center",
  position: "relative",
  zIndex: 1,
};

const centerBlockStyle: React.CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: 16,
  position: "relative",
  zIndex: 1,
};

const topInfoRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  justifyContent: "center",
};

const teamLabelStyle: React.CSSProperties = {
  fontSize: 30,
  color: "#d4d4d8",
  fontWeight: 800,
  textAlign: "center",
};

const bigScoreStyle: React.CSSProperties = {
  fontSize: 140,
  lineHeight: 1,
  fontWeight: 900,
  letterSpacing: "-0.04em",
  textShadow: "0 8px 30px rgba(0,0,0,0.35)",
};

const quarterBadgeStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontSize: 16,
  fontWeight: 900,
  color: "#f5f5f5",
};

const viewerPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 14px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontSize: 14,
  fontWeight: 700,
  color: "#d4d4d8",
};

const viewerDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "#22c55e",
  boxShadow: "0 0 12px rgba(34,197,94,0.5)",
};

const statusBadgeStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  padding: "8px 14px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.10)",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const statusDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
};

const clockStyle: React.CSSProperties = {
  fontSize: 96,
  lineHeight: 1,
  fontWeight: 900,
  letterSpacing: "-0.05em",
  textShadow: "0 12px 40px rgba(0,0,0,0.4)",
};

const quarterLineWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  justifyContent: "center",
};

const quarterItemStyle: React.CSSProperties = {
  minWidth: 84,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  padding: "10px 12px",
  textAlign: "center",
};

const quarterItemLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#a1a1aa",
  fontWeight: 800,
  letterSpacing: "0.08em",
};

const quarterItemScoreStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 16,
  color: "#fff",
  fontWeight: 900,
};

const tableCardStyle: React.CSSProperties = {
  borderRadius: 30,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.10)",
  background:
    "linear-gradient(180deg, rgba(24,24,28,0.96) 0%, rgba(10,10,12,0.98) 100%)",
  boxShadow:
    "0 30px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,140,0,0.05)",
  backdropFilter: "blur(10px)",
};

const tableHeaderStyle: React.CSSProperties = {
  padding: "20px 20px 14px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 16,
  flexWrap: "wrap",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const sectionEyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#fdba74",
  fontWeight: 900,
  letterSpacing: "0.16em",
};

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: "-0.03em",
};

const legendWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
};

const legendItemStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  color: "#d4d4d8",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
};

const legendOnStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#f97316",
  boxShadow: "0 0 12px rgba(249,115,22,0.45)",
};

const legendBenchStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#52525b",
};

const tableWrapStyle: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 1180,
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "16px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  color: "#a1a1aa",
  fontSize: 15,
  fontWeight: 900,
  whiteSpace: "nowrap",
  background: "rgba(255,255,255,0.03)",
};

const thNameStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "16px 14px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  color: "#a1a1aa",
  fontSize: 15,
  fontWeight: 900,
  whiteSpace: "nowrap",
  background: "rgba(255,255,255,0.03)",
};

const tdStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "16px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  fontSize: 16,
  color: "#f4f4f5",
  whiteSpace: "nowrap",
};

const tdNameStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "16px 14px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  fontSize: 16,
  color: "#f4f4f5",
  whiteSpace: "nowrap",
};

const playerCellWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const playerDotStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  flexShrink: 0,
};

const playerNameStyle: React.CSSProperties = {
  fontWeight: 800,
};

const dividerCellStyle: React.CSSProperties = {
  padding: "14px 12px",
  background: "rgba(0,0,0,0.24)",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const dividerWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: "rgba(255,255,255,0.10)",
};

const dividerLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "#71717a",
  whiteSpace: "nowrap",
  letterSpacing: "0.18em",
};

const msgStyle: React.CSSProperties = {
  color: "#fecaca",
  padding: "12px 14px",
  borderRadius: 18,
  background: "rgba(127,29,29,0.20)",
  border: "1px solid rgba(248,113,113,0.18)",
};