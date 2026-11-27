// Development-only, explicitly labelled fixture backend. Never imported in a production build.
import type { Torrent } from "./types";
import { preferences } from "./lib/preferences";
const names = [
  "Ubuntu 26.04 LTS · Desktop",
  "Debian 13.1 · Network installer",
  "Blender studio · Open movie collection",
  "Fedora Workstation 43",
  "Arch Linux · Monthly image",
  "Public domain field recordings",
];
export function installDemo() {
  const torrents: Record<string, Torrent> = {};
  let rid = 0;
  for (let i = 0; i < names.length; i++) {
    const hash = (i + 1).toString(16).padStart(40, "a");
    torrents[hash] = {
      hash,
      name: names[i],
      state: i === 0 ? "downloading" : i === 5 ? "stoppedUP" : "uploading",
      progress: i === 0 ? 0.63 : 1,
      size: (i + 1) * 1_000_000_000,
      dlspeed: i === 0 ? 2_500_000 : 0,
      upspeed: i === 5 ? 0 : (i + 1) * 350_000,
      downloaded: (i + 1) * 1_000_000_000,
      uploaded: i * 800_000_000,
      ratio: i * 0.4,
      eta: i === 0 ? 380 : 8640000,
      num_seeds: 12,
      num_leechs: 26,
      added_on: 1764000000 - i * 2000,
      save_path: "D:\\Transfers",
      category: i < 3 ? "Software" : "Media",
      tags: i % 2 ? "archive" : "linux",
      dl_limit: 0,
      up_limit: 0,
      seq_dl: false,
    };
  }
  const cities = [
    [-122, 49, "Vancouver"],
    [-74, 41, "New York"],
    [-0.1, 51, "London"],
    [13.4, 52.5, "Berlin"],
    [139.7, 35.7, "Tokyo"],
    [151.2, -33.8, "Sydney"],
    [103.8, 1.3, "Singapore"],
    [18.4, -33.9, "Cape Town"],
  ];
  preferences.geoEnabled = true;
  const response = (data: unknown, status = 200) =>
    new Response(typeof data === "string" ? data : JSON.stringify(data), {
      status,
    });
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    options?: RequestInit,
  ) => {
    const url = new URL(String(input), location.origin),
      path = url.pathname.replace("/api/v2/", "");
    const params =
      options?.body instanceof URLSearchParams
        ? options.body
        : url.searchParams;
    if (url.hostname === "get.geojs.io")
      return response(
        (url.searchParams.get("ip") ?? "").split(",").map((ip, index) => {
          const city =
            ip === "1.1.1.1"
              ? cities[0]
              : cities[Number(ip.split(".").at(-1)) % cities.length];
          return {
            ip,
            longitude: String(city[0]),
            latitude: String(city[1]),
            city: city[2],
            country: "Demo location",
          };
        }),
      );
    if (path === "app/version") return response("v5.2.0");
    if (path === "sync/maindata")
      return response({
        rid: ++rid,
        full_update: true,
        torrents,
        server_state: {
          dl_info_data: 2_147_483_648,
          up_info_data: 4_294_967_296,
          alltime_dl: 1_099_511_627_776,
          alltime_ul: 2_199_023_255_552,
          dl_info_speed: 2_500_000,
          up_info_speed: 5_250_000,
          connection_status: "connected",
          free_space_on_disk: 340_000_000_000,
          last_external_address_v4: "1.1.1.1",
        },
        categories: {
          Software: { name: "Software", savePath: "" },
          Media: { name: "Media", savePath: "" },
        },
        tags: ["linux", "archive"],
      });
    if (path === "sync/torrentPeers") {
      const peers = Object.fromEntries(
        Array.from({ length: 24 }, (_, i) => {
          const ip = `8.8.8.${i + 1}`;
          return [
            `${ip}:6881`,
            {
              ip,
              port: 6881,
              client: "qBittorrent 5.2",
              country: String(cities[i % 8][2]),
              progress: i % 3 === 0 ? 1 : 0.4,
              dl_speed: i % 3 === 0 ? 150_000 : 0,
              up_speed: i % 3 === 0 ? 0 : 18_000,
              downloaded: 1_000_000,
              uploaded: 500_000,
            },
          ];
        }),
      );
      return response({ rid: ++rid, full_update: true, peers });
    }
    if (path === "torrents/properties")
      return response({ seeding_time: 51000, availability: 3.2 });
    if (path === "torrents/files")
      return response([
        {
          index: 0,
          name: "image.iso",
          size: 4_000_000_000,
          progress: 0.63,
          priority: 1,
        },
        { index: 1, name: "README.txt", size: 4200, progress: 1, priority: 1 },
      ]);
    if (path === "torrents/trackers")
      return response([
        {
          url: "https://tracker.example.org/announce",
          status: 2,
          num_seeds: 34,
          num_peers: 28,
          msg: "",
        },
      ]);
    if (path === "torrents/start" || path === "torrents/stop") {
      for (const hash of String(params.get("hashes") ?? "").split("|"))
        if (torrents[hash])
          torrents[hash].state = path.endsWith("stop")
            ? "stoppedUP"
            : "uploading";
      return response("");
    }
    if (path === "torrents/delete") {
      for (const hash of String(params.get("hashes") ?? "").split("|"))
        delete torrents[hash];
      return response("");
    }
    if (path === "torrents/rename") {
      const t = torrents[String(params.get("hash"))];
      if (t) t.name = String(params.get("name"));
      return response("");
    }
    if (path === "app/preferences")
      return response({
        save_path: "D:\\Transfers",
        listen_port: 6881,
        upnp: false,
        dht: true,
        pex: true,
        lsd: false,
        dl_limit: 0,
        up_limit: 0,
        queueing_enabled: true,
        max_active_downloads: 3,
        max_active_uploads: 20,
        max_active_torrents: 25,
      });
    if (path === "search/plugins" || path === "log/main") return response([]);
    if (path === "rss/items") return response({});
    return response("");
  }) as typeof fetch;
}
