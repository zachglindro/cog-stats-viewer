// Modifier script for the tab view

// Get gameTabId from URL
const urlParams = new URLSearchParams(window.location.search);
const gameTabId = parseInt(urlParams.get("gameTabId"));

// State
let statsData = { permanent: [], temps: [] };
let filteredStats = [];
let currentScope = "all"; // all, permanent, temporary
let searchTerm = "";
let renderedCount = 0;
const CHUNK_SIZE = 50;
let lastStatsHash = null;
let pollingInterval = null;
let currentSort = "modified-desc"; // name-asc, name-desc, modified-asc, modified-desc
let previousStatsData = { permanent: [], temps: [] };
let changeIndicators = new Map(); // key: scope:key, value: {from: value, type: type, timestamp: number}
let recentlyChanged = new Set(); // keys that changed in the current session
let highlightedStats = new Set(); // keys to highlight in the UI
let currentPollChanges = new Set(); // keys that changed in the most recent poll
let pinnedStats = new Set(); // set of "scope:key"

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Save pins to storage
function savePins() {
  chrome.storage.local.set({ pinnedStats: Array.from(pinnedStats) });
}

// Start polling
function startPolling() {
  if (pollingInterval) return;
  pollingInterval = setInterval(() => {
    loadStats();
  }, 1000);
}

// Stop polling
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Load stats
function loadStats() {
  chrome.runtime.sendMessage({ type: "getStats", gameTabId });
}

// Filter stats
function filterStats(term = searchTerm) {
  searchTerm = term;
  const lowerTerm = term.toLowerCase();
  filteredStats = [];

  if (currentScope === "pins") {
    // Include all pinned stats from both permanent and temporary
    const allStats = [
      ...statsData.permanent.map((stat) => ({ ...stat, scope: "permanent" })),
      ...statsData.temps.map((stat) => ({ ...stat, scope: "temporary" })),
    ];
    filteredStats = allStats.filter(
      (stat) =>
        stat.key.toLowerCase().includes(lowerTerm) &&
        !stat.key.startsWith("_") &&
        pinnedStats.has(`${stat.scope}:${stat.key}`),
    );
  } else {
    if (currentScope === "all" || currentScope === "permanent") {
      filteredStats.push(
        ...statsData.permanent
          .filter(
            (stat) =>
              stat.key.toLowerCase().includes(lowerTerm) &&
              !stat.key.startsWith("_"),
          )
          .map((stat) => ({ ...stat, scope: "permanent" })),
      );
    }

    if (currentScope === "all" || currentScope === "temporary") {
      filteredStats.push(
        ...statsData.temps
          .filter(
            (stat) =>
              stat.key.toLowerCase().includes(lowerTerm) &&
              !stat.key.startsWith("_"),
          )
          .map((stat) => ({ ...stat, scope: "temporary" })),
      );
    }

    if (currentScope === "recently") {
      filteredStats.push(
        ...statsData.permanent
          .filter(
            (stat) =>
              stat.key.toLowerCase().includes(lowerTerm) &&
              !stat.key.startsWith("_") &&
              recentlyChanged.has(`permanent:${stat.key}`),
          )
          .map((stat) => ({ ...stat, scope: "permanent" })),
      );
      filteredStats.push(
        ...statsData.temps
          .filter(
            (stat) =>
              stat.key.toLowerCase().includes(lowerTerm) &&
              !stat.key.startsWith("_") &&
              recentlyChanged.has(`temporary:${stat.key}`),
          )
          .map((stat) => ({ ...stat, scope: "temporary" })),
      );
    }
  }

  // Sort filtered stats
  filteredStats.sort((a, b) => {
    if (currentSort === "name-asc") {
      return a.key.localeCompare(b.key);
    } else if (currentSort === "name-desc") {
      return b.key.localeCompare(a.key);
    } else if (currentSort === "modified-desc") {
      return (b.lastModified || 0) - (a.lastModified || 0);
    } else if (currentSort === "modified-asc") {
      return (a.lastModified || 0) - (b.lastModified || 0);
    }
    return 0;
  });

  // Move pinned stats to the top (except for pins scope, which are already only pinned)
  if (currentScope !== "pins") {
    const pinned = filteredStats.filter((stat) =>
      pinnedStats.has(`${stat.scope}:${stat.key}`),
    );
    const unpinned = filteredStats.filter(
      (stat) => !pinnedStats.has(`${stat.scope}:${stat.key}`),
    );
    filteredStats = [...pinned, ...unpinned];
  }

  renderedCount = 0;
  renderStats();
}

