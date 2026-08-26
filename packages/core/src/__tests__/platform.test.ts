import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlatform, isDesktop, isMobile, isNode, isWeb } from "../utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("platform detection", () => {
  it("detects a plain Node process", () => {
    expect(isNode()).toBe(true);
    expect(isMobile()).toBe(false);
    expect(isWeb()).toBe(false);
    expect(isDesktop()).toBe(false);
    expect(getPlatform()).toBe("node");
  });

  it("detects React Native via navigator.product", () => {
    vi.stubGlobal("window", { navigator: { product: "ReactNative" } });
    expect(isMobile()).toBe(true);
    expect(isWeb()).toBe(false);
    expect(getPlatform()).toBe("mobile");
  });

  it("detects React Native via global navigator.product", () => {
    vi.stubGlobal("navigator", { product: "ReactNative" });
    expect(isMobile()).toBe(true);
    expect(isWeb()).toBe(false);
    expect(getPlatform()).toBe("mobile");
  });

  it("detects a browser window as web", () => {
    vi.stubGlobal("window", { navigator: { product: "Gecko" } });
    expect(isWeb()).toBe(true);
    expect(isMobile()).toBe(false);
    expect(getPlatform()).toBe("web");
  });

  it("detects the Tauri webview as desktop", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    expect(isDesktop()).toBe(true);
    expect(isWeb()).toBe(true);
    expect(getPlatform()).toBe("desktop");
  });
});
