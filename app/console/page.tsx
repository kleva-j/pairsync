import { auth } from "@clerk/nextjs/server";
import { Logger } from "next-axiom";
import { Link } from "next-view-transitions";
import { Button } from "@/components/ui/button";

import Header from "@/console/header";

import { ALL_ROOMS_URL } from "@/lib/contant";

export default async function ConsolePage() {
  const { userId } = auth();

  const log = new Logger();

  log.info("/console", { userId });

  await log.flush();

  return (
    <section>
      <Header>
        <Button variant="link" asChild>
          <Link href={ALL_ROOMS_URL}>Rooms</Link>
        </Button>
      </Header>
      <section className="grid place-items-center">
        <h2 className="text-2xl">Welcome to the console page</h2>
      </section>
    </section>
  );
}
