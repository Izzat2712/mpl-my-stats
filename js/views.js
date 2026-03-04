import { getCurrentSeasonLabel, getHeroesMap, getRosterList, getTeamDisplayName, getTeamLogosMap } from "./data-store.js";
import { calculateHeroPoolStats, calculateHeroStats, calculatePlayerPoolsStats, calculatePlayerStats, calculateTeamStats } from "./stats.js";

let roster = [];
let constHero = {};
let teamLogos = {};

function teamLabel(teamCode) {
  return getTeamDisplayName(teamCode);
}

function seasonLabel() {
  return getCurrentSeasonLabel();
}

export function refreshDataRefs() {
  roster = getRosterList();
  constHero = getHeroesMap();
  teamLogos = getTeamLogosMap();
}

let teamSort = {key: "matchWins", asc: false }; // false = DESC (highest matchWins first)
let playerSort = { key: "kda", asc: false };
let heroSort = { key: "pickRate", asc: false };
let heroPoolSort = { key: "totalHeroes", asc: false };
let playerPoolsSort = { key: "totalPlayers", asc: false };



// ===== SEARCH STATE (Players) =====
let playerSearchState = { value: "", caret: 0 };

function onPlayerSearchInput(e) {
  playerSearchState.value = e.target.value;
  playerSearchState.caret = e.target.selectionStart || playerSearchState.value.length;
  showPlayers(true); // true = keep focus
}

// ===== SEARCH STATES (continuous typing) =====
let heroSearchState = { value: "", caret: 0 };          // Heroes tab (hero name)
let hpPlayerSearchState = { value: "", caret: 0 };      // Hero Pool tab (player name)
let ppHeroSearchState = { value: "", caret: 0 };        // Player Pool tab (hero name)
let ppExcludeUnused = false; // checkbox state

function onHeroSearchInput(e) {
  heroSearchState.value = e.target.value;
  heroSearchState.caret = e.target.selectionStart || heroSearchState.value.length;
  showHeroes(true);
}

// HERO POOL: search PLAYER NAME
function onHpPlayerSearchInput(e) {
  hpPlayerSearchState.value = e.target.value;
  hpPlayerSearchState.caret = e.target.selectionStart || hpPlayerSearchState.value.length;
  showHeroPool(true);
}

// PLAYER POOL: search HERO NAME
function onPpHeroSearchInput(e) {
  ppHeroSearchState.value = e.target.value;
  ppHeroSearchState.caret = e.target.selectionStart || ppHeroSearchState.value.length;
  showPlayerPools(true);
}

function onPpExcludeUnusedToggle(e) {
  ppExcludeUnused = e.target.checked;
  showPlayerPools(false);
}

const laneOrder = {
  "Gold Laner": 1,
  "Jungler": 2,
  "Midlaner": 3,
  "Exp Laner": 4,
  "Roamer": 5
};


function showTeams() {
  let t = calculateTeamStats();

  let arr = Object.keys(t).map(team => ({
    team,
    ...t[team]
  }));

  if (teamSort.key) {
    arr.sort((a, b) => {
      let valA = a[teamSort.key];
      let valB = b[teamSort.key];

      if (typeof valA === "string") {
        const labelA = teamLabel(valA);
        const labelB = teamLabel(valB);
        const cmp = teamSort.asc ? labelA.localeCompare(labelB) : labelB.localeCompare(labelA);
        if (cmp !== 0) return cmp;
        return teamLabel(a.team).localeCompare(teamLabel(b.team));
      }
      const cmp = teamSort.asc ? valA - valB : valB - valA;
      if (cmp !== 0) return cmp;
      return teamLabel(a.team).localeCompare(teamLabel(b.team));
    });
  }

  function arrow(key) {
    if (teamSort.key !== key) return ' <span style="opacity:0.4;">&#9650;</span>';
    return teamSort.asc ? ' <span>&#9650;</span>' : ' <span>&#9660;</span>';
  }

  let html = `
      <div class="rotateHint">
    Rotate your phone for full table view
  </div>

    <table class="teamsTable">
      <tr>
        <th aria-sort="${teamSort.key === 'team' ? (teamSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortTeams('team')">TEAM${arrow('team')}</th>
        <th aria-sort="${teamSort.key === 'matchWins' ? (teamSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortTeams('matchWins')">MATCHES WON${arrow('matchWins')}</th>
        <th aria-sort="${teamSort.key === 'kills' ? (teamSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortTeams('kills')">KILLS${arrow('kills')}</th>
        <th aria-sort="${teamSort.key === 'deaths' ? (teamSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortTeams('deaths')">DEATHS${arrow('deaths')}</th>
        <th aria-sort="${teamSort.key === 'assists' ? (teamSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortTeams('assists')">ASSISTS${arrow('assists')}</th>
        <th aria-sort="${teamSort.key === 'lord' ? (teamSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortTeams('lord')">LORD${arrow('lord')}</th>
        <th aria-sort="${teamSort.key === 'turtle' ? (teamSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortTeams('turtle')">TURTLE${arrow('turtle')}</th>
        <th aria-sort="${teamSort.key === 'tower' ? (teamSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortTeams('tower')">TOWER${arrow('tower')}</th>
      </tr>
  `;

  for (let ts of arr) {
    const logo = teamLogos[ts.team] || "";
    html += `
      <tr>
<td>
  <div class="teamCell">
    <img class="teamLogo" src="${logo}" width="50" height="50" alt="${teamLabel(ts.team)} logo">
    <span>${teamLabel(ts.team)}</span>
  </div>
</td>
        <td>${ts.matchWins}</td>
        <td>${ts.kills}</td>
        <td>${ts.deaths}</td>
        <td>${ts.assists}</td>
        <td>${ts.lord || 0}</td>
        <td>${ts.turtle || 0}</td>
        <td>${ts.tower || 0}</td>
      </tr>
    `;
  }

  html += `</table>`;
  document.getElementById("output").innerHTML = html;
}

