import type { WebhookEvent } from "@clerk/backend";

import { Webhook } from "svix";
import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

function ensureEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`missing environment variable ${name}`);
  }
  return value;
}

const webhookSecret = ensureEnvironmentVariable("CLERK_WEBHOOK_SECRET");

const getTokenId = (id: string) => `${process.env.CLERK_ISSUER_URL}|${id}`;

const handleClerkWebhook = httpAction(async (ctx, request) => {
  const event = await validateRequest(request);
  if (!event) {
    return new Response("Error occured", { status: 400 });
  }

  switch (event.type) {
    case "user.created": // intentional fallthrough
    case "user.updated": {
      const { first_name, last_name, id, email_addresses } = event.data;

      await ctx.runMutation(internal.users.createOrUpdate, {
        name: `${first_name} ${last_name}`,
        email: email_addresses[0]!.email_address,
        tokenIdentifier: getTokenId(id),
      });

      break;
    }
    case "user.deleted": {
      // Clerk docs say this is required, but the types say optional?
      const id = getTokenId(event.data.id!);
      await ctx.runMutation(internal.users.deleteUser, { id });
      break;
    }
    default: {
      console.log("ignored Clerk webhook event", event.type);
    }
  }
  return new Response(null, {
    status: 200,
  });
});

const http = httpRouter();
http.route({
  path: "/clerk-convex-webhook",
  method: "POST",
  handler: handleClerkWebhook,
});

async function validateRequest(req: Request): Promise<WebhookEvent | undefined> {
  const payloadString = await req.text();

  const svixHeaders = {
    "svix-id": req.headers.get("svix-id")!,
    "svix-timestamp": req.headers.get("svix-timestamp")!,
    "svix-signature": req.headers.get("svix-signature")!,
  };
  const wh = new Webhook(webhookSecret);
  let evt: Event | null = null;
  try {
    evt = wh.verify(payloadString, svixHeaders) as Event;
  } catch (_) {
    console.log("error verifying");
    return;
  }

  return evt as unknown as WebhookEvent;
}

export default http;
