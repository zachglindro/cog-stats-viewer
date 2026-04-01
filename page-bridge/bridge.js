// Page bridge for Choice of Games Stats Modifier
// Runs in page context to access window.stats

window.addEventListener('message', (event) => {
  // Only accept messages from the same window (content script isolation)
  if (event.source !== window) return;

  // Validate origin if needed, but for now trust the extension

  const { type, data } = event.data;

  if (type === 'getStats') {
    try {
      const permanent = window.stats ? Object.entries(window.stats).filter(([key, value]) => {
        // Filter out internal/private keys and complex objects
        return !key.startsWith('_') && typeof value !== 'object' && value !== null;
      }).map(([key, value]) => ({
        key,
        value,
        type: typeof value
      })) : [];

      const temps = window.stats?.scene?.temps ? Object.entries(window.stats.scene.temps).filter(([key, value]) => {
        return typeof value !== 'object' && value !== null;
      }).map(([key, value]) => ({
        key,
        value,
        type: typeof value
      })) : [];

      window.postMessage({
        type: 'statsResponse',
        permanent,
        temps
      }, '*');
    } catch (error) {
      window.postMessage({
        type: 'statsResponse',
        error: error.message
      }, '*');
    }
  } else if (type === 'setStat') {
    const { scope, key, value, valueType } = data;
    try {
      let parsedValue;
      if (valueType === 'number') {
        parsedValue = Number(value);
      } else if (valueType === 'boolean') {
        parsedValue = Boolean(value);
      } else if (valueType === 'string') {
        parsedValue = String(value);
      } else {
        parsedValue = value; // unknown or null
      }

      if (scope === 'permanent') {
        if (window.stats) {
          window.stats[key] = parsedValue;
        }
      } else if (scope === 'temporary') {
        if (window.stats?.scene?.temps) {
          window.stats.scene.temps[key] = parsedValue;
        }
      }

      window.postMessage({
        type: 'setResponse',
        success: true,
        key,
        scope
      }, '*');
    } catch (error) {
      window.postMessage({
        type: 'setResponse',
        error: error.message
      }, '*');
    }
  }
});