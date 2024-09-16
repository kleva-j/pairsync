import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex h-screen w-full justify-center pt-40">
      <SignUp path="/auth/sign-up" signInUrl="/auth/sign-in" />
    </div>
  );
}
