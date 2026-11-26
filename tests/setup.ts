import { beforeEach, vi } from "vitest";
Object.defineProperty(document, "hidden", {
  configurable: true,
  get: () => false,
});
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