function sortTeams(key) {
  if (teamSort.key === key) {
    teamSort.asc = !teamSort.asc;
  } else {
    teamSort.key = key;
    teamSort.asc = false; // default DESC
  }
  showTeams();
}

function showPlayers(keepSearchFocus = false) {
  
  let p = calculatePlayerStats();

  const currentTeam = document.getElementById("teamFilter")?.value || "ALL TEAMS";
  const currentLane = document.getElementById("laneFilter")?.value || "ALL ROLES";
  const searchEl = document.getElementById("playerSearch");
  const currentSearch = searchEl ? searchEl.value : (playerSearchState.value || "");
  const q = currentSearch.trim().toLowerCase();

  let arr = Object.keys(p).map(name => ({
    name,
    team: p[name].team,
    lane: p[name].lane,
    games: p[name].games,
    kills: p[name].kills,
    deaths: p[name].deaths,
    assists: p[name].assists,
    avgK: p[name].games ? p[name].kills / p[name].games : 0,
    avgD: p[name].games ? p[name].deaths / p[name].games : 0,
    avgA: p[name].games ? p[name].assists / p[name].games : 0,
    kda: (p[name].kills + p[name].assists) / (p[name].deaths || 1),
    kp: p[name].games ? (p[name].kpTotal / p[name].games) * 100 : 0,
    picture: p[name].picture
  }));

  let topKills = [...arr].sort((a,b) => b.kills - a.kills).slice(0,5);
  let topAssists = [...arr].sort((a,b) => b.assists - a.assists).slice(0,5);
  let topKDA = [...arr].sort((a,b) => b.kda - a.kda).slice(0,5);


  // ===== BUILD FILTER OPTIONS =====
  const teams = [...new Set(arr.map(p => p.team))];
  const lanes = [...new Set(arr.map(p => p.lane))];

  // ===== APPLY FILTER =====
  arr = arr.filter(ps => {
    const teamMatch = currentTeam === "ALL TEAMS" || ps.team === currentTeam;
    const laneMatch = currentLane === "ALL ROLES" || ps.lane === currentLane;
    return teamMatch && laneMatch;
  });

  // ===== APPLY NAME SEARCH (PLAYER NAME ONLY) =====
  if (q) {
    arr = arr.filter(ps => ps.name.toLowerCase().includes(q));
  }

  // ===== SORT =====
  if (playerSort.key) {
    arr.sort((a, b) => {

      if (playerSort.key === "lane") {
        const cmp = playerSort.asc
          ? laneOrder[a.lane] - laneOrder[b.lane]
          : laneOrder[b.lane] - laneOrder[a.lane];
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }

      let valA = a[playerSort.key];
      let valB = b[playerSort.key];

      if (typeof valA === "string") {
        const cmp = playerSort.asc
          ? (playerSort.key === "team" ? teamLabel(valA).localeCompare(teamLabel(valB)) : valA.localeCompare(valB))
          : (playerSort.key === "team" ? teamLabel(valB).localeCompare(teamLabel(valA)) : valB.localeCompare(valA));
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }

      const cmp = playerSort.asc ? valA - valB : valB - valA;
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name);
    });
  }

function arrow(key) {
  if (playerSort.key !== key) {
    return ' <span style="opacity:0.4;">&#9650;</span>';
  }
  return playerSort.asc
    ? ' <span>&#9650;</span>'
    : ' <span>&#9660;</span>';
}
  // ===== START HTML =====
