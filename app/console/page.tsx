import { auth } from "auth";

export default async function ConsolePage() {
  const session = await auth();

  const [firstName] = String(session?.user?.name).split(" ");

  return (
    <section className="grid min-h-screen place-items-center">
      <h2 className="text-2xl">Welcome {firstName}</h2>
    </section>
  );
}
