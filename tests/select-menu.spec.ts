import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import SelectMenu from "../src/components/SelectMenu.vue";
let wrappers: ReturnType<typeof mount>[] = [];
const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta", disabled: true },
  { value: "c", label: "Charlie" },
];
afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  wrappers = [];
  vi.restoreAllMocks();
});
async function menu(extra: Record<string, unknown> = {}) {
  const wrapper = mount(SelectMenu, {
    attachTo: document.body,
    props: { modelValue: "a", options, label: "Example", ...extra },
  });
  wrappers.push(wrapper);
  await wrapper.get("[role=combobox]").trigger("click");
  await flushPromises();
  return wrapper;
}
function press(key: string) {
  document
    .querySelector("[role=listbox]")!
    .dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}
describe("themed selection menus", () => {
  test("opens one real option list outside clipping panels and chooses a value", async () => {
    const wrapper = await menu();
    expect(document.querySelectorAll("[role=listbox]")).toHaveLength(1);
    expect(wrapper.find("[role=listbox]").exists()).toBe(false);
    const item = Array.from(document.querySelectorAll("[role=option]")).find(
      (item) => item.textContent === "Charlie",
    )!;
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")).toEqual([["c"]]);
    expect(document.querySelector("[role=listbox]")).toBeNull();
  });
  test("supports keyboard selection while skipping disabled options", async () => {
    const wrapper = await menu();
    press("ArrowDown");
    await flushPromises();
    press("Enter");
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")).toEqual([["c"]]);
  });
  test("Escape restores focus and does not reach the surrounding workspace", async () => {
    const parent = vi.fn();
    document.addEventListener("keydown", parent);
    const wrapper = await menu();
    press("Escape");
    await flushPromises();
    expect(parent).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(wrapper.get("[role=combobox]").element);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    document.removeEventListener("keydown", parent);
  });
  test("keeps a selection through refreshed options and changing labels", async () => {
    const wrapper = await menu({ modelValue: "c", searchable: true });
    const input = document.querySelector<HTMLInputElement>(".select-search")!;
    input.value = "char";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    await wrapper.setProps({
      options: [
        { value: "a", label: "Alpha" },
        { value: "c", label: "Charlie · disconnected" },
      ],
    });
    expect(wrapper.get("[role=combobox]").text()).toContain("disconnected");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(document.querySelectorAll("[role=option]")).toHaveLength(1);
  });
  test("retains a selected option beyond the initial long-list window", async () => {
    await menu({
      modelValue: "249",
      options: Array.from({ length: 250 }, (_, i) => ({
        value: String(i),
        label: "Peer " + i,
      })),
    });
    expect(document.querySelectorAll("[role=option]")).toHaveLength(200);
    expect(
      document.querySelector("[aria-selected=true]")?.textContent,
    ).toContain("249");
  });
  test("places a menu above a low trigger and inside a narrow viewport", async () => {
    const wrapper = mount(SelectMenu, {
      attachTo: document.body,
      props: { modelValue: "a", options, label: "Position" },
    });
    wrappers.push(wrapper);
    const button = wrapper.get("[role=combobox]").element;
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      left: window.innerWidth - 60,
      right: window.innerWidth - 10,
      top: window.innerHeight - 45,
      bottom: window.innerHeight - 5,
      width: 50,
      height: 40,
      x: 0,
      y: 0,
      toJSON() {},
    });
    await wrapper.get("[role=combobox]").trigger("click");
    await flushPromises();
    const panel = document.querySelector<HTMLElement>(".select-popover")!;
    expect(panel.style.bottom).not.toBe("");
    expect(
      parseFloat(panel.style.left) + parseFloat(panel.style.width),
    ).toBeLessThanOrEqual(window.innerWidth - 12);
    expect(parseFloat(panel.style.maxHeight)).toBeLessThanOrEqual(420);
  });
  test("preserves numeric values and closes on an outside pointer press", async () => {
    const wrapper = await menu({
      modelValue: 1,
      options: [
        { value: 1, label: "Normal" },
        { value: 7, label: "Maximum" },
      ],
    });
    const item = document.querySelectorAll("[role=option]")[1];
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")).toEqual([[7]]);
    await wrapper.get("[role=combobox]").trigger("click");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(document.querySelector("[role=listbox]")).toBeNull();
  });
});
