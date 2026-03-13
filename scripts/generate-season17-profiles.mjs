import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { request } from "node:https";

const repoRoot = process.cwd();
const seasonDir = path.join(repoRoot, "data", "season17");
const rosterPath = path.join(seasonDir, "roster.json");
const staffPath = path.join(seasonDir, "staff.json");
const teamNamesPath = path.join(seasonDir, "teamNames.json");
const outputPath = path.join(seasonDir, "profiles.json");
const cachePath = path.join(seasonDir, "profiles.cache.json");

const SEARCH_DELAY_MS = 2200;
const PARSE_DELAY_MS = 31000;
const USER_AGENT = process.env.LP_USER_AGENT || "MplMyStatsProfileUpdater/1.0 (local dataset builder; set LP_USER_AGENT with contact info)";
const FORCE_REFRESH = process.argv.includes("--force");
const MAX_MISSES = Number(process.env.LP_MAX_MISSES || 0) || Infinity;
const NAME_FILTERS = process.argv
  .filter((arg) => arg.startsWith("--name="))
  .map((arg) => normalizeKey(arg.slice("--name=".length)))
  .filter(Boolean);

const TEAM_ALIASES = {
  SRG: ["Selangor Red Giants", "SRG.OG", "SRG"],
  TR: ["Team Rey", "TR"],
  VMS: ["Team Vamos", "Vamos"],
  RRQ: ["RRQ Tora", "RRQ"],
  BTR: ["Bigetron by Vitality", "Bigetron MY", "Bigetron", "BTR"],
  AC: ["AC Esports", "Aero Esports", "AC"],
  IG: ["Invictus Gaming", "IG"],
  TF: ["Team Flash", "FL"]
};

const SEARCH_OVERRIDES = {
  "COACH ADI": ["Adi"],
  "COACH BAM": ["Bam"],
  "COACH JES": ["Jes"],
  "COACH LINK": ["Link"],
  "COACH ARCADIA": ["Arcadia"],
  "JUST GARRR": ["Garrr", "Just Garrr"],
  "P4K ATAN": ["Atan", "Pak Atan"],
  "P4K BET": ["Bet", "Pak Bet"],
  "SAINTDELUCAZ": ["Saintdelucaz", "Saint De Lucaz"],
  "ZAY LA NINA": ["Zay La Nina", "Zay"],
  "ERROR 404": ["Error 404"]
};

const PAGE_OVERRIDES = {
  KENJI: "Kenji",
  SEKYSS: "Sekys",
  SUPERYOSHI: "Super_Yoshi",
  "P4K BET": "P4kbet",
  NOBODY: "Jeff",
  RANSEI: "Cjay",
  VALDO: "G"
};

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "RateLimitError";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLoose(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "");
}