let html = `
<h2 style="text-align:center;">TOP PLAYERS ${seasonLabel()}</h2>

<div class="topRow">
  <strong>TOP 5 KILLS:</strong>
  <div class="topItems">
${topKills.map((pl, i) => `
  <div class="topItem topRank topRank--${i+1} ${i===0 ? "topMVP" : ""}">
    <div class="rankBadge">#${i+1}</div>

    <div class="avatarWrap">
      <img class="playerAvatar" src="${pl.picture}" alt="${pl.name}">
      
      <img class="teamMiniLogo"
           src="${teamLogos[pl.team] || ''}"
           alt="${teamLabel(pl.team)}">
    </div>

    <div class="topLabel">
      <span class="topName">${pl.name}</span>
      <span class="topValue">${pl.kills}</span>
    </div>

  </div>
`).join('')}
  </div>
</div>

<div class="topRow">
  <strong>TOP 5 ASSISTS:</strong>
  <div class="topItems">
    ${topAssists.map((pl, i) => `
      <div class="topItem topRank topRank--${i+1} ${i===0 ? "topMVP" : ""}">
        <div class="rankBadge">#${i+1}</div>

        <div class="avatarWrap">
          <img class="playerAvatar" src="${pl.picture}" alt="${pl.name}">
          
          ${teamLogos[pl.team] 
            ? `<img class="teamMiniLogo" src="${teamLogos[pl.team]}" alt="${teamLabel(pl.team)}">`
            : ''
          }
        </div>

        <div class="topLabel">
          <span class="topName">${pl.name}</span>
          <span class="topValue">${pl.assists}</span>
        </div>

      </div>
    `).join('')}
  </div>
</div>

<div class="topRow">
  <strong>TOP 5 KDA:</strong>
  <div class="topItems">
    ${topKDA.map((pl, i) => `
      <div class="topItem topRank topRank--${i+1} ${i===0 ? "topMVP" : ""}">
        <div class="rankBadge">#${i+1}</div>

        <div class="avatarWrap">
          <img class="playerAvatar" src="${pl.picture}" alt="${pl.name}">
          
          ${teamLogos[pl.team] 
            ? `<img class="teamMiniLogo" src="${teamLogos[pl.team]}" alt="${teamLabel(pl.team)}">`
            : ''
          }
        </div>

        <div class="topLabel">
          <span class="topName">${pl.name}</span>
          <span class="topValue">${pl.kda.toFixed(2)}</span>
        </div>

      </div>
    `).join('')}
  </div>
</div>




  <div style="margin-bottom:20px; display:flex; gap:20px; justify-content:center;">
    <div>
      <label>TEAM: </label>
      <select id="teamFilter" onchange="showPlayers()">
        <option value="ALL TEAMS">ALL TEAMS</option>
        ${teams.map(t => `<option value="${t}" ${t === currentTeam ? "selected" : ""}>${teamLabel(t)}</option>`).join("")}
      </select>
    </div>

    <div>
      <label>ROLE: </label>
      <select id="laneFilter" onchange="showPlayers()">
        <option value="ALL ROLES">ALL ROLES</option>
        ${lanes.map(l => `<option value="${l}" ${l === currentLane ? "selected" : ""}>${l}</option>`).join("")}
      </select>
    </div>
  </div>

  <div style="margin-bottom:20px; display:flex; justify-content:center;">
    <input
      id="playerSearch"
      type="text"
      placeholder="Search player..."
      value="${currentSearch.replace(/"/g, "&quot;")}"
      oninput="onPlayerSearchInput(event)"
      style="padding:10px 14px; width:320px; border-radius:10px; border:1px solid #444; background:#0b0b0b; color:#fff;"
    />
  </div>

    <div class="rotateHint">
    Rotate your phone for full table view
  </div>

  <table class="playersTable">
  <tr>
    <th aria-sort="${playerSort.key === 'name' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('name')">PLAYER${arrow('name')}</th>
    <th aria-sort="${playerSort.key === 'team' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('team')">TEAM${arrow('team')}</th>
    <th aria-sort="${playerSort.key === 'lane' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('lane')">ROLE${arrow('lane')}</th>
    <th aria-sort="${playerSort.key === 'games' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('games')">GAMES${arrow('games')}</th>
    <th aria-sort="${playerSort.key === 'kills' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('kills')">KILLS${arrow('kills')}</th>
    <th aria-sort="${playerSort.key === 'avgK' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('avgK')">AVG KILLS${arrow('avgK')}</th>
    <th aria-sort="${playerSort.key === 'deaths' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('deaths')">DEATHS${arrow('deaths')}</th>
    <th aria-sort="${playerSort.key === 'avgD' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('avgD')">AVG DEATHS${arrow('avgD')}</th>
    <th aria-sort="${playerSort.key === 'assists' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('assists')">ASSISTS${arrow('assists')}</th>
    <th aria-sort="${playerSort.key === 'avgA' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('avgA')">AVG ASSISTS${arrow('avgA')}</th>
    <th aria-sort="${playerSort.key === 'kda' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('kda')">KDA${arrow('kda')}</th>
    <th aria-sort="${playerSort.key === 'kp' ? (playerSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayers('kp')">KP%${arrow('kp')}</th>
  </tr>
  `;

  for (let ps of arr) {
html += `
<tr>
  <td>
    <div class="teamCell">
      <img src="${ps.picture}" width="90" height="90" style="border-radius:50%;" alt="${ps.name}">
      <span>${ps.name}</span>
    </div>
  </td>

<td style="vertical-align:middle;">
  <div class="teamCell">
    <img class="teamLogo" src="${teamLogos[ps.team]}" width="50" height="50" alt="${teamLabel(ps.team)} logo">
    <span>${teamLabel(ps.team)}</span>
  </div>
</td>

  <td>${ps.lane}</td>
  <td>${ps.games}</td>
  <td>${ps.kills}</td>
  <td>${ps.avgK.toFixed(2)}</td>
  <td>${ps.deaths}</td>
  <td>${ps.avgD.toFixed(2)}</td>
  <td>${ps.assists}</td>
  <td>${ps.avgA.toFixed(2)}</td>
  <td>${ps.kda.toFixed(2)}</td>
  <td>${ps.kp.toFixed(1)}%</td>
</tr>
`;
  }

  html += "</table>";

  document.getElementById("output").innerHTML = html;

    if (keepSearchFocus) {
    requestAnimationFrame(() => {
      const el = document.getElementById("playerSearch");
      if (!el) return;
      el.focus();
      const pos = Math.min(playerSearchState.caret || 0, el.value.length);
      el.setSelectionRange(pos, pos);
    });
  }
}

