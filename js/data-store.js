const SEASON_DATA_FILES = {
  season16: {
    label: "MPL MY SEASON 16",
    roster: "/data/season16/roster.json",
    heroes: "/data/heroes.json",
    matches: "/data/season16/matches.json",
    teamLogos: "/data/season16/teamLogos.json",
    teamNames: "/data/season16/teamNames.json"
  },
  season17: {
    label: "MPL MY SEASON 17",
    roster: "/data/season17/roster.json",
    staff: "/data/season17/staff.json",
    profiles: "/data/season17/profiles.json",
    heroes: "/data/heroes.json",
    matches: "/data/season17/matches.json",
    teamLogos: "/data/season17/teamLogos.json",
    teamNames: "/data/season17/teamNames.json"
  }
};

const HERO_ALIASES = {
  YSS: "Yi Sun-Shin",
  Chang: "Chang'e",
  Lapu: "Lapu-Lapu"
};

let dataVersion = 0;
let roster = [];
let staff = [];
let heroes = {};
let matches = [];
let teamLogos = {};
let teamNames = {};
let rosterMap = {};
let seasonProfiles = {};
let currentSeasonKey = "season16";

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateRoster(list) {
  if (!Array.isArray(list)) throw new Error("roster.json must be an array");
  for (const item of list) {
    if (!item || typeof item.name !== "string" || typeof item.team !== "string" || typeof item.lane !== "string") {
      throw new Error("roster.json contains invalid player records");
    }
  }
}

function validateHeroes(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    throw new Error("heroes.json must be an object map");
  }
}

function validateStaff(list) {
  if (!Array.isArray(list)) throw new Error("staff.json must be an array");
  for (const item of list) {
    if (!item || typeof item.name !== "string" || typeof item.team !== "string" || typeof item.role !== "string") {
      throw new Error("staff.json contains invalid staff records");
    }
  }
}

function validateMatches(list) {
  if (!Array.isArray(list)) throw new Error("matches.json must be an array");

  for (const match of list) {
    if (!match || typeof match.teamA !== "string" || typeof match.teamB !== "string") {
      throw new Error("matches.json match must include teamA and teamB");
    }
    if (match.games != null && !Array.isArray(match.games)) {
      throw new Error("matches.json contains invalid match.games");
    }
    for (const game of (match.games || [])) {
      if (!game) {
        throw new Error("matches.json contains invalid game records");
      }
      if (game.mvp != null && typeof game.mvp !== "string") {
        throw new Error("matches.json game.mvp must be a string");
      }
      if (game.players != null && !Array.isArray(game.players)) {
        throw new Error("matches.json contains invalid game.players");
      }
      for (const p of (game.players || [])) {
        if (!p || typeof p.name !== "string" || typeof p.hero !== "string") {
          throw new Error("matches.json player must include name and hero");
        }
        if (!isNumber(p.kills) || !isNumber(p.deaths) || !isNumber(p.assists)) {
          throw new Error("matches.json player KDA fields must be numeric");
        }
      }
    }
  }
}

function validateProfiles(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("profiles.json must be an object");
  }

  const profiles = payload.profiles;
  if (profiles == null) return;
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
    throw new Error("profiles.json profiles must be an object map");
  }

  for (const [key, value] of Object.entries(profiles)) {
    if (!key || !value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("profiles.json contains invalid profile records");
    }
  }
}

function validateTeamLogos(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    throw new Error("teamLogos.json must be an object map");
  }
}

function validateTeamNames(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    throw new Error("teamNames.json must be an object map");
  }
}

function normalizeHeroName(name) {
  const key = String(name || "").trim();
  return HERO_ALIASES[key] || key;
}

function normalizePlayerNameKey(name) {
  return String(name || "").trim().toLowerCase();
}

function normalizeTeamCodeKey(teamCode) {
  return String(teamCode || "").trim().toLowerCase();
}

function getCanonicalTeamCode(teamCode, sourceMaps = []) {
  const raw = String(teamCode || "").trim();
  const key = normalizeTeamCodeKey(raw);
  if (!key) return raw;

  for (const map of sourceMaps) {
    const matchKey = Object.keys(map || {}).find((item) => normalizeTeamCodeKey(item) === key);
    if (matchKey) return matchKey;
  }

  return raw.toUpperCase();
}

function getCanonicalRosterName(name, rosterList) {
  const key = normalizePlayerNameKey(name);
  if (!key) return String(name || "").trim();

  const record = (rosterList || []).find((player) => normalizePlayerNameKey(player?.name) === key);
  return record?.name || String(name || "").trim();
}

function normalizeHeroesMap(map) {
  const out = {};
  for (const [name, img] of Object.entries(map || {})) {
    out[normalizeHeroName(name)] = img;
  }
  return out;
}

