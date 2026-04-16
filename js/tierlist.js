import { getCurrentSeasonLabel, getHeroesMap, getMatches, getRosterList, getTeamDisplayName, getTeamLogosMap } from "./data-store.js";

const DEFAULT_TIER_LABELS = ["S", "A", "B", "C", "D"];
const DEFAULT_TIER_COLORS = ["#ff9f43", "#ffd166", "#7bd389", "#5aa9e6", "#8b9dcf", "#a29bfe", "#f78fb3"];
const LANE_OPTIONS = ["Gold Laner", "Jungler", "Midlaner", "Exp Laner", "Roamer"];
const CATEGORY_TITLES = {
  team: "Team Tier List",
  player: "Player Tier List",
  hero: "Hero Tier List"
};

const tierlistState = {
  activeTab: "team",
  boards: {
    team: createBoardState(CATEGORY_TITLES.team),
    player: createBoardState(CATEGORY_TITLES.player),
    hero: createBoardState(CATEGORY_TITLES.hero)
  },
  draggingItemId: "",
  draggingPointerOffsetX: 0,
  draggingPointerOffsetY: 0,
  dragPreviewEl: null,
  dragHoverZone: null,
  dragScrollFrame: 0,
  dragScrollVelocity: 0,
  focusTarget: null,
  html2CanvasPromise: null
};

function createBoardState(title) {
  return {
    title,
    tiers: DEFAULT_TIER_LABELS.map((label, index) => createTier(label, index)),
    unranked: [],
    filters: {
      team: "ALL",
      role: "ALL",
      search: "",
      pickedOnly: false
    }
  };
}

