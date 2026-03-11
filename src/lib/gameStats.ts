export type EventRow = {
  id: string;
  game_id: string;
  player_id: string | null;
  quarter: number;
  event_type: string;
  created_at: string;
  team_side?: "A" | "B" | null;
  is_undone?: boolean;
  undone_at?: string | null;
};

export type GamePlayerRow = {
  id: string;
  game_id: string;
  player_id: string;
  team_side: "A" | "B";
  is_starter: boolean;
};

export type Player = {
  id: string;
  name: string;
  number: number | null;
  active?: boolean;
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
  tov: number;
  stl: number;
  blk: number;
  pf: number;
  plusMinus: number;
};

export const emptyStat = (): Stat => ({
  pts: 0,
  fg2m: 0,
  fg2a: 0,
  fg3m: 0,
  fg3a: 0,
  ftm: 0,
  fta: 0,
  reb: 0,
  ast: 0,
  tov: 0,
  stl: 0,
  blk: 0,
  pf: 0,
  plusMinus: 0,
});

export function getPointsFromEvent(eventType: string): number {
  if (eventType === "fg2_made") return 2;
  if (eventType === "fg3_made") return 3;
  if (eventType === "ft_made") return 1;
  return 0;
}

export function buildInitialLineups(gamePlayers: GamePlayerRow[]) {
  const lineups = {
    A: new Set<string>(),
    B: new Set<string>(),
  };

  for (const gp of gamePlayers) {
    if (gp.is_starter) {
      lineups[gp.team_side].add(gp.player_id);
    }
  }

  return lineups;
}

export function computeStatsWithPlusMinus(
  players: Player[],
  gamePlayers: GamePlayerRow[],
  events: EventRow[]
) {
  const statsMap: Record<string, Stat> = {};
  for (const p of players) statsMap[p.id] = emptyStat();

  const validEvents = [...events]
    .filter((e) => !e.is_undone)
    .sort((a, b) => {
      if (a.quarter !== b.quarter) return a.quarter - b.quarter;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const lineups = buildInitialLineups(gamePlayers);

  for (const e of validEvents) {
    const pid = e.player_id ?? "";
    const side = e.team_side;

    // 換人邏輯
    if (e.event_type === "sub_in" && pid && side) {
      lineups[side].add(pid);
      continue;
    }
    if (e.event_type === "sub_out" && pid && side) {
      lineups[side].delete(pid);
      continue;
    }

    // 個人數據
    if (pid && statsMap[pid]) {
      switch (e.event_type) {
        case "fg2_made":
          statsMap[pid].pts += 2;
          statsMap[pid].fg2m += 1;
          statsMap[pid].fg2a += 1;
          break;
        case "fg2_miss":
          statsMap[pid].fg2a += 1;
          break;
        case "fg3_made":
          statsMap[pid].pts += 3;
          statsMap[pid].fg3m += 1;
          statsMap[pid].fg3a += 1;
          break;
        case "fg3_miss":
          statsMap[pid].fg3a += 1;
          break;
        case "ft_made":
          statsMap[pid].pts += 1;
          statsMap[pid].ftm += 1;
          statsMap[pid].fta += 1;
          break;
        case "ft_miss":
          statsMap[pid].fta += 1;
          break;
        case "reb":
          statsMap[pid].reb += 1;
          break;
        case "ast":
          statsMap[pid].ast += 1;
          break;
        case "tov":
          statsMap[pid].tov += 1;
          break;
        case "stl":
          statsMap[pid].stl += 1;
          break;
        case "blk":
          statsMap[pid].blk += 1;
          break;
        case "pf":
          statsMap[pid].pf += 1;
          break;
      }
    }

    // 正負值
    const pts = getPointsFromEvent(e.event_type);
    if (pts > 0 && side) {
      const own = side;
      const opp = side === "A" ? "B" : "A";

      for (const onId of lineups[own]) {
        if (statsMap[onId]) statsMap[onId].plusMinus += pts;
      }
      for (const onId of lineups[opp]) {
        if (statsMap[onId]) statsMap[onId].plusMinus -= pts;
      }
    }
  }

  return statsMap;
}

export function getCurrentLineup(
  gamePlayers: GamePlayerRow[],
  events: EventRow[],
  side: "A" | "B"
) {
  const lineup = new Set(
    gamePlayers
      .filter((gp) => gp.team_side === side && gp.is_starter)
      .map((gp) => gp.player_id)
  );

  const validEvents = [...events]
    .filter((e) => !e.is_undone && e.team_side === side)
    .sort((a, b) => {
      if (a.quarter !== b.quarter) return a.quarter - b.quarter;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  for (const e of validEvents) {
    if (!e.player_id) continue;
    if (e.event_type === "sub_in") lineup.add(e.player_id);
    if (e.event_type === "sub_out") lineup.delete(e.player_id);
  }

  return lineup;
}