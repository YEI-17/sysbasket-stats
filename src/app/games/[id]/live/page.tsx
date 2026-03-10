"use client";

import Link from "next/link";
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

type BoxScoreRow = {
  name: string;
  pts: number;
  fg2m: number;
  fg2a: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
};

const emptyBox = (): BoxScoreRow[] => [
  {
    name: "TEAM",
    pts: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    pf: 0,
  },
];

function fmtDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  return dateStr;
}

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

export default function LiveGamePage() {
  const params = useParams();
  const gameId = String(params.id);

  const [game, setGame] = useState<GameRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [quarter, setQuarter] = useState(1);

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
    setEvents(data ?? []);
  }

  async function loadAll() {
    try {
      setLoading(true);
      setMsg("");
      await Promise.all([fetchGame(), fetchEvents()]);
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
      .channel(`league-live-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        async () => {
          try {
            await fetchGame();
          } catch {}
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
          try {
            await fetchEvents();
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

    let teamA2m = 0;
    let teamA2a = 0;
    let teamA3m = 0;
    let teamA3a = 0;
    let teamA1m = 0;
    let teamA1a = 0;

    let teamB2m = 0;
    let teamB2a = 0;
    let teamB3m = 0;
    let teamB3a = 0;
    let teamB1m = 0;
    let teamB1a = 0;

    for (const e of activeEvents) {
      switch (e.event_type) {
        case "teamA_1pt":
          teamAPoints += 1;
          teamA1m += 1;
          teamA1a += 1;
          break;
        case "teamA_2pt":
          teamAPoints += 2;
          teamA2m += 1;
          teamA2a += 1;
          break;
        case "teamA_3pt":
          teamAPoints += 3;
          teamA3m += 1;
          teamA3a += 1;
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
          teamB1m += 1;
          teamB1a += 1;
          break;
        case "teamB_2pt":
          teamBPoints += 2;
          teamB2m += 1;
          teamB2a += 1;
          break;
        case "teamB_3pt":
          teamBPoints += 3;
          teamB3m += 1;
          teamB3a += 1;
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
      teamA: {
        pts: teamAPoints,
        reb: teamAReb,
        ast: teamAAst,
        stl: teamAStl,
        blk: teamABlk,
        tov: teamATov,
        pf: teamAPf,
        fg2m: teamA2m,
        fg2a: teamA2a,
        fg3m: teamA3m,
        fg3a: teamA3a,
        ftm: teamA1m,
        fta: teamA1a,
      },
      teamB: {
        pts: teamBPoints,
        reb: teamBReb,
        ast: teamBAst,
        stl: teamBStl,
        blk: teamBBlk,
        tov: teamBTov,
        pf: teamBPf,
        fg2m: teamB2m,
        fg2a: teamB2a,
        fg3m: teamB3m,
        fg3a: teamB3a,
        ftm: teamB1m,
        fta: teamB1a,
      },
    };
  }, [activeEvents]);

  const teamABox = useMemo<BoxScoreRow[]>(() => {
    const base = emptyBox();
    base[0] = {
      name: "TEAM",
      pts: summary.teamA.pts,
      fg2m: summary.teamA.fg2m,
      fg2a: summary.teamA.fg2a,
      fg3m: summary.teamA.fg3m,
      fg3a: summary.teamA.fg3a,
      ftm: summary.teamA.ftm,
      fta: summary.teamA.fta,
      reb: summary.teamA.reb,
      ast: summary.teamA.ast,
      stl: summary.teamA.stl,
      blk: summary.teamA.blk,
      tov: summary.teamA.tov,
      pf: summary.teamA.pf,
    };
    return base;
  }, [summary.teamA]);

  const teamBBox = useMemo<BoxScoreRow[]>(() => {
    const base = emptyBox();
    base[0] = {
      name: "TEAM",
      pts: summary.teamB.pts,
      fg2m: summary.teamB.fg2m,
      fg2a: summary.teamB.fg2a,
      fg3m: summary.teamB.fg3m,
      fg3a: summary.teamB.fg3a,
      ftm: summary.teamB.ftm,
      fta: summary.teamB.fta,
      reb: summary.teamB.reb,
      ast: summary.teamB.ast,
      stl: summary.teamB.stl,
      blk: summary.teamB.blk,
      tov: summary.teamB.tov,
      pf: summary.teamB.pf,
    };
    return base;
  }, [summary.teamB]);

  async function startGame() {
    try {
      setSaving(true);
      setMsg("");
      const { error } = await supabase
        .from("games")
        .update({ status: "live" })
        .eq("id", gameId);
      if (error) throw error;
      await fetchGame();
    } catch (err: any) {
      setMsg(err.message || "開始比賽失敗");
    } finally {
      setSaving(false);
    }
  }

  async function pauseGame() {
    try {
      setSaving(true);
      setMsg("");
      const { error } = await supabase
        .from("games")
        .update({ status: "scheduled" })
        .eq("id", gameId);
      if (error) throw error;
      await fetchGame();
    } catch (err: any) {
      setMsg(err.message || "暫停失敗");
    } finally {
      setSaving(false);
    }
  }

  async function finishGame() {
    try {
      setSaving(true);
      setMsg("");
      const { error } = await supabase
        .from("games")
        .update({ status: "finished" })
        .eq("id", gameId);
      if (error) throw error;
      await fetchGame();
    } catch (err: any) {
      setMsg(err.message || "結束比賽失敗");
    } finally {
      setSaving(false);
    }
  }

  async function addEvent(eventType: string) {
    try {
      setSaving(true);
      setMsg("");
      const { error } = await supabase.from("events").insert({
        game_id: gameId,
        player_id: null,
        quarter,
        event_type: eventType,
      });
      if (error) throw error;
      await fetchEvents();
    } catch (err: any) {
      setMsg(err.message || "新增事件失敗");
    } finally {
      setSaving(false);
    }
  }

  async function undoLastEvent() {
    try {
      setSaving(true);
      setMsg("");

      const lastEvent = [...activeEvents].reverse()[0];
      if (!lastEvent) {
        setMsg("目前沒有可復原的事件");
        return;
      }

      const { error } = await supabase
        .from("events")
        .update({
          is_undone: true,
          undone_at: new Date().toISOString(),
        })
        .eq("id", lastEvent.id);

      if (error) throw error;
      await fetchEvents();
    } catch (err: any) {
      setMsg(err.message || "Undo 失敗");
    } finally {
      setSaving(false);
    }
  }

  function TeamControlCard({
    title,
    side,
  }: {
    title: string;
    side: "teamA" | "teamB";
  }) {
    const prefix = side === "teamA" ? "teamA" : "teamB";

    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-2xl font-bold">{title}</h3>
          <div className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70">
            快捷記錄
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <button
            onClick={() => addEvent(`${prefix}_1pt`)}
            disabled={saving}
            className="rounded-2xl bg-white px-4 py-5 text-xl font-bold text-black transition hover:scale-[1.02] disabled:opacity-50"
          >
            +1
          </button>
          <button
            onClick={() => addEvent(`${prefix}_2pt`)}
            disabled={saving}
            className="rounded-2xl bg-white px-4 py-5 text-xl font-bold text-black transition hover:scale-[1.02] disabled:opacity-50"
          >
            +2
          </button>
          <button
            onClick={() => addEvent(`${prefix}_3pt`)}
            disabled={saving}
            className="rounded-2xl bg-white px-4 py-5 text-xl font-bold text-black transition hover:scale-[1.02] disabled:opacity-50"
          >
            +3
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => addEvent(`${prefix}_reb`)}
            disabled={saving}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-lg font-semibold transition hover:bg-white/10 disabled:opacity-50"
          >
            籃板
          </button>
          <button
            onClick={() => addEvent(`${prefix}_ast`)}
            disabled={saving}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-lg font-semibold transition hover:bg-white/10 disabled:opacity-50"
          >
            助攻
          </button>
          <button
            onClick={() => addEvent(`${prefix}_stl`)}
            disabled={saving}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-lg font-semibold transition hover:bg-white/10 disabled:opacity-50"
          >
            抄截
          </button>

          <button
            onClick={() => addEvent(`${prefix}_blk`)}
            disabled={saving}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-lg font-semibold transition hover:bg-white/10 disabled:opacity-50"
          >
            火鍋
          </button>
          <button
            onClick={() => addEvent(`${prefix}_tov`)}
            disabled={saving}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-lg font-semibold transition hover:bg-white/10 disabled:opacity-50"
          >
            失誤
          </button>
          <button
            onClick={() => addEvent(`${prefix}_pf`)}
            disabled={saving}
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-lg font-semibold transition hover:bg-white/10 disabled:opacity-50"
          >
            犯規
          </button>
        </div>
      </div>
    );
  }

  function BoxTable({
    title,
    rows,
  }: {
    title: string;
    rows: BoxScoreRow[];
  }) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 overflow-x-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold">{title}</h3>
          <div className="text-sm text-white/60">即時統計</div>
        </div>

        <table className="min-w-full text-sm">
          <thead className="text-white/60">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 text-left">球員</th>
              <th className="px-3 py-2 text-right">PTS</th>
              <th className="px-3 py-2 text-right">2FG</th>
              <th className="px-3 py-2 text-right">3FG</th>
              <th className="px-3 py-2 text-right">FT</th>
              <th className="px-3 py-2 text-right">REB</th>
              <th className="px-3 py-2 text-right">AST</th>
              <th className="px-3 py-2 text-right">STL</th>
              <th className="px-3 py-2 text-right">BLK</th>
              <th className="px-3 py-2 text-right">TO</th>
              <th className="px-3 py-2 text-right">PF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.name}-${idx}`} className="border-b border-white/5">
                <td className="px-3 py-3 font-semibold">{row.name}</td>
                <td className="px-3 py-3 text-right">{row.pts}</td>
                <td className="px-3 py-3 text-right">
                  {row.fg2m}/{row.fg2a}
                </td>
                <td className="px-3 py-3 text-right">
                  {row.fg3m}/{row.fg3a}
                </td>
                <td className="px-3 py-3 text-right">
                  {row.ftm}/{row.fta}
                </td>
                <td className="px-3 py-3 text-right">{row.reb}</td>
                <td className="px-3 py-3 text-right">{row.ast}</td>
                <td className="px-3 py-3 text-right">{row.stl}</td>
                <td className="px-3 py-3 text-right">{row.blk}</td>
                <td className="px-3 py-3 text-right">{row.tov}</td>
                <td className="px-3 py-3 text-right">{row.pf}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white px-4 py-6">
        <div className="mx-auto max-w-7xl">載入中...</div>
      </main>
    );
  }

  const teamAName = game?.teamA ?? "隊伍A";
  const teamBName = game?.teamB ?? "隊伍B";
  const totalQuarters = game?.quarters ?? 4;
  const recentFive = [...activeEvents].reverse().slice(0, 5);

  return (
    <main className="min-h-screen bg-black text-white px-4 py-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm tracking-[0.3em] text-white/40">LEAGUE LIVE CONSOLE</div>
            <h1 className="mt-1 text-4xl font-black">比賽控制台</h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/games/${gameId}/view`}
              className="rounded-2xl bg-white px-5 py-3 text-lg font-bold text-black"
            >
              觀眾畫面
            </Link>
          </div>
        </div>

        {msg && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/20 px-4 py-3 text-base">
            {msg}
          </div>
        )}

        <section className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5 shadow-2xl">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-white/50">比賽資訊</div>
                  <div className="text-2xl font-bold">
                    {teamAName} vs {teamBName}
                  </div>
                </div>

                <div className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70">
                  狀態：{game?.status ?? "-"}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
                  <div className="text-sm text-white/50">賽事日期</div>
                  <div className="mt-2 text-2xl font-bold">{fmtDate(game?.game_date)}</div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
                  <div className="text-sm text-white/50">比賽地點</div>
                  <div className="mt-2 text-2xl font-bold">{game?.location || "-"}</div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
                  <div className="text-sm text-white/50">目前節次</div>
                  <div className="mt-2 text-2xl font-bold">
                    Q{quarter} / {totalQuarters}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[28px] border border-white/10 bg-black/50 px-5 py-7">
                <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
                  <div className="text-center md:text-left">
                    <div className="text-sm text-white/50">HOME</div>
                    <div className="text-4xl font-black">{teamAName}</div>
                  </div>

                  <div className="text-center">
                    <div className="text-7xl font-black tracking-tight">
                      {summary.teamA.pts} : {summary.teamB.pts}
                    </div>
                    <div className="mt-2 text-xl text-white/60">Q{quarter}</div>
                  </div>

                  <div className="text-center md:text-right">
                    <div className="text-sm text-white/50">AWAY</div>
                    <div className="text-4xl font-black">{teamBName}</div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                    <div className="text-xs text-white/50">REB</div>
                    <div className="mt-1 text-2xl font-bold">{summary.teamA.reb}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                    <div className="text-xs text-white/50">AST</div>
                    <div className="mt-1 text-2xl font-bold">{summary.teamA.ast}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                    <div className="text-xs text-white/50">REB</div>
                    <div className="mt-1 text-2xl font-bold">{summary.teamB.reb}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                    <div className="text-xs text-white/50">AST</div>
                    <div className="mt-1 text-2xl font-bold">{summary.teamB.ast}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">比賽控制</h2>
                <div className="text-sm text-white/50">Record Desk</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={startGame}
                  disabled={saving || game?.status === "live"}
                  className="rounded-2xl bg-green-500 px-4 py-4 text-lg font-black text-black disabled:opacity-50"
                >
                  開始比賽
                </button>
                <button
                  onClick={pauseGame}
                  disabled={saving}
                  className="rounded-2xl bg-yellow-400 px-4 py-4 text-lg font-black text-black disabled:opacity-50"
                >
                  暫停比賽
                </button>
                <button
                  onClick={finishGame}
                  disabled={saving || game?.status === "finished"}
                  className="rounded-2xl bg-red-600 px-4 py-4 text-lg font-black disabled:opacity-50"
                >
                  結束比賽
                </button>
                <button
                  onClick={undoLastEvent}
                  disabled={saving}
                  className="rounded-2xl bg-white px-4 py-4 text-lg font-black text-black disabled:opacity-50"
                >
                  Undo 最後一筆
                </button>
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 text-lg font-bold">節次管理</div>
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: totalQuarters }, (_, i) => i + 1).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuarter(q)}
                      className={`rounded-2xl px-4 py-4 text-lg font-bold transition ${
                        quarter === q
                          ? "bg-white text-black"
                          : "border border-white/10 bg-black/30"
                      }`}
                    >
                      第 {q} 節
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 text-lg font-bold">最近事件</div>
                {recentFive.length === 0 ? (
                  <div className="text-white/50">目前還沒有事件</div>
                ) : (
                  <div className="space-y-2">
                    {recentFive.map((e) => (
                      <div
                        key={e.id}
                        className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3"
                      >
                        <div className="text-sm text-white/50">
                          Q{e.quarter} ｜ {new Date(e.created_at).toLocaleTimeString()}
                        </div>
                        <div className="mt-1 font-semibold">
                          {eventLabel(e.event_type, teamAName, teamBName)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr_1fr]">
          <TeamControlCard title={teamAName} side="teamA" />

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">事件時間軸</h2>
              <div className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/60">
                共 {activeEvents.length} 筆
              </div>
            </div>

            <div className="max-h-[540px] space-y-3 overflow-y-auto pr-1">
              {activeEvents.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-6 text-white/50">
                  目前還沒有事件
                </div>
              ) : (
                [...activeEvents].reverse().map((e, idx) => (
                  <div
                    key={e.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-white/50">
                          #{activeEvents.length - idx} ｜ Q{e.quarter}
                        </div>
                        <div className="mt-1 text-lg font-bold">
                          {eventLabel(e.event_type, teamAName, teamBName)}
                        </div>
                      </div>

                      <div className="text-sm text-white/50">
                        {new Date(e.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <TeamControlCard title={teamBName} side="teamB" />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <BoxTable title={`${teamAName} Box Score`} rows={teamABox} />
          <BoxTable title={`${teamBName} Box Score`} rows={teamBBox} />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 text-2xl font-bold">{teamAName} 團隊數據</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">得分</div>
                <div className="mt-1 text-3xl font-black">{summary.teamA.pts}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">籃板</div>
                <div className="mt-1 text-3xl font-black">{summary.teamA.reb}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">助攻</div>
                <div className="mt-1 text-3xl font-black">{summary.teamA.ast}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">失誤</div>
                <div className="mt-1 text-3xl font-black">{summary.teamA.tov}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">犯規</div>
                <div className="mt-1 text-3xl font-black">{summary.teamA.pf}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">抄截</div>
                <div className="mt-1 text-3xl font-black">{summary.teamA.stl}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">火鍋</div>
                <div className="mt-1 text-3xl font-black">{summary.teamA.blk}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">2FG / 3FG</div>
                <div className="mt-1 text-xl font-black">
                  {summary.teamA.fg2m}/{summary.teamA.fg2a} ｜ {summary.teamA.fg3m}/{summary.teamA.fg3a}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="mb-4 text-2xl font-bold">{teamBName} 團隊數據</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">得分</div>
                <div className="mt-1 text-3xl font-black">{summary.teamB.pts}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">籃板</div>
                <div className="mt-1 text-3xl font-black">{summary.teamB.reb}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">助攻</div>
                <div className="mt-1 text-3xl font-black">{summary.teamB.ast}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">失誤</div>
                <div className="mt-1 text-3xl font-black">{summary.teamB.tov}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">犯規</div>
                <div className="mt-1 text-3xl font-black">{summary.teamB.pf}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">抄截</div>
                <div className="mt-1 text-3xl font-black">{summary.teamB.stl}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">火鍋</div>
                <div className="mt-1 text-3xl font-black">{summary.teamB.blk}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
                <div className="text-sm text-white/50">2FG / 3FG</div>
                <div className="mt-1 text-xl font-black">
                  {summary.teamB.fg2m}/{summary.teamB.fg2a} ｜ {summary.teamB.fg3m}/{summary.teamB.fg3a}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}