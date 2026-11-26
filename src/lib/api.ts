export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export type Parameters = Record<string, string | number | boolean | undefined>;
export class QbitApi {
  version = "";
  async request<T = unknown>(
    endpoint: string,
    parameters: Parameters = {},
    method: "GET" | "POST" = "GET",
    form?: FormData,
  ): Promise<T> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters))
      if (value !== undefined) query.set(key, String(value));
    const response = await fetch(
      `/api/v2/${endpoint}${method === "GET" && query.size ? "?" + query : ""}`,
      {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers:
          method === "POST" && !form
            ? {
                "Content-Type":
                  "application/x-www-form-urlencoded;charset=UTF-8",
              }
            : undefined,
        body: method === "POST" ? (form ?? query) : undefined,
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new ApiError(
        response.status === 403
          ? "Your qBittorrent session expired."
          : `qBittorrent returned ${response.status} for ${endpoint}.`,
        response.status,
      );
    const text = await response.text();
    if (text.trim() === "Fails." && endpoint !== "auth/login")
      throw new ApiError(
        "qBittorrent could not complete " + endpoint + ".",
        400,
      );
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }
  get<T = unknown>(endpoint: string, parameters: Parameters = {}) {
    return this.request<T>(endpoint, parameters);
  }
  post<T = unknown>(
    endpoint: string,
    parameters: Parameters = {},
    form?: FormData,
  ) {
    return this.request<T>(endpoint, parameters, "POST", form);
  }
  async connect() {
    this.version = await this.get<string>("app/version");
    return this.version;
  }
  async login(username: string, password: string) {
    const result = await this.post<string>("auth/login", {
      username,
      password,
    });
    if (result.trim() !== "Ok.")
      throw new ApiError("That username or password was not accepted.", 401);
    return this.connect();
  }
  async transfer(action: "start" | "stop", hashes: string[]) {
    if (!hashes.length) return;
    const legacy = parseInt(this.version.replace(/^v/, "")) < 5;
    await this.post(
      `torrents/${legacy ? (action === "start" ? "resume" : "pause") : action}`,
      { hashes: hashes.join("|") },
    );
  }
}
export const api = new QbitApi();