function createTier(label = "", index = 0) {
  return {
    id: `tier-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    items: [],
    color: DEFAULT_TIER_COLORS[index % DEFAULT_TIER_COLORS.length]
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encodeInline(value) {
  return encodeURIComponent(String(value ?? ""));
}

function getActiveBoard() {
  return tierlistState.boards[tierlistState.activeTab];
}

function buildTierlistData() {
  const teamLogos = getTeamLogosMap() || {};
  const roster = Array.isArray(getRosterList()) ? getRosterList() : [];
  const heroesMap = getHeroesMap() || {};
  const matches = Array.isArray(getMatches()) ? getMatches() : [];
  const rosterByName = new Map(
    roster.map((player) => [String(player?.name || "").trim().toLowerCase(), player])
  );

  const teams = Object.keys(teamLogos)
    .map((teamCode) => ({
      id: `team:${teamCode}`,
      code: teamCode,
      name: getTeamDisplayName(teamCode),
      image: teamLogos[teamCode] || "",
      subtitle: getTeamDisplayName(teamCode)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const players = roster
    .filter((player) => player?.active !== false)
    .map((player) => ({
      id: `player:${player.name}`,
      name: player.name,
      team: player.team,
      role: player.lane,
      image: player.picture || "",
      subtitle: `${getTeamDisplayName(player.team)} | ${player.lane}`
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const heroUsage = new Map();
  for (const match of matches) {
    for (const game of (match.games || [])) {
      for (const participant of (game.players || [])) {
        const heroName = String(participant?.hero || "").trim();
        if (!heroName) continue;

        const playerInfo = rosterByName.get(String(participant?.name || "").trim().toLowerCase());
        const lane = String(playerInfo?.lane || "").trim();
        const usage = heroUsage.get(heroName) || { picked: 0, roles: new Set() };
        usage.picked += 1;
        if (lane) usage.roles.add(lane);
        heroUsage.set(heroName, usage);
      }
    }
  }

  const heroes = Object.keys(heroesMap)
    .map((heroName) => {
      const usage = heroUsage.get(heroName) || { picked: 0, roles: new Set() };
      return {
        id: `hero:${heroName}`,
        name: heroName,
        image: heroesMap[heroName] || "",
        picked: usage.picked,
        roles: Array.from(usage.roles).sort((a, b) => LANE_OPTIONS.indexOf(a) - LANE_OPTIONS.indexOf(b)),
        subtitle: usage.picked
          ? `${usage.picked} picks${usage.roles.size ? ` | ${Array.from(usage.roles).join(", ")}` : ""}`
          : "Unpicked"
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { teams, players, heroes };
}

function sanitizeBoardState(board, items) {
  const validIds = new Set(items.map((item) => item.id));
  const claimed = new Set();

  for (const tier of board.tiers) {
    tier.items = tier.items.filter((itemId) => {
      if (!validIds.has(itemId) || claimed.has(itemId)) return false;
      claimed.add(itemId);
      return true;
    });
  }

  board.unranked = board.unranked.filter((itemId) => {
    if (!validIds.has(itemId) || claimed.has(itemId)) return false;
    claimed.add(itemId);
    return true;
  });

  for (const item of items) {
    if (!claimed.has(item.id)) {
      board.unranked.push(item.id);
      claimed.add(item.id);
    }
  }
}

function getFilteredPoolItems(category, items, filters, itemMap) {
  const query = String(filters.search || "").trim().toLowerCase();

  return items.filter((item) => {
    if (!getActiveBoard().unranked.includes(item.id)) return false;

    if (query && !item.name.toLowerCase().includes(query)) return false;

    if (category === "player") {
      if (filters.team !== "ALL" && item.team !== filters.team) return false;
      if (filters.role !== "ALL" && item.role !== filters.role) return false;
    }

    if (category === "hero") {
      if (filters.role !== "ALL" && !item.roles.includes(filters.role)) return false;
      if (filters.pickedOnly && !item.picked) return false;
    }

    return itemMap.has(item.id);
  });
}

function removeItemFromBoard(board, itemId) {
  board.unranked = board.unranked.filter((id) => id !== itemId);
  for (const tier of board.tiers) {
    tier.items = tier.items.filter((id) => id !== itemId);
  }
}

function getItemMeta(category, item) {
  if (category === "team") return "";
  return `<span class="tierlistItemMeta">${escapeHtml(item.subtitle || "")}</span>`;
}

function renderItemCard(item, category, variant = "pool") {
  const compact = variant === "tier";
  return `
    <button
      type="button"
      class="tierlistItemCard ${compact ? "tierlistItemCard--tier" : ""}"
      onmousedown="startTierlistPointerDrag(event, decodeURIComponent('${encodeInline(item.id)}'))"
      title="${escapeHtml(item.name)}"
      aria-label="${escapeHtml(item.name)}"
    >
      <img class="tierlistItemImage tierlistItemImage--${category}" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" crossorigin="anonymous">
      ${compact ? "" : `<span class="tierlistItemName">${escapeHtml(item.name)}</span>`}
      ${compact ? "" : getItemMeta(category, item)}
    </button>
  `;
}

function renderFilters(category, board, data) {
  if (category === "team") return "";

  if (category === "player") {
    const teams = Array.from(new Set(data.players.map((player) => player.team))).sort((a, b) => getTeamDisplayName(a).localeCompare(getTeamDisplayName(b)));
    return `
      <div class="tierlistFilterBar">
        <label class="tierlistField">
          <span>Search</span>
          <input
            id="tierlistPlayerSearch"
            type="text"
            value="${escapeHtml(board.filters.search)}"
            placeholder="Search player..."
            oninput="updateTierlistFilter('player', 'search', this.value, true)"
          >
        </label>
        <label class="tierlistField">
          <span>Team</span>
          <select onchange="updateTierlistFilter('player', 'team', this.value)">
            <option value="ALL" ${board.filters.team === "ALL" ? "selected" : ""}>All teams</option>
            ${teams.map((teamCode) => `<option value="${escapeHtml(teamCode)}" ${board.filters.team === teamCode ? "selected" : ""}>${escapeHtml(getTeamDisplayName(teamCode))}</option>`).join("")}
          </select>
        </label>
        <label class="tierlistField">
          <span>Role</span>
          <select onchange="updateTierlistFilter('player', 'role', this.value)">
            <option value="ALL" ${board.filters.role === "ALL" ? "selected" : ""}>All roles</option>
            ${LANE_OPTIONS.map((lane) => `<option value="${escapeHtml(lane)}" ${board.filters.role === lane ? "selected" : ""}>${escapeHtml(lane)}</option>`).join("")}
          </select>
        </label>
      </div>
    `;
  }

  return `
    <div class="tierlistFilterBar">
      <label class="tierlistField">
        <span>Search</span>
        <input
          id="tierlistHeroSearch"
          type="text"
          value="${escapeHtml(board.filters.search)}"
          placeholder="Search hero..."
          oninput="updateTierlistFilter('hero', 'search', this.value, true)"
        >
      </label>
      <label class="tierlistField">
        <span>Role</span>
        <select onchange="updateTierlistFilter('hero', 'role', this.value)">
          <option value="ALL" ${board.filters.role === "ALL" ? "selected" : ""}>All roles</option>
          ${LANE_OPTIONS.map((lane) => `<option value="${escapeHtml(lane)}" ${board.filters.role === lane ? "selected" : ""}>${escapeHtml(lane)}</option>`).join("")}
        </select>
      </label>
      <label class="tierlistCheckbox">
        <input
          type="checkbox"
          ${board.filters.pickedOnly ? "checked" : ""}
          onchange="updateTierlistFilter('hero', 'pickedOnly', this.checked)"
        >
        <span>Picked heroes only</span>
      </label>
    </div>
  `;
}

function renderTierlistView() {
  const output = document.getElementById("output");
  if (!output) return;

  const category = tierlistState.activeTab;
  const board = getActiveBoard();
  const data = buildTierlistData();
  const items = category === "team" ? data.teams : category === "player" ? data.players : data.heroes;
  sanitizeBoardState(board, items);
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const poolItems = getFilteredPoolItems(category, items, board.filters, itemMap);

  const html = `
    <section class="tierlistPage">
      <h2 class="panel-title">TIERLIST MAKER ${escapeHtml(getCurrentSeasonLabel())}</h2>

      <div class="nav tierlistSubnav">
        ${["team", "player", "hero"].map((tab) => `
          <button
            type="button"
            class="${category === tab ? "is-active" : ""}"
            onclick="setTierlistCategory('${tab}')"
          >
            ${tab}
          </button>
        `).join("")}
      </div>

      <div class="tierlistToolbar">
        <label class="tierlistTitleField">
          <span>Tierlist Title</span>
          <input
            id="tierlistTitleInput"
            type="text"
            value="${escapeHtml(board.title)}"
            placeholder="Enter your tierlist title"
            oninput="updateTierlistTitle(this.value)"
          >
        </label>

        <div class="tierlistToolbarActions">
          <button type="button" class="tierlistActionBtn" onclick="addTierlistTier()">Add Tier</button>
          <button type="button" class="tierlistActionBtn tierlistActionBtn--accent" onclick="downloadTierlistImage()">Download PNG</button>
        </div>
      </div>

      <div id="tierlistExportSurface" class="tierlistExportSurface">
        <div class="tierlistExportHead">
          <h3 class="tierlistExportTitle">${escapeHtml(board.title || CATEGORY_TITLES[category])}</h3>
        </div>

        <div class="tierlistBoard">
          ${board.tiers.map((tier, index) => `
            <div class="tierlistRow">
              <div class="tierlistTierLabel" style="--tier-color:${escapeHtml(tier.color)};">
                <input
                  type="text"
                  value="${escapeHtml(tier.label)}"
                  aria-label="Tier ${index + 1} label"
                  oninput="renameTierlistTier('${tier.id}', this.value)"
                >
                <button
                  type="button"
                  class="tierlistTierRemove"
                  onclick="removeTierlistTier('${tier.id}')"
                  ${board.tiers.length <= 1 ? "disabled" : ""}
                  aria-label="Remove tier ${escapeHtml(tier.label || `Tier ${index + 1}`)}"
                >
                  x
                </button>
              </div>
              <div
                class="tierlistDropzone"
                data-tierlist-dropzone="tier"
                data-tier-id="${tier.id}"
              >
                ${tier.items.length
                  ? tier.items.map((itemId) => renderItemCard(itemMap.get(itemId), category, "tier")).join("")
                  : `<div class="tierlistEmptyState">Drop ${category} here</div>`}
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <section class="tierlistPoolPanel">
        <div class="tierlistPoolHead">
          <div>
            <p class="tierlistPoolEyebrow">Drag from here</p>
            <h3>Available ${category === "team" ? "Teams" : category === "player" ? "Players" : "Heroes"}</h3>
          </div>
        </div>

        ${renderFilters(category, board, data)}

        <div class="tierlistPoolGrid" data-tierlist-dropzone="pool">
          ${poolItems.length
            ? poolItems.map((item) => renderItemCard(item, category)).join("")
            : `<div class="tierlistPoolEmpty">No ${category} matches the current filters.</div>`}
        </div>
      </section>
    </section>
  `;

  output.innerHTML = html;
  restoreTierlistFocus();
}

function restoreTierlistFocus() {
  const focusTarget = tierlistState.focusTarget;
  tierlistState.focusTarget = null;
  if (!focusTarget) return;

  requestAnimationFrame(() => {
    const input = document.getElementById(focusTarget);
    if (!input) return;
    input.focus();
    const end = input.value.length;
    if (typeof input.setSelectionRange === "function") {
      input.setSelectionRange(end, end);
    }
  });
}

function clearTierlistHoverZone() {
  if (tierlistState.dragHoverZone) {
    tierlistState.dragHoverZone.classList.remove("is-hovered");
    tierlistState.dragHoverZone = null;
  }
}

function setTierlistHoverZone(element) {
  if (tierlistState.dragHoverZone === element) return;
  clearTierlistHoverZone();
  if (element) {
    element.classList.add("is-hovered");
    tierlistState.dragHoverZone = element;
  }
}

function updateTierlistDragPreviewPosition(clientX, clientY) {
  if (!tierlistState.dragPreviewEl) return;
  tierlistState.dragPreviewEl.style.left = `${clientX - tierlistState.draggingPointerOffsetX}px`;
  tierlistState.dragPreviewEl.style.top = `${clientY - tierlistState.draggingPointerOffsetY}px`;
}

function createTierlistDragPreview(sourceEl) {
  const preview = sourceEl.cloneNode(true);
  preview.classList.add("tierlistDragPreview");
  document.body.appendChild(preview);
  tierlistState.dragPreviewEl = preview;
}

function removeTierlistDragPreview() {
  if (tierlistState.dragPreviewEl) {
    tierlistState.dragPreviewEl.remove();
    tierlistState.dragPreviewEl = null;
  }
}

function findTierlistDropzoneAtPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  if (!element) return null;
  return element.closest("[data-tierlist-dropzone]");
}

function stopTierlistAutoScroll() {
  tierlistState.dragScrollVelocity = 0;
  if (tierlistState.dragScrollFrame) {
    cancelAnimationFrame(tierlistState.dragScrollFrame);
    tierlistState.dragScrollFrame = 0;
  }
}

function tickTierlistAutoScroll() {
  if (!tierlistState.dragScrollVelocity) {
    tierlistState.dragScrollFrame = 0;
    return;
  }

  window.scrollBy(0, tierlistState.dragScrollVelocity);
  tierlistState.dragScrollFrame = requestAnimationFrame(tickTierlistAutoScroll);
}

function updateTierlistAutoScroll(clientY) {
  if (!Number.isFinite(clientY) || clientY <= 0) {
    stopTierlistAutoScroll();
    return;
  }

  const edgeZone = Math.max(90, Math.min(window.innerHeight * 0.16, 180));
  let velocity = 0;

  if (clientY < edgeZone) {
    velocity = -Math.ceil(((edgeZone - clientY) / edgeZone) * 24);
  } else if (clientY > window.innerHeight - edgeZone) {
    velocity = Math.ceil(((clientY - (window.innerHeight - edgeZone)) / edgeZone) * 24);
  }

  tierlistState.dragScrollVelocity = velocity;

  if (!velocity) {
    stopTierlistAutoScroll();
    return;
  }

  if (!tierlistState.dragScrollFrame) {
    tierlistState.dragScrollFrame = requestAnimationFrame(tickTierlistAutoScroll);
  }
}

function commitTierlistDrop(destinationType, tierId = "") {
  const itemId = tierlistState.draggingItemId || "";
  if (!itemId) return;

  const board = getActiveBoard();

  if (destinationType === "pool") {
    removeItemFromBoard(board, itemId);
    board.unranked.push(itemId);
    return;
  }

  const tier = board.tiers.find((entry) => entry.id === tierId);
  if (!tier) return;
  removeItemFromBoard(board, itemId);
  tier.items.push(itemId);
}

async function ensureHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  if (tierlistState.html2CanvasPromise) return tierlistState.html2CanvasPromise;

  tierlistState.html2CanvasPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    script.onload = () => resolve(window.html2canvas);
    script.onerror = () => reject(new Error("Unable to load the image export library."));
    document.head.appendChild(script);
  });

  return tierlistState.html2CanvasPromise;
}

