import type { TorrentShape } from "./lib/identity";
export interface Torrent {
  hash: string;
  name: string;
  state: string;
  progress: number;
  size: number;
  total_size?: number;
  dlspeed: number;
  upspeed: number;
  downloaded: number;
  uploaded: number;
  ratio: number;
  eta: number;
  num_seeds: number;
  num_leechs: number;
  num_complete?: number;
  num_incomplete?: number;
  added_on: number;
  save_path: string;
  content_path?: string;
  category: string;
  tags: string;
  tracker?: string;
  magnet_uri?: string;
  dl_limit?: number;
  up_limit?: number;
  seq_dl?: boolean;
  f_l_piece_prio?: boolean;
  force_start?: boolean;
  auto_tmm?: boolean;
  seeding_time?: number;
  time_active?: number;
  amount_left?: number;
  priority?: number;
  [key: string]: unknown;
}
export interface Peer {
  ip: string;
  port: number;
  client: string;
  country?: string;
  country_code?: string;
  progress: number;
  dl_speed: number;
  up_speed: number;
  downloaded: number;
  uploaded: number;
  flags?: string;
  connection?: string;
  [key: string]: unknown;
}
export interface PeerSnapshot {
  rid?: number;
  peers: Record<string, Peer>;
  updatedAt: number;
}
export interface PeerResponse {
  rid: number;
  full_update?: boolean;
  peers?: Record<string, Partial<Peer>>;
  peers_removed?: string[];
}
export interface GeoLocation {
  ip: string;
  latitude: number;
  longitude: number;
  label: string;
}
export interface Identity {
  color: string;
  shape: TorrentShape;
}
export interface ServerState {
  dl_info_speed?: number;
  up_info_speed?: number;
  alltime_dl?: number;
  alltime_ul?: number;
  dl_info_data?: number;
  up_info_data?: number;
  free_space_on_disk?: number;
  connection_status?: string;
  dht_nodes?: number;
  last_external_address_v4?: string;
  last_external_address_v6?: string;
  [key: string]: unknown;
}
export interface MainResponse {
  rid: number;
  full_update?: boolean;
  torrents?: Record<string, Partial<Torrent>>;
  torrents_removed?: string[];
  server_state?: ServerState;
  categories?: Record<string, { name: string; savePath: string }>;
  categories_removed?: string[];
  tags?: string[];
  tags_removed?: string[];
}
export interface TorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
  priority: number;
  availability?: number;
  is_seed?: boolean;
}
export interface Tracker {
  url: string;
  tier: number;
  status: number;
  num_peers?: number;
  num_seeds?: number;
  num_leeches?: number;
  msg?: string;
}
