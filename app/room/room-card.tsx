import { Github, PlusIcon } from "lucide-react";

import NextLink from "next/link";

import { Link } from "next-view-transitions";
import { TagList } from "@/components/tag-lists";
import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogClose,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogImage,
  DialogSubtitle,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/motion-dialog";

import { ROOM_ID_URL, type RoomSchema } from "@/lib/contant";

type RoomCardProps = { room: RoomSchema; roomId: string };

export function RoomCard({ room, roomId }: RoomCardProps) {
  const { name, description, tags } = room;

  return (
    <Dialog transition={{ type: "spring", bounce: 0.05, duration: 0.25 }}>
      <DialogTrigger
        style={{ borderRadius: "12px" }}
        className="flex max-w-[270px] flex-col overflow-hidden border border-zinc-950/10 bg-white dark:border-zinc-50/10 dark:bg-zinc-900"
      >
        <DialogImage
          src="/eb-27-lamp-edouard-wilfrid-buquet.jpg"
          alt="A desk lamp designed by Edouard Wilfrid Buquet in 1925. It features a double-arm design and is made from nickel-plated brass, aluminium and varnished wood."
          className="h-48 w-full object-cover"
        />
        <div className="flex grow flex-row items-end justify-between p-2">
          <div>
            <DialogTitle className="text-zinc-950 dark:text-zinc-50">EB27</DialogTitle>
            <DialogSubtitle className="text-zinc-700 dark:text-zinc-400">
              {name}
            </DialogSubtitle>
          </div>
          <button
            type="button"
            className="relative ml-1 flex size-6 shrink-0 scale-100 select-none appearance-none items-center justify-center rounded-lg border border-zinc-950/10 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:ring-2 active:scale-[0.98] dark:border-zinc-50/10 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-500"
            aria-label="Open dialog"
          >
            <PlusIcon size={12} />
          </button>
        </div>
      </DialogTrigger>
      <DialogContainer>
        <DialogContent
          style={{ borderRadius: "1.5rem" }}
          className="pointer-events-auto relative flex h-auto w-full flex-col overflow-hidden border border-zinc-950/10 bg-white dark:border-zinc-50/10 dark:bg-zinc-900 sm:w-[500px]"
        >
          <DialogImage
            src="/eb-27-lamp-edouard-wilfrid-buquet.jpg"
            alt="A desk lamp designed by Edouard Wilfrid Buquet in 1925. It features a double-arm design and is made from nickel-plated brass, aluminium and varnished wood."
            className="size-full"
          />
          <div className="p-6">
            <DialogTitle className="text-2xl text-zinc-950 dark:text-zinc-50">
              EB27
            </DialogTitle>
            <DialogSubtitle className="text-zinc-700 dark:text-zinc-400">
              {name}
            </DialogSubtitle>
            <DialogDescription
              disableLayoutAnimation
              variants={{
                initial: { opacity: 0, scale: 0.8, y: 100 },
                animate: { opacity: 1, scale: 1, y: 0 },
                exit: { opacity: 0, scale: 0.8, y: 100 },
              }}
              className="mt-2 flex flex-col gap-y-3"
            >
              <p className="text-zinc-500">{description}</p>

              <TagList tags={tags} />

              <div className="flex items-center justify-end gap-x-4">
                {room.githubRepo && (
                  <Button
                    variant="link"
                    className="size-7 rounded px-1 text-neutral-500 hover:text-neutral-600 dark:text-neutral-400 dark:hover:text-neutral-300"
                    asChild
                  >
                    <NextLink
                      href={room.githubRepo || "#"}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      <Github />
                    </NextLink>
                  </Button>
                )}

                <Button className="h-8 font-semibold" variant="secondary">
                  <Link href={`${ROOM_ID_URL}/${roomId}`}>Join</Link>
                </Button>
              </div>
            </DialogDescription>
          </div>
          <DialogClose className="text-zinc-50" />
        </DialogContent>
      </DialogContainer>
    </Dialog>
  );
}
