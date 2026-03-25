import { supabase } from "@/lib/supabaseClient";

type GameRow = {
  id: string;
  is_official?: boolean | null;
  quarters?: number | null;
};

type PlayerRow = {
  id: string;
  name: string;
};

type GamePlayerRow = {
  player_id: string;
  team_side?: string | null;
  is_starter?: boolean | null;
};

type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  team_side?: string | null;
  clock_seconds_left?: number | null;
  points_delta?: number | null;
  is_undone?: boolean | null;
};

type PlayerShiftRow = {
  id: string;
  game_id: string;
  player_id: string;
  quarter: number;
  team_side: string | null;
  in_seconds_left: number;
  out_seconds_left: number | null;
};

type RawLineupStat = {
  lineup_key: string;
  player_ids: string[];
  player_names: string[];
  seconds_played: number;
  points_for: number;
  points_against: number;
  est_possessions: number;
  fga: number;
  fta: number;
  oreb: number;
  tov: number;
};

type RawComboStat = {
  combo_size: 2 | 3;
  combo_key: string;
  player_ids: string[];
  player_names: string[];
  seconds_played: number;
  points_for: number;
  points_against: number;
  est_possessions: number;
};

function normalizeTeamSide(v?: string | null): "teamA" | "teamB" | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return null;

  if (["a", "teama", "team_a", "home", "ours", "our", "teama"].includes(s)) return "teamA";
  if (["b", "teamb", "team_b", "away", "opp", "opponent", "teamb"].includes(s)) return "teamB";

  return null;
}

function normalizeEventType(v?: string | null): string {
  return (v ?? "").trim().toLowerCase();
}

function quarterLength(q: number) {
  return q <= 4 ? 600 : 300;
}

function calcScoreDelta(event: EventRow): number {
  if (typeof event.points_delta === "number" && !Number.isNaN(event.points_delta)) {
    return event.points_delta;
  }

  const t = normalizeEventType(event.event_type);

  if (["fg2_make", "fg2_made", "2pt_make", "2pt_made"].includes(t)) return 2;
  if (["fg3_make", "fg3_made", "3pt_make", "3pt_made"].includes(t)) return 3;
  if (["ft_make", "ft_made"].includes(t)) return 1;

  return 0;
}

function isMadeShot(eventType: string) {
  return [
    "fg2_make",
    "fg2_made",
    "2pt_make",
    "2pt_made",
    "fg3_make",
    "fg3_made",
    "3pt_make",
    "3pt_made",
  ].includes(eventType);
}

function isMissShot(eventType: string) {
  return ["fg2_miss", "2pt_miss", "fg3_miss", "3pt_miss"].includes(eventType);
}

function isFreeThrow(eventType: string) {
  return ["ft_make", "ft_made", "ft_miss"].includes(eventType);
}

function isOffensiveRebound(eventType: string) {
  return ["oreb", "off_reb", "offensive_rebound"].includes(eventType);
}

function isTurnover(eventType: string) {
  return ["tov", "turnover"].includes(eventType);
}

function uniqSorted(ids: string[]) {
  return [...new Set(ids.filter(Boolean))].sort();
}

function makeKey(ids: string[]) {
  return uniqSorted(ids).join("|");
}

function formatNames(ids: string[], playerMap: Map<string, string>) {
  return uniqSorted(ids).map((id) => playerMap.get(id) ?? "未知球員");
}

function nCrCombinations<T>(arr: T[], choose: number): T[][] {
  const result: T[][] = [];
  const n = arr.length;
  if (choose > n) return result;

  const dfs = (start: number, path: T[]) => {
    if (path.length === choose) {
      result.push([...path]);
      return;
    }
    for (let i = start; i < n; i++) {
      path.push(arr[i]);
      dfs(i + 1, path);
      path.pop();
    }
  };

  dfs(0, []);
  return result;
}

function ensureLineupStat(
  map: Map<string, RawLineupStat>,
  lineupIds: string[],
  playerMap: Map<string, string>
) {
  const ids = uniqSorted(lineupIds);
  const key = makeKey(ids);

  if (!map.has(key)) {
    map.set(key, {
      lineup_key: key,
      player_ids: ids,
      player_names: formatNames(ids, playerMap),
      seconds_played: 0,
      points_for: 0,
      points_against: 0,
      est_possessions: 0,
      fga: 0,
      fta: 0,
      oreb: 0,
      tov: 0,
    });
  }

  return map.get(key)!;
}

