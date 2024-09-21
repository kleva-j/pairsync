import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Logger } from "next-axiom";

const isProtectedRoute = createRouteMatcher(["/console(.*)", "/room(.*)"]);

export default clerkMiddleware((auth, req, event) => {
  if (isProtectedRoute(req)) auth().protect();

  const logger = new Logger({ source: "middleware" }); // traffic, request
  logger.middleware(req);

  event.waitUntil(logger.flush());
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