function cleanText(value) {
  return String(value || "")
    .replace(/聽/g, " ")
    .replace(/—/g, " - ")
    .replace(/–/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return cleanText(
    String(value || "")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
  );
}

function stripTags(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function assertNotRateLimited(body, url) {
  const text = String(body || "");
  if (text.includes("Rate Limited - Liquipedia") || text.includes("temporarily blocked from accessing Liquipedia")) {
    throw new RateLimitError(`Liquipedia rate limit detected while requesting ${url}`);
  }
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate"
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const encoding = String(res.headers["content-encoding"] || "").toLowerCase();

        try {
          const decoded = encoding.includes("gzip")
            ? zlib.gunzipSync(buffer)
            : encoding.includes("deflate")
              ? zlib.inflateSync(buffer)
              : buffer;
          const text = decoded.toString("utf8");
          assertNotRateLimited(text, url);

          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`${res.statusCode} ${res.statusMessage || "Request failed"} for ${url}`));
            return;
          }

          resolve(text);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

async function apiJson(url) {
  return JSON.parse(await fetchText(url));
}

async function runThrottled(kind, action) {
  const delay = kind === "parse" ? PARSE_DELAY_MS : SEARCH_DELAY_MS;
  await sleep(delay);
  return action();
}

function getSearchTerms(name) {
  const exact = String(name || "").trim();
  const terms = new Set([exact]);
  for (const term of SEARCH_OVERRIDES[exact] || []) terms.add(term);
  if (exact.startsWith("COACH ")) terms.add(exact.replace(/^COACH\s+/i, ""));
  if (exact.startsWith("P4K ")) terms.add(exact.replace(/^P4K\s+/i, ""));
  return [...terms].filter(Boolean);
}

async function searchCandidates(term, cache) {
  const key = normalizeKey(term);
  if (cache.searches[key]) return cache.searches[key];

  const url = `https://liquipedia.net/mobilelegends/api.php?action=opensearch&search=${encodeURIComponent(term)}&limit=8&namespace=0&format=json`;
  const [query, titles = [], _descriptions = [], urls = []] = await runThrottled("search", () => apiJson(url));
  const results = titles.map((title, index) => ({
    query,
    title,
    url: urls[index] || `https://liquipedia.net/mobilelegends/${encodeURIComponent(title).replace(/%2F/g, "/")}`
  }));
  cache.searches[key] = results;
  return results;
}

async function parsePage(title, cache) {
  const key = String(title || "").trim();
  if (cache.pages[key]) return cache.pages[key];

  const url = `https://liquipedia.net/mobilelegends/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&formatversion=2`;
  const payload = await runThrottled("parse", () => apiJson(url));
  const html = payload.parse?.text || "";
  cache.pages[key] = html;
  return html;
}

function extractInfoboxFields(html) {
  const fields = {};
  const regex = /<div><div class="infobox-cell-2 infobox-description">([^<:]+):<\/div><div[^>]*>([\s\S]*?)<\/div><\/div>/g;
  for (const match of html.matchAll(regex)) {
    fields[stripTags(match[1])] = stripTags(match[2]);
  }
  return fields;
}

function extractSummary(html) {
  const infoboxEnd = html.indexOf("</div>\n<p>");
  const chunk = infoboxEnd >= 0 ? html.slice(infoboxEnd) : html;
  const match = chunk.match(/<p>([\s\S]*?)<\/p>/i);
  return match ? stripTags(match[1]) : "";
}

function extractLinks(html) {
  const linkSection = html.match(/<div><div class="infobox-header wiki-backgroundcolor-light infobox-header-2">Links<\/div><\/div>([\s\S]*?)<div><div class="infobox-header wiki-backgroundcolor-light infobox-header-2">/i);
  if (!linkSection) return {};

  const links = {};
  for (const match of linkSection[1].matchAll(/href="([^"]+)"[\s\S]*?<i class="lp-icon lp-([^"\s]+)"/gi)) {
    links[match[2]] = decodeEntities(match[1]);
  }
  return links;
}

function extractHistory(html) {
  const history = [];
  const section = html.match(/<div><div class="infobox-header wiki-backgroundcolor-light infobox-header-2">History<\/div><\/div>([\s\S]*?)<\/div><\/div><div class="fo-nttax-infobox-adbox">/i);
  if (!section) return history;

  const rowRegex = /<td class="th-mono"[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td>/gi;
  for (const match of section[1].matchAll(rowRegex)) {
    history.push({
      dates: cleanText(stripTags(match[1])),
      team: stripTags(match[2])
    });
  }
  return history;
}

function buildProfile(title, url, html) {
  const fields = extractInfoboxFields(html);
  const nativeName = fields.Name || "";
  const romanizedName = fields["Romanized Name"] || "";
  return {
    liquipediaHandle: fields.ID || title,
    fullName: romanizedName || nativeName,
    nativeName,
    nationality: fields.Nationality || "",
    born: fields.Born || fields["Date of Birth"] || "",
    status: fields.Status || "",
    role: fields.Role || fields.Roles || "",
    team: fields.Team || "",
    approxTotalWinnings: fields["Approx. Total Winnings"] || "",
    summary: extractSummary(html),
    history: extractHistory(html),
    links: extractLinks(html),
    source: url
  };
}

function scoreCandidate(person, teamNames, candidate, profile) {
  let score = 0;
  const exactName = normalizeKey(person.name);
  const looseName = normalizeLoose(person.name);
  const titleKey = normalizeKey(candidate.title);
  const titleLoose = normalizeLoose(candidate.title);
  const summaryKey = normalizeKey(profile.summary);
  const roleKey = normalizeKey(profile.role);
  const teamKey = normalizeKey(profile.team);
  const historyKey = normalizeKey((profile.history || []).map((entry) => `${entry.dates} ${entry.team}`).join(" "));
  const aliases = [teamNames[person.team], ...(TEAM_ALIASES[person.team] || []), person.team].filter(Boolean);

  if (titleKey === exactName || titleLoose === looseName) score += 8;
  if (summaryKey.includes(exactName) || summaryKey.includes(looseName)) score += 4;

  if (person.kind === "coach") {
    if (roleKey.includes("coach")) score += 6;
  } else if (roleKey && !roleKey.includes("coach")) {
    score += 4;
  }

  for (const alias of aliases) {
    const aliasKey = normalizeKey(alias);
    if (!aliasKey) continue;
    if (teamKey.includes(aliasKey)) score += 8;
    if (summaryKey.includes(aliasKey)) score += 6;
    if (historyKey.includes(aliasKey)) score += 3;
  }

  return score;
}

async function resolveProfile(person, teamNames, cache) {
  const forcedTitle = PAGE_OVERRIDES[String(person.name || "").trim()];
  if (forcedTitle) {
    const html = await parsePage(forcedTitle, cache);
    if (html) {
      return buildProfile(forcedTitle, `https://liquipedia.net/mobilelegends/${encodeURIComponent(forcedTitle).replace(/%2F/g, "/")}`, html);
    }
  }

  const candidates = [];
  for (const term of getSearchTerms(person.name)) {
    try {
      candidates.push(...await searchCandidates(term, cache));
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
    }
  }

  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = normalizeKey(candidate.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  let best = null;
  for (const candidate of unique) {
    try {
      const html = await parsePage(candidate.title, cache);
      if (!html) continue;
      const profile = buildProfile(candidate.title, candidate.url, html);
      const score = scoreCandidate(person, teamNames, candidate, profile);
      if (!best || score > best.score) {
        best = { profile, score };
      }
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
    }
  }

  if (!best || best.score < 8) return null;
  return best.profile;
}

async function saveState(profiles, cache) {
  await writeJson(outputPath, {
    generatedAt: new Date().toISOString(),
    source: "Liquipedia Mobile Legends exact page matches",
    profiles
  });
  await writeJson(cachePath, cache);
}

async function main() {
  const [roster, staff, teamNames, existingData, cache] = await Promise.all([
    readJson(rosterPath),
    readJson(staffPath),
    readJson(teamNamesPath),
    readJson(outputPath, { profiles: {} }),
    readJson(cachePath, { searches: {}, pages: {} })
  ]);

  const people = [
    ...roster.map((entry) => ({ ...entry, kind: "player" })),
    ...staff.map((entry) => ({ ...entry, kind: "coach" }))
  ].filter((person) => {
    if (!NAME_FILTERS.length) return true;
    return NAME_FILTERS.includes(normalizeKey(person.name));
  });

  const profiles = { ...(existingData.profiles || {}) };
  const results = [];
  let missCount = 0;

  for (const person of people) {
    const key = normalizeKey(person.name);
    if (!FORCE_REFRESH && profiles[key]) {
      results.push(`SKIP   ${person.kind.padEnd(6)} ${person.name}`);
      continue;
    }

    try {
      const profile = await resolveProfile(person, teamNames, cache);
      if (profile) {
        profiles[key] = {
          ...profile,
          handle: person.name,
          kind: person.kind,
          image: person.picture || ""
        };
        results.push(`FOUND  ${person.kind.padEnd(6)} ${person.name} -> ${profile.source}`);
      } else {
        missCount += 1;
        results.push(`MISS   ${person.kind.padEnd(6)} ${person.name}`);
      }
      await saveState(profiles, cache);
    } catch (error) {
      await saveState(profiles, cache);
      if (error instanceof RateLimitError) {
        console.error(error.message);
        console.error("Stopped early to avoid repeated Liquipedia blocks. Unblock the IP, then rerun this script.");
        process.exitCode = 2;
        break;
      }
      results.push(`ERROR  ${person.kind.padEnd(6)} ${person.name} -> ${error.message}`);
    }

    if (missCount >= MAX_MISSES) {
      console.log(`Reached LP_MAX_MISSES=${MAX_MISSES}, stopping early.`);
      break;
    }
  }

  console.log(results.join("\n"));
  console.log(`\nSaved ${Object.keys(profiles).length} profiles to ${path.relative(repoRoot, outputPath)}`);
  console.log(`Cache saved to ${path.relative(repoRoot, cachePath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
