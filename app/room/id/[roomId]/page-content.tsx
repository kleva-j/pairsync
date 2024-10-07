/* eslint-disable react-hooks/exhaustive-deps */

"use client";

import "@stream-io/video-react-sdk/dist/css/styles.css";

import {
  type Call,
  CallControls,
  PaginatedGridLayout,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
} from "@stream-io/video-react-sdk";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { api } from "@/convex/_generated/api";
import { ALL_ROOMS_URL } from "@/lib/contant";
import { generateToken } from "@/room/id/[roomId]/actions";
import { RightPanel } from "@/room/id/[roomId]/right-panel";
import { Preloaded, usePreloadedQuery } from "convex/react";

import { env } from "env.mjs";

type RoomListProps = {
  query: Preloaded<typeof api.rooms.getOneByUser>;
  user: { id: string; name: string; image: string };
};

export const PageContent = ({ query, user }: RoomListProps) => {
  const room = usePreloadedQuery(query)!;
  const router = useRouter();

  const [client, setclient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);

  useEffect(() => {
    async function launchCall() {
      const client = new StreamVideoClient({
        apiKey: env.NEXT_PUBLIC_GETSTREAM_API_KEY,
        user: { ...user, type: "authenticated" },
        tokenProvider: () => generateToken(),
      });
      const call = client.call("default", room._id);
      await call.join({ create: true });

      setclient(client);
      setCall(call);
    }

    launchCall();

    return () => {
      call &&
        call
          .leave()
          .then(() => {
            if (client) {
              client.disconnectUser();
              setclient(null);
            }
          })
          .catch(console.error);
    };
  }, []);

  const onLeave = () => {
    router.push(ALL_ROOMS_URL);
  };

  return (
    client &&
    call && (
      <StreamVideo client={client}>
        <StreamTheme>
          <StreamCall call={call}>
            <ResizablePanelGroup direction="horizontal" className="h-full space-x-4">
              <ResizablePanel defaultSize={78} className="flex h-full gap-x-4">
                <div className="size-full space-y-3">
                  <Card className="flex-1 rounded p-4 shadow-sm">
                    <PaginatedGridLayout excludeLocalParticipant />
                    <CallControls onLeave={onLeave} />
                  </Card>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <RightPanel {...room} />
            </ResizablePanelGroup>
          </StreamCall>
        </StreamTheme>
      </StreamVideo>
    )
  );
};
