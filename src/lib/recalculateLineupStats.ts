import { supabase } from "./supabaseClient";

type PlayerRow = {
  id: string;
  name: string;
  number?: number | null;
  active?: boolean | null;
};

type GamePlayerRow = {
  player_id: string;
  team_side?: string | null;
  is_starter?: boolean | null;
  is_active?: boolean | null;
};

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  is_undone?: boolean | null;
  undone_at?: string | null;
  team_side?: string | null;
  clock_seconds_left?: number | null;
  points_delta?: number | null;
};

type AggregateRow = {
  player_ids: string[];
  player_names: string[];
  appearances: number;
  seconds_played: number;
  plus_minus: number;
  possessions: number;
  points_for: number;
  points_against: number;
  off_rating: number;
};

type SegmentTotals = {
  pointsFor: number;
  pointsAgainst: number;
  fga: number;
  fta: number;
  tov: number;
};

type UpsertLineupRow = {
  game_id: string;
  lineup_key: string;
  player_ids: string[];
  player_names: string[];
  appearances: number;
  seconds_played: number;
  plus_minus: number;
  possessions: number;
  points_for: number;
  points_against: number;
  off_rating: number;
};

type UpsertPairRow = {
  game_id: string;
  pair_key: string;
  player_ids: string[];
  player_names: string[];
  appearances: number;
  seconds_played: number;
  plus_minus: number;
  possessions: number;
  points_for: number;
  points_against: number;
  off_rating: number;
};

type UpsertTrioRow = {
  game_id: string;
  trio_key: string;
  player_ids: string[];
  player_names: string[];
  appearances: number;
  seconds_played: number;
  plus_minus: number;
  possessions: number;
  points_for: number;
  points_against: number;
  off_rating: number;
};

function normalizeEventType(type?: string | null) {
  return (type ?? "").trim().toLowerCase();
}

function normalizeTeamSide(side?: string | null) {
  const s = (side ?? "").trim().toLowerCase();
  if (s === "a" || s === "teama" || s === "team_a" || s === "home") return "teamA";
  if (s === "b" || s === "teamb" || s === "team_b" || s === "away") return "teamB";
  return "";
}

function getQuarterStartSeconds(quarter: number) {
  return quarter >= 1 && quarter <= 4 ? 600 : 300;
}

function clampClock(clock: number | null | undefined, quarter: number) {
  const max = getQuarterStartSeconds(quarter);
  const value = Number(clock ?? max);
  if (!Number.isFinite(value)) return max;
  if (value < 0) return 0;
  if (value > max) return max;
  return Math.floor(value);
}

function getPointsFromEvent(event: EventRow) {
  const explicit = Number(event.points_delta ?? 0);
  if (Number.isFinite(explicit) && explicit !== 0) {
    return explicit;
  }

  const t = normalizeEventType(event.event_type);
  if (t === "fg2_make" || t === "fg2_made") return 2;
  if (t === "fg3_make" || t === "fg3_made") return 3;
  if (t === "ft_make" || t === "ft_made") return 1;
  return 0;
}

function isFieldGoalAttempt(type: string) {
  return (
    type === "fg2_make" ||
    type === "fg2_made" ||
    type === "fg2_miss" ||
    type === "fg3_make" ||
    type === "fg3_made" ||
    type === "fg3_miss"
  );
}

function isFreeThrowAttempt(type: string) {
  return (
    type === "ft_make" ||
    type === "ft_made" ||
    type === "ft_miss"
  );
}

function isTurnover(type: string) {
  return type === "tov" || type === "turnover";
}

function isSubOut(type: string) {
  return type === "sub_out" || type === "subout";
}

