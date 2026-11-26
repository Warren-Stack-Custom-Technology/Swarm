import { describe, expect, test } from "vitest";
import { torrentIdentityHash } from "../src/lib/identity";
import {
  legacyString,
  allocateIdentities,
  identity,
  preferences,
  vividColor,
} from "../src/lib/preferences";
describe("migration of VueUse string preferences", () => {
  test("accepts raw exit addresses", () => {
    localStorage.setItem("old.ip", "1.1.1.1");
    expect(legacyString("old.ip")).toBe("1.1.1.1");
  });
  test("accepts JSON string preferences", () => {
    localStorage.setItem("old.mode", '"flat"');
    expect(legacyString("old.mode")).toBe("flat");
  });
  test("accepts raw mode preferences", () => {
    localStorage.setItem("old.mode", "flat");
    expect(legacyString("old.mode")).toBe("flat");
  });
  test("preserves the default for absent preferences", () => {
    expect(legacyString("absent.key", "globe")).toBe("globe");
  });
});

describe("readable identities", () => {
  test("allocates distinct colours even when eight torrent hashes collide in the palette", () => {
    preferences.identities = {};
    preferences.vivid = true;
    const hashes = Array.from({ length: 100 }, (_, i) => String(i))
      .filter((hash) => torrentIdentityHash(hash) % 8 === 0)
      .slice(0, 8);
    allocateIdentities(hashes);
    expect(new Set(hashes.map((hash) => identity(hash).color)).size).toBe(8);
  });
  test("adding a transfer does not recolour existing automatic identities", () => {
    preferences.identities = {};
    const hashes = ["one", "two", "three"];
    allocateIdentities(hashes);
    const before = hashes.map(identity);
    allocateIdentities([...hashes, "four"]);
    expect(hashes.map(identity)).toEqual(before);
  });
  test("brightens muted colours without changing them on every subsequent pass", () => {
    const bright = vividColor("#9f85b8");
    expect(bright).not.toBe("#9f85b8");
    expect(vividColor(bright)).toBe(bright);
  });
  test("lets users retain an exact custom colour with vivid mode disabled", () => {
    preferences.identities = { chosen: { color: "#9f85b8", shape: "star" } };
    preferences.vivid = false;
    expect(identity("chosen").color).toBe("#9f85b8");
    preferences.vivid = true;
  });
});
