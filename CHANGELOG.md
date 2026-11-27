# Changelog

## 1.0.3

- Closing the inspector clears its torrent focus and peer highlight, restoring all connections in the current sidebar filter.
- Unpinning a peer also restores the full atlas while keeping transfer details open.
- Apply the same cleanup when closing with Escape or removing the inspected transfer.

## 1.0.2

- Add a Show most globe action that finds a view with fewer peers hidden behind the globe, keeping the exit visible.
- Remove the duplicate torrent ribbon; keep sidebar transfer selection and filtering in one place.
- Show a single transfer table in Library, with shared filter controls and visible sort direction.
- Replace native selects with dark, searchable, keyboard-accessible menus that stay inside the viewport.
- Keep the chosen connection through live option updates, including large lists and disconnected peers.
- Inspect moving traffic markers and visible trajectories, retaining the mouse-down target through motion or disconnection.
- Make live paths clearer without enabling idle routes; prevent disconnected pins from dimming unrelated traffic.
- Preserve peer pins and detail tabs when reopening the same transfer.
- Show a numeric share ratio on every sidebar row.
- Correct map/filter scope and menu Escape/outside-click behavior.

## 1.0.1

- Independent qBittorrent WebUI with an open black-and-charcoal workspace.
- Flat transfer rows and docked inspector panels, with fewer duplicate controls.
- Original Swarm logo, browser icons and a proper settings gear.
- Larger text throughout and an interface-size control up to 150%.
- Larger identity symbols across the library, legend, inspector and traffic map.
- Distinct vivid colours, stable automatic colour allocation and adjustable traffic marker size.
- Globe and flat map with speed-aware bidirectional traffic and cached canvas rendering.
- Torrent and peer inspection survives expansion, projection changes, live updates and disconnects.
- Transfer management, file priorities, trackers, search, RSS and common settings.
- MIT application license with retained third-party notices.