function finalizePossessions(row: RawLineupStat) {
  const est = row.fga - row.oreb + row.tov + 0.44 * row.fta;
  row.est_possessions = Number(Math.max(est, 0).toFixed(2));
}

function clampClock(quarter: number, secondsLeft: number | null | undefined) {
  const qLen = quarterLength(quarter);
  const v = typeof secondsLeft === "number" ? secondsLeft : 0;
  return Math.max(0, Math.min(qLen, v));
}

function getShiftEndSeconds(shift: PlayerShiftRow) {
  return shift.out_seconds_left == null ? 0 : shift.out_seconds_left;
}

function sameLineup(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const aa = uniqSorted(a);
  const bb = uniqSorted(b);
  return aa.every((v, i) => v === bb[i]);
}

function buildQuarterLineupSegments(params: {
  quarter: number;
  teamAPlayerIds: string[];
  shifts: PlayerShiftRow[];
}) {
  const { quarter, teamAPlayerIds, shifts } = params;
  const qLen = quarterLength(quarter);

  const relevant = shifts.filter(
    (s) => normalizeTeamSide(s.team_side) === "teamA" && s.quarter === quarter
  );

  const boundaries = new Set<number>([qLen, 0]);

  for (const s of relevant) {
    boundaries.add(clampClock(quarter, s.in_seconds_left));
    boundaries.add(clampClock(quarter, getShiftEndSeconds(s)));
  }

  const sortedBounds = [...boundaries].sort((a, b) => b - a);

  const segments: Array<{
    quarter: number;
    start_seconds_left: number;
    end_seconds_left: number;
    seconds_played: number;
    lineup_ids: string[];
  }> = [];

  for (let i = 0; i < sortedBounds.length - 1; i++) {
    const start = sortedBounds[i];
    const end = sortedBounds[i + 1];
    const duration = start - end;

    if (duration <= 0) continue;

    const lineupIds = teamAPlayerIds.filter((playerId) => {
      const playerQuarterShifts = relevant.filter((s) => s.player_id === playerId);
      if (!playerQuarterShifts.length) return false;

      return playerQuarterShifts.some((s) => {
        const inSec = clampClock(quarter, s.in_seconds_left);
        const outSec = clampClock(quarter, getShiftEndSeconds(s));
        return start <= inSec && end >= outSec;
      });
    });

    if (lineupIds.length === 0) continue;

    const last = segments[segments.length - 1];
    if (
      last &&
      last.quarter === quarter &&
      last.end_seconds_left === start &&
      sameLineup(last.lineup_ids, lineupIds)
    ) {
      last.end_seconds_left = end;
      last.seconds_played += duration;
    } else {
      segments.push({
        quarter,
        start_seconds_left: start,
        end_seconds_left: end,
        seconds_played: duration,
        lineup_ids: uniqSorted(lineupIds),
      });
    }
  }

  return segments;
}

function getActiveLineupAtClock(params: {
  quarter: number;
  eventClock: number;
  teamAPlayerIds: string[];
  shifts: PlayerShiftRow[];
}) {
  const { quarter, eventClock, teamAPlayerIds, shifts } = params;

  const relevant = shifts.filter(
    (s) => normalizeTeamSide(s.team_side) === "teamA" && s.quarter === quarter
  );

  const activeIds = teamAPlayerIds.filter((playerId) => {
    const playerQuarterShifts = relevant.filter((s) => s.player_id === playerId);
    if (!playerQuarterShifts.length) return false;

    return playerQuarterShifts.some((s) => {
      const inSec = clampClock(quarter, s.in_seconds_left);
      const outSec = clampClock(quarter, getShiftEndSeconds(s));
      return eventClock <= inSec && eventClock >= outSec;
    });
  });

  return uniqSorted(activeIds);
}

function inferEventSide(
  event: EventRow,
  teamAPlayerIdSet: Set<string>
): "teamA" | "teamB" | null {
  const normalized = normalizeTeamSide(event.team_side);
  if (normalized) return normalized;

  if (event.player_id && teamAPlayerIdSet.has(event.player_id)) {
    return "teamA";
  }

  const t = normalizeEventType(event.event_type);
  const scoreDelta = calcScoreDelta(event);

  if (scoreDelta > 0 && !event.player_id) {
    return "teamB";
  }

  if (
    [
      "reb",
      "oreb",
      "off_reb",
      "offensive_rebound",
      "ast",
      "stl",
      "blk",
      "tov",
      "turnover",
      "pf",
      "fg2_make",
      "fg2_made",
      "2pt_make",
      "2pt_made",
      "fg2_miss",
      "2pt_miss",
      "fg3_make",
      "fg3_made",
      "3pt_make",
      "3pt_made",
      "fg3_miss",
      "3pt_miss",
      "ft_make",
      "ft_made",
      "ft_miss",
      "sub_in",
      "sub_out",
    ].includes(t) &&
    event.player_id &&
    teamAPlayerIdSet.has(event.player_id)
  ) {
    return "teamA";
  }

  return null;
}

