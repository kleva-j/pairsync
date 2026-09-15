import { getNativeDeviceId, type DeviceIdSources } from "./deviceId";

const emptySources: DeviceIdSources = {
  androidId: null,
  osBuildId: null,
  modelId: null,
  modelName: null,
  deviceName: null,
  platformOS: "unknown",
  platformVersion: "?",
};

const makeSources =
  (overrides: Partial<DeviceIdSources>) =>
  async (): Promise<DeviceIdSources> => ({ ...emptySources, ...overrides });

describe("getNativeDeviceId", () => {
  it("returns a dev-<16hex> fingerprint from the composed sources", async () => {
    const id = await getNativeDeviceId({
      sources: makeSources({
        androidId: "some-android-id",
        platformOS: "android",
        platformVersion: 33,
      }),
    });
    expect(id).toMatch(/^dev-[0-9a-f]{16}$/);
  });

  it("is deterministic for the same sources", async () => {
    const sources = makeSources({
      androidId: "abc",
      platformOS: "android",
      platformVersion: 33,
    });
    const id1 = await getNativeDeviceId({ sources });
    const id2 = await getNativeDeviceId({ sources });
    expect(id1).toBe(id2);
  });

  it("differs when the androidId differs", async () => {
    const a = await getNativeDeviceId({
      sources: makeSources({
        androidId: "aaa",
        platformOS: "android",
        platformVersion: 33,
      }),
    });
    const b = await getNativeDeviceId({
      sources: makeSources({
        androidId: "bbb",
        platformOS: "android",
        platformVersion: 33,
      }),
    });
    expect(a).not.toBe(b);
  });

  it("differs when the deviceName differs on iOS with otherwise identical traits", async () => {
    const alice = await getNativeDeviceId({
      sources: makeSources({
        osBuildId: "22A123",
        modelId: "iPhone14,3",
        modelName: "iPhone 13 Pro",
        deviceName: "Alice's iPhone",
        platformOS: "ios",
        platformVersion: "17.5",
      }),
    });
    const bob = await getNativeDeviceId({
      sources: makeSources({
        osBuildId: "22A123",
        modelId: "iPhone14,3",
        modelName: "iPhone 13 Pro",
        deviceName: "Bob's iPhone",
        platformOS: "ios",
        platformVersion: "17.5",
      }),
    });
    expect(alice).not.toBe(bob);
  });

  it("still produces a stable fingerprint when only one device-unique trait is available", async () => {
    const random = jest.fn(() => "should-not-be-called");
    const id = await getNativeDeviceId({
      sources: makeSources({ deviceName: "MyDevice" }),
      random,
    });
    expect(id).toMatch(/^dev-[0-9a-f]{16}$/);
    expect(random).not.toHaveBeenCalled();
  });

  it("falls back to random when no device-unique trait is available", async () => {
    const random = jest.fn(() => "abcdef123456");
    const id = await getNativeDeviceId({
      sources: async () => emptySources,
      random,
    });
    expect(id).toBe("dev-abcdef123456");
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("falls back to random when gathering sources throws", async () => {
    const random = jest.fn(() => "000000000000");
    const id = await getNativeDeviceId({
      sources: async () => {
        throw new Error("no native module");
      },
      random,
    });
    expect(id).toBe("dev-000000000000");
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("hashes Android and iOS separately even when other trait values overlap", async () => {
    const android = await getNativeDeviceId({
      sources: makeSources({
        deviceName: "shared-name",
        platformOS: "android",
        platformVersion: 33,
      }),
    });
    const ios = await getNativeDeviceId({
      sources: makeSources({
        deviceName: "shared-name",
        platformOS: "ios",
        platformVersion: "17.5",
      }),
    });
    expect(android).not.toBe(ios);
  });
});
