import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateRoomForm } from "@/room/create/form";

export default async function CreateRoomPage() {
  return (
    <div className="grid place-items-center p-4">
      <Card className="w-full max-w-lg rounded">
        <CardHeader>
          <CardTitle className="text-lg">Create Room</CardTitle>
          <CardDescription>Create a new room in a few steps.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateRoomForm />
        </CardContent>
      </Card>
    </div>
  );
}
