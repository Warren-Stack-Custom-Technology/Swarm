# Changelog

## 1.1.0

- Replace numeric seeding codes with Use global limits, Unlimited, and Custom choices; show the inherited ratio and current action.
- Fix share-limit saves with qBittorrent 5.3 by sending the required action and match-mode fields.
- Preserve untouched speed limits, seeding times, actions, and match modes, including mixed bulk selections.
- Show each transfer’s seeding cutoff and whether downloaders are currently connected in the inspector.
- Add a shared, collapsible upload/download speed tracker to Atlas, Library, and expanded workspaces.
- Include Session, 5-minute, 30-minute, 1-hour, 3-hour, 6-hour, 12-hour, and 24-hour graph periods, independent series toggles, and hover readings.
- Show qBittorrent session and all-time transfer totals. Keep up to 24 hours of page-collected history and leave missing samples as gaps.

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
