import { afterEach, describe, expect, test, vi } from "vitest";
import { GeoLookup, isPublicIp, parseGeoLocation } from "../src/lib/geo";
import { mergePeers as mergePeerSnapshot } from "../src/lib/store";
import type { Peer } from "../src/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("swarm peer synchronization", () => {
  test("merges sparse deltas without losing IP or speed, removes disconnected peers, and clears on a full update", () => {
    const initial = mergePeerSnapshot(undefined, {
      rid: 1,
      full_update: true,
      peers: {
        first: {
          ip: "8.8.8.8",
          dl_speed: 100,
          up_speed: 50,
          progress: 1,
        } as Peer,
        removed: { ip: "1.1.1.1" } as Peer,
      },
    });
    const next = mergePeerSnapshot(initial, {
      rid: 2,
      peers: { first: { dl_speed: 0 } as Peer },
      peers_removed: ["removed"],
    });
    expect(next.peers.first).toMatchObject({
      ip: "8.8.8.8",
      dl_speed: 0,
      up_speed: 50,
      progress: 1,
    });
    expect(next.peers.removed).toBeUndefined();
    expect(initial.peers.first.dl_speed).toBe(100);
    expect(
      mergePeerSnapshot(next, { rid: 3, full_update: true }).peers,
    ).toEqual({});
  });
});

describe("swarm location lookups", () => {
  test.each([
    "10.0.0.1",
    "192.168.1.1",
    "127.0.0.1",
    "172.31.4.1",
    "169.254.1.2",
    "100.64.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "198.51.100.2",
    "203.0.113.4",
    "256.4.4.4",
    "1.2.3.04",
    "example.com",
    "",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:192.168.1.1",
    "2001:db8::1",
    "2001:0::1",
    "2002:c0a8:101::",
  ])("does not send non-public address %s", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });
  test.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.32.0.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("accepts public address %s", (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  test("rejects missing and invalid coordinates while preserving legitimate zero coordinates", () => {
    expect(
      parseGeoLocation({ ip: "8.8.8.8", latitude: null, longitude: 20 }),
    ).toBeUndefined();
    expect(
      parseGeoLocation({ ip: "8.8.8.8", latitude: "", longitude: 20 }),
    ).toBeUndefined();
    expect(
      parseGeoLocation({ ip: "8.8.8.8", latitude: 91, longitude: 20 }),
    ).toBeUndefined();
    expect(
      parseGeoLocation({ ip: "8.8.8.8", latitude: "0", longitude: "0" }),
    ).toMatchObject({ latitude: 0, longitude: 0 });
  });

  test("requests explicit addresses, batches and caches results without looking up the browser IP", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            ip: "8.8.8.8",
            latitude: "40",
            longitude: "-70",
            city: "Test city",
            country: "Test country",
          },
        ]),
    });
    vi.stubGlobal("fetch", fetcher);
    const lookup = new GeoLookup();
    const signal = new AbortController().signal;
    await lookup.lookup(["8.8.8.8", "8.8.8.8", "10.0.0.1", "1.1.1.1"], signal);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("ip")).toBe(
      "8.8.8.8,1.1.1.1",
    );
    expect(lookup.get("8.8.8.8")?.label).toBe("Test city, Test country");
    await lookup.lookup(["8.8.8.8", "1.1.1.1"], signal);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  test("backs off for a minute after rate limiting, then retries", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal("fetch", fetcher);
    const lookup = new GeoLookup();
    const signal = new AbortController().signal;
    await expect(lookup.lookup(["8.8.8.8"], signal)).rejects.toThrow("busy");
    await lookup.lookup(["8.8.8.8"], signal);
    expect(fetcher).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_001);
    await lookup.lookup(["8.8.8.8"], signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("does not cache cancelled responses", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ ip: "8.8.8.8", latitude: 40, longitude: -70 }),
        });
      }),
    );
    const lookup = new GeoLookup();
    await lookup.lookup(["8.8.8.8"], controller.signal);
    expect(lookup.get("8.8.8.8")).toBeUndefined();
  });
});
