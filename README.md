# Choice of Games Stats Modifier

A Firefox extension that adds a stats modifier panel to Choice of Games pages, allowing you to view and edit permanent and temporary variables in the game.

## Installation

1. Download or clone this repository.
2. Open Firefox and go to `about:debugging`.
3. Click "This Firefox" in the left sidebar.
4. Click "Load Temporary Add-on".
5. Select the `manifest.json` file from this directory.
6. The extension will be loaded temporarily.

Note: For permanent installation, you would need to package it as an .xpi file, but for development, temporary loading is fine.

## Supported Sites

- https://www.choiceofgames.com/game-name/
- https://www.choiceofgames.com/user-contributed/game-name/

## Usage

1. Navigate to a supported Choice of Games page.
2. Click the "Modifier" button next to the "Show Stats" button.
3. The panel will open on the right side (or full screen on mobile).
4. Use the dropdown to filter by All Stats, Permanent, or Temporary.
5. Use the search box to find specific stats.
6. Click "Edit" on any stat to change its value.
7. Changes are applied immediately to the game.

## Features

- View all permanent and temporary stats
- Search and filter stats (debounced for performance)
- Edit values with type preservation
- Incremental loading for large stat lists (50 at a time)
- Responsive design for desktop and mobile
- Seamless integration with site styling (nightmode/whitemode support)
- Refresh button to reload stats

## Development

- Manifest V3 for modern Firefox
- Content script injects a page bridge to access game state
- No external dependencies

## Notes

- Only works on Choice of Games pages
- Requires the game to have loaded (stats object available)
- Temporary add-on will be unloaded when Firefox restarts
