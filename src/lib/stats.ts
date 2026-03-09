export type EventType =
  | "FG2_MAKE" | "FG2_MISS"
  | "FG3_MAKE" | "FG3_MISS"
  | "FT_MAKE"  | "FT_MISS"
  | "REB" | "AST" | "STL" | "BLK" | "TOV" | "PF";

export type EventRow = { player_id: string; event_type: EventType };

export function calcPlayerStats(events: EventRow[]) {
  const c = (t: EventType) => events.filter(e => e.event_type === t).length;

  const fg2m = c("FG2_MAKE"), fg2x = c("FG2_MISS");
  const fg3m = c("FG3_MAKE"), fg3x = c("FG3_MISS");
  const ftm  = c("FT_MAKE"),  ftx  = c("FT_MISS");

  const pts = fg2m * 2 + fg3m * 3 + ftm;

  return {
    pts,
    fg2m, fg2a: fg2m + fg2x,
    fg3m, fg3a: fg3m + fg3x,
    ftm,  fta:  ftm + ftx,
    reb: c("REB"),
    ast: c("AST"),
    stl: c("STL"),
    blk: c("BLK"),
    tov: c("TOV"),
    pf:  c("PF"),
  };
}

export function pct(m: number, a: number) {
  if (a <= 0) return "-";
  return `${Math.round((m / a) * 1000) / 10}%`;
}