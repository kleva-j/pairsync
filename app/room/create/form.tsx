"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { Input } from "@/components/ui/input";
import { MultipleSelector } from "@/components/ui/multi-select";
import { Textarea } from "@/components/ui/textarea";
import {
  ALL_ROOMS_URL,
  type CreateRoomFormSchema,
  defaultFormValues as defaultValues,
  createRoomFormResolver as resolver,
  tags,
} from "@/lib/contant";

import { createRoomAction } from "@/room/create/actions";

type ComponentProps = {
  handleSubmit?: () => void | Promise<void>;
  handleError?: (error: unknown) => void;
};

export const CreateRoomForm = ({ handleSubmit, handleError }: ComponentProps) => {
  const form = useForm({ resolver, defaultValues });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(data: CreateRoomFormSchema) {
    setLoading(true);
    try {
      await createRoomAction(data);
      toast.success("Room created successfully!");
      setLoading(false);

      if (handleSubmit) await handleSubmit();
      else router.push(ALL_ROOMS_URL);
    } catch (error) {
      setLoading(false);
      toast.error("Error creating room!");
      handleError?.(error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          name="name"
          control={form.control}
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Add a room name" {...field} />
              </FormControl>
              <FormDescription>This is the public room name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="description"
          control={form.control}
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Add a description here..." {...field} />
              </FormControl>
              <FormDescription>
                Describe what you want to Do / Build / Learn.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="language"
          control={form.control}
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Primary Programming Language</FormLabel>
              <FormControl>
                <Input placeholder="Language of choice" {...field} />
              </FormControl>
              <FormDescription>
                Set the programming language of choice to use in your project.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="tags"
          control={form.control}
          disabled={loading}
          render={({ field }) => (
            <FormItem className="flex flex-col items-start">
              <FormLabel className="text-left">Tags</FormLabel>
              <FormControl>
                <MultipleSelector
                  {...field}
                  defaultOptions={tags}
                  disabled={loading}
                  creatable
                  placeholder="Select / Create tags you like..."
                  emptyIndicator={
                    <p className="text-center text-lg leading-10 text-gray-600 dark:text-gray-400">
                      no results found.
                    </p>
                  }
                />
              </FormControl>
              <FormDescription>
                These are the tags that you&apos;re interested in.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="githubRepo"
          control={form.control}
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Github Repo</FormLabel>
              <FormControl>
                <Input placeholder="Add a Github repo" {...field} />
              </FormControl>
              <FormDescription>Set the Github repo of your project.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={loading}>
          {!loading && "Submit"}
          {loading && (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Please wait
            </>
          )}
        </Button>
      </form>
    </Form>
  );
};