export function showTierlist() {
  renderTierlistView();
}

export function setTierlistCategory(category) {
  if (!tierlistState.boards[category]) return;
  tierlistState.activeTab = category;
  renderTierlistView();
}

export function updateTierlistTitle(value) {
  const nextTitle = String(value || "");
  getActiveBoard().title = nextTitle;
  const titleNode = document.querySelector(".tierlistExportTitle");
  if (titleNode) {
    titleNode.textContent = nextTitle || CATEGORY_TITLES[tierlistState.activeTab];
  }
}

export function addTierlistTier() {
  const board = getActiveBoard();
  board.tiers.push(createTier(`Tier ${board.tiers.length + 1}`, board.tiers.length));
  renderTierlistView();
}

export function renameTierlistTier(tierId, value) {
  const tier = getActiveBoard().tiers.find((entry) => entry.id === tierId);
  if (!tier) return;
  tier.label = String(value || "");
}

export function removeTierlistTier(tierId) {
  const board = getActiveBoard();
  if (board.tiers.length <= 1) return;

  const nextTiers = [];
  for (const tier of board.tiers) {
    if (tier.id === tierId) {
      board.unranked.push(...tier.items);
      continue;
    }
    nextTiers.push(tier);
  }
  board.tiers = nextTiers;
  renderTierlistView();
}

