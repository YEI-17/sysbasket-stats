export type EventType =
  | "FG2_MAKE" | "FG2_MISS"
  | "FG3_MAKE" | "FG3_MISS"
  | "FT_MAKE"  | "FT_MISS"
  | "REB" | "AST" | "STL" | "BLK" | "TOV" | "PF";

export type EventRow = {
  player_id: string | null;
  event_type: EventType;
  team_side?: "A" | "B" | null;
  is_undone?: boolean;
};

export type Stat = {
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

export function emptyStat(): Stat {
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

function isValidEvent(e: EventRow) {
  return !e.is_undone;
}

export function calcPlayerStats(events: EventRow[]): Stat {
  const validEvents = events.filter(isValidEvent);

  const c = (t: EventType) => validEvents.filter((e) => e.event_type === t).length;

  const fg2m = c("FG2_MAKE");
  const fg2x = c("FG2_MISS");
  const fg3m = c("FG3_MAKE");
  const fg3x = c("FG3_MISS");
  const ftm = c("FT_MAKE");
  const ftx = c("FT_MISS");

  const pts = fg2m * 2 + fg3m * 3 + ftm;

  return {
    pts,
    fg2m,
    fg2a: fg2m + fg2x,
    fg3m,
    fg3a: fg3m + fg3x,
    ftm,
    fta: ftm + ftx,
    reb: c("REB"),
    ast: c("AST"),
    stl: c("STL"),
    blk: c("BLK"),
    tov: c("TOV"),
    pf: c("PF"),
  };
}

export function calcTeamStats(events: EventRow[], teamSide: "A" | "B"): Stat {
  const teamEvents = events.filter(
    (e) => e.team_side === teamSide && !e.is_undone
  );
  return calcPlayerStats(teamEvents);
}

export function groupPlayerStats(events: EventRow[]): Record<string, Stat> {
  const map: Record<string, EventRow[]> = {};

  for (const e of events) {
    if (!isValidEvent(e)) continue;
    if (!e.player_id) continue;

    if (!map[e.player_id]) {
      map[e.player_id] = [];
    }

    map[e.player_id].push(e);
  }

  const result: Record<string, Stat> = {};

  for (const playerId of Object.keys(map)) {
    result[playerId] = calcPlayerStats(map[playerId]);
  }

  return result;
}

export function sumStats(stats: Stat[]): Stat {
  const total = emptyStat();

  for (const s of stats) {
    total.pts += s.pts;
    total.fg2m += s.fg2m;
    total.fg2a += s.fg2a;
    total.fg3m += s.fg3m;
    total.fg3a += s.fg3a;
    total.ftm += s.ftm;
    total.fta += s.fta;
    total.reb += s.reb;
    total.ast += s.ast;
    total.stl += s.stl;
    total.blk += s.blk;
    total.tov += s.tov;
    total.pf += s.pf;
  }

  return total;
}

export function eff(stat: Stat) {
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

export function pct(m: number, a: number) {
  if (a <= 0) return "-";
  return `${Math.round((m / a) * 1000) / 10}%`;
}

export function madeAttempt(made: number, attempt: number) {
  return `${made}/${attempt}`;
}