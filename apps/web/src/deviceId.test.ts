import { describe, expect, it, vi } from "vitest";

import {
  DEVICE_ID_STORAGE_KEY,
  getDesktopDeviceId,
  type DeviceIdStorage,
} from "./deviceId";

/** Map-backed fake `localStorage` so tests run in pure Node without jsdom. */
function createFakeStorage(initial: Record<string, string> = {}): DeviceIdStorage & {
  readonly store: Map<string, string>;
} {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("getDesktopDeviceId", () => {
  it("returns the stored UUID id when it's valid", () => {
    const storage = createFakeStorage({
      [DEVICE_ID_STORAGE_KEY]: "dev-11111111-2222-3333-4444-555555555555",
    });
    const randomUUID = vi.fn(() => "test-uuid-1234");

    const id = getDesktopDeviceId({ storage, randomUUID });

    expect(id).toBe("dev-11111111-2222-3333-4444-555555555555");
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it("returns the stored legacy numeric id when it's valid", () => {
    const storage = createFakeStorage({
      [DEVICE_ID_STORAGE_KEY]: "dev-1234567890",
    });
    const randomUUID = vi.fn(() => "test-uuid-1234");

    const id = getDesktopDeviceId({ storage, randomUUID });

    expect(id).toBe("dev-1234567890");
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it("generates and persists a new id when nothing is stored", () => {
    const storage = createFakeStorage();
    const randomUUID = vi.fn(() => "test-uuid-1234");

    const id = getDesktopDeviceId({ storage, randomUUID });

    expect(id).toBe("dev-test-uuid-1234");
    expect(storage.store.get(DEVICE_ID_STORAGE_KEY)).toBe("dev-test-uuid-1234");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("generates and persists a new id when the stored value is malformed", () => {
    const storage = createFakeStorage({
      [DEVICE_ID_STORAGE_KEY]: "garbage",
    });
    const randomUUID = vi.fn(() => "test-uuid-1234");

    const id = getDesktopDeviceId({ storage, randomUUID });

    expect(id).toBe("dev-test-uuid-1234");
    expect(storage.store.get(DEVICE_ID_STORAGE_KEY)).toBe("dev-test-uuid-1234");
  });

  it("falls back to an ephemeral id when storage throws", () => {
    const storage: DeviceIdStorage = {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
    };
    const randomUUID = vi.fn(() => "test-uuid-1234");

    const id = getDesktopDeviceId({ storage, randomUUID });

    expect(id).toBe("dev-test-uuid-1234");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });
});
