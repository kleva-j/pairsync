import { PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import type { RoomSchema } from "@/lib/contant";

type RoomCardProps = { room: RoomSchema };

export function RoomCard({ room }: RoomCardProps) {
  const { name, description, tags } = room;

  return (
    <Dialog transition={{ type: "spring", bounce: 0.05, duration: 0.25 }}>
      <DialogTrigger
        style={{
          borderRadius: "12px",
        }}
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
          style={{
            borderRadius: "24px",
          }}
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
              <div className="flex items-center gap-x-1.5 text-zinc-500">
                {tags.map(({ label, value }) => (
                  <Badge
                    key={label}
                    variant="secondary"
                    className="h-6 rounded-full capitalize"
                  >
                    {value}
                  </Badge>
                ))}
              </div>
            </DialogDescription>
          </div>
          <DialogClose className="text-zinc-50" />
        </DialogContent>
      </DialogContainer>
    </Dialog>
  );
}