function sortPlayers(key) {
  if (playerSort.key === key) {
    playerSort.asc = !playerSort.asc;
  } else {
    playerSort.key = key;
    playerSort.asc = false;
  }

  showPlayers(); // re-render with same filters preserved
}



function showTopPlayers(category) {
  let p = calculatePlayerStats();
  let arr = Object.keys(p).map(name => ({
    name,
    team: p[name].team,
    lane: p[name].lane,
    picture: p[name].picture,
    kills: p[name].kills,
    assists: p[name].assists,
    deaths: p[name].deaths,
    kda: ((p[name].kills + p[name].assists)/(p[name].deaths||1)).toFixed(2)
  }));
  if (category !== 'kda') arr.sort((a,b)=>b[category]-a[category]);
  else arr.sort((a,b)=>b.kda-a.kda); // kda numeric
  let top5 = arr.slice(0,5);
  let html = `<h2 style="text-align:center;">Top 5 Players - ${category.toUpperCase()}</h2><div style="display:flex; justify-content:center; gap:20px;">`;
  for (let pl of top5) {
    html += `<div style="text-align:center;"><img src="${pl.picture}" width="60" height="60" alt="${pl.name}"><br><b>${pl.name}</b><br>${teamLabel(pl.team)}<br>${pl[category]}</div>`;
  }
  html += "</div>";
  document.getElementById("output").innerHTML = html;
}



