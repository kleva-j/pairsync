import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { HOME_URL } from "@/lib/contant";

export default async function SignInPage() {
  return (
    <section className="flex flex-col items-center justify-center">
      <div className="container flex h-16 w-full items-center justify-end">
        <ModeToggle />
      </div>
      <div className="flex min-h-[calc(100vh_-_theme(spacing.20))] -translate-y-10 flex-col justify-center px-6 py-12 lg:px-8">
        <Card className="mx-auto max-w-sm rounded-md shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Choose your preferred sign in method</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 sm:mx-auto sm:w-full sm:max-w-sm"></div>
          </CardContent>

          <CardFooter className="p-0">
            <Button asChild variant="link" className="ml-auto mr-3 text-xs">
              <Link href={HOME_URL}>Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
}
