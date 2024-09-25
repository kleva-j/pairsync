import { Github } from "lucide-react";

import NextLink from "next/link";

import { TagList } from "@/components/tag-lists";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ResizablePanel } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoomSchema } from "@/lib/contant";

type RightPanelProps = RoomSchema & {};

export const RightPanel = ({ name, description, tags, githubRepo }: RightPanelProps) => {
  return (
    <ResizablePanel
      className="flex flex-col gap-y-4"
      defaultSize={22}
      maxSize={30}
      minSize={15}
    >
      <Card className="rounded-md shadow-sm">
        <CardHeader className="p-4">
          <CardTitle>{name}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-y-4 px-4 pb-4">
          {githubRepo && (
            <NextLink
              href={githubRepo}
              className="flex items-center gap-x-1 text-neutral-500 hover:text-neutral-600 dark:text-neutral-400 dark:hover:text-neutral-300"
            >
              <Github className="size-4" />
              <span className="text-sm">GitHub Project</span>
            </NextLink>
          )}
          <TagList tags={tags} />
        </CardContent>
      </Card>
      <Card className="justify-center rounded-md p-4 shadow-sm">
        <Tabs className="flex w-full flex-col" defaultValue="chat">
          <TabsList className="flex w-full items-center">
            <TabsTrigger value="chat" className="flex-1">
              Chat
            </TabsTrigger>
            <TabsTrigger value="participants" className="flex-1">
              Participants
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="h-36 rounded border p-2">
            Make changes to your chat here.
          </TabsContent>
          <TabsContent value="participants" className="h-36 rounded border p-2">
            Change your participants here.
          </TabsContent>
        </Tabs>
      </Card>
    </ResizablePanel>
  );
};
