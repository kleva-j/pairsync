import { CallParticipantsList } from "@stream-io/video-react-sdk";
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
import { RoomSchema } from "@/lib/contant";

export const RightPanel = ({ name, description, tags, githubRepo }: RoomSchema) => {
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
      <Card className="rounded-md px-4 py-3 shadow-sm">
        <CallParticipantsList onClose={() => {}} />
      </Card>
    </ResizablePanel>
  );
};
