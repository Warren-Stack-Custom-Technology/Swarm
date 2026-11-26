import { afterEach, describe, expect, test, vi } from "vitest";
import { QbitApi } from "../src/lib/api";
function reply(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () =>
      Promise.resolve(
        typeof value === "string" ? value : JSON.stringify(value),
      ),
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("direct qBittorrent API", () => {
  test("sends mutations as form POST with same-origin cookies", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(""));
    vi.stubGlobal("fetch", fetcher);
    const api = new QbitApi();
    await api.post("torrents/rename", { hash: "abc", name: "A & B + C" });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("/api/v2/torrents/rename");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("same-origin");
    expect(options.body.get("name")).toBe("A & B + C");
  });
  test("uses modern start/stop and legacy resume/pause correctly", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(""));
    vi.stubGlobal("fetch", fetcher);
    const api = new QbitApi();
    api.version = "v5.2.0";
    await api.transfer("stop", ["abc", "def"]);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v2/torrents/stop");
    expect(fetcher.mock.calls[0][1].body.get("hashes")).toBe("abc|def");
    api.version = "v4.6.7";
    await api.transfer("start", ["abc"]);
    expect(fetcher.mock.calls[1][0]).toBe("/api/v2/torrents/resume");
  });
  test("does not treat rejected additions or an expired session as success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(reply("Fails."))
        .mockResolvedValueOnce(reply("", 403)),
    );
    const api = new QbitApi();
    await expect(api.post("torrents/add", { urls: "bad" })).rejects.toThrow(
      "could not complete",
    );
    await expect(api.get("sync/maindata")).rejects.toMatchObject({
      status: 403,
    });
  });
  test("checks login result and does not store credentials", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply("Fails."))
      .mockResolvedValueOnce(reply("Ok."))
      .mockResolvedValueOnce(reply("v5.2.0"));
    vi.stubGlobal("fetch", fetcher);
    const api = new QbitApi();
    await expect(api.login("user", "bad")).rejects.toMatchObject({
      status: 401,
    });
    await expect(api.login("user", "secret")).resolves.toBe("v5.2.0");
    expect(localStorage.getItem("password")).toBeNull();
  });
  test("does not set multipart Content-Type manually", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply("Ok."));
    vi.stubGlobal("fetch", fetcher);
    const api = new QbitApi(),
      form = new FormData();
    form.append("urls", "magnet:?xt=urn:btih:abc");
    await api.post("torrents/add", {}, form);
    expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
    expect(fetcher.mock.calls[0][1].body).toBe(form);
  });
});
