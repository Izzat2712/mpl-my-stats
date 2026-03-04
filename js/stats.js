import { getDataVersion, getHeroesMap, getMatches, getRoster, getRosterList } from "./data-store.js";

const cache = new Map();

function memoized(name, impl) {
  const key = `${name}:${getDataVersion()}`;
  if (cache.has(key)) return cache.get(key);
  const value = impl();
  cache.set(key, value);
  return value;
}

export function invalidateStatsCache() {
  cache.clear();
}

function calculateTeamStatsImpl() {
  let teamStats = {};

  for (const r of (getRosterList() || [])) {
    if (!teamStats[r.team]) {
      teamStats[r.team] = {
        kills:0,deaths:0,assists:0,
        gamesPlayed:0,gameWins:0,
        matchesPlayed:0,matchWins:0,
        lord:0,turtle:0,tower:0
      };
    }
  }

  for (let match of getMatches()) {
    let teamAGameWins = 0, teamBGameWins = 0;

    for (let game of match.games) {
      if (!teamStats[match.teamA]) {
        teamStats[match.teamA] = {
          kills:0,deaths:0,assists:0,
          gamesPlayed:0,gameWins:0,
          matchesPlayed:0,matchWins:0,
          lord:0,turtle:0,tower:0
        };
      }
      if (!teamStats[match.teamB]) {
        teamStats[match.teamB] = {
          kills:0,deaths:0,assists:0,
          gamesPlayed:0,gameWins:0,
          matchesPlayed:0,matchWins:0,
          lord:0,turtle:0,tower:0
        };
      }

      if (game.winner === match.teamA) teamAGameWins++; else teamBGameWins++;

for (let player of game.players) {
  const info = getRoster(player.name);
  const t = info.team;

  if (!teamStats[t]) {
    teamStats[t] = {
      kills:0,deaths:0,assists:0,
      gamesPlayed:0,gameWins:0,
      matchesPlayed:0,matchWins:0,
      lord:0,turtle:0,tower:0
    };
  }

  teamStats[t].kills += player.kills;
  teamStats[t].deaths += player.deaths;
  teamStats[t].assists += player.assists;
}

      // objectives totals (safe if missing)
      if (game.objectives) {
        const l = game.objectives.lord || {};
        const tu = game.objectives.turtle || {};
        const to = game.objectives.tower || {};

        teamStats[match.teamA].lord += (l[match.teamA] || 0);
        teamStats[match.teamB].lord += (l[match.teamB] || 0);

        teamStats[match.teamA].turtle += (tu[match.teamA] || 0);
        teamStats[match.teamB].turtle += (tu[match.teamB] || 0);

        teamStats[match.teamA].tower += (to[match.teamA] || 0);
        teamStats[match.teamB].tower += (to[match.teamB] || 0);
      }

      teamStats[match.teamA].gamesPlayed++;
      teamStats[match.teamB].gamesPlayed++;
    }

    teamStats[match.teamA].gameWins += teamAGameWins;
    teamStats[match.teamB].gameWins += teamBGameWins;

    teamStats[match.teamA].matchesPlayed++;
    teamStats[match.teamB].matchesPlayed++;

    if (teamAGameWins > teamBGameWins) teamStats[match.teamA].matchWins++;
    else teamStats[match.teamB].matchWins++;
  }
  return teamStats;
}

export function calculateTeamStats() {
  return memoized("calculateTeamStats", calculateTeamStatsImpl);
}

function calculatePlayerStatsImpl() {
  let playerStats = {};

  // Seed from getRosterList() so subs show with 0 games
  for (const r of (getRosterList() || [])) {
    playerStats[r.name] = {
      team: r.team,
      lane: r.lane,
      games: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      kpTotal: 0,
      picture: r.picture
    };
  }

  // Add match data
  for (let match of getMatches()) {
    for (let game of match.games) {

      // teamKills needs team info from getRosterList()
      let teamKills = {};
      for (let player of game.players) {
        const t = getRoster(player.name).team;
        if (!teamKills[t]) teamKills[t] = 0;
        teamKills[t] += player.kills;
      }

      for (let player of game.players) {
        const info = getRoster(player.name);

        // if player not in getRosterList() (typo/new), still include them
        if (!playerStats[player.name]) {
          playerStats[player.name] = {
            team: info.team,
            lane: info.lane,
            games: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            kpTotal: 0,
            picture: info.picture
          };
        }

        const ps = playerStats[player.name];
        ps.team = info.team;
        ps.lane = info.lane;
        ps.picture = info.picture;

        ps.games++;
        ps.kills += player.kills;
        ps.deaths += player.deaths;
        ps.assists += player.assists;

        const denom = teamKills[info.team] || 0;
        if (denom > 0) {
          ps.kpTotal += (player.kills + player.assists) / denom;
        }
      }
    }
  }

  return playerStats;
}

