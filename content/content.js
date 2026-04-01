// Content script for Choice of Games Stats Modifier

// Check if on eligible page
function isEligiblePage() {
  if (window.location.hostname !== 'www.choiceofgames.com') return false;

  const path = window.location.pathname;
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    const canonicalUrl = new URL(canonical.href);
    if (canonicalUrl.hostname !== 'www.choiceofgames.com') return false;
  }

  // Match /game-name/ or /user-contributed/game-name/
  return /^\/(user-contributed\/)?[^\/]+\/$/.test(path);
}

if (!isEligiblePage()) return;

// Inject bridge script
const bridgeScript = document.createElement('script');
bridgeScript.src = chrome.runtime.getURL('page-bridge/bridge.js');
(document.head || document.documentElement).appendChild(bridgeScript);

// State
let statsData = { permanent: [], temps: [] };
let filteredStats = [];
let currentScope = 'all'; // all, permanent, temporary
let searchTerm = '';
let renderedCount = 0;
const CHUNK_SIZE = 50;

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
  const buttonsDiv = document.getElementById('buttons');
  if (!buttonsDiv) return;

  const modifierButton = document.createElement('button');
  modifierButton.id = 'cog-modifier-button';
  modifierButton.className = 'spacedLink';
  modifierButton.textContent = 'Modifier';
  modifierButton.onclick = togglePanel;

  buttonsDiv.appendChild(modifierButton);
}

// Create panel
function createPanel() {
  const panel = document.createElement('div');
  panel.id = 'cog-modifier-panel';
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
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 10px;
    background: #e0e0e0;
    border-bottom: 1px solid #ccc;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;

  const title = document.createElement('h3');
  title.textContent = 'Stats Modifier';
  title.style.margin = '0';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.onclick = () => panel.style.display = 'none';

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Controls
  const controls = document.createElement('div');
  controls.style.cssText = `
    padding: 10px;
    border-bottom: 1px solid #ccc;
  `;

  const scopeSelect = document.createElement('select');
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

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search stats...';
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

  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Refresh';
  refreshBtn.onclick = loadStats;
  refreshBtn.style.cssText = `
    margin-left: 10px;
    padding: 5px 10px;
  `;

  controls.appendChild(scopeSelect);
  controls.appendChild(refreshBtn);
  controls.appendChild(searchInput);

  // List container
  const listContainer = document.createElement('div');
  listContainer.id = 'cog-stats-list';
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

function togglePanel() {
  const panel = document.getElementById('cog-modifier-panel');
  if (!panel) return;

  if (panel.style.display === 'none' || !panel.style.display) {
    loadStats();
    panel.style.display = 'flex';
  } else {
    panel.style.display = 'none';
  }
}

function loadStats() {
  window.postMessage({ type: 'getStats' }, '*');
}

function filterStats(term = searchTerm) {
  searchTerm = term;
  const lowerTerm = term.toLowerCase();
  filteredStats = [];

  if (currentScope === 'all' || currentScope === 'permanent') {
    filteredStats.push(...statsData.permanent.filter(stat =>
      stat.key.toLowerCase().includes(lowerTerm)
    ).map(stat => ({ ...stat, scope: 'permanent' })));
  }

  if (currentScope === 'all' || currentScope === 'temporary') {
    filteredStats.push(...statsData.temps.filter(stat =>
      stat.key.toLowerCase().includes(lowerTerm)
    ).map(stat => ({ ...stat, scope: 'temporary' })));
  }

  renderedCount = 0;
  renderStats();
}

function renderStats() {
  const listContainer = document.getElementById('cog-stats-list');
  if (!listContainer) return;

  // Clear previous content
  listContainer.innerHTML = '';

  if (filteredStats.length === 0) {
    listContainer.innerHTML = '<p>No stats found.</p>';
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
    const loadMoreBtn = document.createElement('button');
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

function createStatItem(stat) {
  const item = document.createElement('div');
  item.style.cssText = `
    margin-bottom: 10px;
    padding: 5px;
    border: 1px solid #ddd;
    border-radius: 3px;
    background: white;
  `;

  const label = document.createElement('div');
  label.textContent = `${stat.scope}: ${stat.key}`;
  label.style.fontWeight = 'bold';

  const valueDisplay = document.createElement('div');
  valueDisplay.textContent = `Value: ${stat.value} (${stat.type})`;

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.onclick = () => editStat(stat);

  item.appendChild(label);
  item.appendChild(valueDisplay);
  item.appendChild(editBtn);

  return item;
}

function editStat(stat) {
  const newValue = prompt(`Edit ${stat.key} (${stat.type}):`, stat.value);
  if (newValue === null) return;

  window.postMessage({
    type: 'setStat',
    data: {
      scope: stat.scope,
      key: stat.key,
      value: newValue,
      valueType: stat.type
    }
  }, '*');
}

// Listen for bridge responses
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const { type, permanent, temps, success, error } = event.data;

  if (type === 'statsResponse') {
    if (error) {
      console.error('Stats error:', error);
      return;
    }
    statsData = { permanent: permanent || [], temps: temps || [] };
    renderedCount = 0;
    filterStats();
  } else if (type === 'setResponse') {
    if (success) {
      loadStats(); // Refresh
    } else {
      alert('Failed to set stat: ' + error);
    }
  }
});

// Initialize
injectButton();
createPanel();