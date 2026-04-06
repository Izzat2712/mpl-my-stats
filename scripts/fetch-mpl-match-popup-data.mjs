import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const slug = process.argv[2] || "W1D1SRGvsVMS";
const seasonKey = process.argv[3] || "season17";
const TEAM_CODE_ALIASES = {
  BTRM: "BTR",
  FL: "TF"
};
const HERO_ALIASES = {
  YSS: "Yi Sun-Shin",
  "Yi Sun-shin": "Yi Sun-Shin",
  "Yi Sun-Shin": "Yi Sun-Shin",
  Chang: "Chang'e",
  Lapu: "Lapu-Lapu"
};
const expectedTeamA = normalizeTeamCode(process.argv[4] || "SRG");
const expectedTeamB = normalizeTeamCode(process.argv[5] || "VMS");
const matchesPath = path.join(repoRoot, "data", seasonKey, "matches.json");

function normalizeTeamCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  return TEAM_CODE_ALIASES[raw] || raw;
}

function normalizeNameKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeHeroKey(value) {
  const raw = String(value || "").trim();
  const canonical = HERO_ALIASES[raw] || raw;
  return canonical.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseNumericText(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "mpl-my-stats trial updater"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  return response.text();
}

function extractRequired(input, pattern, label) {
  const match = input.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Unable to extract ${label}`);
  }
  return match[1];
}

function extractPageMatchId(detailPageHtml) {
  const readyScriptMatch = detailPageHtml.match(
    /\$\(document\)\.ready\(function \(\) \{[\s\S]*?if \(tabs\[0\] == 'detail'\) \{\s*loadMatchData\('(\d+)', 'detail'\);/i
  );
  if (readyScriptMatch?.[1]) {
    return Number.parseInt(readyScriptMatch[1], 10);
  }

  const allLoadMatchIds = [...detailPageHtml.matchAll(/loadMatchData\('(\d+)'/g)].map((match) => Number.parseInt(match[1], 10));
  if (allLoadMatchIds.length) {
    return allLoadMatchIds[allLoadMatchIds.length - 1];
  }

  throw new Error("Unable to extract match id");
}

function splitGameBlocks(detailHtml) {
  const startMatches = [...detailHtml.matchAll(/<div class="card-match-detail[^>]+data-game-no="(\d+)"/g)];
  return startMatches.map((match, index) => {
    const start = match.index;
    const end = startMatches[index + 1]?.index ?? detailHtml.length;
    return {
      gameNo: Number.parseInt(match[1], 10),
      html: detailHtml.slice(start, end)
    };
  });
}

function extractGameTeams(gameHtml) {
  const teamOne = extractRequired(
    gameHtml,
    /title-team-1[\s\S]*?<div class="team-name">([^<]+)<\/div>/,
    "team one name"
  );
  const teamTwo = extractRequired(
    gameHtml,
    /title-team-2[\s\S]*?<div class="team-name">([^<]+)<\/div>/,
    "team two name"
  );

  return {
    leftTeam: teamOne.trim().toUpperCase(),
    rightTeam: teamTwo.trim().toUpperCase()
  };
}

function parsePlayerChunk(chunk, teamCode, stats) {
  const name = extractRequired(chunk, /<div class="player-name">([^<]+)<\/div>/, "player name").trim();
  const heroName = extractRequired(chunk, /<div class="player-pick">([^<]+)<\/div>/, "hero name").trim();
  const portraitUrl = extractRequired(chunk, /<div class="player-logo">[\s\S]*?<img src="([^"]+)"/, "player portrait");
  const heroImageUrl = extractRequired(chunk, /class="hero-logo[^"]*" src="([^"]+)"/, "hero image");
  const kdaText = extractRequired(chunk, /<div class="kda-content">([^<]+)<\/div>/, "player kda").trim();
  const emblemUrl = chunk.match(/(https:\/\/mlbb-image\.scoregg\.com\/emblem\/[^"]+)/i)?.[1] || "";
  const runeUrls = [...chunk.matchAll(/https:\/\/mlbb-image\.scoregg\.com\/rune\/[^"]+/gi)].map((item) => item[0]);
  const itemUrls = [...chunk.matchAll(/https:\/\/wsrv\.nl\/\?url=https:\/\/ik\.imagekit\.io\/nloe8dhf7w\/mlbb\/2024\/equipments\/[^"]+/gi)].map((item) => item[0]);
  const kdaParts = String(kdaText).split("/").map((value) => Number.parseInt(value, 10) || 0);

  return {
    team: teamCode,
    name,
    hero: heroName,
    performance: {
      portraitUrl,
      heroImageUrl,
      emblemUrl,
      runeUrls,
      itemUrls,
      stats: {
        towerDamage: stats.towerDamage,
        damageTaken: stats.damageTaken,
        heroDamage: stats.heroDamage,
        totalGold: stats.totalGold
      }
    },
    scrapedKda: {
      kills: kdaParts[0] || 0,
      deaths: kdaParts[1] || 0,
      assists: kdaParts[2] || 0
    }
  };
}

function parseStatColumns(midChunk) {
  const values = [...midChunk.matchAll(/<div class="kda-content">([^<]+)<\/div>/g)].map((match) => parseNumericText(match[1]));
  if (values.length < 8) {
    throw new Error("Unable to parse player stat columns");
  }

  return {
    left: {
      towerDamage: values[0],
      damageTaken: values[2],
      heroDamage: values[4],
      totalGold: values[6]
    },
    right: {
      towerDamage: values[1],
      damageTaken: values[3],
      heroDamage: values[5],
      totalGold: values[7]
    }
  };
}

function parseGameRows(gameHtml, teams) {
  const rowSegments = gameHtml.split('<div class="col-6 col-lg-left px-0 ">').slice(1);
  const players = [];

  for (const segment of rowSegments) {
    const midIndex = segment.indexOf('<div class="col-0 col-lg-mid');
    const rightIndex = segment.indexOf('<div class="col-6 col-lg-right');

    if (midIndex < 0 || rightIndex < 0) continue;

    const leftChunk = segment.slice(0, midIndex);
    const midChunk = segment.slice(midIndex, rightIndex);
    const rightChunk = segment.slice(rightIndex);
    const stats = parseStatColumns(midChunk);

    players.push(parsePlayerChunk(leftChunk, teams.leftTeam, stats.left));
    players.push(parsePlayerChunk(rightChunk, teams.rightTeam, stats.right));
  }

  return players;
}

function findMatchIndex(matches, teamA, teamB) {
  return matches.findIndex((match) => {
    const left = normalizeTeamCode(match?.teamA || "");
    const right = normalizeTeamCode(match?.teamB || "");
    return (left === teamA && right === teamB) || (left === teamB && right === teamA);
  });
}

function findTargetPlayer(game, scrapedPlayer) {
  const scrapedNameKey = normalizeNameKey(scrapedPlayer.name);
  const scrapedHeroKey = normalizeHeroKey(scrapedPlayer.hero);

  let target = (game.players || []).find((player) => normalizeNameKey(player?.name) === scrapedNameKey);
  if (target) return target;

  target = (game.players || []).find((player) => {
    const heroMatches = normalizeHeroKey(player?.hero) === scrapedHeroKey;
    const teamMatches = !player?.team || String(player.team).trim().toUpperCase() === scrapedPlayer.team;
    return heroMatches && teamMatches;
  });
  if (target) return target;

  return null;
}

async function main() {
  const detailPageUrl = `https://my.mpl.mobilelegends.com/detail/${slug}`;
  const detailPageHtml = await fetchText(detailPageUrl);
  const token = extractRequired(detailPageHtml, /_token\s*:\s*"([^"]+)"/, "CSRF token");
  const matchId = extractPageMatchId(detailPageHtml);
  const matchDetailHtml = await fetchText(
    `https://my.mpl.mobilelegends.com/ajax/rating/match-detail?_token=${encodeURIComponent(token)}&matchId=${matchId}&isShowDetail=false`
  );

  const rawMatches = JSON.parse(await readFile(matchesPath, "utf8"));
  const matchIndex = findMatchIndex(rawMatches, expectedTeamA, expectedTeamB);
  if (matchIndex < 0) {
    throw new Error(`Unable to find ${expectedTeamA} vs ${expectedTeamB} in ${matchesPath}`);
  }

  const targetMatch = rawMatches[matchIndex];
  targetMatch.mpl = {
    ...(targetMatch.mpl || {}),
    slug,
    matchId
  };

  const gameBlocks = splitGameBlocks(matchDetailHtml);
  for (const gameBlock of gameBlocks) {
    const targetGame = targetMatch.games?.[gameBlock.gameNo - 1];
    if (!targetGame) continue;

    const teams = extractGameTeams(gameBlock.html);
    const scrapedPlayers = parseGameRows(gameBlock.html, teams);

    for (const scrapedPlayer of scrapedPlayers) {
      const targetPlayer = findTargetPlayer(targetGame, scrapedPlayer);
      if (!targetPlayer) {
        throw new Error(`Unable to match ${scrapedPlayer.name} in game ${gameBlock.gameNo}`);
      }

      targetPlayer.team = scrapedPlayer.team;
      targetPlayer.performance = scrapedPlayer.performance;
    }
  }

  await writeFile(matchesPath, `${JSON.stringify(rawMatches, null, 2)}\n`, "utf8");
  console.log(`Updated ${seasonKey} ${expectedTeamA} vs ${expectedTeamB} using ${detailPageUrl}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
