ALTER TABLE "skills" ADD COLUMN "doc_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "doc_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;