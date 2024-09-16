import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Auth constants
export const SIGNIN_ERROR_URL = "/api/auth/signin/error";
export const SIGNOUT_URL = "/api/auth/signout";
export const CREATE_ROOM_URL = "/room/create";
export const SIGNIN_URL = "/auth/sign-in";
export const SIGNUP_URL = "/auth/sign-up";
export const ALL_ROOMS_URL = "/room";
export const CONSOLE_URL = "/console";
export const HOME_URL = "/";

// Room constants
export const roomSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().min(1).max(100),
  language: z.string().min(1).max(100),
  githubRepo: z.optional(z.string().url("Must be a valid URL")),
  tags: z.array(z.object({ value: z.string(), label: z.string() })),
});

export const createRoomSchema = roomSchema.extend({
  ownerId: z.string().min(1).max(100),
});

export type CreateRoomFormSchema = z.infer<typeof createRoomSchema>;

export const createRoomFormResolver = zodResolver(createRoomSchema);

export const tags: Record<"value" | "label", string>[] = [
  { value: "next.js", label: "Next.js" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt.js", label: "Nuxt.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "wordpress", label: "WordPress" },
  { value: "express.js", label: "Express.js" },
  { value: "nest.js", label: "Nest.js" },
  { value: "react", label: "React.js" },
  { value: "vue", label: "Vue.js" },
  { value: "angular", label: "Angular" },
  { value: "svelte", label: "Svelte" },
  { value: "tailwindcss", label: "Tailwind CSS" },
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "node", label: "Node.js" },
  { value: "graphql", label: "GraphQL" },
  { value: "prisma", label: "Prisma" },
  { value: "supabase", label: "Supabase" },
  { value: "mongodb", label: "MongoDB" },
  { value: "mysql", label: "MySQL" },
  { value: "mariadb", label: "MariaDB" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "redis", label: "Redis" },
  { value: "docker", label: "Docker" },
  { value: "aws", label: "AWS" },
  { value: "gcp", label: "GCP" },
  { value: "firebase", label: "Firebase" },
  { value: "netlify", label: "Netlify" },
  { value: "vercel", label: "Vercel" },
];

export const defaultFormValues: CreateRoomFormSchema = {
  name: "",
  description: "",
  language: "",
  githubRepo: "",
  ownerId: "",
  tags: [],
};