export async function recalculateLineupStats(gameId: string) {
  const [
    { data: game, error: gameError },
    { data: players, error: playersError },
    { data: gamePlayers, error: gpError },
    { data: events, error: eventsError },
    { data: shifts, error: shiftsError },
  ] = await Promise.all([
    supabase
      .from("games")
      .select("id,is_official,quarters")
      .eq("id", gameId)
      .single<GameRow>(),

    supabase.from("players").select("id,name").returns<PlayerRow[]>(),

    supabase
      .from("game_players")
      .select("player_id,team_side,is_starter")
      .eq("game_id", gameId)
      .returns<GamePlayerRow[]>(),

    supabase
      .from("events")
      .select(
        "id,game_id,player_id,quarter,event_type,created_at,team_side,clock_seconds_left,points_delta,is_undone"
      )
      .eq("game_id", gameId)
      .or("is_undone.is.null,is_undone.eq.false")
      .order("quarter", { ascending: true })
      .order("clock_seconds_left", { ascending: false })
      .order("created_at", { ascending: true })
      .returns<EventRow[]>(),

    supabase
      .from("player_shifts")
      .select(
        "id,game_id,player_id,quarter,team_side,in_seconds_left,out_seconds_left"
      )
      .eq("game_id", gameId)
      .returns<PlayerShiftRow[]>(),
  ]);

  if (gameError || !game) throw new Error(gameError?.message || "找不到比賽資料");
  if (playersError) throw new Error(playersError.message);
  if (gpError) throw new Error(gpError.message);
  if (eventsError) throw new Error(eventsError.message);
  if (shiftsError) throw new Error(shiftsError.message);

  const isOfficial = Boolean(game.is_official ?? true);

  const playerMap = new Map<string, string>((players ?? []).map((p) => [p.id, p.name]));

  const teamAPlayerIds = uniqSorted(
    (gamePlayers ?? [])
      .filter((gp) => normalizeTeamSide(gp.team_side) === "teamA")
      .map((gp) => gp.player_id)
  );

  const teamAPlayerIdSet = new Set(teamAPlayerIds);

  const safeEvents = (events ?? []).filter((e) => e.quarter >= 1);
  const maxEventQuarter =
    safeEvents.reduce((m, e) => Math.max(m, e.quarter || 1), 1) || 1;

  const maxShiftQuarter =
    (shifts ?? []).reduce((m, s) => Math.max(m, s.quarter || 1), 1) || 1;

  const totalQuarters = Math.max(game.quarters ?? 4, maxEventQuarter, maxShiftQuarter, 4);

  const lineupMap = new Map<string, RawLineupStat>();

  const allSegments: Array<{
    quarter: number;
    start_seconds_left: number;
    end_seconds_left: number;
    seconds_played: number;
    lineup_ids: string[];
  }> = [];

  for (let q = 1; q <= totalQuarters; q++) {
    const segments = buildQuarterLineupSegments({
      quarter: q,
      teamAPlayerIds,
      shifts: (shifts ?? []) as PlayerShiftRow[],
    });

    for (const seg of segments) {
      const row = ensureLineupStat(lineupMap, seg.lineup_ids, playerMap);
      row.seconds_played += seg.seconds_played;
      allSegments.push(seg);
    }
  }

  for (const event of safeEvents) {
    const eventQuarter = event.quarter;
    const eventClock = clampClock(eventQuarter, event.clock_seconds_left);
    const side = inferEventSide(event, teamAPlayerIdSet);
    const type = normalizeEventType(event.event_type);
    const scoreDelta = calcScoreDelta(event);

    let lineupIds = getActiveLineupAtClock({
      quarter: eventQuarter,
      eventClock,
      teamAPlayerIds,
      shifts: (shifts ?? []) as PlayerShiftRow[],
    });

    if (lineupIds.length === 0) {
      const fallbackSegment = allSegments.find(
        (seg) =>
          seg.quarter === eventQuarter &&
          eventClock <= seg.start_seconds_left &&
          eventClock >= seg.end_seconds_left
      );
      lineupIds = fallbackSegment?.lineup_ids ?? [];
    }

    if (lineupIds.length === 0) continue;

    const row = ensureLineupStat(lineupMap, lineupIds, playerMap);

    if (side === "teamA") {
      if (scoreDelta > 0) row.points_for += scoreDelta;
      if (isMadeShot(type) || isMissShot(type)) row.fga += 1;
      if (isFreeThrow(type)) row.fta += 1;
      if (isOffensiveRebound(type)) row.oreb += 1;
      if (isTurnover(type)) row.tov += 1;
    } else if (side === "teamB") {
      if (scoreDelta > 0) row.points_against += scoreDelta;
    }
  }

  const lineupRows = [...lineupMap.values()]
    .map((row) => {
      finalizePossessions(row);
      const plusMinus = row.points_for - row.points_against;
      const offRating =
        row.est_possessions > 0
          ? Number(((row.points_for / row.est_possessions) * 100).toFixed(2))
          : 0;

      return {
        game_id: gameId,
        lineup_key: row.lineup_key,
        player_ids: row.player_ids,
        player_names: row.player_names,
        seconds_played: row.seconds_played,
        est_possessions: row.est_possessions,
        points_for: row.points_for,
        points_against: row.points_against,
        plus_minus: plusMinus,
        off_rating: offRating,
        is_official: isOfficial,
      };
    })
    .filter((row) => row.seconds_played > 0 && row.player_ids.length > 0);

  const comboMap = new Map<string, RawComboStat>();

  function addComboStat(
    comboSize: 2 | 3,
    comboIds: string[],
    source: (typeof lineupRows)[number]
  ) {
    const ids = uniqSorted(comboIds);
    const pureKey = makeKey(ids);
    const key = `${comboSize}:${pureKey}`;

    if (!comboMap.has(key)) {
      comboMap.set(key, {
        combo_size: comboSize,
        combo_key: pureKey,
        player_ids: ids,
        player_names: formatNames(ids, playerMap),
        seconds_played: 0,
        points_for: 0,
        points_against: 0,
        est_possessions: 0,
      });
    }

    const row = comboMap.get(key)!;
    row.seconds_played += source.seconds_played;
    row.points_for += source.points_for;
    row.points_against += source.points_against;
    row.est_possessions = Number(
      (row.est_possessions + source.est_possessions).toFixed(2)
    );
  }

  for (const row of lineupRows) {
    const ids = row.player_ids;

    if (ids.length >= 2) {
      for (const combo of nCrCombinations(ids, 2)) {
        addComboStat(2, combo, row);
      }
    }

    if (ids.length >= 3) {
      for (const combo of nCrCombinations(ids, 3)) {
        addComboStat(3, combo, row);
      }
    }
  }

  const comboRows = [...comboMap.values()]
    .map((row) => {
      const plusMinus = row.points_for - row.points_against;
      const offRating =
        row.est_possessions > 0
          ? Number(((row.points_for / row.est_possessions) * 100).toFixed(2))
          : 0;

      return {
        game_id: gameId,
        combo_size: row.combo_size,
        combo_key: row.combo_key,
        player_ids: row.player_ids,
        player_names: row.player_names,
        seconds_played: row.seconds_played,
        est_possessions: row.est_possessions,
        points_for: row.points_for,
        points_against: row.points_against,
        plus_minus: plusMinus,
        off_rating: offRating,
        is_official: isOfficial,
      };
    })
    .filter((row) => row.seconds_played > 0 && row.player_ids.length > 0);

  const { error: deleteLineupError } = await supabase
    .from("lineup_stats")
    .delete()
    .eq("game_id", gameId);

  if (deleteLineupError) throw new Error(deleteLineupError.message);

  const { error: deleteComboError } = await supabase
    .from("lineup_combo_stats")
    .delete()
    .eq("game_id", gameId);

  if (deleteComboError) throw new Error(deleteComboError.message);

  if (lineupRows.length > 0) {
    const { error: insertLineupError } = await supabase
      .from("lineup_stats")
      .insert(lineupRows);

    if (insertLineupError) throw new Error(insertLineupError.message);
  }

  if (comboRows.length > 0) {
    const { error: insertComboError } = await supabase
      .from("lineup_combo_stats")
      .insert(comboRows);

    if (insertComboError) throw new Error(insertComboError.message);
  }

  return {
    lineupCount: lineupRows.length,
    comboCount: comboRows.length,
  };
}