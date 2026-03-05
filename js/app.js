import { getCurrentSeasonLabel, loadData } from "./data-store.js";
import { invalidateStatsCache } from "./stats.js";
import {
  refreshDataRefs,
  onTeamCompareChange,
  onPlayerCompareChange,
  onHeroCompareChange,
  openH2hPoolPopup,
  closeH2hPoolPopup,
  onPlayerSearchInput,
  onHeroSearchInput,
  onHpPlayerSearchInput,
  onPpHeroSearchInput,
  onPpExcludeUnusedToggle,
  showTeams,
  sortTeams,
  showPlayers,
  sortPlayers,
  showHeroes,
  sortHeroes,
  showHeroPool,
  sortHeroPool,
  showPlayerPools,
  sortPlayerPools,
  showH2H,
  setH2hSubTab,
  setSupportPos
} from "./views.js";

const appState = {
  loaded: false,
  season: "season16",
  view: "teams",
  sort: {
    teams: { key: "matchWins", asc: false },
    players: { key: "kda", asc: false },
    heroes: { key: "pickRate", asc: false },
    heroPool: { key: "totalHeroes", asc: false },
    playerPools: { key: "totalPlayers", asc: false }
  },
  search: {
    player: { value: "", caret: 0 },
    hero: { value: "", caret: 0 },
    hpPlayer: { value: "", caret: 0 },
    ppHero: { value: "", caret: 0 }
  },
  filters: {
    ppExcludeUnused: false
  }
};

const ENABLED_SEASONS = new Set(["season16"]);
let h2hTabBound = false;

function bindH2HTabClick() {
  if (h2hTabBound) return;
  const h2hBtn = document.getElementById("tabH2H");
  if (!h2hBtn) return;
  h2hBtn.addEventListener("click", (e) => {
    e.preventDefault();
    showH2HView();
  });
  h2hTabBound = true;
}

function setLoading(message) {
  const output = document.getElementById("output");
  if (!output) return;
  output.innerHTML = `<div class="panel-title">${message}</div>`;
}

function updateSeasonMeta() {
  const seasonLabel = getCurrentSeasonLabel();
  document.title = `${seasonLabel} Stats`;
  const heading = document.getElementById("seasonHeading");
  if (heading) heading.textContent = `${seasonLabel} STATISTICS`;
}

function showLoadError(err) {
  const output = document.getElementById("output");
  if (!output) return;
  const protocol = window.location.protocol;
  const protocolHint = protocol === "file:"
    ? "<p><strong>Tip:</strong> You are running with file://. Start a local server (for example: <code>python -m http.server 5500</code>) and open http://localhost:5500.</p>"
    : "";
  output.innerHTML = `
    <div class="panel-title">Data Load Error</div>
    <p>${String(err.message || err)}</p>
    ${protocolHint}
    <button type="button" class="retry-btn" onclick="initApp()">Retry</button>
  `;
}

function setActiveNavByLabel(label) {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  for (const btn of nav.querySelectorAll("button")) {
    const active = btn.textContent.trim().toLowerCase() === label.toLowerCase();
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function showTeamsView(...args) {
  appState.view = "teams";
  setActiveNavByLabel("Teams");
  return showTeams(...args);
}

function showPlayersView(...args) {
  appState.view = "players";
  setActiveNavByLabel("Players");
  return showPlayers(...args);
}

function showHeroesView(...args) {
  appState.view = "heroes";
  setActiveNavByLabel("Heroes");
  return showHeroes(...args);
}

function showHeroPoolView(...args) {
  appState.view = "hero pool";
  setActiveNavByLabel("Hero Pool");
  return showHeroPool(...args);
}

function showPlayerPoolsView(...args) {
  appState.view = "player pool";
  setActiveNavByLabel("Player Pool");
  return showPlayerPools(...args);
}

function showH2HView(...args) {
  appState.view = "h2h";
  setActiveNavByLabel("H2H");
  return showH2H(...args);
}

function renderCurrentView() {
  if (appState.view === "players") return showPlayersView();
  if (appState.view === "heroes") return showHeroesView();
  if (appState.view === "hero pool") return showHeroPoolView();
  if (appState.view === "player pool") return showPlayerPoolsView();
  if (appState.view === "h2h") return showH2HView();
  return showTeamsView();
}

export async function initApp() {
  bindH2HTabClick();

  const startupWatchdog = setTimeout(() => {
    const output = document.getElementById("output");
    if (!output) return;
    if (output.textContent && output.textContent.includes("Loading data")) {
      output.innerHTML = `
        <div class="panel-title">Startup Timeout</div>
        <p>Data loading took too long.</p>
        <p><strong>Tip:</strong> Run from a local server instead of opening the HTML file directly.</p>
        <button type="button" class="retry-btn" onclick="initApp()">Retry</button>
      `;
    }
  }, 12000);

  try {
    setLoading("Loading data...");
    await loadData(appState.season);
    invalidateStatsCache();
    refreshDataRefs();
    updateSeasonMeta();
    appState.loaded = true;
    showTeamsView();

    const selector = document.getElementById("seasonSelect");
    if (selector) selector.value = appState.season;

    if (window.matchMedia && window.matchMedia("(max-width: 700px)").matches) {
      setSupportPos("topRight");
    }
  } catch (err) {
    showLoadError(err);
  } finally {
    clearTimeout(startupWatchdog);
  }
}

export async function onSeasonChange(seasonKey) {
  if (!seasonKey || seasonKey === appState.season) return;
  if (!ENABLED_SEASONS.has(seasonKey)) return;

  appState.season = seasonKey;

  try {
    setLoading("Loading data...");
    await loadData(appState.season);
    invalidateStatsCache();
    refreshDataRefs();
    updateSeasonMeta();
    renderCurrentView();
  } catch (err) {
    showLoadError(err);
  }
}

window.appState = appState;
window.initApp = initApp;
window.onSeasonChange = onSeasonChange;
window.showTeams = showTeamsView;
window.sortTeams = sortTeams;
window.showPlayers = showPlayersView;
window.sortPlayers = sortPlayers;
window.showHeroes = showHeroesView;
window.sortHeroes = sortHeroes;
window.showHeroPool = showHeroPoolView;
window.sortHeroPool = sortHeroPool;
window.showPlayerPools = showPlayerPoolsView;
window.sortPlayerPools = sortPlayerPools;
window.showH2H = showH2HView;
window.setH2hSubTab = setH2hSubTab;
window.onPlayerSearchInput = onPlayerSearchInput;
window.onTeamCompareChange = onTeamCompareChange;
window.onPlayerCompareChange = onPlayerCompareChange;
window.onHeroCompareChange = onHeroCompareChange;
window.openH2hPoolPopup = openH2hPoolPopup;
window.closeH2hPoolPopup = closeH2hPoolPopup;
window.onHeroSearchInput = onHeroSearchInput;
window.onHpPlayerSearchInput = onHpPlayerSearchInput;
window.onPpHeroSearchInput = onPpHeroSearchInput;
window.onPpExcludeUnusedToggle = onPpExcludeUnusedToggle;
window.invalidateStatsCache = invalidateStatsCache;

window.addEventListener("DOMContentLoaded", () => {
  initApp();
});
