// lib/statsFromEvents.ts

type EventRow = {
  game_id: string;
  event_type: string;
  team_side?: string | null;
  is_undone?: boolean | null;
};

function normalizeSide(side?: string | null): "teamA" | "teamB" | null {
  if (!side) return null;
  const s = String(side).toLowerCase();
  if (s === "a" || s === "teama") return "teamA";
  if (s === "b" || s === "teamb") return "teamB";
  return null;
}

export function calcTeamStatsFromEvents(
  events: EventRow[],
  gameId: string,
  mySide: "teamA" | "teamB" = "teamA"
) {
  let pts = 0;
  let oppPts = 0;
  let reb = 0;
  let ast = 0;
  let stl = 0;
  let blk = 0;
  let tov = 0;

  const gameEvents = events.filter(
    (e) => e.game_id === gameId && !e.is_undone
  );

  for (const e of gameEvents) {
    const side = normalizeSide(e.team_side);
    if (!side) continue;

    const isMine = side === mySide;

    switch (e.event_type) {
      case "fg2_made":
        isMine ? (pts += 2) : (oppPts += 2);
        break;
      case "fg3_made":
        isMine ? (pts += 3) : (oppPts += 3);
        break;
      case "ft_made":
        isMine ? (pts += 1) : (oppPts += 1);
        break;
      case "reb":
        if (isMine) reb++;
        break;
      case "ast":
        if (isMine) ast++;
        break;
      case "stl":
        if (isMine) stl++;
        break;
      case "blk":
        if (isMine) blk++;
        break;
      case "tov":
        if (isMine) tov++;
        break;
    }
  }

  return {
    pts,
    opp_pts: oppPts,
    reb,
    ast,
    stl,
    blk,
    tov,
  };
}