export function updateTierlistFilter(category, field, value, keepFocus = false) {
  const board = tierlistState.boards[category];
  if (!board) return;
  board.filters[field] = value;

  if (keepFocus) {
    tierlistState.focusTarget = category === "player" ? "tierlistPlayerSearch" : "tierlistHeroSearch";
  }

  renderTierlistView();
}

export function startTierlistPointerDrag(event, itemId) {
  if (event.button !== 0) return;

  const sourceEl = event.currentTarget;
  if (!(sourceEl instanceof HTMLElement)) return;

  event.preventDefault();
  tierlistState.draggingItemId = itemId;
  const rect = sourceEl.getBoundingClientRect();
  tierlistState.draggingPointerOffsetX = event.clientX - rect.left;
  tierlistState.draggingPointerOffsetY = event.clientY - rect.top;

  createTierlistDragPreview(sourceEl);
  updateTierlistDragPreviewPosition(event.clientX, event.clientY);
  document.body.classList.add("tierlistDragging");
  document.addEventListener("mousemove", onTierlistPointerMove);
  document.addEventListener("mouseup", onTierlistPointerUp);
}

export function onTierlistPointerMove(event) {
  if (!tierlistState.draggingItemId) return;
  updateTierlistDragPreviewPosition(event.clientX, event.clientY);
  updateTierlistAutoScroll(Number(event.clientY));
  setTierlistHoverZone(findTierlistDropzoneAtPoint(event.clientX, event.clientY));
}

