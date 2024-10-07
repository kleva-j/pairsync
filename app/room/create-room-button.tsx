"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateRoomForm } from "@/room/create/form";

export const CreateRoomButton = () => {
  const [open, setOpen] = useState(false);

  const handleSubmit = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Room</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Room</DialogTitle>
          <DialogDescription>Create a new room and join immediately.</DialogDescription>
        </DialogHeader>
        <CreateRoomForm handleSubmit={handleSubmit} />
      </DialogContent>
    </Dialog>
  );
};
