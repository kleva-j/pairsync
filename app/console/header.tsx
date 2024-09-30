import { UserButton } from "@clerk/nextjs";
import { Command } from "lucide-react";

import type { PropsWithChildren } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { cn } from "@/lib/utils";

type HeaderProps = PropsWithChildren & { className?: string };

export const Header = ({ children, className }: HeaderProps) => {
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
            <UserButton
              showName
              appearance={{
                elements: {
                  userButtonTrigger:
                    "border border-zinc-300 dark:border-zinc-700 p-0.5 text-sm dark:text-white",
                },
              }}
            />
            <ModeToggle />
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