export function onTierlistPointerUp(event) {
  if (!tierlistState.draggingItemId) return;

  const dropzone = findTierlistDropzoneAtPoint(event.clientX, event.clientY);
  if (dropzone) {
    commitTierlistDrop(
      String(dropzone.getAttribute("data-tierlist-dropzone") || ""),
      String(dropzone.getAttribute("data-tier-id") || "")
    );
  }

  endTierlistPointerDrag();
  renderTierlistView();
}

export function endTierlistPointerDrag() {
  tierlistState.draggingItemId = "";
  document.body.classList.remove("tierlistDragging");
  document.removeEventListener("mousemove", onTierlistPointerMove);
  document.removeEventListener("mouseup", onTierlistPointerUp);
  clearTierlistHoverZone();
  removeTierlistDragPreview();
  stopTierlistAutoScroll();
}

export async function downloadTierlistImage() {
  const exportSurface = document.getElementById("tierlistExportSurface");
  if (!exportSurface) return;

  const button = document.querySelector(".tierlistActionBtn--accent");
  const board = getActiveBoard();
  const fileTitle = (board.title || CATEGORY_TITLES[tierlistState.activeTab])
    .replace(/[\\/:*?"<>|]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "tierlist";

  if (button) {
    button.disabled = true;
    button.textContent = "Preparing...";
  }

  const previousInlineWidth = exportSurface.style.width;
  const previousInlineMaxWidth = exportSurface.style.maxWidth;

  try {
    const html2canvas = await ensureHtml2Canvas();
    exportSurface.classList.add("is-capturing");
    exportSurface.style.width = "1280px";
    exportSurface.style.maxWidth = "1280px";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = await html2canvas(exportSurface, {
      backgroundColor: null,
      useCORS: true,
      scale: Math.max(2, Math.min(window.devicePixelRatio || 1, 3)),
      width: exportSurface.scrollWidth,
      windowWidth: 1440
    });

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${fileTitle}.png`;
    link.click();
  } catch (error) {
    window.alert(String(error?.message || error || "Failed to download tierlist image."));
  } finally {
    exportSurface.classList.remove("is-capturing");
    exportSurface.style.width = previousInlineWidth;
    exportSurface.style.maxWidth = previousInlineMaxWidth;
    if (button) {
      button.disabled = false;
      button.textContent = "Download PNG";
    }
  }
}
