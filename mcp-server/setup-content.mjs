// One-time setup: create content table and insert methodology + style examples
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new pg.Client({
  host: "db.idbvezfpkodmohebrwkc.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "ShefaYoel2026!",
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("Connected to Supabase PostgreSQL");

// Create content table
await client.query(`
  CREATE TABLE IF NOT EXISTS content (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`);
console.log("Created content table");

// Enable RLS with open policies (anon can read and write)
await client.query(`ALTER TABLE content ENABLE ROW LEVEL SECURITY;`);
await client.query(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'content' AND policyname = 'anon_read_content') THEN
      CREATE POLICY anon_read_content ON content FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'content' AND policyname = 'anon_write_content') THEN
      CREATE POLICY anon_write_content ON content FOR ALL USING (true) WITH CHECK (true);
    END IF;
  END $$;
`);
console.log("RLS policies set");

// Read files
const skillMd = readFileSync(join(__dirname, "..", "skill", "SKILL.md"), "utf-8");
const styleExamples = readFileSync(join(__dirname, "..", "skill", "references", "style-examples.md"), "utf-8");

// Upsert content
await client.query(`
  INSERT INTO content (key, value, description, updated_at)
  VALUES ($1, $2, $3, NOW())
  ON CONFLICT (key) DO UPDATE SET value = $2, description = $3, updated_at = NOW()
`, ["methodology", skillMd, "SKILL.md \u2014 Lesson generation methodology and rules"]);
console.log("Inserted methodology");

await client.query(`
  INSERT INTO content (key, value, description, updated_at)
  VALUES ($1, $2, $3, NOW())
  ON CONFLICT (key) DO UPDATE SET value = $2, description = $3, updated_at = NOW()
`, ["style_examples", styleExamples, "Style examples \u2014 good/bad lesson writing patterns"]);
console.log("Inserted style_examples");

await client.end();
console.log("Done!");