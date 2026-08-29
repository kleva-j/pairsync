import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { vi } from "vitest";

export type FakeListener = {
  event: string;
  handler: (event: { payload: unknown }) => void;
};

const listeners: FakeListener[] = [];

/** Clears recorded invocations and re-arms the listen() capture. */
export function resetIpc(): void {
  listeners.length = 0;
  vi.mocked(invoke).mockReset();
  // Erase the generic signature so handlers can be captured loosely.
  const listenMock = vi.mocked(listen) as unknown as {
    mockImplementation: (
      impl: (
        event: string,
        handler: FakeListener["handler"],
      ) => Promise<() => void>,
    ) => void;
  };
  listenMock.mockImplementation(async (event, handler) => {
    const entry: FakeListener = { event, handler };
    listeners.push(entry);
    return () => {
      const index = listeners.indexOf(entry);
      if (index >= 0) listeners.splice(index, 1);
    };
  });
}

/** Delivers a fake plugin event to every matching listener. */
export async function emitTauriEvent(
  event: string,
  payload: unknown,
): Promise<void> {
  for (const listener of [...listeners]) {
    if (listener.event === event) listener.handler({ payload });
  }
}

/** All currently-registered (event, handler) pairs. */
export function registeredListeners(): FakeListener[] {
  return listeners;
}

/**
 * ASCII bytes without TextEncoder — jsdom's TextEncoder produces
 * cross-realm Uint8Arrays that vitest's `toEqual` rejects.
 */
export function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i);
  }
  return bytes;
}
