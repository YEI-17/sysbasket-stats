"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { pct, type EventRow as StatEventRow, type Stat } from "@/lib/stats";

type Player = {
  id: string;
  name: string;
  number: number | null;
  active?: boolean;
};

type GameRow = {
  id: string;
  teamA: string | null;
  teamB: string | null;
  is_live?: boolean | null;
  ended_at?: string | null;
  status?: string | null;
};

type EventDbRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: StatEventRow["event_type"] | string;
  created_at: string;
  team_side?: "A" | "B" | null;
  is_undone?: boolean | null;
  undone_at?: string | null;
};

type EventWithGame = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: StatEventRow["event_type"] | string;
  created_at: string;
  team_side?: "A" | "B" | null;
  is_undone?: boolean;
};

type ClockRow = {
  game_id: string;
  quarter: number;
  seconds_left: number;
  is_running: boolean;
  updated_at?: string | null;
};

type GamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "A" | "B";
  is_starter: boolean;
};

type SortKey =
  | "gp"
  | "avgMin"
  | "avgPts"
  | "avgReb"
  | "avgAst"
  | "avgStl"
  | "avgBlk"
  | "avgTov"
  | "avgPf"
  | "fg2Pct"
  | "fg3Pct"
  | "ftPct"
  | "avgEff";

type SortDirection = "desc" | "asc";

type PlayerRow = Player & {
  stat: Stat;
  gamesPlayed: number;
  avgMin: string;
  totalSeconds: number;
  avgMinSeconds: number;
  eff: number;

  avgPts: string;
  avgReb: string;
  avgAst: string;
  avgStl: string;
  avgBlk: string;
  avgTov: string;
  avgPf: string;
  avgEff: string;

  avgPtsValue: number;
  avgRebValue: number;
  avgAstValue: number;
  avgStlValue: number;
  avgBlkValue: number;
  avgTovValue: number;
  avgPfValue: number;
  avgEffValue: number;

  fg2PctValue: number;
  fg3PctValue: number;
  ftPctValue: number;
};

const CLOCK_TABLE = "game_clock";
const REGULAR_SECONDS = 600;

function safeStat(): Stat {
  return {
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
  };
}

function eff(stat: Stat) {
  return (
    stat.pts +
    stat.reb +
    stat.ast +
    stat.stl +
    stat.blk -
    stat.tov -
    (stat.fg2a - stat.fg2m) -
    (stat.fg3a - stat.fg3m) -
    (stat.fta - stat.ftm)
  );
}

function avgValue(value: number, gamesPlayed: number) {
  if (!gamesPlayed) return 0;
  return value / gamesPlayed;
}

