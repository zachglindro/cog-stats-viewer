// Content script for Choice of Games Stats Modifier

// Check if on eligible page
function isEligiblePage() {
  if (window.location.hostname !== "www.choiceofgames.com") return false;

  const path = window.location.pathname;
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    const canonicalUrl = new URL(canonical.href);
    if (canonicalUrl.hostname !== "www.choiceofgames.com") return false;
  }

  // Match /game-name/ or /user-contributed/game-name/
  return /^\/(user-contributed\/)?[^\/]+\/$/.test(path);
}

if (isEligiblePage()) {
  // Inject bridge script
  const bridgeScript = document.createElement("script");
  bridgeScript.src = chrome.runtime.getURL("page-bridge/bridge.js");
  (document.head || document.documentElement).appendChild(bridgeScript);

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
  let changeIndicators = new Map(); // key: scope:key, value: {from: value, type: type}

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

  // Inject Modifier button
  function injectButton() {
    const buttonsDiv = document.getElementById("buttons");
    if (!buttonsDiv) return;

    const modifierButton = document.createElement("button");
    modifierButton.id = "cog-modifier-button";
    modifierButton.className = "spacedLink";
    modifierButton.textContent = "Modifier";
    modifierButton.addEventListener("click", togglePanel);

    buttonsDiv.appendChild(modifierButton);
  }

  // Create panel
  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "cog-modifier-panel";
    panel.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100vh;
    background: #f5f5f5;
    border-left: 1px solid #ccc;
    z-index: 10000;
    display: none;
    flex-direction: column;
    font-family: inherit;
  `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `
    padding: 10px;
    background: #e0e0e0;
    border-bottom: 1px solid #ccc;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;

    const title = document.createElement("h3");
    title.textContent = "Stats Modifier";
    title.style.margin = "0";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.onclick = () => {
      panel.style.display = "none";
      stopPolling();
    };

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Controls
    const controls = document.createElement("div");
    controls.style.cssText = `
    padding: 10px;
    border-bottom: 1px solid #ccc;
  `;

    const scopeSelect = document.createElement("select");
    scopeSelect.innerHTML = `
    <option value="all">All Stats</option>
    <option value="permanent">Permanent</option>
    <option value="temporary">Temporary</option>
  `;
    scopeSelect.onchange = () => {
      currentScope = scopeSelect.value;
      renderedCount = 0;
      filterStats();
    };

    const sortSelect = document.createElement("select");
    sortSelect.innerHTML = `
    <option value="name-asc">Name (A-Z)</option>
    <option value="name-desc">Name (Z-A)</option>
    <option value="modified-desc">Last Modified (newest)</option>
    <option value="modified-asc">Last Modified (oldest)</option>
  `;
    sortSelect.value = currentSort;
    sortSelect.onchange = () => {
      currentSort = sortSelect.value;
      renderedCount = 0;
      filterStats();
    };

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search stats...";
    searchInput.style.cssText = `
    width: 100%;
    padding: 5px;
    margin-top: 5px;
  `;
    const debouncedFilter = debounce(() => filterStats(searchInput.value), 300);
    searchInput.oninput = () => {
      searchTerm = searchInput.value;
      debouncedFilter();
    };

    const refreshBtn = document.createElement("button");
    refreshBtn.textContent = "Refresh";
    refreshBtn.onclick = loadStats;
    refreshBtn.style.cssText = `
    margin-left: 10px;
    padding: 5px 10px;
  `;

    controls.appendChild(scopeSelect);
    controls.appendChild(sortSelect);
    controls.appendChild(refreshBtn);
    controls.appendChild(searchInput);

    // List container
    const listContainer = document.createElement("div");
    listContainer.id = "cog-stats-list";
    listContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 10px;
  `;

    panel.appendChild(header);
    panel.appendChild(controls);
    panel.appendChild(listContainer);

    document.body.appendChild(panel);

    return panel;
  }

  function startPolling() {
    if (pollingInterval) return; // already polling
    pollingInterval = setInterval(() => {
      const panel = document.getElementById("cog-modifier-panel");
      if (panel && panel.style.display !== "none") {
        loadStats();
      }
    }, 1000);
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  function togglePanel() {
    const panel = document.getElementById("cog-modifier-panel");
    if (!panel) return;

    if (panel.style.display === "none" || !panel.style.display) {
      loadStats();
      panel.style.display = "flex";
      startPolling();
    } else {
      panel.style.display = "none";
      stopPolling();
    }
  }

  function loadStats() {
    window.postMessage({ type: "getStats" }, "*");
  }

  function filterStats(term = searchTerm) {
    searchTerm = term;
    const lowerTerm = term.toLowerCase();
    filteredStats = [];

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

    renderedCount = 0;
    renderStats();
  }

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

  function createStatItem(stat) {
    const item = document.createElement("div");
    item.style.cssText = `
    margin-bottom: 10px;
    padding: 5px;
    border: 1px solid #ddd;
    border-radius: 3px;
    background: white;
  `;

    const label = document.createElement("div");
    label.textContent = `${stat.scope}: ${stat.key}`;
    label.style.fontWeight = "bold";

    const valueDisplay = document.createElement("div");

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
    const key = `${stat.scope}:${stat.key}`;
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

    item.appendChild(label);
    item.appendChild(valueDisplay);
    item.appendChild(editBtn);

    return item;
  }

  function editStat(stat) {
    const newValue = prompt(`Edit ${stat.key} (${stat.type}):`, stat.value);
    if (newValue === null) return;

    window.postMessage(
      {
        type: "setStat",
        data: {
          scope: stat.scope,
          key: stat.key,
          value: newValue,
          valueType: stat.type,
        },
      },
      "*",
    );
  }

  // Listen for bridge responses
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    const { type, permanent, temps, success, error } = event.data;

    if (type === "statsResponse") {
      if (error) {
        console.error("Stats error:", error);
        return;
      }
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
        const prev = previousStatsData.permanent.find(
          (p) => p.key === stat.key,
        );
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
        const prev = previousStatsData.permanent.find(
          (p) => p.key === stat.key,
        );
        if (prev && prev.value !== stat.value) {
          changeIndicators.set(key, { from: prev.value, type: prev.type });
        }
      });

      // Update change indicators for temporary stats
      newTemps.forEach((stat) => {
        const key = `temporary:${stat.key}`;
        const prev = previousStatsData.temps.find((p) => p.key === stat.key);
        if (prev && prev.value !== stat.value) {
          changeIndicators.set(key, { from: prev.value, type: prev.type });
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
  injectButton();
  createPanel();

  // Watch for DOM changes that might remove the button
  const observer = new MutationObserver((mutations) => {
    const buttonsDiv = document.getElementById("buttons");
    const button = document.getElementById("cog-modifier-button");
    if (button) {
      // Re-bind the event listener in case the element was replaced
      button.addEventListener("click", togglePanel);
    } else if (buttonsDiv) {
      injectButton();
    }
    const panel = document.getElementById("cog-modifier-panel");
    if (!panel) {
      createPanel();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also poll every second to ensure button is present
  setInterval(() => {
    const buttonsDiv = document.getElementById("buttons");
    const button = document.getElementById("cog-modifier-button");
    if (buttonsDiv && !button) {
      injectButton();
    }
  }, 1000);
}
