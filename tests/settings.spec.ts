import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import Settings from "../src/components/Settings.vue";
import { state, stop } from "../src/lib/store";
let wrapper: ReturnType<typeof mount> | undefined;
function response(value: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      typeof value === "string" ? value : JSON.stringify(value),
  };
}
beforeEach(() => {
  stop();
  state.authenticated = false;
  state.busy = false;
  state.error = "";
});
afterEach(async () => {
  wrapper?.unmount();
  wrapper = undefined;
  await flushPromises();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("server settings", () => {
  test("sends only changed fields and converts KiB/s once", async () => {
    const server = {
      save_path: "D:\\Transfers",
      dl_limit: 1024,
      up_limit: 0,
      queueing_enabled: true,
      max_active_downloads: 3,
      current_network_interface: "VPN",
      web_ui_password: "protected",
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      response(String(input).includes("app/preferences") ? server : ""),
    );
    vi.stubGlobal("fetch", fetcher);
    wrapper = mount(Settings);
    await wrapper
      .get(".settings-layout nav button:nth-child(2)")
      .trigger("click");
    await flushPromises();
    const numberInputs = wrapper.findAll('input[type="number"]');
    await numberInputs[numberInputs.length - 2].setValue(12);
    await wrapper.get("footer .primary").trigger("click");
    await flushPromises();
    const call = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith("app/setPreferences"),
    ) as unknown as [string, RequestInit];
    expect(call).toBeTruthy();
    expect(JSON.parse((call[1].body as URLSearchParams).get("json")!)).toEqual({
      dl_limit: 12288,
    });
  });
  test("stops a search whose start completes after settings closes", async () => {
    let resolveStart: (value: unknown) => void = () => {};
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("search/start"))
        return new Promise((resolve) => (resolveStart = resolve));
      return Promise.resolve(
        response(
          path.includes("search/plugins")
            ? [{ name: "example", fullName: "Example", enabled: true }]
            : "",
        ),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    wrapper = mount(Settings);
    await wrapper
      .get(".settings-layout nav button:nth-child(4)")
      .trigger("click");
    await flushPromises();
    await wrapper.get('[aria-label="Search query"]').setValue("linux");
    await wrapper.get("form.panel-toolbar").trigger("submit");
    wrapper.unmount();
    wrapper = undefined;
    resolveStart(response({ id: 42 }));
    await flushPromises();
    const call = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith("search/stop"),
    ) as unknown as [string, RequestInit];
    expect(call).toBeTruthy();
    expect((call[1].body as URLSearchParams).get("id")).toBe("42");
  });
});
