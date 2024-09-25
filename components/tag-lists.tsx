import { Badge } from "@/components/ui/badge";
import { RoomSchema } from "@/lib/contant";

type TagListProps = { tags: RoomSchema["tags"] };

export const TagList = ({ tags }: TagListProps) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-zinc-500">
      {tags.map(({ label, value }) => (
        <Badge
          key={label}
          variant="secondary"
          className="h-6 w-max rounded-full capitalize"
        >
          {value}
        </Badge>
      ))}
    </div>
  );
};
