import { LogOut, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResizablePanel } from "@/components/ui/resizable";

import type { RoomSchema } from "@/lib/contant";

type MainPanelProps = Pick<RoomSchema, "name" | "language">;

export const MainPanel = ({ name, language }: MainPanelProps) => {
  return (
    <ResizablePanel defaultSize={78} className="flex h-full gap-x-4">
      <Card className="flex w-16 flex-col items-center rounded-md shadow-sm"></Card>
      <div className="size-full space-y-3">
        <div className="flex items-center gap-x-3">
          <Button className="size-8 p-1" variant="secondary">
            <Video className="size-5" />
          </Button>
          <h3 className="text-lg">{name}</h3>
          <Badge variant="secondary">{language}</Badge>
          <Button className="ml-auto" variant="destructive" size="sm">
            <LogOut className="mr-2 size-4" />
            Leave
          </Button>
        </div>
        <Card className="h-[600px] flex-1 rounded p-4 shadow-sm">Video Content</Card>
      </div>
    </ResizablePanel>
  );
};
