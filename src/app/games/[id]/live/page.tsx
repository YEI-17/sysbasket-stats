"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type GameRow = {
  id: string;
  game_date: string;
  start_time: string | null;
  location: string | null;
  status: string;
  teamA: string | null;
  teamB: string | null;
  quarters?: number | null;
};

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  is_undone?: boolean;
  undone_at?: string | null;
};

type PlayerInfo = {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
};

type GamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "teamA" | "teamB";
  is_starter: boolean;
  is_active: boolean;
  player: PlayerInfo | null;
};

type TabKey = "overview" | "events" | "stats" | "players";

function eventLabel(eventType: string, teamA = "隊伍A", teamB = "隊伍B") {
  const map: Record<string, string> = {
    teamA_1pt: `${teamA} 罰球命中`,
    teamA_2pt: `${teamA} 兩分命中`,
    teamA_3pt: `${teamA} 三分命中`,
    teamA_reb: `${teamA} 籃板`,
    teamA_ast: `${teamA} 助攻`,
    teamA_stl: `${teamA} 抄截`,
    teamA_blk: `${teamA} 火鍋`,
    teamA_tov: `${teamA} 失誤`,
    teamA_pf: `${teamA} 犯規`,

    teamB_1pt: `${teamB} 罰球命中`,
    teamB_2pt: `${teamB} 兩分命中`,
    teamB_3pt: `${teamB} 三分命中`,
    teamB_reb: `${teamB} 籃板`,
    teamB_ast: `${teamB} 助攻`,
    teamB_stl: `${teamB} 抄截`,
    teamB_blk: `${teamB} 火鍋`,
    teamB_tov: `${teamB} 失誤`,
    teamB_pf: `${teamB} 犯規`,
  };

  return map[eventType] ?? eventType;
}

function getEventSide(eventType: string): "teamA" | "teamB" | "other" {
  if (eventType.startsWith("teamA_")) return "teamA";
  if (eventType.startsWith("teamB_")) return "teamB";
  return "other";
}

function statEventName(eventType: string) {
  if (eventType.endsWith("_1pt")) return "FT";
  if (eventType.endsWith("_2pt")) return "2PT";
  if (eventType.endsWith("_3pt")) return "3PT";
  if (eventType.endsWith("_reb")) return "REB";
  if (eventType.endsWith("_ast")) return "AST";
  if (eventType.endsWith("_stl")) return "STL";
  if (eventType.endsWith("_blk")) return "BLK";
  if (eventType.endsWith("_tov")) return "TO";
  if (eventType.endsWith("_pf")) return "PF";
  return eventType;
}

function formatStatus(status?: string) {
  if (status === "live") return "LIVE";
  if (status === "finished") return "FINAL";
  return "SCHEDULED";
}

function formatTime(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  return dateStr;
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-white/50">
      {text}
    </div>
  );
}

function normalizeGamePlayers(rows: any[]): GamePlayerRow[] {
  return rows.map((row) => {
    const rawPlayer = Array.isArray(row.player) ? row.player[0] : row.player;

    return {
      id: String(row.id),
      game_id: String(row.game_id),
      player_id: String(row.player_id),
      team_side: row.team_side === "teamB" ? "teamB" : "teamA",
      is_starter: Boolean(row.is_starter),
      is_active: Boolean(row.is_active),
      player: rawPlayer
        ? {
            id: String(rawPlayer.id),
            name: String(rawPlayer.name ?? ""),
            number:
              rawPlayer.number === null || rawPlayer.number === undefined
                ? null
                : Number(rawPlayer.number),
            position:
              rawPlayer.position === null || rawPlayer.position === undefined
                ? null
                : String(rawPlayer.position),
          }
        : null,
    };
  });
}