function showHeroes(keepSearchFocus = false) {
  let arr = calculateHeroStats();

  // ===== TOP LISTS =====
  const topPick = [...arr].sort((a, b) => b.pick - a.pick).slice(0, 5);
  const topBan  = [...arr].sort((a, b) => b.ban - a.ban).slice(0, 5);

  // Top 5 Winrate (min 5 picks). Fallback to min 1 pick if none >= 5
  let topWinCandidates = arr.filter(h => h.pick >= 5);
  const hasMin5 = topWinCandidates.length > 0;
  if (!hasMin5) topWinCandidates = arr.filter(h => h.pick > 0);
  const topWin = [...topWinCandidates].sort((a, b) => b.winRate - a.winRate).slice(0, 5);

  const winLabel = hasMin5
    ? "TOP 5 WINRATE (MIN 5 GAMES):"
    : "TOP 5 WINRATE (MIN 1 PICK):";

  // ===== SEARCH (HERO NAME ONLY) =====
  const searchEl = document.getElementById("heroSearch");
  const currentSearch = searchEl ? searchEl.value : (heroSearchState.value || "");
  const q = currentSearch.trim().toLowerCase();

  if (q) {
    arr = arr.filter(h => h.hero.toLowerCase().includes(q));
  }

  // ===== SORT TABLE =====
  if (heroSort.key) {
    arr.sort((a, b) => {
      let valA = a[heroSort.key];
      let valB = b[heroSort.key];

      if (typeof valA === "string") {
        const cmp = heroSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        if (cmp !== 0) return cmp;
        return a.hero.localeCompare(b.hero);
      }
      const cmp = heroSort.asc ? valA - valB : valB - valA;
      if (cmp !== 0) return cmp;
      return a.hero.localeCompare(b.hero);
    });
  }

  function arrow(key) {
    if (heroSort.key !== key) return ' <span style="opacity:0.4;">&#9650;</span>';
    return heroSort.asc ? ' <span>&#9650;</span>' : ' <span>&#9660;</span>';
  }

  // ===== unified top row renderer (centered + consistent card/avatar) =====
function renderTopRow(label, list, valueFn) {
  return `
    <div class="toprow">
      <div class="toprow-label">${label}</div>

      <div class="toprow-grid">
        ${list.map((item, i) => `
          <div class="topcard topRank topRank--${i+1} ${i===0 ? "topMVP" : ""}">
            <div class="rankBadge">#${i+1}</div>
            <img class="topavatar" src="${item.img}" alt="${item.hero}">
            <div class="topLabel">
              <span class="topName">${item.hero}</span>
              <span class="topValue">${valueFn(item)}</span>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

const topPickRow = renderTopRow("TOP 5 PICK:", topPick, h => h.pick);
const topBanRow  = renderTopRow("TOP 5 BAN:",  topBan,  h => h.ban);
const topWinRow  = renderTopRow(winLabel,      topWin,  h => `${h.winRate.toFixed(1)}%`);

let html = `
<h2 class="panel-title">HERO STATS ${seasonLabel()}</h2>

<div class="toprows">
  ${topPickRow}
  ${topBanRow}
  ${topWinRow}
</div>

<div class="searchRow">
  <input
    id="heroSearch"
    class="searchInput"
    type="text"
    placeholder="Search hero..."
    value="${currentSearch.replace(/"/g, "&quot;")}"
    oninput="onHeroSearchInput(event)"
  />
</div>

<div class="tableWrap">
  <div class="rotateHint">
    Rotate your phone for full table view
  </div>

  <table class="dataTable heroesTable">
    <tr>
      <th aria-sort="${heroSort.key === 'hero' ? (heroSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortHeroes('hero')">HERO${arrow('hero')}</th>
      <th aria-sort="${heroSort.key === 'pick' ? (heroSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortHeroes('pick')">PICK${arrow('pick')}</th>
      <th aria-sort="${heroSort.key === 'pickRate' ? (heroSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortHeroes('pickRate')">PICK RATE${arrow('pickRate')}</th>
      <th aria-sort="${heroSort.key === 'ban' ? (heroSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortHeroes('ban')">BAN${arrow('ban')}</th>
      <th aria-sort="${heroSort.key === 'banRate' ? (heroSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortHeroes('banRate')">BAN RATE${arrow('banRate')}</th>
      <th aria-sort="${heroSort.key === 'winRate' ? (heroSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortHeroes('winRate')">WIN RATE${arrow('winRate')}</th>
    </tr>
`;

for (let h of arr) {
  html += `
    <tr>
      <td>
        <div class="cellHero">
          <img class="cellHeroImg" src="${h.img}" alt="${h.hero}">
          <span class="cellHeroName">${h.hero}</span>
        </div>
      </td>
      <td class="tdCenter">${h.pick}</td>
      <td class="tdCenter">${h.pickRate.toFixed(1)}%</td>
      <td class="tdCenter">${h.ban}</td>
      <td class="tdCenter">${h.banRate.toFixed(1)}%</td>
      <td class="tdCenter">${h.winRate.toFixed(1)}%</td>
    </tr>
  `;
}

html += `
  </table>
</div>
`;

document.getElementById("output").innerHTML = html;

  // keep continuous typing
  if (keepSearchFocus) {
    requestAnimationFrame(() => {
      const el = document.getElementById("heroSearch");
      if (!el) return;
      el.focus();
      const pos = Math.min(heroSearchState.caret || 0, el.value.length);
      el.setSelectionRange(pos, pos);
    });
  }
}

function sortHeroes(key) {
  if (heroSort.key === key) {
    heroSort.asc = !heroSort.asc;
  } else {
    heroSort.key = key;
    heroSort.asc = false;
  }
  showHeroes();
}



function showHeroPool(keepSearchFocus = false) {

  const pool = calculateHeroPoolStats();

  let arr = Object.keys(pool).map(name => {
    const ps = pool[name];
    const uniqueHeroes = Object.keys(ps.heroes).length;

    const heroList = Object.keys(ps.heroes)
      .map(h => ({
        hero: h,
        games: ps.heroes[h].games,
        winRate: ps.heroes[h].games ? (ps.heroes[h].wins / ps.heroes[h].games) * 100 : 0,
        img: constHero[h] || ""
      }))
      .sort((a,b) => b.games - a.games);

    return {
      name: ps.name,
      team: ps.team,
      lane: ps.lane,
      picture: ps.picture,
      totalHeroes: uniqueHeroes,
      heroesPlayed: heroList
    };
  });

  // Keep current filter values
  const currentTeam = document.getElementById("hpTeamFilter")?.value || "ALL TEAMS";
  const currentLane = document.getElementById("hpLaneFilter")?.value || "ALL ROLES";

  // ===== SEARCH (PLAYER NAME ONLY) =====
  const searchEl = document.getElementById("hpPlayerSearch");
  const currentSearch = searchEl ? searchEl.value : (hpPlayerSearchState.value || "");
  const q = currentSearch.trim().toLowerCase();

  // Build filter lists
  const teams = [...new Set(arr.map(p => p.team))];
  const lanes = [...new Set(arr.map(p => p.lane))];

  // Apply Team/Lane filters
  arr = arr.filter(ps => {
    const teamMatch = currentTeam === "ALL TEAMS" || ps.team === currentTeam;
    const laneMatch = currentLane === "ALL ROLES" || ps.lane === currentLane;
    return teamMatch && laneMatch;
  });

  // Apply PLAYER NAME search
  if (q) {
    arr = arr.filter(ps => ps.name.toLowerCase().includes(q));
  }

  // Sort
  if (heroPoolSort.key) {
    arr.sort((a, b) => {
      let valA = a[heroPoolSort.key];
      let valB = b[heroPoolSort.key];

      if (heroPoolSort.key === "lane") {
        const cmp = heroPoolSort.asc
          ? laneOrder[a.lane] - laneOrder[b.lane]
          : laneOrder[b.lane] - laneOrder[a.lane];
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }

      if (typeof valA === "string") {
        const cmp = heroPoolSort.asc
          ? (heroPoolSort.key === "team" ? teamLabel(valA).localeCompare(teamLabel(valB)) : valA.localeCompare(valB))
          : (heroPoolSort.key === "team" ? teamLabel(valB).localeCompare(teamLabel(valA)) : valB.localeCompare(valA));
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }

      const cmp = heroPoolSort.asc ? valA - valB : valB - valA;
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name);
    });
  }

  function arrow(key) {
    if (heroPoolSort.key !== key) return ' <span style="opacity:0.4;">&#9650;</span>';
    return heroPoolSort.asc ? ' <span>&#9650;</span>' : ' <span>&#9660;</span>';
  }

  // Render
  let html = `
    <h2 style="text-align:center;">HERO POOL ${seasonLabel()}</h2>

    <div class="filterRow">
      <div>
        <label>TEAM: </label>
        <select id="hpTeamFilter" onchange="showHeroPool()">
          <option value="ALL TEAMS">ALL TEAMS</option>
          ${teams.map(t => `<option value="${t}" ${t === currentTeam ? "selected" : ""}>${teamLabel(t)}</option>`).join("")}
        </select>
      </div>

      <div>
        <label>ROLE: </label>
        <select id="hpLaneFilter" onchange="showHeroPool()">
          <option value="ALL ROLES">ALL ROLES</option>
          ${lanes.map(l => `<option value="${l}" ${l === currentLane ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
    </div>

    <!-- SEARCH BELOW FILTERS (PLAYER NAME ONLY) -->
    <div class="searchRow">
      <input
        id="hpPlayerSearch"
        type="text"
        placeholder="Search player..."
        value="${currentSearch.replace(/"/g, "&quot;")}"
        oninput="onHpPlayerSearchInput(event)"
        class="searchInput"
      />
    </div>

          <div class="rotateHint">
    Rotate your phone for full table view
  </div>

    <table class="heroPoolTable">
      <tr>
        <th aria-sort="${heroPoolSort.key === 'name' ? (heroPoolSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortHeroPool('name')">PLAYER${arrow('name')}</th>
        <th aria-sort="${heroPoolSort.key === 'team' ? (heroPoolSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortHeroPool('team')">TEAM${arrow('team')}</th>
        <th aria-sort="${heroPoolSort.key === 'lane' ? (heroPoolSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortHeroPool('lane')">ROLE${arrow('lane')}</th>
        <th aria-sort="${heroPoolSort.key === 'totalHeroes' ? (heroPoolSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortHeroPool('totalHeroes')">TOTAL HEROES${arrow('totalHeroes')}</th>
        <th>HEROES PLAYED (GAMES - WINRATE %)</th>
      </tr>
  `;

  for (let ps of arr) {
    const heroesHTML = ps.heroesPlayed.map(h => `
      <span style="display:inline-flex; align-items:center; gap:6px; margin:3px 10px 3px 0;">
        <img
          src="${h.img}"
          width="45"
          height="45"
          alt="${h.hero}"
          style="border-radius:50%; object-fit:cover; border:2px solid #fff;"
        >
        <span>${h.hero} (${h.games} - ${h.winRate.toFixed(0)}%)</span>
      </span>
    `).join("");

    html += `
      <tr>
        <td style="vertical-align:middle;">
          <div style="display:flex; align-items:center; gap:10px; height:100%;">
            <img src="${ps.picture}" width="55" height="55"
              alt="${ps.name}"
              style="border-radius:50%; object-fit:cover; border:2px solid #fff;">
            <span>${ps.name}</span>
          </div>
        </td>