function normalizeMatchesData(list, rosterList, teamNamesMap, teamLogosMap) {
  const teamSources = [teamNamesMap, teamLogosMap];
  return (list || []).map((match) => ({
    ...match,
    teamA: getCanonicalTeamCode(match.teamA, teamSources),
    teamB: getCanonicalTeamCode(match.teamB, teamSources),
    games: (Array.isArray(match.games) ? match.games : []).map((game) => ({
      ...game,
      winner: getCanonicalTeamCode(game.winner, teamSources),
      mvp: game.mvp == null ? game.mvp : getCanonicalRosterName(game.mvp, rosterList),
      bans: Array.isArray(game.bans) ? game.bans.map((b) => normalizeHeroName(b)) : [],
      players: (game.players || []).map((p) => ({
        ...p,
        name: getCanonicalRosterName(p.name, rosterList),
        hero: normalizeHeroName(p.hero)
      })),
      objectives: !game.objectives ? game.objectives : {
        ...game.objectives,
        lord: Object.fromEntries(Object.entries(game.objectives.lord || {}).map(([team, value]) => [getCanonicalTeamCode(team, teamSources), value])),
        turtle: Object.fromEntries(Object.entries(game.objectives.turtle || {}).map(([team, value]) => [getCanonicalTeamCode(team, teamSources), value])),
        tower: Object.fromEntries(Object.entries(game.objectives.tower || {}).map(([team, value]) => [getCanonicalTeamCode(team, teamSources), value]))
      }
    }))
  }));
}

async function loadJson(path) {
  const controller = new AbortController();
  const timeoutMs = 10000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(path, { cache: "no-store", signal: controller.signal });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error(`Timed out loading ${path} after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`);
  }
  const raw = await response.text();
  try {
    return JSON.parse(stripJsonComments(raw));
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${err.message || err}`);
  }
}

async function loadOptionalJson(path, fallbackValue) {
  if (!path) return fallbackValue;
  try {
    return await loadJson(path);
  } catch (err) {
    if (String(err?.message || "").includes("(404)")) {
      return fallbackValue;
    }
    throw err;
  }
}

function stripJsonComments(input) {
  let out = "";
  let inString = false;
  let stringQuote = '"';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (ch === "\\") {
        i += 1;
        if (i < input.length) out += input[i];
        continue;
      }
      if (ch === stringQuote) inString = false;
      continue;
    }

    if ((ch === '"' || ch === "'")) {
      inString = true;
      stringQuote = ch;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    out += ch;
  }

  return out;
}

function getSeasonConfig(seasonKey) {
  return SEASON_DATA_FILES[seasonKey] || SEASON_DATA_FILES.season16;
}

export async function loadData(seasonKey = "season16") {
  const config = getSeasonConfig(seasonKey);
  const [nextRoster, nextStaff, nextProfiles, nextHeroes, nextMatches, nextTeamLogos, nextTeamNames] = await Promise.all([
    loadJson(config.roster),
    loadOptionalJson(config.staff, []),
    loadOptionalJson(config.profiles, { profiles: {} }),
    loadJson(config.heroes),
    loadJson(config.matches),
    loadJson(config.teamLogos),
    loadJson(config.teamNames)
  ]);

  validateRoster(nextRoster);
  validateStaff(nextStaff);
  validateProfiles(nextProfiles);
  const normalizedHeroes = normalizeHeroesMap(nextHeroes);
  const normalizedMatches = normalizeMatchesData(nextMatches, nextRoster, nextTeamNames, nextTeamLogos);

  validateHeroes(normalizedHeroes);
  validateMatches(normalizedMatches);
  validateTeamLogos(nextTeamLogos);
  validateTeamNames(nextTeamNames);

  roster = nextRoster;
  staff = nextStaff;
  heroes = normalizedHeroes;
  matches = normalizedMatches;
  teamLogos = nextTeamLogos;
  teamNames = nextTeamNames;
  rosterMap = Object.fromEntries(roster.map((p) => [normalizePlayerNameKey(p.name), p]));
  seasonProfiles = nextProfiles.profiles || {};
  currentSeasonKey = seasonKey in SEASON_DATA_FILES ? seasonKey : "season16";

  dataVersion += 1;
}

export function getDataVersion() {
  return dataVersion;
}

export function getCurrentSeasonKey() {
  return currentSeasonKey;
}

export function getCurrentSeasonLabel() {
  return getSeasonConfig(currentSeasonKey).label;
}

export function getRoster(name) {
  const key = normalizePlayerNameKey(name);
  return rosterMap[key] || { name: String(name || "").trim(), team: "Unknown", lane: "Unknown", picture: "" };
}

export function getRosterList() {
  return roster;
}

export function getStaffList() {
  return staff;
}

export function getHeroesMap() {
  return heroes;
}

export function getMatches() {
  return matches;
}

export function getTeamLogosMap() {
  return teamLogos;
}

export function getTeamNamesMap() {
  return teamNames;
}

export function getSeasonProfilesMap() {
  return seasonProfiles;
}

export function getTeamDisplayName(teamCode) {
  return teamNames[teamCode] || teamCode;
}

export function getHeroDisplayName(heroCodeOrName) {
  return normalizeHeroName(heroCodeOrName);
}
