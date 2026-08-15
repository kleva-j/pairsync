/** Runtime platform of the current process, detected without platform SDKs. */
export type RuntimePlatform = "mobile" | "web" | "desktop" | "node" | "unknown";

type GlobalWithWindow = typeof globalThis & {
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
  return globalWithWindow().window?.navigator?.product === "ReactNative";
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

/** True when running in a browser or Tauri webview. */
export function isWeb(): boolean {
  return hasWindow() && !runningInReactNative();
}

/** True when running inside the Tauri desktop shell. */
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