<td style="vertical-align:middle;">
  <div class="teamCell">
    <img class="teamLogo" src="${teamLogos[ps.team] || ""}" width="45" height="45" alt="${teamLabel(ps.team)} logo">
    <span>${teamLabel(ps.team)}</span>
  </div>
</td>

        <td>${ps.lane}</td>
        <td>${ps.totalHeroes}</td>
        <td style="text-align:left; max-width:650px;">${heroesHTML}</td>
      </tr>
    `;
  }

  html += `</table>`;
  document.getElementById("output").innerHTML = html;

  // keep continuous typing
  if (keepSearchFocus) {
    requestAnimationFrame(() => {
      const el = document.getElementById("hpPlayerSearch");
      if (!el) return;
      el.focus();
      const pos = Math.min(hpPlayerSearchState.caret || 0, el.value.length);
      el.setSelectionRange(pos, pos);
    });
  }
}

function sortHeroPool(key) {
  
  if (heroPoolSort.key === key) {
    heroPoolSort.asc = !heroPoolSort.asc;
  } else {
    heroPoolSort.key = key;
    heroPoolSort.asc = false;
  }
  showHeroPool();
}



function showPlayerPools(keepSearchFocus = false) {
  const pools = calculatePlayerPoolsStats();

  let arr = Object.keys(pools).map(heroName => {
    const hs = pools[heroName];

    const playerList = Object.keys(hs.players || {})
      .map(pn => {
        const p = hs.players[pn];
        return {
          name: p.name,
          team: p.team,
          lane: p.lane,
          picture: p.picture,
          games: p.games,
          winRate: p.games ? (p.wins / p.games) * 100 : 0
        };
      })
      .sort((a, b) => b.games - a.games);

    return {
      hero: heroName,
      img: constHero[heroName] || "",
      totalPlayers: playerList.length,
      playersPlayed: playerList
    };
  });

  // ===== Current filters =====
  const currentTeam = document.getElementById("ppTeamFilter")?.value || "ALL TEAMS";
  const currentLane = document.getElementById("ppLaneFilter")?.value || "ALL ROLES";

  // ===== Search (hero name only) =====
  const searchEl = document.getElementById("ppHeroSearch");
  const currentSearch = searchEl ? searchEl.value : (ppHeroSearchState.value || "");
  const q = currentSearch.trim().toLowerCase();

  // ===== Filter dropdown options (from roster, so they always exist even if no games) =====
  const teams = ["ALL TEAMS", ...new Set((roster || []).map(r => r.team))].filter(Boolean);
  const lanes = ["ALL ROLES", ...new Set((roster || []).map(r => r.lane))].filter(Boolean);

  // ===== Apply Team/Lane filters =====
  // - If Team/Lane is not ALL, we filter the player list within each hero
  // - BUT we keep unused heroes in the table when checkbox is NOT checked
  const teamLaneFilteringActive = currentTeam !== "ALL TEAMS" || currentLane !== "ALL ROLES";

  arr = arr.map(h => {
    const filteredPlayers = (h.playersPlayed || []).filter(p => {
      const teamMatch = currentTeam === "ALL TEAMS" || p.team === currentTeam;
      const laneMatch = currentLane === "ALL ROLES" || p.lane === currentLane;
      return teamMatch && laneMatch;
    });

    return {
      ...h,
      totalPlayers: filteredPlayers.length,
      playersPlayed: filteredPlayers
    };
  });

  // If filters are active, we usually hide heroes that have 0 matching players,
  // BUT only if "Exclude unused heroes" is checked.
  // If checkbox is OFF, we still show heroes with 0 players (unused).
  if (ppExcludeUnused || teamLaneFilteringActive) {
    // keep heroes that have at least one matching player
    // unless checkbox is OFF AND no team/lane filter applied
    if (ppExcludeUnused) {
      arr = arr.filter(h => h.totalPlayers > 0);
    } else if (teamLaneFilteringActive) {
      arr = arr.filter(h => h.totalPlayers > 0);
    }
  }

  // ===== Apply hero-name search =====
  if (q) {
    arr = arr.filter(h => h.hero.toLowerCase().includes(q));
  }

  // ===== Sort =====
  if (playerPoolsSort.key) {
    arr.sort((a, b) => {
      let valA = a[playerPoolsSort.key];
      let valB = b[playerPoolsSort.key];

      if (typeof valA === "string") {
        const cmp = playerPoolsSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        if (cmp !== 0) return cmp;
        return a.hero.localeCompare(b.hero);
      }
      const cmp = playerPoolsSort.asc ? valA - valB : valB - valA;
      if (cmp !== 0) return cmp;
      return a.hero.localeCompare(b.hero);
    });
  }

  function arrow(key) {
    if (playerPoolsSort.key !== key) return ' <span style="opacity:0.4;">&#9650;</span>';
    return playerPoolsSort.asc ? ' <span>&#9650;</span>' : ' <span>&#9660;</span>';
  }

  // ===== Render =====
  let html = `
    <h2 style="text-align:center;">PLAYER POOL ${seasonLabel()}</h2>

    <div class="filterRow">
      <div>
        <label>TEAM: </label>
        <select id="ppTeamFilter" onchange="showPlayerPools()">
          ${teams.map(t => `<option value="${t}" ${t === currentTeam ? "selected" : ""}>${teamLabel(t)}</option>`).join("")}
        </select>
      </div>

      <div>
        <label>ROLE: </label>
        <select id="ppLaneFilter" onchange="showPlayerPools()">
          ${lanes.map(l => `<option value="${l}" ${l === currentLane ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="searchRow" style="margin:14px 0 18px; align-items:center; gap:14px;">
      <input
        id="ppHeroSearch"
        type="text"
        placeholder="Search hero..."
        value="${currentSearch.replace(/"/g, "&quot;")}"
        oninput="onPpHeroSearchInput(event)"
        class="searchInput"
      />

      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none;">
        <input
          id="ppExcludeUnused"
          type="checkbox"
          ${ppExcludeUnused ? "checked" : ""}
          onchange="onPpExcludeUnusedToggle(event)"
          style="width:18px; height:18px;"
        />
        <span style="opacity:0.9;">Exclude unused heroes</span>
      </label>
    </div>

          <div class="rotateHint">
    Rotate your phone for full table view
  </div>

    <table class="playerPoolTable">
      <tr>
        <th aria-sort="${playerPoolsSort.key === 'hero' ? (playerPoolsSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayerPools('hero')">HERO${arrow('hero')}</th>
        <th aria-sort="${playerPoolsSort.key === 'totalPlayers' ? (playerPoolsSort.asc ? 'ascending' : 'descending') : 'none'}" onclick="sortPlayerPools('totalPlayers')">TOTAL PLAYERS${arrow('totalPlayers')}</th>
        <th>PLAYERS PLAYED (GAMES - WIN RATE %)</th>
      </tr>
  `;

  for (let h of arr) {
    const playersHTML = (h.playersPlayed && h.playersPlayed.length)
      ? h.playersPlayed.map(p => `
          <span style="display:inline-flex; align-items:center; gap:6px; margin:3px 10px 3px 0;">
            <img
              src="${p.picture}"
              width="85"
              height="85"
              alt="${p.name}"
              style="border-radius:50%; object-fit:cover; border:2px solid #fff;"
            >
            <span>${p.name} (${p.games} - ${p.winRate.toFixed(0)}%)</span>
          </span>
        `).join("")
      : `<span style="opacity:0.6;">-</span>`;

    html += `
      <tr>
        <td style="vertical-align:middle;">
          <div style="display:flex; align-items:center; gap:10px; height:100%;">
            <img src="${h.img}" width="55" height="55"
              alt="${h.hero}"
              style="border-radius:50%; object-fit:cover; border:2px solid #fff;">
            <span>${h.hero}</span>
          </div>
        </td>
        <td>${h.totalPlayers}</td>
        <td style="text-align:left; max-width:700px;">${playersHTML}</td>
      </tr>
    `;
  }

  html += `</table>`;
  document.getElementById("output").innerHTML = html;

  // keep continuous typing
  if (keepSearchFocus) {
    requestAnimationFrame(() => {
      const el = document.getElementById("ppHeroSearch");
      if (!el) return;
      el.focus();
      const pos = Math.min(ppHeroSearchState.caret || 0, el.value.length);
      el.setSelectionRange(pos, pos);
    });
  }
}

function sortPlayerPools(key) {
  if (playerPoolsSort.key === key) {
    playerPoolsSort.asc = !playerPoolsSort.asc;
  } else {
    playerPoolsSort.key = key;
    playerPoolsSort.asc = false;
  }
  showPlayerPools();
}

// ===== Sociabuzz Position Control =====
let _sbEl = null;

function findSociabuzzElement() {
  // Try common possibilities (works even if Sociabuzz changes wrapper)
  return (
    document.querySelector("#sbBoW") ||
    document.querySelector(".sbBoW") ||
    document.querySelector('[class*="sbBoW"]') ||
    document.querySelector('iframe[src*="sociabuzz"]') ||
    document.querySelector('a[href*="sociabuzz.com/izzat27"]') ||
    null
  );
}

function setSupportPos(mode) {
  if (!_sbEl) _sbEl = findSociabuzzElement();
  if (!_sbEl) return;

  // Sometimes the clickable button is inside a wrapper; move the wrapper if possible
  const el = _sbEl.parentElement && _sbEl.tagName.toLowerCase() === "iframe"
    ? _sbEl.parentElement
    : _sbEl;

  el.style.position = "fixed";
  el.style.zIndex = "9999";

  if (mode === "center") {
    el.style.top = "50%";
    el.style.left = "50%";
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "translate(-50%, -50%)";
  } else if (mode === "topRight") {
    el.style.top = "15px";
    el.style.right = "15px";
    el.style.left = "auto";
    el.style.bottom = "auto";
    el.style.transform = "none";

  }}
export {
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
  setSupportPos
};






