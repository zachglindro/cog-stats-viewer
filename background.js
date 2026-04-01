// Background script for Choice of Games Stats Modifier

const modifierTabs = {}; // gameTabId -> modifierTabId

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "openModifierTab") {
    const gameTabId = sender.tab.id;
    chrome.tabs.create(
      {
        url: chrome.runtime.getURL("modifier.html") + "?gameTabId=" + gameTabId,
      },
      (tab) => {
        modifierTabs[gameTabId] = tab.id;
        chrome.tabs.sendMessage(gameTabId, { type: "hidePanel" });
      },
    );
  } else if (message.type === "closeModifierTab") {
    const gameTabId = message.gameTabId;
    const modifierTabId = modifierTabs[gameTabId];
    if (modifierTabId) {
      chrome.tabs.remove(modifierTabId);
      delete modifierTabs[gameTabId];
      chrome.tabs.sendMessage(gameTabId, { type: "showPanel" });
    }
  } else if (message.type === "getStats") {
    const gameTabId = message.gameTabId;
    chrome.tabs.sendMessage(gameTabId, { type: "getStats" });
  } else if (message.type === "setStat") {
    const gameTabId = message.gameTabId;
    chrome.tabs.sendMessage(gameTabId, { type: "setStat", data: message.data });
  } else if (
    message.type === "statsResponse" ||
    message.type === "setResponse"
  ) {
    const gameTabId = sender.tab.id;
    const modifierTabId = modifierTabs[gameTabId];
    if (modifierTabId) {
      chrome.tabs.sendMessage(modifierTabId, message);
    }
  }
});

// Handle manual tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  for (let gameId in modifierTabs) {
    if (modifierTabs[gameId] === tabId) {
      delete modifierTabs[gameId];
      chrome.tabs.sendMessage(parseInt(gameId), { type: "showPanel" });
      break;
    }
  }
});
