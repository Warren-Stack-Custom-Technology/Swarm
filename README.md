<p align="left"><img src="public/swarm-mark-v2.svg" width="58" height="58" alt="Swarm logo"></p>

# Swarm

**A quieter qBittorrent WebUI. Watch your connections, manage your transfers, and keep the details that matter in view.**

Swarm is an independent frontend for qBittorrent, with an open workspace, a flat transfer list, and a lightweight globe. It connects directly to the qBittorrent Web API. No extra server, CDN, map tiles, VueTorrent runtime, or hosted account is required.

## What it does

- **Connection atlas:** a shaded globe and flat map, with raised routes from the torrent engine's exit address to connected peers.
- **Show most:** rotate the globe to bring more peer locations onto the visible side while keeping your exit in view. Runs only when clicked.
- **Readable interface:** 16px base text, larger controls, and adjustable interface scale up to 150%. No tiny 10px labels.
- **Readable identities:** six large shape identities, a vivid colour palette, and automatic colour allocation that avoids duplicates across the first eight transfers. Shapes stay upright so squares and diamonds remain distinct.
- **Traffic you can follow:** shapes move toward you for downloads and away for uploads. Their movement follows each connection's current speed. Marker size and vivid-colour mode are adjustable.
- **Clear controls:** the sidebar owns search, filters and sorting. Library shows a single full table. Searchable dark menus support keyboard navigation, and each sidebar row shows its share ratio.
- **Persistent inspection:** keep a torrent or peer pinned while expanding the workspace, switching projections, or receiving live updates. Disconnected peers remain as labelled last-seen snapshots.
- **Everyday transfer tools:** magnets, torrent files, start/stop, bulk selection, file priorities, trackers, names, save locations, speed/share limits, categories, tags, sequential download, recheck and reannounce.
- **Useful extras:** installed search plugins, RSS articles, activity logs, and common qBittorrent settings.

## Install

Download **Swarm-1.0.2.zip** from [Releases](../../releases/latest) and extract it.

On Windows, run `Apply-Update.ps1` from Administrator PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Apply-Update.ps1
```

Then open qBittorrent → **Options → Web UI**, enable **Use alternative WebUI**, and set **Files location** to:

```text
C:\Program Files\Swarm\webui
```

Use the `webui` directory, without appending `public`. Refresh your WebUI with **Ctrl+F5**. The installer verifies file checksums before activating the UI and keeps a previous Swarm installation for rollback.

For Linux, containers, or manual installation, extract the release and point qBittorrent's alternative WebUI setting at the extracted `webui` directory. Configure qBittorrent's own WebUI account and network access as usual. Swarm uses that existing session.

## Controls

| Action | Control |
| --- | --- |
| Inspect a transfer | Select its row |
| Inspect a connection | Select a marker or visible path, or use the searchable connection picker |
| Bring more connections into view | Show most (Globe view) |
| Focus the map | Select a transfer in the sidebar, or use **Focus atlas** in its inspector |
| Return to the whole swarm | Clear the map focus; transfer filters still apply |
| Rotate / pan | Drag |
| Zoom / reset | Scroll / **Fit** or **Home** |
| Add a transfer | **Ctrl+O** |
| Find a transfer | **Ctrl+F** |
| Leave expanded view | **Escape**; the inspector stays pinned |

## Location and privacy

IP geolocation is **opt-in** on a fresh installation. Enabling it sends public peer and exit IP addresses to GeoJS; that provider can also see the browser's public address. Torrent names, hashes, credentials and files are not sent to the location provider. Locations are approximate, not GPS positions.

The atlas uses the exit address reported by **qBittorrent**, with an optional manual override. It never silently substitutes the browser's address. It is a visualization, not a VPN protection check.

UI preferences are stored in your browser. Swarm does not include analytics or an application telemetry endpoint.

## Performance

The map uses cached canvas layers and particle sprites, a 30 fps cap, a 900-marker budget, and a maximum 1.5 device-pixel ratio. Selected traffic is prioritized within the budget. Active trajectories remain visible with idle routes disabled; idle endpoints stay available for inspection. Continuous motion stops when the tab or atlas is hidden, when reduced motion is requested, or when no visible route carries traffic.

Main data refreshes every 1.5 seconds. Peer refreshes run every 3 seconds for the inspected transfer and a rotating background batch, with at most four peer requests per cycle. Location lookups are batched, cached and independent of transfer refreshes. Motion represents flow, not literal captured packets.

## Build

Requires Node.js 22.12+ or 24+.

```sh
npm ci
npm test
npm run build
python3 scripts/package_release.py
```

The static app is built to `build/webui/public`; the distributable is written to `artifacts/Swarm-1.0.2.zip`.

```sh
npm run dev
```

Development proxies `/api` to `http://127.0.0.1:8080`; set `QBIT_URL` to use another engine. Production uses same-origin `/api/v2/`. An explicitly labelled development demo is available with `VITE_SWARM_DEMO=true`; its backend and fixture data are excluded from production builds.

## Scope

Targets current qBittorrent 5.x, with compatibility handling for the 4.x pause/resume and add-paused endpoints. Available features depend on your engine version and installed search plugins.

Advanced engine configuration, torrent creation, file renaming, peer banning, manual queue position, search-plugin installation and RSS rule editing remain in qBittorrent's other interfaces. Existing RSS rules keep running in the engine. Search shows up to 200 results; each RSS feed shows its first 50 returned articles.

## License

Swarm application code is **MIT licensed**. Third-party code and map data retain their own notices in [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt). The runtime uses Vue (MIT), d3-geo and its dependencies (permissive licenses), and public-domain Natural Earth map data. No VueTorrent application code, components, styles or logo are included.
