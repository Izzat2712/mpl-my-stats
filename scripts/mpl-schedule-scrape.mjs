import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTeamCode } from "./mpl-fetch-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const SCHEDULE_URL = "https://my.mpl.mobilelegends.com/schedule";
const SEASON_YEAR = 2026;
const OUT_PATH = path.join(repoRoot, "data", "season18", "matches.json");

const MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
};

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"
];

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.text();
}

function parseDateText(dateText) {
  const match = String(dateText || "").match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  const month = MONTHS[match[2]];
  if (!month || !Number.isFinite(day)) return null;
  return { year: SEASON_YEAR, month, day };
}

function to12Hour(timeText) {
  const match = String(timeText || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  let hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour}:${minute} ${suffix}`;
}

function parseMatchCard(block) {
  const teamNames = [...block.matchAll(/<div class="team-name">([^<]+)<\/div>/g)].map((m) => m[1].trim());
  if (teamNames.length < 2) return null;

  const dateMatch = block.match(/<div class="match-date">([^<]+)<\/div>/);
  const timeMatch = block.match(/<div class="match-time">([^<]+)<\/div>/);
  const detailMatch = block.match(/href="[^"]*\/detail\/([A-Za-z0-9]+)"[^>]*data-detail-id="(\d+)"/);

  if (!dateMatch || !timeMatch) return null;

  return {
    teamA: normalizeTeamCode(teamNames[0]),
    teamB: normalizeTeamCode(teamNames[1]),
    date: parseDateText(dateMatch[1]),
    startTime: to12Hour(timeMatch[1]),
    slug: detailMatch ? detailMatch[1] : "",
    matchId: detailMatch ? Number.parseInt(detailMatch[2], 10) : null
  };
}

function parseMatchCards(html) {
  const startMatches = [...html.matchAll(/<div class="match-card[^"]*"[^>]*>/g)].map((m) => m.index);
  const cards = [];
  for (let i = 0; i < startMatches.length; i += 1) {
    const start = startMatches[i];
    const end = startMatches[i + 1] || html.length;
    const card = parseMatchCard(html.slice(start, end));
    if (!card) continue;
    const weekMatch = String(card.slug).match(/^W(\d+)/i);
    card.week = weekMatch ? Number.parseInt(weekMatch[1], 10) : null;
    if (card.week && card.date && card.startTime) {
      cards.push(card);
    }
  }
  return cards;
}

function buildMatches(cards) {
  const matches = [];
  const dayCounters = {};
  for (const card of cards) {
    const dayKey = `${card.week}|${card.date.month}-${card.date.day}`;
    dayCounters[dayKey] = (dayCounters[dayKey] || 0) + 1;
    const weekdayIndex = new Date(card.date.year, card.date.month - 1, card.date.day).getDay();
    matches.push({
      teamA: card.teamA,
      teamB: card.teamB,
      week: card.week,
      day: WEEKDAYS[weekdayIndex],
      dayMatch: dayCounters[dayKey],
      date: `${card.date.year}-${String(card.date.month).padStart(2, "0")}-${card.date.day}`,
      startTime: card.startTime,
      games: [],
      mpl: {
        slug: card.slug,
        matchId: card.matchId
      },
      stage: "regular"
    });
  }
  return matches;
}

async function main() {
  console.log(`Fetching schedule from ${SCHEDULE_URL} ...`);
  const html = await fetchText(SCHEDULE_URL);
  const cards = parseMatchCards(html);
  if (!cards.length) {
    throw new Error("No matches parsed from the schedule page. The page structure may have changed.");
  }
  const matches = buildMatches(cards);
  if (!matches.length) {
    throw new Error("No matches with valid week slugs were found.");
  }

  await writeFile(OUT_PATH, `${JSON.stringify(matches, null, 2)}\n`, "utf8");

  const weeks = [...new Set(matches.map((m) => m.week))].sort((a, b) => a - b);
  const days = [...new Set(matches.map((m) => m.day))];
  const perWeek = weeks.map((w) => `${w}:${matches.filter((m) => m.week === w).length}`).join(", ");
  console.log(`Parsed ${matches.length} matches (${perWeek}) across ${days.join(", ")}`);
  console.log(`Wrote ${path.relative(repoRoot, OUT_PATH)}`);
  console.log("Sample:", JSON.stringify(matches[0], null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});