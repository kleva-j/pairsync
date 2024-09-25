import { Link } from "next-view-transitions";

import type { PropsWithChildren } from "react";

import { Button } from "@/components/ui/button";

import Header from "@/console/header";

import { ALL_ROOMS_URL, CREATE_ROOM_URL } from "@/lib/contant";

const navLinks = [
  { name: "Available Rooms", href: ALL_ROOMS_URL },
  { name: "Create Room", href: CREATE_ROOM_URL },
];

export default function RoomLayout({ children }: PropsWithChildren) {
  return (
    <section className="min-h-screen">
      <Header className="shadow dark:border-b">
        <div className="space-x-4">
          {navLinks.map((link) => (
            <Button variant="link" className="px-1" asChild key={link.name}>
              <Link href={link.href}>{link.name}</Link>
            </Button>
          ))}
        </div>
      </Header>
      <section className="h-[calc(100vh_-_65px)] p-4">{children}</section>
    </section>
  );
}
