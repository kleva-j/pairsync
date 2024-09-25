"use client";

import { ResizableHandle, ResizablePanelGroup } from "@/components/ui/resizable";
import { api } from "@/convex/_generated/api";
import { MainPanel } from "@/room/id/[roomId]/main-panel";
import { RightPanel } from "@/room/id/[roomId]/right-panel";
import { Preloaded, usePreloadedQuery } from "convex/react";

type RoomListProps = {
  query: Preloaded<typeof api.rooms.getOneByUser>;
};

export const PageContent = ({ query }: RoomListProps) => {
  const room = usePreloadedQuery(query);

  if (room) {
    return (
      <ResizablePanelGroup direction="horizontal" className="h-full space-x-4">
        <MainPanel name={room.name} language={room.language} />
        <ResizableHandle withHandle />
        <RightPanel {...room} />
      </ResizablePanelGroup>
    );
  }
  return <div>No room of this ID found</div>;
};
