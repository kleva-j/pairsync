import Link from "next/link";

import { Button } from "@/components/ui/button";

import Header from "@/console/header";

import { CREATE_ROOM_URL } from "@/lib/contant";

export default async function ConsolePage() {
  return (
    <section>
      <Header>
        <Button variant="link" asChild>
          <Link href={CREATE_ROOM_URL}>Create Room</Link>
        </Button>
      </Header>
      <section className="grid place-items-center">
        <h2 className="text-2xl">Welcome to the console page</h2>
      </section>
    </section>
  );
}
