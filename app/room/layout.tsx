import { Link } from "next-view-transitions";

import type { PropsWithChildren } from "react";

import { Button } from "@/components/ui/button";
import { Header } from "@/console/header";
import { CONSOLE_URL, CREATE_ROOM_URL } from "@/lib/contant";

export default function RoomLayout({ children }: PropsWithChildren) {
  return (
    <section className="min-h-screen">
      <Header className="shadow dark:border-b">
        <div className="space-x-4">
          <Button variant="link" className="px-1" asChild>
            <Link href={CONSOLE_URL}>Console</Link>
          </Button>
          <Button variant="link" className="px-1" asChild>
            <Link href={CREATE_ROOM_URL}>Create Room</Link>
          </Button>
        </div>
      </Header>
      <section className="h-[calc(100vh_-_65px)] p-4">{children}</section>
    </section>
  );
}
