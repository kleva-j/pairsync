CREATE TABLE IF NOT EXISTS "post" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text,
	"content" text,
	"created_at" timestamp,
	"updated_at" timestamp
);