export default function GameViewerPage() {
  const params = useParams();
  const gameId = String(params.id);

  const [game, setGame] = useState<GameRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<TabKey>("overview");

  async function fetchGame() {
    const { data, error } = await supabase
      .from("games")
      .select('id, game_date, start_time, location, status, quarters, "teamA", "teamB"')
      .eq("id", gameId)
      .single();

    if (error) throw error;
    setGame(data);
  }

  async function fetchEvents() {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    setEvents((data ?? []) as EventRow[]);
  }

  async function fetchGamePlayers() {
    const { data, error } = await supabase
      .from("game_players")
      .select(`
        id,
        game_id,
        player_id,
        team_side,
        is_starter,
        is_active,
        player:players (
          id,
          name,
          number,
          position
        )
      `)
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (error) {
      setGamePlayers([]);
      return;
    }

    const safeRows = Array.isArray(data) ? normalizeGamePlayers(data) : [];
    setGamePlayers(safeRows);
  }

  async function loadAll() {
    try {
      setLoading(true);
      setMsg("");
      await Promise.all([fetchGame(), fetchEvents(), fetchGamePlayers()]);
    } catch (err: any) {
      setMsg(err.message || "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!gameId) return;

    loadAll();

    const channel = supabase
      .channel(`viewer-mobile-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        async () => {
          try {
            await fetchGame();
          } catch {}
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `game_id=eq.${gameId}` },
        async () => {
          try {
            await fetchEvents();
          } catch {}
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` },
        async () => {
          try {
            await fetchGamePlayers();
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const activeEvents = useMemo(() => events.filter((e) => !e.is_undone), [events]);

  const summary = useMemo(() => {
    let teamAPoints = 0;
    let teamBPoints = 0;
    let teamAReb = 0;
    let teamBReb = 0;
    let teamAAst = 0;
    let teamBAst = 0;
    let teamAStl = 0;
    let teamBStl = 0;
    let teamABlk = 0;
    let teamBBlk = 0;
    let teamATov = 0;
    let teamBTov = 0;
    let teamAPf = 0;
    let teamBPf = 0;
    let currentQuarter = 1;

    for (const e of activeEvents) {
      if (e.quarter > currentQuarter) currentQuarter = e.quarter;

      switch (e.event_type) {
        case "teamA_1pt":
          teamAPoints += 1;
          break;
        case "teamA_2pt":
          teamAPoints += 2;
          break;
        case "teamA_3pt":
          teamAPoints += 3;
          break;
        case "teamA_reb":
          teamAReb += 1;
          break;
        case "teamA_ast":
          teamAAst += 1;
          break;
        case "teamA_stl":
          teamAStl += 1;
          break;
        case "teamA_blk":
          teamABlk += 1;
          break;
        case "teamA_tov":
          teamATov += 1;
          break;
        case "teamA_pf":
          teamAPf += 1;
          break;

        case "teamB_1pt":
          teamBPoints += 1;
          break;
        case "teamB_2pt":
          teamBPoints += 2;
          break;
        case "teamB_3pt":
          teamBPoints += 3;
          break;
        case "teamB_reb":
          teamBReb += 1;
          break;
        case "teamB_ast":
          teamBAst += 1;
          break;
        case "teamB_stl":
          teamBStl += 1;
          break;
        case "teamB_blk":
          teamBBlk += 1;
          break;
        case "teamB_tov":
          teamBTov += 1;
          break;
        case "teamB_pf":
          teamBPf += 1;
          break;
      }
    }

    return {
      currentQuarter,
      teamA: {
        pts: teamAPoints,
        reb: teamAReb,
        ast: teamAAst,
        stl: teamAStl,
        blk: teamABlk,
        tov: teamATov,
        pf: teamAPf,
      },
      teamB: {
        pts: teamBPoints,
        reb: teamBReb,
        ast: teamBAst,
        stl: teamBStl,
        blk: teamBBlk,
        tov: teamBTov,
        pf: teamBPf,
      },
    };
  }, [activeEvents]);

  const teamAName = game?.teamA ?? "隊伍A";
  const teamBName = game?.teamB ?? "隊伍B";

  const recentEvents = useMemo(() => {
    return [...activeEvents].reverse().slice(0, 5);
  }, [activeEvents]);

  const eventsByQuarter = useMemo(() => {
    const map = new Map<number, EventRow[]>();
    for (const e of [...activeEvents].reverse()) {
      if (!map.has(e.quarter)) map.set(e.quarter, []);
      map.get(e.quarter)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [activeEvents]);

  const scoringLeaders = useMemo(() => {
    const a = activeEvents.filter((e) =>
      ["teamA_1pt", "teamA_2pt", "teamA_3pt"].includes(e.event_type)
    ).length;
    const b = activeEvents.filter((e) =>
      ["teamB_1pt", "teamB_2pt", "teamB_3pt"].includes(e.event_type)
    ).length;

    return [
      {
        label: `${teamAName} 進攻事件`,
        value: a,
      },
      {
        label: `${teamBName} 進攻事件`,
        value: b,
      },
    ];
  }, [activeEvents, teamAName, teamBName]);

  const teamAPlayers = useMemo(
    () => gamePlayers.filter((p) => p.team_side === "teamA"),
    [gamePlayers]
  );

  const teamBPlayers = useMemo(
    () => gamePlayers.filter((p) => p.team_side === "teamB"),
    [gamePlayers]
  );

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "總覽" },
    { key: "events", label: "事件" },
    { key: "stats", label: "數據" },
    { key: "players", label: "球員" },
  ];

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-5xl px-4 py-6">載入中...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl">
        <div className="sticky top-0 z-30 border-b border-white/10 bg-black/95 backdrop-blur">
          <div className="px-4 pt-4 pb-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-xs tracking-[0.25em] text-white/40">
                LEAGUE VIEW
              </div>
              <div
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  game?.status === "live"
                    ? "bg-green-500/20 text-green-300"
                    : game?.status === "finished"
                    ? "bg-white/10 text-white"
                    : "bg-yellow-500/20 text-yellow-300"
                }`}
              >
                {formatStatus(game?.status)}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/10 to-white/5 px-4 py-4 shadow-2xl">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-white/50">HOME</div>
                  <div className="truncate text-2xl font-black">{teamAName}</div>
                </div>

                <div className="text-center">
                  <div className="text-4xl font-black sm:text-6xl">
                    {summary.teamA.pts} : {summary.teamB.pts}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    Q{summary.currentQuarter}
                  </div>
                </div>

                <div className="min-w-0 text-right">
                  <div className="truncate text-sm text-white/50">AWAY</div>
                  <div className="truncate text-2xl font-black">{teamBName}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-white/50">日期</div>
                  <div className="mt-1 font-semibold">{formatDate(game?.game_date)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-white/50">時間</div>
                  <div className="mt-1 font-semibold">{formatTime(game?.start_time)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-white/50">地點</div>
                  <div className="mt-1 truncate font-semibold">{game?.location || "-"}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <div className="flex min-w-max gap-2">
                {tabs.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key)}
                    className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
                      tab === item.key
                        ? "bg-white text-black"
                        : "border border-white/10 bg-white/5 text-white/80"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-4">
          {msg && (
            <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/20 px-4 py-3">
              {msg}
            </div>
          )}

          {tab === "overview" && (
            <div className="space-y-4">
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label={`${teamAName} 籃板`} value={summary.teamA.reb} />
                <StatCard label={`${teamAName} 助攻`} value={summary.teamA.ast} />
                <StatCard label={`${teamBName} 籃板`} value={summary.teamB.reb} />
                <StatCard label={`${teamBName} 助攻`} value={summary.teamB.ast} />
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold">最近事件</h2>
                  <div className="text-sm text-white/50">最新 5 筆</div>
                </div>

                {recentEvents.length === 0 ? (
                  <EmptyState text="目前還沒有事件" />
                ) : (
                  <div className="space-y-3">
                    {recentEvents.map((e) => (
                      <div
                        key={e.id}
                        className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-white/50">Q{e.quarter}</div>
                            <div className="mt-1 font-semibold">
                              {eventLabel(e.event_type, teamAName, teamBName)}
                            </div>
                          </div>
                          <div className="shrink-0 text-sm text-white/50">
                            {new Date(e.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 text-xl font-bold">比賽摘要</div>

                <div className="grid grid-cols-2 gap-3">
                  <StatCard label={`${teamAName} 失誤`} value={summary.teamA.tov} />
                  <StatCard label={`${teamBName} 失誤`} value={summary.teamB.tov} />
                  <StatCard label={`${teamAName} 犯規`} value={summary.teamA.pf} />
                  <StatCard label={`${teamBName} 犯規`} value={summary.teamB.pf} />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {scoringLeaders.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="text-sm text-white/50">{item.label}</div>
                      <div className="mt-1 text-2xl font-black">{item.value}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {tab === "events" && (
            <div className="space-y-4">
              {eventsByQuarter.length === 0 ? (
                <EmptyState text="目前還沒有事件紀錄" />
              ) : (
                eventsByQuarter.map(([quarter, rows]) => (
                  <section
                    key={quarter}
                    className="rounded-3xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-xl font-bold">第 {quarter} 節</h2>
                      <div className="text-sm text-white/50">{rows.length} 筆</div>
                    </div>

                    <div className="space-y-3">
                      {rows.map((e) => {
                        const side = getEventSide(e.event_type);
                        return (
                          <div
                            key={e.id}
                            className={`rounded-2xl border px-4 py-3 ${
                              side === "teamA"
                                ? "border-blue-500/20 bg-blue-500/10"
                                : side === "teamB"
                                ? "border-orange-500/20 bg-orange-500/10"
                                : "border-white/10 bg-black/30"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs text-white/50">
                                  {statEventName(e.event_type)}
                                </div>
                                <div className="mt-1 font-semibold">
                                  {eventLabel(e.event_type, teamAName, teamBName)}
                                </div>
                              </div>
                              <div className="shrink-0 text-sm text-white/50">
                                {new Date(e.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          )}

          {tab === "stats" && (
            <div className="space-y-4">
              <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-4 text-xl font-bold">團隊數據比較</div>

                <div className="space-y-3">
                  {[
                    { label: "得分", a: summary.teamA.pts, b: summary.teamB.pts },
                    { label: "籃板", a: summary.teamA.reb, b: summary.teamB.reb },
                    { label: "助攻", a: summary.teamA.ast, b: summary.teamB.ast },
                    { label: "抄截", a: summary.teamA.stl, b: summary.teamB.stl },
                    { label: "火鍋", a: summary.teamA.blk, b: summary.teamB.blk },
                    { label: "失誤", a: summary.teamA.tov, b: summary.teamB.tov },
                    { label: "犯規", a: summary.teamA.pf, b: summary.teamB.pf },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
                    >
                      <div className="mb-2 text-center text-sm text-white/50">
                        {item.label}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div className="text-left">
                          <div className="text-xs text-white/50">{teamAName}</div>
                          <div className="text-2xl font-black">{item.a}</div>
                        </div>
                        <div className="text-white/40">vs</div>
                        <div className="text-right">
                          <div className="text-xs text-white/50">{teamBName}</div>
                          <div className="text-2xl font-black">{item.b}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xl font-bold">{teamAName}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="PTS" value={summary.teamA.pts} />
                    <StatCard label="REB" value={summary.teamA.reb} />
                    <StatCard label="AST" value={summary.teamA.ast} />
                    <StatCard label="TO" value={summary.teamA.tov} />
                    <StatCard label="STL" value={summary.teamA.stl} />
                    <StatCard label="PF" value={summary.teamA.pf} />
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-xl font-bold">{teamBName}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="PTS" value={summary.teamB.pts} />
                    <StatCard label="REB" value={summary.teamB.reb} />
                    <StatCard label="AST" value={summary.teamB.ast} />
                    <StatCard label="TO" value={summary.teamB.tov} />
                    <StatCard label="STL" value={summary.teamB.stl} />
                    <StatCard label="PF" value={summary.teamB.pf} />
                  </div>
                </div>
              </section>
            </div>
          )}

          {tab === "players" && (
            <div className="space-y-4">
              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xl font-bold">{teamAName}</h2>
                    <div className="text-sm text-white/50">球員名單</div>
                  </div>

                  {teamAPlayers.length === 0 ? (
                    <EmptyState text="目前沒有 teamA 球員資料" />
                  ) : (
                    <div className="space-y-3">
                      {teamAPlayers.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold">
                                {p.player?.number != null ? `#${p.player.number} ` : ""}
                                {p.player?.name ?? "未命名球員"}
                              </div>
                              <div className="mt-1 text-sm text-white/50">
                                {p.player?.position || "-"}
                              </div>
                            </div>

                            <div className="flex gap-2">
                              {p.is_starter && (
                                <span className="rounded-full bg-green-500/20 px-2 py-1 text-xs font-bold text-green-300">
                                  先發
                                </span>
                              )}
                              {p.is_active && (
                                <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-white/80">
                                  啟用
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xl font-bold">{teamBName}</h2>
                    <div className="text-sm text-white/50">球員名單</div>
                  </div>

                  {teamBPlayers.length === 0 ? (
                    <EmptyState text="目前沒有 teamB 球員資料" />
                  ) : (
                    <div className="space-y-3">
                      {teamBPlayers.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold">
                                {p.player?.number != null ? `#${p.player.number} ` : ""}
                                {p.player?.name ?? "未命名球員"}
                              </div>
                              <div className="mt-1 text-sm text-white/50">
                                {p.player?.position || "-"}
                              </div>
                            </div>

                            <div className="flex gap-2">
                              {p.is_starter && (
                                <span className="rounded-full bg-green-500/20 px-2 py-1 text-xs font-bold text-green-300">
                                  先發
                                </span>
                              )}
                              {p.is_active && (
                                <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-white/80">
                                  啟用
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}