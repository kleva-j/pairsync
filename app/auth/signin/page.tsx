import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { GithubIcon } from "@/components/icons/github";
import { GoogleIcon } from "@/components/icons/google";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { SIGNIN_ERROR_URL } from "@/lib/contant";
import { signIn } from "auth";
import { providerMap } from "auth.config";

const providers = Object.values(providerMap);

const iconMap: Record<string, React.FC<{ className: string }>> = {
  github: GithubIcon,
  google: GoogleIcon,
};

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
            <div className="flex flex-col gap-2 sm:mx-auto sm:w-full sm:max-w-sm">
              {providers.map((provider: { id: string; name: keyof typeof iconMap }) => {
                const Icon =
                  iconMap[provider.id] || ((props) => <span className={props.className}>Icon not found</span>);
                return (
                  <form
                    key={provider.id}
                    action={async () => {
                      "use server";
                      try {
                        await signIn(provider.id);
                      } catch (error) {
                        if (error instanceof AuthError) {
                          return redirect(`${SIGNIN_ERROR_URL}?error=${error.type}`);
                        }
                        throw error;
                      }
                    }}
                  >
                    <Button type="submit" variant="outline" className="w-full">
                      <Icon className="mr-2 size-4" />
                      <span className="">{provider.name}</span>
                    </Button>
                  </form>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
