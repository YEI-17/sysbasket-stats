export type MinuteEventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  team_side?: "teamA" | "teamB" | null;
  is_undone?: boolean;
};

export type MinuteClockRow = {
  game_id: string;
  quarter: number;
  seconds_left: number;
  is_running: boolean;
  updated_at?: string | null;
};

export type MinutePlayer = {
  id: string;
  name: string;
  number: number | null;
};

export type MinuteGamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "teamA" | "teamB";
  is_starter: boolean;
};

export const REGULAR_SECONDS = 600;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function formatMinutesFromSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function getQuarterPlayedSeconds(
  quarter: number,
  currentQuarter: number,
  currentDisplaySeconds: number
) {
  if (quarter < currentQuarter) return REGULAR_SECONDS;
  if (quarter > currentQuarter) return 0;
  return REGULAR_SECONDS - currentDisplaySeconds;
}

function getClockUpdatedAtMs(clockRow: MinuteClockRow | null | undefined) {
  if (!clockRow?.updated_at) return null;
  const ms = new Date(clockRow.updated_at).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function getQuarterStartMsFromClock(clockRow: MinuteClockRow | null | undefined) {
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
  quarterEvents: MinuteEventRow[],
  playedSecondsThisQuarter: number
) {
  const subEvents = quarterEvents.filter(
    (e) => e.event_type === "sub_in" || e.event_type === "sub_out"
  );

  if (subEvents.length === 0) return playedSecondsThisQuarter;

  const index = subEvents.findIndex((e) => e.id === eventId);
  if (index === -1) return playedSecondsThisQuarter;

  return Math.floor(((index + 1) / (subEvents.length + 1)) * playedSecondsThisQuarter);
}

function getQuarterStartMs(
  quarter: number,
  currentQuarter: number,
  clockRows: MinuteClockRow[],
  currentClock: MinuteClockRow | null
) {
  const clockMap = new Map(clockRows.map((row) => [row.quarter, row]));

  const ownClock = quarter === currentQuarter ? currentClock : clockMap.get(quarter);
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
  event: MinuteEventRow,
  quarterEvents: MinuteEventRow[],
  quarter: number,
  currentQuarter: number,
  currentDisplaySeconds: number,
  clockRows: MinuteClockRow[],
  currentClock: MinuteClockRow | null
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

export function calcMinutesMapForGame(params: {
  players: MinutePlayer[];
  gamePlayers: MinuteGamePlayerRow[];
  events: MinuteEventRow[];
  clockRows: MinuteClockRow[];
  currentClock: MinuteClockRow | null;
  currentDisplaySeconds: number;
}) {
  const {
    players,
    gamePlayers,
    events,
    clockRows,
    currentClock,
    currentDisplaySeconds,
  } = params;

  const validEvents = events.filter((e) => !e.is_undone);

  const teamAPlayerIds = gamePlayers
    .filter((gp) => gp.team_side === "teamA")
    .map((gp) => gp.player_id);

  const teamAPlayers =
    teamAPlayerIds.length > 0
      ? players.filter((p) => teamAPlayerIds.includes(p.id))
      : players;

  const starterIds = gamePlayers
    .filter((gp) => gp.team_side === "teamA" && gp.is_starter)
    .map((gp) => gp.player_id);

  const resolvedStarterIds =
    starterIds.length > 0
      ? starterIds
      : teamAPlayers
          .slice()
          .sort((a, b) => (a.number ?? 999) - (b.number ?? 999))
          .slice(0, 5)
          .map((p) => p.id);

  const minutesMap: Record<string, number> = {};
  for (const p of teamAPlayers) {
    minutesMap[p.id] = 0;
  }

  const currentQuarter = currentClock?.quarter ?? 1;
  const maxQuarter = Math.max(
    currentQuarter,
    ...validEvents.map((e) => e.quarter),
    1
  );

  let lineup = new Set<string>(resolvedStarterIds);

  for (let q = 1; q <= maxQuarter; q += 1) {
    const playedSecondsThisQuarter = getQuarterPlayedSeconds(
      q,
      currentQuarter,
      currentDisplaySeconds
    );

    if (playedSecondsThisQuarter <= 0) continue;

    const activeStartMap: Record<string, number | null> = {};
    for (const p of teamAPlayers) {
      activeStartMap[p.id] = lineup.has(p.id) ? 0 : null;
    }

    const quarterSubEvents = validEvents
      .filter(
        (e) =>
          e.team_side === "teamA" &&
          e.quarter === q &&
          !!e.player_id &&
          (e.event_type === "sub_in" || e.event_type === "sub_out")
      )
      .sort((a, b) => {
        const diff =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });

    for (const e of quarterSubEvents) {
      const playerId = e.player_id!;
      const eventElapsed = getPreciseEventElapsedSeconds(
        e,
        quarterSubEvents,
        q,
        currentQuarter,
        currentDisplaySeconds,
        clockRows,
        currentClock
      );

      if (e.event_type === "sub_in") {
        if (activeStartMap[playerId] == null) {
          activeStartMap[playerId] = eventElapsed;
          lineup.add(playerId);
        }
      }

      if (e.event_type === "sub_out") {
        const startedAt = activeStartMap[playerId];
        if (startedAt != null) {
          minutesMap[playerId] += Math.max(0, eventElapsed - startedAt);
          activeStartMap[playerId] = null;
        }
        lineup.delete(playerId);
      }
    }

    for (const p of teamAPlayers) {
      const startedAt = activeStartMap[p.id];
      if (startedAt != null) {
        minutesMap[p.id] += Math.max(0, playedSecondsThisQuarter - startedAt);
      }
    }
  }

  return minutesMap;
}