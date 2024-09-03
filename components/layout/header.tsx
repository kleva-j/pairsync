import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export default function Header() {
  return (
    <header className="bg-white shadow dark:bg-neutral-950/40">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between p-4">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">PairSync</h1>
        <nav className="flex gap-x-4">
          <Button asChild variant="link">
            <Link href="/">Home</Link>
          </Button>
          <Button asChild variant="link">
            <Link href="#features">Features</Link>
          </Button>
          <Button asChild variant="link">
            <Link href="#contact">Contact</Link>
          </Button>
        </nav>
        <ModeToggle />
      </div>
    </header>
  );
}
