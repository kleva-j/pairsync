"use client";

import { Command } from "lucide-react";

import type { PropsWithChildren } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signOut } from "auth";

type HeaderProps = PropsWithChildren & { className?: string };

const Header = ({ children, className }: HeaderProps) => {
  const handleSignOut = async () => await signOut();

  return (
    <header
      className={cn("sticky top-0 bg-white p-4 text-white dark:bg-black", className)}
    >
      <div className="container mx-auto flex h-8 items-center justify-between gap-x-2">
        <div className="flex items-center gap-x-1">
          <Command className="size-5 stroke-[1px] text-black dark:text-white" />
          <span className="text-lg font-medium text-black dark:text-white">PairSync</span>
        </div>
        <nav className="flex items-center gap-x-8">
          {children}

          <div className="flex items-center gap-x-2">
            <Button
              variant="outline"
              onClick={handleSignOut}
              className="border-[1.5px] text-black dark:text-white"
            >
              Sign Out
            </Button>
            <ModeToggle />
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
