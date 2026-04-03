function normalizeMatchStage(match) {
  const stage = String(match?.schedule?.stage || match?.stage || "").trim().toLowerCase();
  return stage === "playoff" || stage === "playoffs" ? "playoff" : "regular";
}

function getExplicitBestOf(match) {
  const candidates = [
    match?.bestOf,
    match?.schedule?.bestOf,
    match?.series?.bestOf
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  return null;
}

export function getRequiredMatchWins(match) {
  const bestOf = getExplicitBestOf(match);
  if (bestOf) return Math.floor(bestOf / 2) + 1;
  return normalizeMatchStage(match) === "playoff" ? 3 : 2;
}

export function getMatchScore(match) {
  let teamAScore = 0;
  let teamBScore = 0;

  for (const game of (match?.games || [])) {
    if (game?.winner === match?.teamA) teamAScore += 1;
    if (game?.winner === match?.teamB) teamBScore += 1;
  }

  const requiredWins = getRequiredMatchWins(match);
  const started = teamAScore > 0 || teamBScore > 0;
  const finished = teamAScore >= requiredWins || teamBScore >= requiredWins;

  return {
    teamAScore,
    teamBScore,
    requiredWins,
    started,
    finished,
    played: started
  };
}

export function getCompletedMatchWinner(match) {
  const score = getMatchScore(match);

  if (!score.finished) return null;
  if (score.teamAScore > score.teamBScore) return match?.teamA || null;
  if (score.teamBScore > score.teamAScore) return match?.teamB || null;
  return null;
}