function avgText(value: number, gamesPlayed: number) {
  return avgValue(value, gamesPlayed).toFixed(1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

function getClockUpdatedAtMs(clockRow: ClockRow | null | undefined) {
  if (!clockRow?.updated_at) return null;
  const ms = new Date(clockRow.updated_at).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function getQuarterStartMsFromClock(clockRow: ClockRow | null | undefined) {
  const updatedAtMs = getClockUpdatedAtMs(clockRow);
  if (updatedAtMs == null) return null;

  const secondsLeft = clamp(
    clockRow?.seconds_left ?? REGULAR_SECONDS,
    0,
    REGULAR_SECONDS
  );
  const playedAtSnapshot = REGULAR_SECONDS - secondsLeft;

  return updatedAtMs - playedAtSnapshot * 1000;
}

function getFallbackElapsedFromOrder(
  eventId: string,
  quarterEvents: EventWithGame[],
  playedSecondsThisQuarter: number
) {
  const subEvents = quarterEvents.filter(
    (e) => e.event_type === "sub_in" || e.event_type === "sub_out"
  );

  if (subEvents.length === 0) return playedSecondsThisQuarter;

  const index = subEvents.findIndex((e) => e.id === eventId);
  if (index === -1) return playedSecondsThisQuarter;

  return Math.floor(
    ((index + 1) / (subEvents.length + 1)) * playedSecondsThisQuarter
  );
}

function getQuarterStartMs(
  quarter: number,
  currentQuarter: number,
  clockRows: ClockRow[],
  currentClock: ClockRow | null
) {
  const clockMap = new Map(clockRows.map((row) => [row.quarter, row]));

  const ownClock =
    quarter === currentQuarter ? currentClock : clockMap.get(quarter);
  const ownStartMs = getQuarterStartMsFromClock(ownClock);
  if (ownStartMs != null) return ownStartMs;

  const nextClock = clockMap.get(quarter + 1);
  const nextStartMs = getQuarterStartMsFromClock(nextClock);
  if (nextStartMs != null) {
    return nextStartMs - REGULAR_SECONDS * 1000;
  }

  return null;
}

function getPreciseEventElapsedSeconds(
  event: EventWithGame,
  quarterEvents: EventWithGame[],
  quarter: number,
  currentQuarter: number,
  currentDisplaySeconds: number,
  clockRows: ClockRow[],
  currentClock: ClockRow | null
) {
  const playedSecondsThisQuarter = getQuarterPlayedSeconds(
    quarter,
    currentQuarter,
    currentDisplaySeconds
  );

  if (playedSecondsThisQuarter <= 0) return 0;

  const quarterStartMs = getQuarterStartMs(
    quarter,
    currentQuarter,
    clockRows,
    currentClock
  );

  const eventMs = new Date(event.created_at).getTime();

  if (quarterStartMs != null && !Number.isNaN(eventMs)) {
    return clamp(
      Math.floor((eventMs - quarterStartMs) / 1000),
      0,
      playedSecondsThisQuarter
    );
  }

  return getFallbackElapsedFromOrder(
    event.id,
    quarterEvents,
    playedSecondsThisQuarter
  );
}

function formatAverageSeconds(totalSeconds: number, gamesPlayed: number) {
  if (!gamesPlayed) return "0:00";
  const avgSeconds = Math.round(totalSeconds / gamesPlayed);
  const mm = Math.floor(avgSeconds / 60);
  const ss = avgSeconds % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function normalizeEventType(
  raw: string
):
  | StatEventRow["event_type"]
  | "reb"
  | "ast"
  | "stl"
  | "blk"
  | "tov"
  | "pf"
  | null {
  switch (raw) {
    case "fg2_made":
    case "fg2_miss":
    case "fg3_made":
    case "fg3_miss":
    case "ft_made":
    case "ft_miss":
    case "reb":
    case "ast":
    case "stl":
    case "blk":
    case "tov":
    case "pf":
    case "sub_in":
    case "sub_out":
      return raw;

    case "assist":
      return "ast";
    case "rebound":
    case "oreb":
    case "dreb":
      return "reb";
    case "steal":
      return "stl";
    case "block":
      return "blk";
    case "turnover":
      return "tov";
    case "foul":
    case "personal_foul":
      return "pf";

    default:
      return null;
  }
}

function applyEventToStat(stat: Stat, rawEventType: string) {
  const eventType = normalizeEventType(rawEventType);
  if (!eventType) return;

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
    case "stl":
      stat.stl += 1;
      break;
    case "blk":
      stat.blk += 1;
      break;
    case "tov":
      stat.tov += 1;
      break;
    case "pf":
      stat.pf += 1;
      break;
    default:
      break;
  }
}

function pctValue(made: number, attempt: number) {
  if (!attempt) return 0;
  return (made / attempt) * 100;
}

function getSortValue(row: PlayerRow, key: SortKey) {
  switch (key) {
    case "gp":
      return row.gamesPlayed;
    case "avgMin":
      return row.avgMinSeconds;
    case "avgPts":
      return row.avgPtsValue;
    case "avgReb":
      return row.avgRebValue;
    case "avgAst":
      return row.avgAstValue;
    case "avgStl":
      return row.avgStlValue;
    case "avgBlk":
      return row.avgBlkValue;
    case "avgTov":
      return row.avgTovValue;
    case "avgPf":
      return row.avgPfValue;
    case "fg2Pct":
      return row.fg2PctValue;
    case "fg3Pct":
      return row.fg3PctValue;
    case "ftPct":
      return row.ftPctValue;
    case "avgEff":
      return row.avgEffValue;
    default:
      return 0;
  }
}

export default function BoxDashboardPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [events, setEvents] = useState<EventWithGame[]>([]);
  const [clockRows, setClockRows] = useState<ClockRow[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("avgPts");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDirection((prevDir) => (prevDir === "desc" ? "asc" : "desc"));
        return prevKey;
      }
      setSortDirection("desc");
      return key;
    });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMsg("");

    const [playersRes, gamesRes, eventsRes, clocksRes, gamePlayersRes] =
      await Promise.all([
        supabase
          .from("players")
          .select("id, name, number, active")
          .eq("active", true)
          .order("number", { ascending: true }),

        supabase
          .from("games")
          .select("id, teamA, teamB, is_live, ended_at, status")
          .order("created_at", { ascending: true }),

        supabase
          .from("events")
          .select(
            "id, game_id, player_id, quarter, event_type, created_at, team_side, is_undone, undone_at"
          )
          .order("created_at", { ascending: true }),

        supabase
          .from(CLOCK_TABLE)
          .select("game_id, quarter, seconds_left, is_running, updated_at")
          .order("game_id", { ascending: true })
          .order("quarter", { ascending: true }),

        supabase
          .from("game_players")
          .select("id, game_id, player_id, team_side, is_starter"),
      ]);

    if (playersRes.error) {
      setMsg(`讀取球員失敗：${playersRes.error.message}`);
      setLoading(false);
      return;
    }

    if (gamesRes.error) {
      setMsg(`讀取比賽失敗：${gamesRes.error.message}`);
      setLoading(false);
      return;
    }

    if (eventsRes.error) {
      setMsg(`讀取事件失敗：${eventsRes.error.message}`);
      setLoading(false);
      return;
    }

    if (clocksRes.error) {
      setMsg(`讀取比賽時間失敗：${clocksRes.error.message}`);
      setLoading(false);
      return;
    }

    if (gamePlayersRes.error) {
      setMsg(`讀取出賽名單失敗：${gamePlayersRes.error.message}`);
      setLoading(false);
      return;
    }

    setPlayers((playersRes.data || []) as Player[]);
    setGames((gamesRes.data || []) as GameRow[]);
    setClockRows((clocksRes.data || []) as ClockRow[]);
    setGamePlayers((gamePlayersRes.data || []) as GamePlayerRow[]);
    setEvents(
      ((eventsRes.data || []) as EventDbRow[]).map(
        (event): EventWithGame => ({
          id: event.id,
          game_id: event.game_id,
          player_id: event.player_id,
          quarter: event.quarter,
          event_type: event.event_type,
          created_at: event.created_at,
          team_side: event.team_side ?? null,
          is_undone: !!event.is_undone,
        })
      )
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();

    const channel = supabase
      .channel("box-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: CLOCK_TABLE },
        () => void loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_players" },
        () => void loadAll()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAll]);

  const validEvents = useMemo(
    () => events.filter((event) => !event.is_undone),
    [events]
  );

  const activePlayerIdSet = useMemo(() => {
    return new Set(players.map((player) => player.id));
  }, [players]);

  const clocksByGame = useMemo(() => {
    const map: Record<string, ClockRow[]> = {};
    for (const row of clockRows) {
      if (!map[row.game_id]) map[row.game_id] = [];
      map[row.game_id].push(row);
    }
    for (const gameId of Object.keys(map)) {
      map[gameId].sort((a, b) => a.quarter - b.quarter);
    }
    return map;
  }, [clockRows]);

  const gamePlayersByGame = useMemo(() => {
    const map: Record<string, GamePlayerRow[]> = {};
    for (const row of gamePlayers) {
      if (!map[row.game_id]) map[row.game_id] = [];
      map[row.game_id].push(row);
    }
    return map;
  }, [gamePlayers]);

  const teamAPlayerIdsByGame = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const row of gamePlayers) {
      if (row.team_side !== "A") continue;
      if (!activePlayerIdSet.has(row.player_id)) continue;
      if (!map[row.game_id]) map[row.game_id] = new Set<string>();
      map[row.game_id].add(row.player_id);
    }
    return map;
  }, [gamePlayers, activePlayerIdSet]);

  const isTeamAEvent = useCallback(
    (event: EventWithGame) => {
      if (!event.player_id) return false;
      if (!activePlayerIdSet.has(event.player_id)) return false;

      if (event.team_side === "A") return true;
      if (event.team_side === "B") return false;

      const knownTeamASet = teamAPlayerIdsByGame[event.game_id];
      if (knownTeamASet && knownTeamASet.size > 0) {
        return knownTeamASet.has(event.player_id);
      }

      return true;
    },
    [activePlayerIdSet, teamAPlayerIdsByGame]
  );

  const eventsByGame = useMemo(() => {
    const map: Record<string, EventWithGame[]> = {};
    for (const event of validEvents) {
      if (!map[event.game_id]) map[event.game_id] = [];
      map[event.game_id].push(event);
    }
    return map;
  }, [validEvents]);

  const gamesById = useMemo(() => {
    const map: Record<string, GameRow> = {};
    for (const game of games) {
      map[game.id] = game;
    }
    return map;
  }, [games]);

  const relevantGameIds = useMemo(() => {
    const ids = new Set<string>();

    for (const gp of gamePlayers) {
      if (gp.team_side === "A" && activePlayerIdSet.has(gp.player_id)) {
        ids.add(gp.game_id);
      }
    }

    for (const event of validEvents) {
      if (isTeamAEvent(event)) {
        ids.add(event.game_id);
      }
    }

    return Array.from(ids);
  }, [gamePlayers, validEvents, activePlayerIdSet, isTeamAEvent]);

  const teamPlayerEvents = useMemo(() => {
    return validEvents.filter(isTeamAEvent);
  }, [validEvents, isTeamAEvent]);

  const playerStatMap = useMemo(() => {
    const map: Record<string, Stat> = {};

    for (const event of teamPlayerEvents) {
      if (!event.player_id) continue;

      if (!map[event.player_id]) {
        map[event.player_id] = safeStat();
      }

      applyEventToStat(map[event.player_id], event.event_type);
    }

    return map;
  }, [teamPlayerEvents]);

  const teamStatByGame = useMemo(() => {
    const map: Record<string, Stat> = {};

    for (const event of teamPlayerEvents) {
      if (!map[event.game_id]) {
        map[event.game_id] = safeStat();
      }

      applyEventToStat(map[event.game_id], event.event_type);
    }

    return map;
  }, [teamPlayerEvents]);

  const teamGamesCount = useMemo(() => {
    return Object.keys(teamStatByGame).length;
  }, [teamStatByGame]);

  const teamTotals = useMemo(() => {
    const total = safeStat();

    for (const stat of Object.values(teamStatByGame)) {
      total.pts += stat.pts;
      total.fg2m += stat.fg2m;
      total.fg2a += stat.fg2a;
      total.fg3m += stat.fg3m;
      total.fg3a += stat.fg3a;
      total.ftm += stat.ftm;
      total.fta += stat.fta;
      total.reb += stat.reb;
      total.ast += stat.ast;
      total.stl += stat.stl;
      total.blk += stat.blk;
      total.tov += stat.tov;
      total.pf += stat.pf;
    }

    return total;
  }, [teamStatByGame]);

  const avgTeamPts = useMemo(
    () => avgText(teamTotals.pts, teamGamesCount),
    [teamTotals.pts, teamGamesCount]
  );

  const avgTeamReb = useMemo(
    () => avgText(teamTotals.reb, teamGamesCount),
    [teamTotals.reb, teamGamesCount]
  );

  const avgTeamAst = useMemo(
    () => avgText(teamTotals.ast, teamGamesCount),
    [teamTotals.ast, teamGamesCount]
  );

  const playerGameCountMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};

    for (const player of players) {
      map[player.id] = new Set<string>();
    }

    for (const row of gamePlayers) {
      if (row.team_side !== "A") continue;
      if (!activePlayerIdSet.has(row.player_id)) continue;

      if (!map[row.player_id]) map[row.player_id] = new Set<string>();
      map[row.player_id].add(row.game_id);
    }

    for (const event of teamPlayerEvents) {
      if (!event.player_id) continue;
      if (!map[event.player_id]) map[event.player_id] = new Set<string>();
      map[event.player_id].add(event.game_id);
    }

    const result: Record<string, number> = {};
    for (const playerId of Object.keys(map)) {
      result[playerId] = map[playerId].size;
    }

    return result;
  }, [players, gamePlayers, activePlayerIdSet, teamPlayerEvents]);

  const playerTotalSecondsMap = useMemo(() => {
    const secondsMap: Record<string, number> = {};

    for (const player of players) {
      secondsMap[player.id] = 0;
    }

    for (const gameId of relevantGameIds) {
      const game = gamesById[gameId] ?? null;
      const allGameEvents = eventsByGame[gameId] || [];
      const gameEvents = allGameEvents.filter(isTeamAEvent);
      const rows = gamePlayersByGame[gameId] || [];
      const gameClockRows = clocksByGame[gameId] || [];

      const teamAIdsFromGamePlayers = rows
        .filter((gp) => gp.team_side === "A" && activePlayerIdSet.has(gp.player_id))
        .map((gp) => gp.player_id);

      const teamAIdsFromEvents = Array.from(
        new Set(
          gameEvents
            .filter((e) => !!e.player_id)
            .map((e) => e.player_id!)
            .filter((id) => activePlayerIdSet.has(id))
        )
      );

      const mergedTeamAIds = Array.from(
        new Set([...teamAIdsFromGamePlayers, ...teamAIdsFromEvents])
      );

      const teamAPlayers = sortPlayers(
        players.filter((p) => mergedTeamAIds.includes(p.id))
      );

      if (teamAPlayers.length === 0) continue;

      const starterIds = rows
        .filter(
          (gp) =>
            gp.team_side === "A" &&
            gp.is_starter &&
            activePlayerIdSet.has(gp.player_id)
        )
        .map((gp) => gp.player_id);

      const fallbackStarterIds =
        starterIds.length > 0
          ? starterIds
          : teamAPlayers.slice(0, 5).map((p) => p.id);

      const currentClock =
        gameClockRows.length > 0 ? gameClockRows[gameClockRows.length - 1] : null;

      const currentQuarter =
        game?.status === "finished"
          ? Math.max(
              currentClock?.quarter ?? 1,
              ...gameEvents.map((e) => e.quarter),
              1
            )
          : currentClock?.quarter ?? Math.max(...gameEvents.map((e) => e.quarter), 1);

      const currentDisplaySeconds =
        game?.status === "finished" ? 0 : computeDisplaySeconds(currentClock);

      const maxQuarter = Math.max(
        currentQuarter,
        ...gameEvents.map((e) => e.quarter),
        1
      );

      let lineup = new Set<string>(fallbackStarterIds);

      for (let q = 1; q <= maxQuarter; q += 1) {
        const playedSecondsThisQuarter = getQuarterPlayedSeconds(
          q,
          currentQuarter,
          currentDisplaySeconds
        );

        if (playedSecondsThisQuarter <= 0) continue;

        const activeStartMap: Record<string, number | null> = {};
        for (const player of teamAPlayers) {
          activeStartMap[player.id] = lineup.has(player.id) ? 0 : null;
        }

        const quarterSubEvents = gameEvents
          .filter(
            (e) =>
              e.quarter === q &&
              !!e.player_id &&
              (normalizeEventType(e.event_type) === "sub_in" ||
                normalizeEventType(e.event_type) === "sub_out")
          )
          .sort((a, b) => {
            const diff =
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            if (diff !== 0) return diff;
            return a.id.localeCompare(b.id);
          });

        for (const event of quarterSubEvents) {
          const playerId = event.player_id!;
          const normalized = normalizeEventType(event.event_type);
          const eventElapsed = getPreciseEventElapsedSeconds(
            event,
            quarterSubEvents,
            q,
            currentQuarter,
            currentDisplaySeconds,
            gameClockRows,
            currentClock
          );

          if (normalized === "sub_in") {
            if (activeStartMap[playerId] == null) {
              activeStartMap[playerId] = eventElapsed;
              lineup.add(playerId);
            }
          }

          if (normalized === "sub_out") {
            const startedAt = activeStartMap[playerId];

            if (startedAt != null) {
              secondsMap[playerId] =
                (secondsMap[playerId] || 0) + Math.max(0, eventElapsed - startedAt);
              activeStartMap[playerId] = null;
            }

            lineup.delete(playerId);
          }
        }

        for (const player of teamAPlayers) {
          const startedAt = activeStartMap[player.id];
          if (startedAt != null) {
            secondsMap[player.id] =
              (secondsMap[player.id] || 0) +
              Math.max(0, playedSecondsThisQuarter - startedAt);
          }
        }
      }
    }

    return secondsMap;
  }, [
    players,
    relevantGameIds,
    gamesById,
    eventsByGame,
    gamePlayersByGame,
    clocksByGame,
    activePlayerIdSet,
    isTeamAEvent,
  ]);

  const playerAvgMinutesMap = useMemo(() => {
    const result: Record<string, string> = {};

    for (const player of players) {
      const totalSeconds = playerTotalSecondsMap[player.id] || 0;
      const gamesPlayed = playerGameCountMap[player.id] || 0;
      result[player.id] = formatAverageSeconds(totalSeconds, gamesPlayed);
    }

    return result;
  }, [players, playerTotalSecondsMap, playerGameCountMap]);

  const playerRows = useMemo<PlayerRow[]>(() => {
    return players.map((player) => {
      const stat = playerStatMap[player.id] || safeStat();
      const gamesPlayed = playerGameCountMap[player.id] || 0;
      const totalSeconds = playerTotalSecondsMap[player.id] || 0;
      const avgMinSeconds = gamesPlayed ? Math.round(totalSeconds / gamesPlayed) : 0;
      const playerEff = eff(stat);

      const avgPtsValue = avgValue(stat.pts, gamesPlayed);
      const avgRebValue = avgValue(stat.reb, gamesPlayed);
      const avgAstValue = avgValue(stat.ast, gamesPlayed);
      const avgStlValue = avgValue(stat.stl, gamesPlayed);
      const avgBlkValue = avgValue(stat.blk, gamesPlayed);
      const avgTovValue = avgValue(stat.tov, gamesPlayed);
      const avgPfValue = avgValue(stat.pf, gamesPlayed);
      const avgEffValue = avgValue(playerEff, gamesPlayed);

      return {
        ...player,
        stat,
        gamesPlayed,
        totalSeconds,
        avgMinSeconds,
        avgMin: playerAvgMinutesMap[player.id] || "0:00",
        eff: playerEff,

        avgPts: avgPtsValue.toFixed(1),
        avgReb: avgRebValue.toFixed(1),
        avgAst: avgAstValue.toFixed(1),
        avgStl: avgStlValue.toFixed(1),
        avgBlk: avgBlkValue.toFixed(1),
        avgTov: avgTovValue.toFixed(1),
        avgPf: avgPfValue.toFixed(1),
        avgEff: avgEffValue.toFixed(1),

        avgPtsValue,
        avgRebValue,
        avgAstValue,
        avgStlValue,
        avgBlkValue,
        avgTovValue,
        avgPfValue,
        avgEffValue,

        fg2PctValue: pctValue(stat.fg2m, stat.fg2a),
        fg3PctValue: pctValue(stat.fg3m, stat.fg3a),
        ftPctValue: pctValue(stat.ftm, stat.fta),
      };
    });
  }, [
    players,
    playerStatMap,
    playerGameCountMap,
    playerAvgMinutesMap,
    playerTotalSecondsMap,
  ]);

  const sortedPlayerRows = useMemo(() => {
    return [...playerRows].sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);

      if (aValue !== bValue) {
        return sortDirection === "desc" ? bValue - aValue : aValue - bValue;
      }

      if (b.avgPtsValue !== a.avgPtsValue) return b.avgPtsValue - a.avgPtsValue;
      if (b.avgEffValue !== a.avgEffValue) return b.avgEffValue - a.avgEffValue;
      return (a.number ?? 999) - (b.number ?? 999);
    });
  }, [playerRows, sortKey, sortDirection]);

  const topThree = useMemo(() => {
    return [...playerRows]
      .sort((a, b) => {
        if (b.avgPtsValue !== a.avgPtsValue) return b.avgPtsValue - a.avgPtsValue;
        if (b.avgEffValue !== a.avgEffValue) return b.avgEffValue - a.avgEffValue;
        return (a.number ?? 999) - (b.number ?? 999);
      })
      .slice(0, 3);
  }, [playerRows]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(255,140,0,0.18),transparent_30%),radial-gradient(circle_at_0%_100%,rgba(255,98,0,0.12),transparent_30%),radial-gradient(circle_at_100%_100%,rgba(96,165,250,0.08),transparent_28%),linear-gradient(180deg,#0b0b0d_0%,#101014_55%,#060606_100%)] px-4 py-6 text-white md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.03),transparent_20%),radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.28)_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18]">
        <div className="absolute left-1/2 top-[8%] h-[72vw] max-h-[980px] w-[72vw] max-w-[980px] -translate-x-1/2 rounded-full border-2 border-white/10" />
        <div className="absolute bottom-0 left-1/2 top-0 -translate-x-1/2 border-l-2 border-white/10" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:28px_28px] opacity-20 [mask-image:radial-gradient(circle_at_center,black_30%,transparent_85%)]" />
      <div className="pointer-events-none absolute left-[-60px] top-[120px] h-[320px] w-[320px] rounded-full bg-orange-500/20 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-[60px] right-[-60px] h-[320px] w-[320px] rounded-full bg-blue-400/15 blur-[100px]" />

      <div className="pointer-events-none absolute right-[70px] top-[90px] hidden h-[210px] w-[210px] animate-[floatBall1_8s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle_at_30%_30%,#ffb347_0%,#f48c06_38%,#d96a00_70%,#9a4d00_100%)] opacity-[0.12] shadow-[inset_-18px_-18px_40px_rgba(0,0,0,0.25),inset_10px_10px_20px_rgba(255,255,255,0.08),0_20px_50px_rgba(0,0,0,0.35)] lg:block" />
      <div className="pointer-events-none absolute bottom-[90px] left-[60px] hidden h-[160px] w-[160px] animate-[floatBall2_10s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle_at_30%_30%,#ffb347_0%,#f48c06_38%,#d96a00_70%,#9a4d00_100%)] opacity-[0.12] shadow-[inset_-18px_-18px_40px_rgba(0,0,0,0.25),inset_10px_10px_20px_rgba(255,255,255,0.08),0_20px_50px_rgba(0,0,0,0.35)] lg:block" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <section className="relative mb-6 overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,140,0,0.08)] backdrop-blur md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,140,0,0.12),transparent_28%,transparent_70%,rgba(255,140,0,0.08)),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_18%)]" />
          <div className="pointer-events-none absolute bottom-[-10px] right-[24px] text-[clamp(54px,10vw,120px)] font-black tracking-[-0.06em] text-white/[0.04]">
            ANALYTICS
          </div>

          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-black tracking-[0.14em] text-orange-100">
                TEAM ANALYTICS
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
                數據中心
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 md:text-[15px]">
                查看團隊整體表現、命中率與球員場均數據，快速掌握目前最有影響力的球員與比賽輸出。
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <HeroChip label="ACTIVE PLAYERS" value={players.length} />
                <HeroChip label="GAMES" value={teamGamesCount} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void loadAll()}
                className="rounded-2xl bg-[linear-gradient(135deg,#ffb347_0%,#f48c06_55%,#d96a00_100%)] px-5 py-3 text-sm font-black tracking-[0.14em] text-white shadow-[0_18px_34px_rgba(244,140,6,0.28),inset_0_1px_0_rgba(255,255,255,0.24)] transition hover:-translate-y-0.5"
              >
                REFRESH
              </button>
            </div>
          </div>

          <div className="relative z-10 mt-6 flex items-center gap-3 border-t border-white/10 pt-4 text-xs font-extrabold tracking-[0.14em] text-orange-100/50">
            <div className="h-2.5 w-2.5 rounded-full bg-[linear-gradient(135deg,#ffb347_0%,#f48c06_100%)] shadow-[0_0_16px_rgba(244,140,6,0.4)]" />
            <span>COURTSIDE ANALYTICS DASHBOARD</span>
          </div>
        </section>

        {msg ? (
          <div className="mb-6 rounded-3xl border border-red-400/25 bg-red-900/20 px-4 py-3 text-red-200 backdrop-blur">
            {msg}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-black/40 p-6 text-zinc-300 backdrop-blur">
            載入中...
          </div>
        ) : (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-3">
              <StatCard label="平均得分" value={avgTeamPts} accent="orange" />
              <StatCard label="平均籃板" value={avgTeamReb} accent="blue" />
              <StatCard label="平均助攻" value={avgTeamAst} accent="violet" />
            </section>

            <section className="mb-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">團隊命中率</h2>
                  <p className="mt-1 text-sm text-zinc-400">快速查看整體出手效率</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <RateCard
                  label="2分球"
                  made={teamTotals.fg2m}
                  attempt={teamTotals.fg2a}
                  accent="orange"
                />
                <RateCard
                  label="3分球"
                  made={teamTotals.fg3m}
                  attempt={teamTotals.fg3a}
                  accent="blue"
                />
                <RateCard
                  label="罰球"
                  made={teamTotals.ftm}
                  attempt={teamTotals.fta}
                  accent="violet"
                />
              </div>
            </section>

            <section className="mb-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">本季焦點球員</h2>
                  <p className="mt-1 text-sm text-zinc-400">依場均得分與效率排序的前三名</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {topThree.length > 0 ? (
                  topThree.map((row, index) => (
                    <TopPlayerCard
                      key={row.id}
                      rank={index + 1}
                      number={row.number}
                      name={row.name}
                      avgPts={row.avgPts}
                      avgReb={row.avgReb}
                      avgAst={row.avgAst}
                      avgEff={row.avgEff}
                    />
                  ))
                ) : (
                  <div className="col-span-full rounded-[28px] border border-white/10 bg-white/5 p-5 text-zinc-300">
                    尚無可顯示的球員資料
                  </div>
                )}
              </div>
            </section>

            <section className="mb-6 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,140,0,0.05)] backdrop-blur">
              <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">球員場均數據列表</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    完整排行、命中率表現與效率值
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-white/10 bg-black/20">
                <table className="min-w-[1480px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-zinc-400">
                      <th className="px-3 py-4 text-left">球員</th>
                      <SortableTh
                        label="GP"
                        sortKeyName="gp"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="AVG MIN"
                        sortKeyName="avgMin"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="AVG PTS"
                        sortKeyName="avgPts"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="AVG REB"
                        sortKeyName="avgReb"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="AVG AST"
                        sortKeyName="avgAst"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="AVG STL"
                        sortKeyName="avgStl"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="AVG BLK"
                        sortKeyName="avgBlk"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="AVG TOV"
                        sortKeyName="avgTov"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="AVG PF"
                        sortKeyName="avgPf"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="2PT%"
                        sortKeyName="fg2Pct"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="3PT%"
                        sortKeyName="fg3Pct"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="FT%"
                        sortKeyName="ftPct"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                      <SortableTh
                        label="AVG EFF"
                        sortKeyName="avgEff"
                        activeKey={sortKey}
                        direction={sortDirection}
                        onClick={handleSort}
                        align="center"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayerRows.length > 0 ? (
                      sortedPlayerRows.map((row, index) => (
                        <tr
                          key={row.id}
                          className="border-b border-white/5 transition hover:bg-white/[0.03]"
                        >
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black ring-1 ${
                                  index === 0
                                    ? "bg-orange-500/20 text-orange-100 ring-orange-300/20"
                                    : index === 1
                                    ? "bg-sky-500/20 text-sky-100 ring-sky-300/20"
                                    : index === 2
                                    ? "bg-violet-500/20 text-violet-100 ring-violet-300/20"
                                    : "bg-white/5 text-orange-100 ring-white/10"
                                }`}
                              >
                                {index + 1}
                              </div>

                              <div className="min-w-0">
                                <div className="whitespace-nowrap font-bold text-white">
                                  #{row.number ?? "-"} {row.name}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4 text-center font-semibold">
                            {row.gamesPlayed}
                          </td>
                          <td className="px-3 py-4 text-center font-semibold text-emerald-300">
                            {row.avgMin}
                          </td>
                          <td className="px-3 py-4 text-center font-bold text-orange-300">
                            {row.avgPts}
                          </td>
                          <td className="px-3 py-4 text-center">{row.avgReb}</td>
                          <td className="px-3 py-4 text-center">{row.avgAst}</td>
                          <td className="px-3 py-4 text-center">{row.avgStl}</td>
                          <td className="px-3 py-4 text-center">{row.avgBlk}</td>
                          <td className="px-3 py-4 text-center">{row.avgTov}</td>
                          <td className="px-3 py-4 text-center">{row.avgPf}</td>
                          <td className="px-3 py-4 text-center">
                            {pct(row.stat.fg2m, row.stat.fg2a)}
                          </td>
                          <td className="px-3 py-4 text-center">
                            {pct(row.stat.fg3m, row.stat.fg3a)}
                          </td>
                          <td className="px-3 py-4 text-center">
                            {pct(row.stat.ftm, row.stat.fta)}
                          </td>
                          <td className="px-3 py-4 text-center font-bold text-cyan-300">
                            {row.avgEff}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={14}
                          className="px-4 py-10 text-center text-zinc-400"
                        >
                          目前沒有球員數據
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <style jsx global>{`
              @keyframes floatBall1 {
                0%,
                100% {
                  transform: translateY(0px) rotate(-16deg);
                }
                50% {
                  transform: translateY(-16px) rotate(-10deg);
                }
              }

              @keyframes floatBall2 {
                0%,
                100% {
                  transform: translateY(0px) rotate(18deg);
                }
                50% {
                  transform: translateY(14px) rotate(24deg);
                }
              }
            `}</style>
          </>
        )}
      </div>
    </main>
  );
}

function HeroChip({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
      <div className="text-[10px] font-black tracking-[0.14em] text-orange-100/60">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = "orange",
}: {
  label: string;
  value: number | string;
  accent?: "orange" | "blue" | "violet";
}) {
  const accentMap: Record<"orange" | "blue" | "violet", string> = {
    orange:
      "from-orange-500/20 to-orange-300/5 text-orange-200 border-orange-400/20",
    blue:
      "from-blue-500/20 to-blue-300/5 text-blue-200 border-blue-400/20",
    violet:
      "from-violet-500/20 to-violet-300/5 text-violet-200 border-violet-400/20",
  };

  return (
    <div
      className={`rounded-[28px] border bg-gradient-to-br ${accentMap[accent]} p-5 shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur transition hover:-translate-y-1`}
    >
      <div className="text-sm font-medium text-zinc-400">{label}</div>
      <div className="mt-3 text-4xl font-black tracking-tight text-white">
        {value}
      </div>
    </div>
  );
}

function RateCard({
  label,
  made,
  attempt,
  accent,
}: {
  label: string;
  made: number;
  attempt: number;
  accent: "orange" | "blue" | "violet";
}) {
  const accentClasses =
    accent === "orange"
      ? {
          pill: "text-orange-100/80",
          value: "text-orange-200",
          glow: "from-orange-500/20 to-orange-300/5 border-orange-400/15",
        }
      : accent === "blue"
      ? {
          pill: "text-sky-100/80",
          value: "text-sky-200",
          glow: "from-sky-500/20 to-sky-300/5 border-sky-400/15",
        }
      : {
          pill: "text-violet-100/80",
          value: "text-violet-200",
          glow: "from-violet-500/20 to-violet-300/5 border-violet-400/15",
        };

  return (
    <div className="rounded-[28px] border bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.34)] backdrop-blur transition hover:-translate-y-1">
      <div
        className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-black tracking-[0.12em] ${accentClasses.pill}`}
      >
        {label}
      </div>
      <div className="mt-4 text-4xl font-black tracking-tight text-white">
        {pct(made, attempt)}
      </div>
      <div className="mt-2 text-sm text-zinc-400">命中 / 出手</div>
      <div className={`mt-1 text-lg font-bold ${accentClasses.value}`}>
        {made}/{attempt}
      </div>
      <div
        className={`mt-4 h-2 w-full overflow-hidden rounded-full border bg-gradient-to-r ${accentClasses.glow}`}
      >
        <div
          className="h-full rounded-full bg-white/80"
          style={{
            width: attempt === 0 ? "0%" : `${(made / attempt) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

function TopPlayerCard({
  rank,
  number,
  name,
  avgPts,
  avgReb,
  avgAst,
  avgEff,
}: {
  rank: number;
  number: number | null;
  name: string;
  avgPts: string;
  avgReb: string;
  avgAst: string;
  avgEff: string;
}) {
  const theme =
    rank === 1
      ? {
          ring: "border-orange-300/20",
          badge: "bg-orange-500/20 text-orange-100",
        }
      : rank === 2
      ? {
          ring: "border-sky-300/20",
          badge: "bg-sky-500/20 text-sky-100",
        }
      : {
          ring: "border-violet-300/20",
          badge: "bg-violet-500/20 text-violet-100",
        };

  return (
    <div
      className={`rounded-[28px] border ${theme.ring} bg-[linear-gradient(180deg,rgba(24,24,28,0.96)_0%,rgba(10,10,12,0.98)_100%)] p-5 shadow-[0_20px_44px_rgba(0,0,0,0.34)] backdrop-blur`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={`inline-flex rounded-full px-3 py-1 text-xs font-black tracking-[0.12em] ${theme.badge}`}
          >
            TOP {rank}
          </div>
          <div className="mt-4 text-xl font-black text-white">
            #{number ?? "-"} {name}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[11px] font-black tracking-[0.14em] text-zinc-500">
            AVG PTS
          </div>
          <div className="mt-1 text-3xl font-black text-white">{avgPts}</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <MiniValue label="REB" value={avgReb} />
        <MiniValue label="AST" value={avgAst} />
        <MiniValue label="EFF" value={avgEff} />
      </div>
    </div>
  );
}

function MiniValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center">
      <div className="text-[10px] font-black tracking-[0.12em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function SortableTh({
  label,
  sortKeyName,
  activeKey,
  direction,
  onClick,
  align = "left",
}: {
  label: string;
  sortKeyName: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onClick: (key: SortKey) => void;
  align?: "left" | "center";
}) {
  const active = activeKey === sortKeyName;
  const arrow = active ? (direction === "desc" ? "↓" : "↑") : "↕";

  return (
    <th
      className={`px-3 py-4 ${align === "center" ? "text-center" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onClick(sortKeyName)}
        className={`inline-flex items-center gap-1 font-semibold transition ${
          active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
        }`}
      >
        <span>{label}</span>
        <span className="text-[11px]">{arrow}</span>
      </button>
    </th>
  );
}