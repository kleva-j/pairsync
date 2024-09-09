import type { User } from "@auth/core/types";

import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

import { DASHBOARD_URL, SIGNIN_URL } from "@/lib/contant";

type HeaderProps = {
  signedInUser?: User;
};

export async function Header({ signedInUser }: HeaderProps) {
  return (
    <header className="bg-white shadow dark:bg-black">
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
        <div className="flex items-center gap-x-4">
          <Button asChild variant="secondary">
            <Link href={!signedInUser ? SIGNIN_URL : DASHBOARD_URL}>{!signedInUser ? "Sign in" : "Dashboard"}</Link>
          </Button>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}

export default Header;