function isSubIn(type: string) {
  return type === "sub_in" || type === "subin";
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function sortedIds(ids: string[]) {
  return [...uniqueIds(ids)].sort((a, b) => a.localeCompare(b));
}

function makeKey(ids: string[]) {
  return sortedIds(ids).join("|");
}

function combinations(ids: string[], pick: number): string[][] {
  const source = sortedIds(ids);
  const result: string[][] = [];

  function walk(start: number, path: string[]) {
    if (path.length === pick) {
      result.push([...path]);
      return;
    }
    for (let i = start; i < source.length; i += 1) {
      path.push(source[i]);
      walk(i + 1, path);
      path.pop();
    }
  }

  walk(0, []);
  return result;
}

function emptySegmentTotals(): SegmentTotals {
  return {
    pointsFor: 0,
    pointsAgainst: 0,
    fga: 0,
    fta: 0,
    tov: 0,
  };
}

function resetSegmentTotals(target: SegmentTotals) {
  target.pointsFor = 0;
  target.pointsAgainst = 0;
  target.fga = 0;
  target.fta = 0;
  target.tov = 0;
}

function getPlayerNames(ids: string[], playerMap: Map<string, PlayerRow>) {
  return sortedIds(ids).map((id) => playerMap.get(id)?.name || "未知球員");
}

function ensureAgg(
  map: Map<string, AggregateRow>,
  ids: string[],
  playerMap: Map<string, PlayerRow>
) {
  const key = makeKey(ids);
  let current = map.get(key);

  if (!current) {
    current = {
      player_ids: sortedIds(ids),
      player_names: getPlayerNames(ids, playerMap),
      appearances: 0,
      seconds_played: 0,
      plus_minus: 0,
      possessions: 0,
      points_for: 0,
      points_against: 0,
      off_rating: 0,
    };
    map.set(key, current);
  }

  return current;
}

function addSegmentToAggregate(
  map: Map<string, AggregateRow>,
  ids: string[],
  playerMap: Map<string, PlayerRow>,
  secondsPlayed: number,
  totals: SegmentTotals
) {
  if (secondsPlayed <= 0) return;
  const normalizedIds = sortedIds(ids);
  if (normalizedIds.length === 0) return;

  const agg = ensureAgg(map, normalizedIds, playerMap);
  agg.appearances += 1;
  agg.seconds_played += secondsPlayed;
  agg.points_for += totals.pointsFor;
  agg.points_against += totals.pointsAgainst;
  agg.plus_minus += totals.pointsFor - totals.pointsAgainst;
  agg.possessions += totals.fga + totals.tov + 0.44 * totals.fta;
}

function finalizeRatings<T extends AggregateRow>(rows: T[]) {
  return rows.map((row) => ({
    ...row,
    off_rating: row.possessions > 0 ? Number(((row.points_for / row.possessions) * 100).toFixed(2)) : 0,
    possessions: Number(row.possessions.toFixed(2)),
  }));
}

function sortEvents(events: EventRow[]) {
  return [...events].sort((a, b) => {
    const q = (a.quarter ?? 0) - (b.quarter ?? 0);
    if (q !== 0) return q;

    const ca = new Date(a.created_at).getTime();
    const cb = new Date(b.created_at).getTime();
    if (ca !== cb) return ca - cb;

    return a.id.localeCompare(b.id);
  });
}

function applySubstitution(currentLineup: string[], event: EventRow) {
  const playerId = event.player_id;
  if (!playerId) return currentLineup;

  const type = normalizeEventType(event.event_type);
  const next = [...currentLineup];

  if (isSubOut(type)) {
    return next.filter((id) => id !== playerId);
  }

  if (isSubIn(type)) {
    if (!next.includes(playerId)) {
      next.push(playerId);
    }
    return uniqueIds(next);
  }

  return currentLineup;
}

async function deleteOldRows(gameId: string) {
  const [a, b, c] = await Promise.all([
    supabase.from("lineup_stats").delete().eq("game_id", gameId),
    supabase.from("lineup_pair_stats").delete().eq("game_id", gameId),
    supabase.from("lineup_trio_stats").delete().eq("game_id", gameId),
  ]);

  if (a.error) throw a.error;
  if (b.error) throw b.error;
  if (c.error) throw c.error;
}

async function insertInChunks<T>(table: string, rows: T[], chunkSize = 500) {
  if (!rows.length) return;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

export async function recalculateLineupStats(gameId: string) {
  if (!gameId) {
    throw new Error("recalculateLineupStats: 缺少 gameId");
  }

  const [
    gamePlayersRes,
    playersRes,
    eventsRes,
  ] = await Promise.all([
    supabase
      .from("game_players")
      .select("player_id, team_side, is_starter, is_active")
      .eq("game_id", gameId),
    supabase
      .from("players")
      .select("id, name, number, active"),
    supabase
      .from("events")
      .select(
        "id, game_id, player_id, quarter, event_type, created_at, is_undone, undone_at, team_side, clock_seconds_left, points_delta"
      )
      .eq("game_id", gameId)
      .eq("is_undone", false),
  ]);

  if (gamePlayersRes.error) throw gamePlayersRes.error;
  if (playersRes.error) throw playersRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const gamePlayers = (gamePlayersRes.data ?? []) as GamePlayerRow[];
  const players = (playersRes.data ?? []) as PlayerRow[];
  const events = sortEvents((eventsRes.data ?? []) as EventRow[]);

  const playerMap = new Map<string, PlayerRow>();
  for (const p of players) {
    playerMap.set(p.id, p);
  }

  const teamAGamePlayers = gamePlayers.filter(
    (row) => normalizeTeamSide(row.team_side) === "teamA"
  );

  const starterIds = teamAGamePlayers
    .filter((row) => row.is_starter)
    .map((row) => row.player_id)
    .filter(Boolean);

  const fallbackIds = teamAGamePlayers
    .filter((row) => row.is_active !== false)
    .map((row) => row.player_id)
    .filter(Boolean);

  let currentLineup = uniqueIds(
    starterIds.length >= 5 ? starterIds.slice(0, 5) : fallbackIds.slice(0, 5)
  );

  if (currentLineup.length < 5) {
    throw new Error("無法重算 lineup：teamA 的先發 / 啟用球員不足 5 人");
  }

  const lineupAgg = new Map<string, AggregateRow>();
  const pairAgg = new Map<string, AggregateRow>();
  const trioAgg = new Map<string, AggregateRow>();

  let currentQuarter = 1;
  let quarterInitialized = false;
  let segmentStartClock = getQuarterStartSeconds(1);
  let segmentTotals = emptySegmentTotals();

  function closeCurrentSegment(endClockRaw: number | null | undefined) {
    const endClock = clampClock(endClockRaw, currentQuarter);
    const secondsPlayed = Math.max(0, segmentStartClock - endClock);

    const validLineup = sortedIds(currentLineup);
    if (validLineup.length === 5 && secondsPlayed > 0) {
      addSegmentToAggregate(lineupAgg, validLineup, playerMap, secondsPlayed, segmentTotals);

      for (const pair of combinations(validLineup, 2)) {
        addSegmentToAggregate(pairAgg, pair, playerMap, secondsPlayed, segmentTotals);
      }

      for (const trio of combinations(validLineup, 3)) {
        addSegmentToAggregate(trioAgg, trio, playerMap, secondsPlayed, segmentTotals);
      }
    }

    segmentStartClock = endClock;
    resetSegmentTotals(segmentTotals);
  }

  for (const event of events) {
    const quarter = Number(event.quarter ?? 1) || 1;

    if (!quarterInitialized) {
      currentQuarter = quarter;
      segmentStartClock = getQuarterStartSeconds(currentQuarter);
      quarterInitialized = true;
    }

    if (quarter !== currentQuarter) {
      closeCurrentSegment(0);

      currentQuarter = quarter;
      segmentStartClock = getQuarterStartSeconds(currentQuarter);
      resetSegmentTotals(segmentTotals);
    }

    const type = normalizeEventType(event.event_type);
    const side = normalizeTeamSide(event.team_side);
    const clock = clampClock(event.clock_seconds_left, currentQuarter);

    const points = getPointsFromEvent(event);
    if (points > 0) {
      if (side === "teamA") segmentTotals.pointsFor += points;
      if (side === "teamB") segmentTotals.pointsAgainst += points;
    }

    if (side === "teamA") {
      if (isFieldGoalAttempt(type)) segmentTotals.fga += 1;
      if (isFreeThrowAttempt(type)) segmentTotals.fta += 1;
      if (isTurnover(type)) segmentTotals.tov += 1;
    }

    if (isSubOut(type) || isSubIn(type)) {
      closeCurrentSegment(clock);
      currentLineup = applySubstitution(currentLineup, event);
      segmentStartClock = clock;
    }
  }

  if (quarterInitialized) {
    closeCurrentSegment(0);
  }

  const lineupRows = finalizeRatings(Array.from(lineupAgg.values())).map<UpsertLineupRow>((row) => ({
    game_id: gameId,
    lineup_key: makeKey(row.player_ids),
    player_ids: row.player_ids,
    player_names: row.player_names,
    appearances: row.appearances,
    seconds_played: row.seconds_played,
    plus_minus: row.plus_minus,
    possessions: row.possessions,
    points_for: row.points_for,
    points_against: row.points_against,
    off_rating: row.off_rating,
  }));

  const pairRows = finalizeRatings(Array.from(pairAgg.values())).map<UpsertPairRow>((row) => ({
    game_id: gameId,
    pair_key: makeKey(row.player_ids),
    player_ids: row.player_ids,
    player_names: row.player_names,
    appearances: row.appearances,
    seconds_played: row.seconds_played,
    plus_minus: row.plus_minus,
    possessions: row.possessions,
    points_for: row.points_for,
    points_against: row.points_against,
    off_rating: row.off_rating,
  }));

  const trioRows = finalizeRatings(Array.from(trioAgg.values())).map<UpsertTrioRow>((row) => ({
    game_id: gameId,
    trio_key: makeKey(row.player_ids),
    player_ids: row.player_ids,
    player_names: row.player_names,
    appearances: row.appearances,
    seconds_played: row.seconds_played,
    plus_minus: row.plus_minus,
    possessions: row.possessions,
    points_for: row.points_for,
    points_against: row.points_against,
    off_rating: row.off_rating,
  }));

  await deleteOldRows(gameId);
  await insertInChunks("lineup_stats", lineupRows);
  await insertInChunks("lineup_pair_stats", pairRows);
  await insertInChunks("lineup_trio_stats", trioRows);

  return {
    ok: true,
    gameId,
    lineupCount: lineupRows.length,
    pairCount: pairRows.length,
    trioCount: trioRows.length,
  };
}

export default recalculateLineupStats;