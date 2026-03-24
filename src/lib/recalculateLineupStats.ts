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

  if (["a", "teama", "team_a", "home", "ours", "our"].includes(s)) return "teamA";
  if (["b", "teamb", "team_b", "away", "opp", "opponent"].includes(s)) return "teamB";

  return null;
}

function normalizeEventType(v?: string | null): string {
  return (v ?? "").trim().toLowerCase();
}

function quarterLength(q: number) {
  return q <= 4 ? 600 : 300;
}

function calcScoreDelta(event: EventRow): number {
  if (typeof event.points_delta === "number") return event.points_delta;

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
  return [
    "fg2_miss",
    "2pt_miss",
    "fg3_miss",
    "3pt_miss",
  ].includes(eventType);
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

function isSubIn(eventType: string) {
  return ["sub_in", "subin"].includes(eventType);
}

function isSubOut(eventType: string) {
  return ["sub_out", "subout"].includes(eventType);
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

function addSegmentTime(
  map: Map<string, RawLineupStat>,
  lineupIds: string[],
  seconds: number,
  playerMap: Map<string, string>
) {
  if (seconds <= 0) return;
  if (lineupIds.length === 0) return;

  const row = ensureLineupStat(map, lineupIds, playerMap);
  row.seconds_played += seconds;
}

function addForTeamEvent(
  map: Map<string, RawLineupStat>,
  lineupIds: string[],
  event: EventRow,
  playerMap: Map<string, string>
) {
  if (lineupIds.length === 0) return;

  const row = ensureLineupStat(map, lineupIds, playerMap);
  const t = normalizeEventType(event.event_type);
  const scoreDelta = calcScoreDelta(event);

  if (scoreDelta > 0) row.points_for += scoreDelta;

  if (isMadeShot(t) || isMissShot(t)) row.fga += 1;
  if (isFreeThrow(t)) row.fta += 1;
  if (isOffensiveRebound(t)) row.oreb += 1;
  if (isTurnover(t)) row.tov += 1;
}

function addAgainstTeamEvent(
  map: Map<string, RawLineupStat>,
  lineupIds: string[],
  event: EventRow,
  playerMap: Map<string, string>
) {
  if (lineupIds.length === 0) return;

  const row = ensureLineupStat(map, lineupIds, playerMap);
  const scoreDelta = calcScoreDelta(event);

  if (scoreDelta > 0) row.points_against += scoreDelta;
}

function finalizePossessions(row: RawLineupStat) {
  const est = row.fga - row.oreb + row.tov + 0.44 * row.fta;
  row.est_possessions = Number(Math.max(est, 0).toFixed(2));
}

export async function recalculateLineupStats(gameId: string) {
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id,is_official,quarters")
    .eq("id", gameId)
    .single<GameRow>();

  if (gameError || !game) {
    throw new Error(gameError?.message || "找不到比賽資料");
  }

  const isOfficial = Boolean(game.is_official ?? true);

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id,name")
    .returns<PlayerRow[]>();

  if (playersError) {
    throw new Error(playersError.message);
  }

  const playerMap = new Map<string, string>(
    (players ?? []).map((p) => [p.id, p.name])
  );

  const { data: gamePlayers, error: gpError } = await supabase
    .from("game_players")
    .select("player_id,team_side,is_starter")
    .eq("game_id", gameId)
    .returns<GamePlayerRow[]>();

  if (gpError) {
    throw new Error(gpError.message);
  }

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select(
      "id,game_id,player_id,quarter,event_type,created_at,team_side,clock_seconds_left,points_delta,is_undone"
    )
    .eq("game_id", gameId)
    .or("is_undone.is.null,is_undone.eq.false")
    .order("quarter", { ascending: true })
    .order("clock_seconds_left", { ascending: false })
    .order("created_at", { ascending: true })
    .returns<EventRow[]>();

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  const maxEventQuarter =
    (events ?? []).reduce((m, e) => Math.max(m, e.quarter || 1), 1) || 1;

  const totalQuarters = Math.max(game.quarters ?? 4, maxEventQuarter, 4);

  let currentLineup = uniqSorted(
    (gamePlayers ?? [])
      .filter(
        (gp) =>
          normalizeTeamSide(gp.team_side) === "teamA" &&
          Boolean(gp.is_starter) &&
          gp.player_id
      )
      .map((gp) => gp.player_id)
  );

  const lineupMap = new Map<string, RawLineupStat>();

  let currentQuarter = 1;
  let prevClock = quarterLength(currentQuarter);

  const safeEvents = (events ?? []).filter((e) => e.quarter >= 1);

  for (const event of safeEvents) {
    while (currentQuarter < event.quarter) {
      addSegmentTime(lineupMap, currentLineup, prevClock, playerMap);
      currentQuarter += 1;
      prevClock = quarterLength(currentQuarter);
    }

    const qLen = quarterLength(currentQuarter);
    const eventClockRaw =
      typeof event.clock_seconds_left === "number"
        ? event.clock_seconds_left
        : prevClock;

    const eventClock = Math.max(0, Math.min(qLen, eventClockRaw));
    const segmentSeconds = prevClock - eventClock;

    addSegmentTime(lineupMap, currentLineup, segmentSeconds, playerMap);

    const side = normalizeTeamSide(event.team_side);
    const type = normalizeEventType(event.event_type);

    if (side === "teamA") {
      addForTeamEvent(lineupMap, currentLineup, event, playerMap);

      if (event.player_id) {
        if (isSubOut(type)) {
          currentLineup = currentLineup.filter((id) => id !== event.player_id);
        } else if (isSubIn(type)) {
          currentLineup = uniqSorted([...currentLineup, event.player_id]);
        }
      }
    } else if (side === "teamB") {
      addAgainstTeamEvent(lineupMap, currentLineup, event, playerMap);
    }

    prevClock = eventClock;
  }

  while (currentQuarter <= totalQuarters) {
    addSegmentTime(lineupMap, currentLineup, prevClock, playerMap);
    currentQuarter += 1;
    if (currentQuarter <= totalQuarters) {
      prevClock = quarterLength(currentQuarter);
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

  const pairRows = comboRows
    .filter((row) => row.combo_size === 2)
    .map((row) => ({
      game_id: row.game_id,
      combo_key: row.combo_key,
      player_ids: row.player_ids,
      player_names: row.player_names,
      seconds_played: row.seconds_played,
      est_possessions: row.est_possessions,
      points_for: row.points_for,
      points_against: row.points_against,
      plus_minus: row.plus_minus,
      off_rating: row.off_rating,
      is_official: row.is_official,
    }));

  const trioRows = comboRows
    .filter((row) => row.combo_size === 3)
    .map((row) => ({
      game_id: row.game_id,
      combo_key: row.combo_key,
      player_ids: row.player_ids,
      player_names: row.player_names,
      seconds_played: row.seconds_played,
      est_possessions: row.est_possessions,
      points_for: row.points_for,
      points_against: row.points_against,
      plus_minus: row.plus_minus,
      off_rating: row.off_rating,
      is_official: row.is_official,
    }));

  const { error: deleteLineupError } = await supabase
    .from("lineup_stats")
    .delete()
    .eq("game_id", gameId);

  if (deleteLineupError) {
    throw new Error(deleteLineupError.message);
  }

  const { error: deleteComboError } = await supabase
    .from("lineup_combo_stats")
    .delete()
    .eq("game_id", gameId);

  if (deleteComboError) {
    throw new Error(deleteComboError.message);
  }

  const { error: deletePairError } = await supabase
    .from("lineup_pair_stats")
    .delete()
    .eq("game_id", gameId);

  if (deletePairError) {
    throw new Error(deletePairError.message);
  }

  const { error: deleteTrioError } = await supabase
    .from("lineup_trio_stats")
    .delete()
    .eq("game_id", gameId);

  if (deleteTrioError) {
    throw new Error(deleteTrioError.message);
  }

  if (lineupRows.length > 0) {
    const { error: insertLineupError } = await supabase
      .from("lineup_stats")
      .insert(lineupRows);

    if (insertLineupError) {
      throw new Error(insertLineupError.message);
    }
  }

  if (comboRows.length > 0) {
    const { error: insertComboError } = await supabase
      .from("lineup_combo_stats")
      .insert(comboRows);

    if (insertComboError) {
      throw new Error(insertComboError.message);
    }
  }

  if (pairRows.length > 0) {
    const { error: insertPairError } = await supabase
      .from("lineup_pair_stats")
      .insert(pairRows);

    if (insertPairError) {
      throw new Error(insertPairError.message);
    }
  }

  if (trioRows.length > 0) {
    const { error: insertTrioError } = await supabase
      .from("lineup_trio_stats")
      .insert(trioRows);

    if (insertTrioError) {
      throw new Error(insertTrioError.message);
    }
  }

  return {
    lineupCount: lineupRows.length,
    comboCount: comboRows.length,
    pairCount: pairRows.length,
    trioCount: trioRows.length,
  };
}