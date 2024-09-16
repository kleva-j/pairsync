import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex h-screen w-full justify-center pt-40">
      <SignIn path="/auth/sign-in" signUpUrl="/auth/sign-up" />
    </div>
  );
}
