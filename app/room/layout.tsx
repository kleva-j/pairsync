import Link from "next/link";

import type { PropsWithChildren } from "react";

import { Button } from "@/components/ui/button";

import Header from "@/console/header";

import { ALL_ROOMS_URL, CREATE_ROOM_URL } from "@/lib/contant";

export const routes = [
  { name: "Available Rooms", href: ALL_ROOMS_URL },
  { name: "Create Room", href: CREATE_ROOM_URL },
];

export default function RoomLayout({ children }: PropsWithChildren) {
  return (
    <section>
      <Header className="shadow">
        <div className="space-x-4">
          <Button variant="link" className="px-1" asChild>
            <Link href={ALL_ROOMS_URL}>Available Rooms</Link>
          </Button>
          <Button variant="link" className="px-1" asChild>
            <Link href={CREATE_ROOM_URL}>Create Room</Link>
          </Button>
        </div>
      </Header>
      <section className="p-4">{children}</section>
    </section>
  );
}