// Render stats
function renderStats() {
  const listContainer = document.getElementById("cog-stats-list");
  if (!listContainer) return;

  // Clear previous content
  listContainer.innerHTML = "";

  if (filteredStats.length === 0) {
    listContainer.innerHTML = "<p>No stats found.</p>";
    return;
  }

  // Render current chunk
  const endIndex = Math.min(renderedCount + CHUNK_SIZE, filteredStats.length);
  for (let i = renderedCount; i < endIndex; i++) {
    const stat = filteredStats[i];
    const item = createStatItem(stat);
    listContainer.appendChild(item);
  }
  renderedCount = endIndex;

  // Add load more button if more items
  if (renderedCount < filteredStats.length) {
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.textContent = `Load More (${filteredStats.length - renderedCount} remaining)`;
    loadMoreBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-top: 10px;
      background: #ddd;
      border: 1px solid #ccc;
      cursor: pointer;
    `;
    loadMoreBtn.onclick = () => renderStats();
    listContainer.appendChild(loadMoreBtn);
  }
}

// Helper function to format stat values for display
function formatValue(value, type) {
  if (type === "string") return `"${value}"`;
  return value;
}

// Create stat item
function createStatItem(stat) {
  const item = document.createElement("div");
  const key = `${stat.scope}:${stat.key}`;
  const isRecentChange = highlightedStats.has(key);
  item.style.cssText = `
    margin-bottom: 10px;
    padding: 5px;
    border: 1px solid #ddd;
    border-radius: 3px;
    background: ${isRecentChange ? "#f0fff0" : "white"};
    ${isRecentChange ? "border-left: 4px solid #4CAF50;" : ""}
  `;

  const label = document.createElement("div");
  label.innerHTML = `${stat.key} <span style="font-weight: normal; color: grey;">${stat.scope === "permanent" ? "P" : "T"}</span>`;
  label.style.fontWeight = "bold";
  if (isRecentChange) label.style.background = "#f0fff0";

  const valueDisplay = document.createElement("div");
  if (isRecentChange) valueDisplay.style.background = "#f0fff0";

  // Find previous value
  let prevValue = null;
  if (stat.scope === "permanent") {
    const prev = previousStatsData.permanent.find((p) => p.key === stat.key);
    if (prev) prevValue = prev.value;
  } else {
    const prev = previousStatsData.temps.find((p) => p.key === stat.key);
    if (prev) prevValue = prev.value;
  }

  // Compute change indicator
  let changeText = "";
  if (changeIndicators.has(key)) {
    const change = changeIndicators.get(key);
    if (typeof stat.value === "number" && typeof change.from === "number") {
      const diff = stat.value - change.from;
      const sign = diff > 0 ? "+" : "";
      const color = diff > 0 ? "green" : "red";
      changeText = ` <span style="color: ${color};">${sign}${diff}</span>`;
    } else {
      changeText = ` ← <span style="color: grey;">${formatValue(change.from, change.type)}</span>`;
    }
  }

  valueDisplay.innerHTML = `Value: ${formatValue(stat.value, stat.type)} (${stat.type})${changeText}`;

  const editBtn = document.createElement("button");
  editBtn.textContent = "Edit";
  editBtn.onclick = () => editStat(stat);

  const pinBtn = document.createElement("button");
  pinBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="${pinnedStats.has(key) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
  pinBtn.style.marginLeft = "5px";
  pinBtn.title = pinnedStats.has(key) ? "Unpin" : "Pin";
  pinBtn.onclick = () => {
    if (pinnedStats.has(key)) {
      pinnedStats.delete(key);
    } else {
      pinnedStats.add(key);
    }
    savePins();
    pinBtn
      .querySelector("svg")
      .setAttribute("fill", pinnedStats.has(key) ? "currentColor" : "none");
    pinBtn.title = pinnedStats.has(key) ? "Unpin" : "Pin";
    filterStats(); // Re-filter and re-sort to update list
  };

  item.appendChild(label);
  item.appendChild(valueDisplay);
  item.appendChild(editBtn);
  item.appendChild(pinBtn);

  return item;
}
function editStat(stat) {
  const newValue = prompt(`Edit ${stat.key} (${stat.type}):`, stat.value);
  if (newValue === null) return;

  chrome.runtime.sendMessage({
    type: "setStat",
    gameTabId,
    data: {
      scope: stat.scope,
      key: stat.key,
      value: newValue,
      valueType: stat.type,
    },
  });
}

// Message listener
chrome.runtime.onMessage.addListener((message) => {
  const { type, permanent, temps, success, error } = message;

  if (type === "statsResponse") {
    if (error) {
      console.error("Stats error:", error);
      return;
    }
    currentPollChanges.clear();
    highlightedStats.clear(); // Clear old highlights
    const newPermanent = permanent || [];
    const newTemps = temps || [];

    // Save current stats as previous for change detection
    previousStatsData = {
      permanent: statsData.permanent.map((s) => ({ ...s })),
      temps: statsData.temps.map((s) => ({ ...s })),
    };

    const now = Date.now();

    // Update lastModified for permanent stats
    newPermanent.forEach((stat) => {
      const prev = previousStatsData.permanent.find((p) => p.key === stat.key);
      if (!prev || prev.value !== stat.value) {
        stat.lastModified = now;
      } else {
        stat.lastModified = prev.lastModified || now;
      }
    });

    // Update lastModified for temporary stats
    newTemps.forEach((stat) => {
      const prev = previousStatsData.temps.find((p) => p.key === stat.key);
      if (!prev || prev.value !== stat.value) {
        stat.lastModified = now;
      } else {
        stat.lastModified = prev.lastModified || now;
      }
    });

    // Update change indicators for permanent stats
    newPermanent.forEach((stat) => {
      const key = `permanent:${stat.key}`;
      const prev = previousStatsData.permanent.find((p) => p.key === stat.key);
      if (prev && prev.value !== stat.value) {
        changeIndicators.set(key, {
          from: prev.value,
          type: prev.type,
          timestamp: Date.now(),
        });
        recentlyChanged.add(key);
        highlightedStats.add(key);
        currentPollChanges.add(key);
      }
    });

    // Update change indicators for temporary stats
    newTemps.forEach((stat) => {
      const key = `temporary:${stat.key}`;
      const prev = previousStatsData.temps.find((p) => p.key === stat.key);
      if (prev && prev.value !== stat.value) {
        changeIndicators.set(key, {
          from: prev.value,
          type: prev.type,
          timestamp: Date.now(),
        });
        recentlyChanged.add(key);
        highlightedStats.add(key);
        currentPollChanges.add(key);
      }
    });

    statsData = { permanent: newPermanent, temps: newTemps };
    const newHash = JSON.stringify(statsData);
    if (newHash !== lastStatsHash) {
      lastStatsHash = newHash;
      renderedCount = 0;
      filterStats();
    }
  } else if (type === "setResponse") {
    if (success) {
      loadStats(); // Refresh
    } else {
      alert("Failed to set stat: " + error);
    }
  }
});

// Initialize
document.getElementById("scope-select").onchange = () => {
  currentScope = document.getElementById("scope-select").value;
  renderedCount = 0;
  filterStats();
};

document.getElementById("sort-select").onchange = () => {
  currentSort = document.getElementById("sort-select").value;
  renderedCount = 0;
  filterStats();
};

document.getElementById("scope-select").value = currentScope;
document.getElementById("sort-select").value = currentSort;

// Load pinned stats from storage
chrome.storage.local.get(["pinnedStats"], (result) => {
  pinnedStats = new Set(result.pinnedStats || []);
});

const debouncedFilter = debounce(
  () => filterStats(document.getElementById("search-input").value),
  300,
);
document.getElementById("search-input").oninput = () => {
  searchTerm = document.getElementById("search-input").value;
  debouncedFilter();
};

document.getElementById("move-to-panel-btn").onclick = () => {
  chrome.runtime.sendMessage({ type: "closeModifierTab", gameTabId });
};

// Start polling
startPolling();
