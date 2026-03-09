// Set up RLS policies so anon key can read/write all tables
import pg from "pg";

const client = new pg.Client({
  host: "db.idbvezfpkodmohebrwkc.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "ShefaYoel2026!",
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const tables = ["lessons", "lesson_sources", "versions", "skill_examples", "content"];

for (const table of tables) {
  await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${table}' AND policyname = 'anon_full_${table}') THEN
        CREATE POLICY anon_full_${table} ON ${table} FOR ALL USING (true) WITH CHECK (true);
      END IF;
    END $$;
  `);
  console.log(`RLS set for ${table}`);
}

await client.end();
console.log("Done!");