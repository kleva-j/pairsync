import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MdnsService } from "@pairsync/core";

type FoundPayload = {
  name: string;
  ipv4: string[];
  ipv6: string[];
  port: number;
  txt: Record<string, string>;
};

/**
 * Desktop mDNS service backed by the `pairsync-mdns` Tauri plugin
 * (`mdns-sd` crate on the Rust side). Found/lost events arrive as
 * `pairsync-mdns:service-found` / `pairsync-mdns:service-lost`.
 */
export class TauriMdnsService implements MdnsService {
  private foundHandler?: (service: FoundPayload) => void;
  private lostHandler?: (name: string) => void;
  private advertised?: { serviceType: string; name: string };
  private unlisteners: UnlistenFn[] = [];
  private closed = false;

  constructor() {
    listen<FoundPayload>("pairsync-mdns:service-found", (event) => {
      this.foundHandler?.(event.payload);
    }).then((unlisten) => {
      // A close() racing the listen registration must not leak the listener.
      if (this.closed) unlisten();
      else this.unlisteners.push(unlisten);
    });
    listen<{ name: string }>("pairsync-mdns:service-lost", (event) => {
      this.lostHandler?.(event.payload.name);
    }).then((unlisten) => {
      if (this.closed) unlisten();
      else this.unlisteners.push(unlisten);
    });
  }

  async advertise(
    serviceType: string,
    name: string,
    port: number,
    txt: Record<string, string>,
  ): Promise<void> {
    await invoke("plugin:pairsync-mdns|advertise", {
      serviceType,
      name,
      port,
      txt,
    });
    this.advertised = { serviceType, name };
  }

  async browse(serviceType: string): Promise<void> {
    await invoke("plugin:pairsync-mdns|browse", { serviceType });
  }

  onServiceFound(handler: (service: FoundPayload) => void): void {
    this.foundHandler = handler;
  }

  onServiceLost(handler: (name: string) => void): void {
    this.lostHandler = handler;
  }

  async unpublish(): Promise<void> {
    if (this.advertised === undefined) return;
    const { serviceType, name } = this.advertised;
    this.advertised = undefined;
    await invoke("plugin:pairsync-mdns|unpublish", { serviceType, name });
  }

  async close(): Promise<void> {
    this.closed = true;
    try {
      await invoke("plugin:pairsync-mdns|stop_browse");
    } finally {
      for (const unlisten of this.unlisteners.splice(0)) unlisten();
    }
  }
}
