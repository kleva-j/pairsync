import { BackgroundGrid } from "@/components/grid-bg";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";

import { LP_GRID_ITEMS } from "lp-items";

export { metadata } from "@/_metadata";

export default async function HomePage() {
  return (
    <>
      <Header />
      <section className="relative h-[calc(100vh_-_theme(spacing.20))] w-screen overflow-hidden">
        <div className="mx-auto grid max-w-screen-xl px-4 py-8 text-center lg:py-20">
          <div className="mx-auto place-self-center">
            <h1 className="mb-4 max-w-2xl text-4xl font-extrabold leading-none tracking-tight dark:text-white md:text-5xl xl:text-6xl">
              PairSync - A pair programming tool for developers
            </h1>
            <p className="mb-6 max-w-2xl font-light text-neutral-500 dark:text-neutral-400 md:text-lg lg:mb-8 lg:text-xl">
              Jumpstart your enterprise project with our feature-packed, high-performance
              Next.js boilerplate! Experience rapid UI development, AI-powered code
              reviews, and an extensive suite of tools for a smooth and enjoyable
              development process.
            </p>
            <Button className="mr-3">Get started</Button>
            <Button variant="secondary">Deploy Now</Button>
          </div>
        </div>
        <BackgroundGrid color="purple" cellSize="30px" />
      </section>
      <section className="bg-white dark:bg-black">
        <div className="mx-auto max-w-screen-xl px-4 py-8 sm:py-16 lg:px-6">
          <div className="justify-center space-y-8 md:grid md:grid-cols-2 md:gap-12 md:space-y-0 lg:grid-cols-3">
            {LP_GRID_ITEMS.map((singleItem) => (
              <div
                key={singleItem.title}
                className="flex flex-col items-center justify-center text-center"
              >
                <div className="bg-primary-100 dark:bg-primary-900 mb-4 flex size-10 items-center justify-center rounded-full p-1.5 text-blue-700 lg:size-12">
                  {singleItem.icon}
                </div>
                <h3 className="mb-2 text-xl font-bold dark:text-white">
                  {singleItem.title}
                </h3>
                <p className="text-neutral-500 dark:text-neutral-400">
                  {singleItem.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