export function calculatePlayerStats() {
  return memoized("calculatePlayerStats", calculatePlayerStatsImpl);
}

function calculateHeroStatsImpl() {
  const heroStats = {};
  let totalGames = 0;

  for (const match of getMatches()) {
    for (const game of (match.games || [])) {
      totalGames++;

      // Track which heroes were picked THIS game (so pickGames counts once per game)
      const pickedThisGame = new Set();

      // PICKS + WINS
      for (const p of (game.players || [])) {
        const h = String(p.hero || "").trim();
        if (!h) continue;

        if (!heroStats[h]) heroStats[h] = { hero: h, pick: 0, pickGames: 0, ban: 0, win: 0 };

        heroStats[h].pick += 1;          // total times picked (player-picks)
        pickedThisGame.add(h);           // used for per-game pick rate

        const team = getRoster(p.name).team;
        if (team === game.winner) heroStats[h].win += 1; // win per pick (same as before)
      }

      // After reading all players, add 1 pickGame for each hero picked this game
      for (const h of pickedThisGame) {
        heroStats[h].pickGames += 1;
      }

      // BANS (once per game per hero)
      if (Array.isArray(game.bans)) {
        const uniqueBans = new Set(game.bans.map(b => String(b).trim()));
        for (const b of uniqueBans) {
          if (!heroStats[b]) heroStats[b] = { hero: b, pick: 0, pickGames: 0, ban: 0, win: 0 };
          heroStats[b].ban += 1;
        }
      }
    }
  }

  // Include unused heroes too
  const allHeroes = new Set([
    ...Object.keys(getHeroesMap() || {}),
    ...Object.keys(heroStats)
  ]);

  return Array.from(allHeroes).map(h => {
    const hs = heroStats[h] || { hero: h, pick: 0, pickGames: 0, ban: 0, win: 0 };

    return {
      hero: hs.hero,
      pick: hs.pick,
      pickRate: totalGames ? (hs.pickGames / totalGames) * 100 : 0, // per-game pick rate
      ban: hs.ban,
      banRate: totalGames ? (hs.ban / totalGames) * 100 : 0,
      winRate: hs.pick ? (hs.win / hs.pick) * 100 : 0,
      img: getHeroesMap()[hs.hero] || ""
    };
  });
}

export function calculateHeroStats() {
  return memoized("calculateHeroStats", calculateHeroStatsImpl);
}

function calculateHeroPoolStatsImpl() {
  let pool = {};

  // 1) Seed from getRosterList() so 0-game players exist
  for (const r of (getRosterList() || [])) {
    pool[r.name] = {
      name: r.name,
      team: r.team,
      lane: r.lane,
      picture: r.picture,
      heroes: {} // heroName -> { games:0, wins:0 }
    };
  }

  // 2) Add match data
  for (let match of getMatches()) {
    for (let game of (match.games || [])) {
      for (let player of (game.players || [])) {
        const info = getRoster(player.name);

        // If player not in getRosterList() (typo/new), still include them
        if (!pool[player.name]) {
          pool[player.name] = {
            name: player.name,
            team: info.team,
            lane: info.lane,
            picture: info.picture,
            heroes: {}
          };
        }

        const ps = pool[player.name];
        const heroName = player.hero;

        if (!ps.heroes[heroName]) ps.heroes[heroName] = { games: 0, wins: 0 };

        ps.heroes[heroName].games++;
        if (info.team === game.winner) ps.heroes[heroName].wins++;
      }
    }
  }

  return pool;
}

export function calculateHeroPoolStats() {
  return memoized("calculateHeroPoolStats", calculateHeroPoolStatsImpl);
}

function calculatePlayerPoolsStatsImpl() {
  let pools = {};

  // Seed all heroes so unused heroes exist
  for (const heroName of Object.keys(getHeroesMap() || {})) {
    pools[heroName] = { hero: heroName, players: {} };
  }

  // Add match data
  for (let match of getMatches()) {
    for (let game of (match.games || [])) {
      for (let player of (game.players || [])) {
        const heroName = player.hero;
        const info = getRoster(player.name);

        if (!pools[heroName]) {
          pools[heroName] = { hero: heroName, players: {} };
        }

        if (!pools[heroName].players[player.name]) {
          pools[heroName].players[player.name] = {
            name: player.name,
            team: info.team,
            lane: info.lane,
            picture: info.picture,
            games: 0,
            wins: 0
          };
        }

        pools[heroName].players[player.name].games++;
        if (info.team === game.winner) pools[heroName].players[player.name].wins++;
      }
    }
  }

  return pools;
}

export function calculatePlayerPoolsStats() {
  return memoized("calculatePlayerPoolsStats", calculatePlayerPoolsStatsImpl);
}


