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

// Show chapter \u05d1 section 4 in detail
const result = await client.query(
  `SELECT id, section_heading, section, point_number, human_title,
          LEFT(human_body, 80) as body_start,
          LENGTH(human_body) as body_len
   FROM lessons WHERE chapter = $1
   AND CAST(SPLIT_PART(id, '.', 2) AS INTEGER) = 4
   ORDER BY CAST(SPLIT_PART(id, '.', 3) AS INTEGER)`,
  ["\u05d1"]
);

console.log(`Chapter \u05d1 Section 4: "${result.rows[0]?.section_heading}" (${result.rows.length} lessons)\n`);
for (const r of result.rows) {
  const title = r.human_title ? `"${r.human_title.slice(0,50)}"` : "(no title)";
  console.log(`  ${r.id} #${r.point_number} ${title} [${r.body_len} chars]`);
  console.log(`    -> ${r.body_start}...`);
}

// Also show total lessons per section for chapter \u05d1
const sections = await client.query(
  `SELECT CAST(SPLIT_PART(id, '.', 2) AS INTEGER) as sec,
          section_heading,
          COUNT(*) as cnt
   FROM lessons WHERE chapter = $1
   GROUP BY sec, section_heading
   ORDER BY sec`,
  ["\u05d1"]
);
console.log(`\nChapter \u05d1 sections:`);
for (const r of sections.rows) {
  console.log(`  Section ${r.sec}: ${r.cnt} lessons - "${r.section_heading?.slice(0,50)}"`);
}

await client.end();