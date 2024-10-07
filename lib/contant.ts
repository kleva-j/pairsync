import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Auth constants
export const SIGNIN_ERROR_URL = "/api/auth/signin/error";
export const SEARCH_ROOMS_URL = "/room/?search=";
export const SIGNOUT_URL = "/api/auth/signout";
export const CREATE_ROOM_URL = "/room/create";
export const SIGNIN_URL = "/auth/sign-in";
export const SIGNUP_URL = "/auth/sign-up";
export const ROOM_ID_URL = "/room/id";
export const CONSOLE_URL = "/console";
export const ALL_ROOMS_URL = "/room";
export const HOME_URL = "/";

// Room constants
export const createRoomSchema = z.object({
  name: z
    .string()
    .min(3, "Name should be at least 3 characters")
    .max(50, "Name should be at most 50 characters"),
  description: z
    .string()
    .min(10, "Description should be at least 10 characters long")
    .max(250, "Description should be at most 250 characters long")
    .optional()
    .or(z.literal("")),
  language: z.string().min(1, "Must be a valid language").max(100),
  githubRepo: z.optional(z.string().url("Must be a valid URL")),
  tags: z.array(z.object({ value: z.string(), label: z.string() })),
});

export const searchSchema = z.object({ search: z.string() });
export type SearchSchema = z.infer<typeof searchSchema>;

export type CreateRoomFormSchema = z.infer<typeof createRoomSchema>;
export type RoomSchema = CreateRoomFormSchema;

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
  githubRepo: undefined,
  tags: [],
};
