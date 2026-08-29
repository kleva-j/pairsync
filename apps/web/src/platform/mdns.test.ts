import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SERVICE_TYPE } from "@pairsync/core";
import type { MdnsService } from "@pairsync/core";

import {
  emitTauriEvent,
  registeredListeners,
  resetIpc,
} from "./test-support";
import { TauriMdnsService } from "./mdns";

vi.mock("@tauri-apps/api/core");
vi.mock("@tauri-apps/api/event");

beforeEach(() => {
  resetIpc();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

describe("TauriMdnsService", () => {
  it("advertises via the mdns plugin with the TXT record", async () => {
    const service = new TauriMdnsService();
    const txt = { device_id: "d1", alias: "Golden Eagle" };

    await service.advertise(SERVICE_TYPE, "pairsync-d1", 53350, txt);

    expect(invoke).toHaveBeenCalledWith("plugin:pairsync-mdns|advertise", {
      serviceType: SERVICE_TYPE,
      name: "pairsync-d1",
      port: 53350,
      txt,
    });
  });

  it("browses for the service type and resolves found services", async () => {
    const service: MdnsService = new TauriMdnsService();
    const found: unknown[] = [];
    service.onServiceFound((s) => found.push(s));
    await service.browse(SERVICE_TYPE);

    expect(invoke).toHaveBeenCalledWith("plugin:pairsync-mdns|browse", {
      serviceType: SERVICE_TYPE,
    });

    await emitTauriEvent("pairsync-mdns:service-found", {
      name: "pairsync-peer",
      ipv4: ["192.168.1.9"],
      ipv6: [],
      port: 53350,
      txt: { device_id: "peer-1" },
    });

    expect(found).toEqual([
      {
        name: "pairsync-peer",
        ipv4: ["192.168.1.9"],
        ipv6: [],
        port: 53350,
        txt: { device_id: "peer-1" },
      },
    ]);
  });

  it("reports lost services", async () => {
    const service = new TauriMdnsService();
    const lost: string[] = [];
    service.onServiceLost((name) => lost.push(name));
    await service.browse(SERVICE_TYPE);

    await emitTauriEvent("pairsync-mdns:service-lost", { name: "pairsync-peer" });

    expect(lost).toEqual(["pairsync-peer"]);
  });

  it("unpublishes the last advertised service", async () => {
    const service = new TauriMdnsService();
    await service.advertise(SERVICE_TYPE, "pairsync-d1", 53350, {});
    vi.mocked(invoke).mockClear();

    await service.unpublish();

    expect(invoke).toHaveBeenCalledWith("plugin:pairsync-mdns|unpublish", {
      serviceType: SERVICE_TYPE,
      name: "pairsync-d1",
    });
  });

  it("unpublish is a no-op when nothing was advertised", async () => {
    const service = new TauriMdnsService();
    await service.unpublish();
    expect(invoke).not.toHaveBeenCalledWith(
      "plugin:pairsync-mdns|unpublish",
      expect.anything(),
    );
  });

  it("close stops browsing and detaches listeners", async () => {
    const service = new TauriMdnsService();
    const onFound = vi.fn();
    service.onServiceFound(onFound);
    await service.browse(SERVICE_TYPE);

    await service.close();

    expect(invoke).toHaveBeenCalledWith("plugin:pairsync-mdns|stop_browse");
    expect(registeredListeners()).toHaveLength(0);

    await emitTauriEvent("pairsync-mdns:service-found", {
      name: "x",
      ipv4: [],
      ipv6: [],
      port: 1,
      txt: {},
    });
    expect(onFound).not.toHaveBeenCalled();
  });
});
