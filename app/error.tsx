/* eslint-disable no-console */
"use client";

import { Siren } from "lucide-react";
import { usePathname } from "next/navigation";
import { LogLevel, useLogger } from "next-axiom";
import { Link } from "next-view-transitions";
import { Button } from "@/components/ui/button";
import { HOME_URL } from "@/lib/contant";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  const path = usePathname();

  console.error(error);

  const { name, message, cause, stack, digest } = error;

  const log = useLogger({ source: "error.tsx" });
  let statusCode = message === "Invalid URL" ? 404 : 500;

  log.logHttpRequest(
    LogLevel.error,
    error.message,
    { host: window.location.href, path, statusCode },
    { error: name, cause, stack, digest }
  );

  return (
    <main>
      <section className="bg-white">
        <div className="layout flex min-h-screen flex-col items-center justify-center text-center text-black">
          <Siren size={60} className="drop-shadow-glow animate-flicker text-red-500" />
          <h1 className="mt-8 text-4xl md:text-6xl">Oops, something went wrong!</h1>

          <p className="mt-4 px-8 py-2 text-lg text-red-400">`{error.message}`</p>

          <div className="mt-4 flex items-center gap-x-2">
            <Button className="mt-4" variant="secondary" asChild>
              <Link href={HOME_URL}>Home</Link>
            </Button>
            <Button onClick={reset} className="mt-4">
              Reset
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
