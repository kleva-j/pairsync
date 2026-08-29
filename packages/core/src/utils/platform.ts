/** Runtime platform of the current process, detected without platform SDKs. */
export type RuntimePlatform = "mobile" | "web" | "desktop" | "node" | "unknown";

type GlobalWithWindow = typeof globalThis & {
  navigator?: { product?: string };
  window?: {
    navigator?: { product?: string };
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
  };
};

function globalWithWindow(): GlobalWithWindow {
  return globalThis as GlobalWithWindow;
}

function hasWindow(): boolean {
  return typeof globalWithWindow().window !== "undefined";
}

function runningInReactNative(): boolean {
  const global = globalWithWindow();
  const hasNavigatorProduct = (nav: unknown): nav is { product: string } =>
    typeof nav === "object" && nav !== null && "product" in nav;
  return (
    (hasNavigatorProduct(global.navigator) && global.navigator.product === "ReactNative") ||
    (global.window !== undefined &&
      hasNavigatorProduct(global.window.navigator) &&
      global.window.navigator.product === "ReactNative")
  );
}

function runningInTauri(): boolean {
  const window = globalWithWindow().window;
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

function runningInNode(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions?.node === "string"
  );
}

/** True when running inside React Native (iOS/Android). */
export function isMobile(): boolean {
  return runningInReactNative();
}

/**
 * True when a DOM/window exists — i.e. a plain browser **or** the Tauri
 * webview. Use `getPlatform()` when you need to distinguish the two:
 * `isDesktop()` is checked first, so a Tauri webview reports `"desktop"`.
 */
export function isWeb(): boolean {
  return hasWindow() && !runningInReactNative();
}

/** True when running inside the Tauri desktop shell (implies `isWeb()` too). */
export function isDesktop(): boolean {
  return runningInTauri();
}

/** True when running under Node.js (tests, CLI, bundlers). */
export function isNode(): boolean {
  return runningInNode();
}

/** Best-effort detection of the current runtime platform. */
export function getPlatform(): RuntimePlatform {
  if (isMobile()) return "mobile";
  if (isDesktop()) return "desktop";
  if (isWeb()) return "web";
  if (isNode()) return "node";
  return "unknown";
}
