// Shefa Yoel MCP Server — Stateless Cloudflare Worker
// Implements MCP protocol via Streamable HTTP (POST /mcp) and SSE (GET /sse)

const SUPABASE_URL = "https://idbvezfpkodmohebrwkc.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkYnZlemZwa29kbW9oZWJyd2tjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NzQ2MjIsImV4cCI6MjA4ODM1MDYyMn0.l3Y4NJuo8b4L1sQrf27C82dWMkQFDwuRFF4Wk93ZJqA";

// ── Supabase REST helper ────────────────────────────────────────────
async function sb(path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

// ── Tool definitions ────────────────────────────────────────────────
interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (args: any) => Promise<any>;
}

const tools: ToolDef[] = [];

function defineTool(
  name: string,
  description: string,
  properties: Record<string, any>,
  required: string[],
  handler: (args: any) => Promise<any>
) {
  tools.push({
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
    },
    handler,
  });
}

// ═══════════════════════════════════════════════════════════════
//  METHODOLOGY
// ═══════════════════════════════════════════════════════════════

defineTool(
  "get_methodology",
  "Get the SKILL-v2 lesson-synthesis methodology. Read this FIRST before writing any lesson. Covers: the 3 Iron Laws, how to transform sources into lessons, writing style (title 5-9 words ending with ':', body is one flowing ~46-word sentence), section arc (opener/chain/escalation/landing), and complete examples.",
  {},
  [],
  async () => {
    // Try v2 first, fall back to v1
    let rows = await sb("content?key=eq.methodology_v2&select=value");
    if (!rows?.length) rows = await sb("content?key=eq.methodology&select=value");
    return [{ type: "text", text: rows?.[0]?.value || "Not found" }];
  }
);

defineTool(
  "get_style_examples",
  "Get detailed style examples showing good vs bad lesson writing patterns. Includes real source→lesson transformations demonstrating: direct extraction, personalizing cosmic statements, extracting practical consequences, and synthesizing multiple sources.",
  {},
  [],
  async () => {
    const rows = await sb("content?key=eq.style_examples&select=value");
    return [{ type: "text", text: rows?.[0]?.value || "Not found" }];
  }
);

defineTool(
  "update_methodology",
  "Update the SKILL methodology document (methodology_v2). Use this to revise the lesson-synthesis rules, Iron Laws, section arc guidance, title/body format rules, or style examples. The full markdown content replaces the existing methodology.",
  {
    value: { type: "string", description: "The full SKILL methodology text (markdown). This replaces the entire methodology_v2 document." },
    changelog: { type: "string", description: "Brief description of what changed in this update" },
  },
  ["value"],
  async ({ value, changelog }) => {
    const key = "methodology_v2";
    const description = changelog
      ? `SKILL-v2 methodology — updated: ${changelog}`
      : "SKILL-v2 methodology";
    const now = new Date().toISOString();
    const existing = await sb(`content?key=eq.${encodeURIComponent(key)}&select=key`);
    let data;
    if (existing?.length) {
      data = await sb(`content?key=eq.${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ value, description, updated_at: now }),
      });
    } else {
      data = await sb("content", {
        method: "POST",
        body: JSON.stringify({ key, value, description, updated_at: now }),
      });
    }
    return [{ type: "text", text: JSON.stringify({ updated: key, changelog, timestamp: now, size: value.length }, null, 2) }];
  }
);

defineTool(
  "list_content",
  "List all content documents stored in the database",
  {},
  [],
  async () => {
    const data = await sb("content?select=key,description,updated_at&order=key");
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
  }
);

defineTool(
  "get_skill_examples",
  "Get training examples (good/bad pairs) for few-shot reference",
  {
    category: { type: "string", description: "Filter by category, e.g. 'Iron Law #1'" },
    limit: { type: "number", description: "Max results (default 5)" },
  },
  [],
  async ({ category, limit }) => {
    let q = "skill_examples?select=*&order=id";
    if (category) q += `&category=eq.${encodeURIComponent(category)}`;
    q += `&limit=${limit || 5}`;
    return [{ type: "text", text: JSON.stringify(await sb(q), null, 2) }];
  }
);

// ═══════════════════════════════════════════════════════════════
//  READ
// ═══════════════════════════════════════════════════════════════

defineTool(
  "list_chapters",
  "List all chapters with descriptions and lesson counts",
  {},
  [],
  async () => {
    const rows = await sb("lessons?select=chapter,chapter_desc&order=chapter");
    const map = new Map<string, { chapter: string; description: string; count: number }>();
    for (const r of rows) {
      const e = map.get(r.chapter);
      if (e) e.count++;
      else map.set(r.chapter, { chapter: r.chapter, description: r.chapter_desc, count: 1 });
    }
    return [{ type: "text", text: JSON.stringify([...map.values()], null, 2) }];
  }
);

defineTool(
  "list_lessons",
  "List lessons with optional filters",
  {
    chapter: { type: "string", description: "Chapter letter" },
    status: { type: "string", description: "Status: imported, empty, finalized, review" },
    limit: { type: "number", description: "Max results (default 50)" },
  },
  [],
  async ({ chapter, status, limit }) => {
    let q = "lessons?select=id,chapter,chapter_desc,section,section_heading,point_number,human_title,status&order=id";
    if (chapter) q += `&chapter=eq.${encodeURIComponent(chapter)}`;
    if (status) q += `&status=eq.${encodeURIComponent(status)}`;
    q += `&limit=${limit || 50}`;
    return [{ type: "text", text: JSON.stringify(await sb(q), null, 2) }];
  }
);

defineTool(
  "get_lesson",
  "Get a single lesson with its sources. For writing/editing, prefer get_lesson_with_context which also returns neighbors and position.",
  { lesson_id: { type: "string", description: "Lesson ID, e.g. א.1.1" } },
  ["lesson_id"],
  async ({ lesson_id }) => {
    const enc = encodeURIComponent(lesson_id);
    const [lessons, sources] = await Promise.all([
      sb(`lessons?id=eq.${enc}`),
      sb(`lesson_sources?lesson_id=eq.${enc}&order=footnote_number`),
    ]);
    if (!lessons?.length) return [{ type: "text", text: `Lesson ${lesson_id} not found` }];
    return [{ type: "text", text: JSON.stringify({ lesson: lessons[0], sources }, null, 2) }];
  }
);

defineTool(
  "search_lessons",
  "Search lessons by text in title or body",
  { query: { type: "string", description: "Search text (Hebrew)" } },
  ["query"],
  async ({ query }) => {
    const enc = encodeURIComponent(query);
    const data = await sb(
      `lessons?or=(human_title.ilike.*${enc}*,human_body.ilike.*${enc}*)&select=id,chapter,section,human_title,status&limit=20`
    );
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
  }
);

// ═══════════════════════════════════════════════════════════════
//  CONTEXT (SKILL-v2 required: lesson before/after, position, arc)
// ═══════════════════════════════════════════════════════════════

defineTool(
  "get_lesson_with_context",
  "Get a lesson with its surrounding context for SKILL-v2 compliant writing. Returns: the lesson, its sources, the lesson BEFORE and AFTER (title+body), section info, and position (opener/middle/closer). Use this instead of get_lesson when writing or editing.",
  { lesson_id: { type: "string", description: "Lesson ID, e.g. א.1.3" } },
  ["lesson_id"],
  async ({ lesson_id }) => {
    const enc = encodeURIComponent(lesson_id);
    const [lessons, sources] = await Promise.all([
      sb(`lessons?id=eq.${enc}`),
      sb(`lesson_sources?lesson_id=eq.${enc}&order=footnote_number`),
    ]);
    if (!lessons?.length) return [{ type: "text", text: `Lesson ${lesson_id} not found` }];
    const lesson = lessons[0];

    // Get all lessons in same section to determine position and neighbors
    const sectionLessons = await sb(
      `lessons?chapter=eq.${encodeURIComponent(lesson.chapter)}&section_heading=eq.${encodeURIComponent(lesson.section_heading)}&select=id,point_number,human_title,human_body&order=point_number`
    );

    const idx = sectionLessons.findIndex((l: any) => l.id === lesson_id);
    const total = sectionLessons.length;
    const position = idx === 0 ? "opener" : idx === total - 1 ? "closer" : "middle";
    const lessonBefore = idx > 0 ? { title: sectionLessons[idx - 1].human_title, body: sectionLessons[idx - 1].human_body } : null;
    const lessonAfter = idx < total - 1 ? { title: sectionLessons[idx + 1].human_title, body: sectionLessons[idx + 1].human_body } : null;

    return [{
      type: "text",
      text: JSON.stringify({
        lesson,
        sources,
        context: {
          position,
          position_index: idx + 1,
          total_in_section: total,
          lesson_before: lessonBefore,
          lesson_after: lessonAfter,
          chapter: lesson.chapter,
          chapter_desc: lesson.chapter_desc,
          section: lesson.section,
          section_heading: lesson.section_heading,
        },
      }, null, 2),
    }];
  }
);


defineTool(
  "get_generation_context",
  "Get context for generating a lesson from scratch. Returns: the lesson BEFORE (title + body + sources), the lesson AFTER (title + body + sources), the current lesson's sources ONLY (no title/body to avoid bias), position info, and methodology. Use this when you want to write a fresh lesson without being influenced by the existing text.",
  { lesson_id: { type: "string", description: "Lesson ID, e.g. א.1.3" } },
  ["lesson_id"],
  async ({ lesson_id }) => {
    const enc = encodeURIComponent(lesson_id);
    const [lessons, sources, methodology] = await Promise.all([
      sb(`lessons?id=eq.${enc}`),
      sb(`lesson_sources?lesson_id=eq.${enc}&order=footnote_number`),
      sb("content?key=eq.methodology_v2&select=value"),
    ]);
    if (!lessons?.length) return [{ type: "text", text: `Lesson ${lesson_id} not found` }];
    const lesson = lessons[0];

    // Get all lessons in same section
    const sectionLessons = await sb(
      `lessons?chapter=eq.${encodeURIComponent(lesson.chapter)}&section_heading=eq.${encodeURIComponent(lesson.section_heading)}&select=id,point_number,human_title,human_body&order=point_number`
    );

    const idx = sectionLessons.findIndex((l: any) => l.id === lesson_id);
    const total = sectionLessons.length;
    const position = idx === 0 ? "opener" : idx === total - 1 ? "closer" : "middle";

    // Get neighbor lessons with their sources
    let lessonBefore = null;
    if (idx > 0) {
      const prev = sectionLessons[idx - 1];
      const prevSources = await sb(`lesson_sources?lesson_id=eq.${encodeURIComponent(prev.id)}&order=footnote_number`);
      lessonBefore = { id: prev.id, title: prev.human_title, body: prev.human_body, sources: prevSources };
    }

    let lessonAfter = null;
    if (idx < total - 1) {
      const next = sectionLessons[idx + 1];
      const nextSources = await sb(`lesson_sources?lesson_id=eq.${encodeURIComponent(next.id)}&order=footnote_number`);
      lessonAfter = { id: next.id, title: next.human_title, body: next.human_body, sources: nextSources };
    }

    return [{
      type: "text",
      text: JSON.stringify({
        current_lesson: {
          id: lesson.id,
          chapter: lesson.chapter,
          chapter_desc: lesson.chapter_desc,
          section: lesson.section,
          section_heading: lesson.section_heading,
          point_number: lesson.point_number,
          sources,
        },
        context: {
          position,
          position_index: idx + 1,
          total_in_section: total,
          lesson_before: lessonBefore,
          lesson_after: lessonAfter,
        },
        methodology: methodology?.[0]?.value || "Not found",
      }, null, 2),
    }];
  }
);

defineTool(
  "get_section_arc",
  "Get all lessons in a section to see the full arc: opener→chain→escalation→landing. Essential for maintaining flow when writing or editing any lesson in the section.",
  {
    chapter: { type: "string", description: "Chapter letter" },
    section_heading: { type: "string", description: "Section heading text" },
  },
  ["chapter", "section_heading"],
  async ({ chapter, section_heading }) => {
    const lessons = await sb(
      `lessons?chapter=eq.${encodeURIComponent(chapter)}&section_heading=eq.${encodeURIComponent(section_heading)}&select=id,point_number,human_title,human_body,status&order=point_number`
    );
    const arc = lessons.map((l: any, i: number) => ({
      ...l,
      position: i === 0 ? "opener" : i === lessons.length - 1 ? "closer" : "middle",
      connector_hint: i === 0 ? "standalone (no connector)" : "needs connector",
    }));
    return [{ type: "text", text: JSON.stringify({ section_heading, total_lessons: lessons.length, arc }, null, 2) }];
  }
);

defineTool(
  "validate_lesson",
  "Validate a lesson against SKILL-v2 quality checklist. Checks: title length (5-9 words, ends with ':'), body structure (one flowing sentence, ~46 words), no forbidden modern Hebrew words, and basic Iron Law compliance.",
  {
    title: { type: "string", description: "Lesson title to validate" },
    body: { type: "string", description: "Lesson body to validate" },
  },
  ["title", "body"],
  async ({ title, body }) => {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Title checks
    if (!title.endsWith(":")) {
      issues.push("Title must end with ':'");
    }
    const titleWords = title.replace(/:$/, "").trim().split(/\s+/);
    if (titleWords.length < 5) issues.push(`Title too short: ${titleWords.length} words (need 5-9)`);
    if (titleWords.length > 9) issues.push(`Title too long: ${titleWords.length} words (need 5-9)`);

    // Body checks
    const bodyWords = body.trim().split(/\s+/);
    if (bodyWords.length < 20) warnings.push(`Body very short: ${bodyWords.length} words (target ~46)`);
    if (bodyWords.length > 80) warnings.push(`Body very long: ${bodyWords.length} words (target ~46)`);

    const periods = (body.match(/\./g) || []).length;
    if (periods > 2) warnings.push(`Body has ${periods} periods - should be one flowing sentence (max 1-2 periods)`);

    // Forbidden modern Hebrew words
    const forbidden = ["\u05d1\u05d9\u05d8\u05d5\u05d9", "\u05ea\u05d5\u05d1\u05e0\u05d4", "\u05d4\u05e9\u05e4\u05e2\u05d4", "\u05de\u05d9\u05de\u05d5\u05e9", "\u05d0\u05e1\u05e4\u05e7\u05d8 \u05ea\u05d5\u05e8\u05e0\u05d9", "\u05de\u05d4 \u05e9\u05e0\u05d5\u05d2\u05e2 \u05dc"];
    for (const word of forbidden) {
      if (body.includes(word) || title.includes(word)) {
        issues.push(`Forbidden modern Hebrew: "${word}"`);
      }
    }

    const passed = issues.length === 0;
    return [{
      type: "text",
      text: JSON.stringify({
        passed,
        issues,
        warnings,
        stats: { title_words: titleWords.length, body_words: bodyWords.length, periods },
      }, null, 2),
    }];
  }
);

// ═══════════════════════════════════════════════════════════════
//  WRITE
// ═══════════════════════════════════════════════════════════════

defineTool(
  "create_lesson",
  "Create a new lesson. IMPORTANT: Follow SKILL-v2 methodology — title must be 5-9 words ending with ':', body must be one flowing sentence ~46 words. Use get_lesson_with_context first to check neighbors for proper connectors.",
  {
    id: { type: "string", description: "Lesson ID format: chapter.section.point, e.g. א.1.5" },
    chapter: { type: "string", description: "Chapter letter" },
    chapter_desc: { type: "string", description: "Chapter description" },
    section: { type: "string", description: "Section name / verse" },
    section_heading: { type: "string", description: "Section heading" },
    point_number: { type: "number", description: "Point number within section" },
    human_title: { type: "string", description: "Lesson title (Hebrew)" },
    human_body: { type: "string", description: "Lesson body (Hebrew)" },
    status: { type: "string", description: "Status (default: imported)" },
  },
  ["id", "chapter", "chapter_desc", "section", "section_heading", "point_number", "human_title", "human_body"],
  async (params) => {
    const data = await sb("lessons", {
      method: "POST",
      body: JSON.stringify({ ...params, status: params.status || "imported", updated_at: new Date().toISOString() }),
    });
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
  }
);

defineTool(
  "update_lesson",
  "Update an existing lesson. When updating title/body, follow SKILL-v2: title 5-9 words ending ':', body one flowing sentence. Use validate_lesson to check before saving.",
  {
    lesson_id: { type: "string", description: "Lesson ID to update" },
    human_title: { type: "string", description: "New title" },
    human_body: { type: "string", description: "New body" },
    status: { type: "string", description: "New status" },
    section: { type: "string", description: "New section" },
    section_heading: { type: "string", description: "New section heading" },
    point_number: { type: "number", description: "New point number" },
  },
  ["lesson_id"],
  async ({ lesson_id, ...fields }) => {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    const data = await sb(`lessons?id=eq.${encodeURIComponent(lesson_id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
  }
);

defineTool(
  "delete_lesson",
  "Delete a lesson and all its sources",
  { lesson_id: { type: "string", description: "Lesson ID to delete" } },
  ["lesson_id"],
  async ({ lesson_id }) => {
    const enc = encodeURIComponent(lesson_id);
    await sb(`lesson_sources?lesson_id=eq.${enc}`, { method: "DELETE" });
    await sb(`lessons?id=eq.${enc}`, { method: "DELETE" });
    return [{ type: "text", text: JSON.stringify({ deleted: lesson_id }) }];
  }
);

// ═══════════════════════════════════════════════════════════════
//  REORDER
// ═══════════════════════════════════════════════════════════════

defineTool(
  "move_lesson",
  "Move a lesson to a new position or section",
  {
    lesson_id: { type: "string", description: "Lesson ID to move" },
    new_point_number: { type: "number", description: "New position number" },
    new_section: { type: "string", description: "New section (if moving between sections)" },
    new_section_heading: { type: "string", description: "New section heading" },
  },
  ["lesson_id", "new_point_number"],
  async ({ lesson_id, new_point_number, new_section, new_section_heading }) => {
    const updates: Record<string, unknown> = { point_number: new_point_number, updated_at: new Date().toISOString() };
    if (new_section) updates.section = new_section;
    if (new_section_heading) updates.section_heading = new_section_heading;
    const data = await sb(`lessons?id=eq.${encodeURIComponent(lesson_id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
  }
);

defineTool(
  "reorder_section_lessons",
  "Set the order of all lessons in a section by providing lesson IDs in desired order",
  {
    chapter: { type: "string", description: "Chapter letter" },
    section_heading: { type: "string", description: "Section heading" },
    lesson_ids_in_order: { type: "array", items: { type: "string" }, description: "Lesson IDs in desired order" },
  },
  ["chapter", "section_heading", "lesson_ids_in_order"],
  async ({ chapter, section_heading, lesson_ids_in_order }) => {
    for (let i = 0; i < lesson_ids_in_order.length; i++) {
      await sb(`lessons?id=eq.${encodeURIComponent(lesson_ids_in_order[i])}`, {
        method: "PATCH",
        body: JSON.stringify({ point_number: i + 1, updated_at: new Date().toISOString() }),
      });
    }
    return [{ type: "text", text: JSON.stringify({ reordered: lesson_ids_in_order.length, chapter, section_heading }) }];
  }
);

// ═══════════════════════════════════════════════════════════════
//  VERSIONS
// ═══════════════════════════════════════════════════════════════

defineTool(
  "list_versions",
  "List all AI-generated versions for a lesson",
  { lesson_id: { type: "string", description: "Lesson ID" } },
  ["lesson_id"],
  async ({ lesson_id }) => {
    const data = await sb(`versions?lesson_id=eq.${encodeURIComponent(lesson_id)}&order=version_number`);
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
  }
);

defineTool(
  "save_version",
  "Save a new AI-generated version of a lesson, with optional evaluation comments",
  {
    lesson_id: { type: "string", description: "Lesson ID" },
    generated_title: { type: "string", description: "Generated title" },
    generated_body: { type: "string", description: "Generated body" },
    evaluation_notes: { type: "string", description: "Optional evaluation comments from the user" },
  },
  ["lesson_id", "generated_title", "generated_body"],
  async ({ lesson_id, generated_title, generated_body, evaluation_notes }) => {
    const existing = await sb(
      `versions?lesson_id=eq.${encodeURIComponent(lesson_id)}&select=version_number&order=version_number.desc&limit=1`
    );
    const nextNum = existing?.length ? existing[0].version_number + 1 : 1;
    const row: any = { lesson_id, version_number: nextNum, generated_title, generated_body, model: "claude-via-mcp" };
    if (evaluation_notes) row.evaluation_notes = evaluation_notes;
    const data = await sb("versions", {
      method: "POST",
      body: JSON.stringify(row),
    });
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
  }
);

// ═══════════════════════════════════════════════════════════════
//  SOURCES
// ═══════════════════════════════════════════════════════════════

defineTool(
  "add_source",
  "Add a source (footnote) to a lesson",
  {
    lesson_id: { type: "string", description: "Lesson ID" },
    source_type: { type: "string", enum: ["primary", "supporting"], description: "primary or supporting" },
    sefer: { type: "string", description: "Source book name" },
    location: { type: "string", description: "Location/page reference" },
    raw_text: { type: "string", description: "Full source text" },
    language: { type: "string", enum: ["hebrew", "yiddish"], description: "Language (default: hebrew)" },
    footnote_number: { type: "number", description: "Footnote number" },
  },
  ["lesson_id", "source_type", "sefer", "location", "raw_text", "footnote_number"],
  async (params) => {
    const data = await sb("lesson_sources", {
      method: "POST",
      body: JSON.stringify({ ...params, language: params.language || "hebrew" }),
    });
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
  }
);

defineTool(
  "delete_source",
  "Delete a specific source by its ID",
  { source_id: { type: "number", description: "Source row ID" } },
  ["source_id"],
  async ({ source_id }) => {
    await sb(`lesson_sources?id=eq.${source_id}`, { method: "DELETE" });
    return [{ type: "text", text: JSON.stringify({ deleted: source_id }) }];
  }
);

// ═══════════════════════════════════════════════════════════════
//  Reusable data helpers (shared by MCP tools + REST API)
// ═══════════════════════════════════════════════════════════════

async function fetchChapters() {
  const rows = await sb("lessons?select=chapter,chapter_desc&order=chapter");
  const map = new Map<string, { chapter: string; description: string; count: number }>();
  for (const r of rows) {
    const e = map.get(r.chapter);
    if (e) e.count++;
    else map.set(r.chapter, { chapter: r.chapter, description: r.chapter_desc, count: 1 });
  }
  return [...map.values()];
}

async function fetchSections(chapter: string) {
  const rows = await sb(
    `lessons?chapter=eq.${encodeURIComponent(chapter)}&select=section,section_heading&order=section`
  );
  const seen = new Set<string>();
  const result: { section: string; section_heading: string }[] = [];
  for (const r of rows) {
    if (!seen.has(r.section_heading)) {
      seen.add(r.section_heading);
      result.push({ section: r.section, section_heading: r.section_heading });
    }
  }
  return result;
}

async function fetchLessons(chapter: string, section_heading?: string) {
  let q = `lessons?chapter=eq.${encodeURIComponent(chapter)}&select=id,section,section_heading,point_number,human_title,status&order=id`;
  if (section_heading) q += `&section_heading=${encodeURIComponent(section_heading)}`;
  q += "&limit=200";
  return await sb(q);
}

async function fetchLessonContext(lesson_id: string) {
  const enc = encodeURIComponent(lesson_id);
  const [lessons, sources] = await Promise.all([
    sb(`lessons?id=eq.${enc}`),
    sb(`lesson_sources?lesson_id=eq.${enc}&order=footnote_number`),
  ]);
  if (!lessons?.length) return null;
  const lesson = lessons[0];
  const sectionLessons = await sb(
    `lessons?chapter=eq.${encodeURIComponent(lesson.chapter)}&section_heading=eq.${encodeURIComponent(lesson.section_heading)}&select=id,point_number,human_title,human_body&order=point_number`
  );
  const idx = sectionLessons.findIndex((l: any) => l.id === lesson_id);
  const total = sectionLessons.length;
  const position = idx === 0 ? "opener" : idx === total - 1 ? "closer" : "middle";
  const lessonBefore = idx > 0 ? { title: sectionLessons[idx - 1].human_title, body: sectionLessons[idx - 1].human_body } : null;
  const lessonAfter = idx < total - 1 ? { title: sectionLessons[idx + 1].human_title, body: sectionLessons[idx + 1].human_body } : null;
  return { lesson, sources, context: { position, position_index: idx + 1, total_in_section: total, lesson_before: lessonBefore, lesson_after: lessonAfter, chapter: lesson.chapter, chapter_desc: lesson.chapter_desc, section: lesson.section, section_heading: lesson.section_heading } };
}

async function fetchMethodology() {
  let rows = await sb("content?key=eq.methodology_v2&select=value");
  if (!rows?.length) rows = await sb("content?key=eq.methodology&select=value");
  return rows?.[0]?.value || "";
}

async function saveNewVersion(lesson_id: string, generated_title: string, generated_body: string) {
  const existing = await sb(
    `versions?lesson_id=eq.${encodeURIComponent(lesson_id)}&select=version_number&order=version_number.desc&limit=1`
  );
  const nextNum = existing?.length ? existing[0].version_number + 1 : 1;
  return await sb("versions", {
    method: "POST",
    body: JSON.stringify({ lesson_id, version_number: nextNum, generated_title, generated_body, model: "claude-via-app" }),
  });
}

const APP_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>שפע יואל — מחולל שיעורים</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#0f172a;color:#e2e8f0;padding:16px;max-width:1200px;margin:0 auto;direction:rtl}
h1{text-align:center;color:#f59e0b;margin-bottom:8px;font-size:1.6em}
.subtitle{text-align:center;color:#94a3b8;margin-bottom:20px;font-size:.9em}
label{font-size:.85em;color:#94a3b8;display:block;margin-bottom:4px}
select,input,textarea{width:100%;padding:8px 10px;border:1px solid #334155;border-radius:6px;background:#1e293b;color:#e2e8f0;font-size:.95em;font-family:inherit;direction:rtl}
select:focus,input:focus,textarea:focus{outline:none;border-color:#f59e0b}
textarea{resize:vertical;min-height:100px;line-height:1.6}
button{padding:10px 24px;border:none;border-radius:6px;font-size:1em;cursor:pointer;font-weight:600;transition:all .15s}
.btn-primary{background:#f59e0b;color:#0f172a}
.btn-primary:hover{background:#fbbf24}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.btn-secondary{background:#334155;color:#e2e8f0}
.btn-secondary:hover{background:#475569}
.btn-save{background:#10b981;color:#fff}
.btn-save:hover{background:#34d399}
.row{display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.row>*{flex:1;min-width:120px}
.card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:14px;margin-bottom:12px}
.card h3{color:#f59e0b;font-size:.95em;margin-bottom:8px;border-bottom:1px solid #334155;padding-bottom:6px}
.card pre{white-space:pre-wrap;word-break:break-word;font-size:.85em;line-height:1.5;color:#cbd5e1;max-height:300px;overflow-y:auto}
.source-item{background:#0f172a;border:1px solid #334155;border-radius:4px;padding:8px;margin-bottom:6px}
.source-item .sefer{color:#f59e0b;font-weight:600;font-size:.85em}
.source-item .loc{color:#94a3b8;font-size:.8em}
.source-item .text{margin-top:4px;font-size:.85em;line-height:1.5}
.context-badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:.8em;font-weight:600;margin-left:8px}
.badge-opener{background:#10b981;color:#fff}
.badge-middle{background:#3b82f6;color:#fff}
.badge-closer{background:#ef4444;color:#fff}
.result-box{background:#1a2332;border:2px solid #f59e0b;border-radius:8px;padding:16px}
.result-title{font-size:1.2em;font-weight:700;color:#fbbf24;margin-bottom:8px}
.result-body{font-size:1.05em;line-height:1.7;color:#e2e8f0}
.stats{display:flex;gap:16px;margin-top:10px;flex-wrap:wrap}
.stat{background:#0f172a;padding:4px 10px;border-radius:4px;font-size:.8em;color:#94a3b8}
.stat b{color:#f59e0b}
.key-row{display:flex;gap:8px;align-items:end;margin-bottom:16px}
.key-row>div:first-child{flex:1}
.key-row>button{margin-bottom:0;white-space:nowrap}
#status{text-align:center;padding:8px;color:#94a3b8;font-size:.9em}
.spinner{display:inline-block;width:18px;height:18px;border:2px solid #334155;border-top-color:#f59e0b;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-left:8px}
@keyframes spin{to{transform:rotate(360deg)}}
.hidden{display:none}
.neighbor{background:#0f172a;border:1px solid #334155;border-radius:4px;padding:8px;margin-bottom:6px}
.neighbor .n-title{color:#fbbf24;font-weight:600;font-size:.9em}
.neighbor .n-body{color:#94a3b8;font-size:.85em;margin-top:2px}
.toolbar{display:flex;gap:8px;justify-content:center;margin:12px 0;flex-wrap:wrap}
</style>
</head>
<body>
<h1>שפע יואל — מחולל שיעורים</h1>
<p class="subtitle">SKILL-v2 Lesson Generator</p>

<div class="key-row">
  <div>
    <label for="apiKey">Claude API Key</label>
    <input type="password" id="apiKey" placeholder="sk-ant-..." />
  </div>
  <button class="btn-secondary" onclick="toggleKey()">הצג</button>
</div>

<div class="row">
  <div>
    <label>פרק</label>
    <select id="chapter" onchange="loadSections()"><option value="">בחר פרק...</option></select>
  </div>
  <div>
    <label>סעיף</label>
    <select id="section" onchange="loadLessons()"><option value="">בחר סעיף...</option></select>
  </div>
  <div>
    <label>שיעור</label>
    <select id="lesson"><option value="">בחר שיעור...</option></select>
  </div>
</div>

<div class="toolbar">
  <button class="btn-primary" onclick="loadContext()">טען שיעור</button>
</div>

<div id="contextPanel" class="hidden">
  <div class="row">
    <div class="card" style="flex:2">
      <h3>מקורות</h3>
      <div id="sourcesPanel"></div>
    </div>
    <div class="card" style="flex:1">
      <h3>הקשר</h3>
      <div id="contextInfo"></div>
    </div>
  </div>

  <div class="row">
    <div class="card" id="beforeCard" style="flex:1">
      <h3>שיעור קודם</h3>
      <div id="beforePanel">—</div>
    </div>
    <div class="card" id="afterCard" style="flex:1">
      <h3>שיעור הבא</h3>
      <div id="afterPanel">—</div>
    </div>
  </div>

  <div class="card">
    <h3>פרומפט (ניתן לעריכה)</h3>
    <textarea id="prompt" rows="14"></textarea>
  </div>

  <div class="toolbar">
    <button class="btn-primary" id="generateBtn" onclick="generate()">חולל שיעור</button>
  </div>
</div>

<div id="status"></div>

<div id="resultPanel" class="hidden">
  <div class="result-box">
    <div class="result-title" id="resultTitle"></div>
    <div class="result-body" id="resultBody"></div>
    <div class="stats" id="resultStats"></div>
  </div>
  <div class="toolbar">
    <button class="btn-save" onclick="saveVersion()">שמור גרסה</button>
    <button class="btn-primary" onclick="generate()">חולל מחדש</button>
  </div>
</div>

<script>
const API = '';
let currentData = null;
let currentMethodology = '';

function $(id){return document.getElementById(id)}
function toggleKey(){const i=$('apiKey');i.type=i.type==='password'?'text':'password'}

async function api(path){
  const r=await fetch(API+path);
  return r.json();
}

async function init(){
  const k=sessionStorage.getItem('claude_key');
  if(k) $('apiKey').value=k;
  $('apiKey').addEventListener('change',()=>sessionStorage.setItem('claude_key',$('apiKey').value));
  try{
    const chapters=await api('/api/chapters');
    const sel=$('chapter');
    for(const c of chapters){
      const o=document.createElement('option');
      o.value=c.chapter;
      o.textContent=c.chapter+' — '+c.description+' ('+c.count+')';
      sel.appendChild(o);
    }
  }catch(e){console.error(e)}
}

async function loadSections(){
  const ch=$('chapter').value;
  if(!ch)return;
  const sections=await api('/api/sections?chapter='+encodeURIComponent(ch));
  const sel=$('section');
  sel.innerHTML='<option value="">בחר סעיף...</option>';
  for(const s of sections){
    const o=document.createElement('option');
    o.value=s.section_heading;
    o.textContent=s.section+' — '+s.section_heading.slice(0,60);
    sel.appendChild(o);
  }
  $('lesson').innerHTML='<option value="">בחר שיעור...</option>';
}

async function loadLessons(){
  const ch=$('chapter').value,sh=$('section').value;
  if(!ch||!sh)return;
  const lessons=await api('/api/lessons?chapter='+encodeURIComponent(ch)+'&section_heading='+encodeURIComponent(sh));
  const sel=$('lesson');
  sel.innerHTML='<option value="">בחר שיעור...</option>';
  for(const l of lessons){
    const o=document.createElement('option');
    o.value=l.id;
    const title=l.human_title||'(ללא כותרת)';
    o.textContent=l.id+' — '+title.slice(0,50)+' ['+l.status+']';
    sel.appendChild(o);
  }
}

async function loadContext(){
  const id=$('lesson').value;
  if(!id){alert('בחר שיעור');return}
  $('status').innerHTML='טוען...<span class="spinner"></span>';
  try{
    const [data,meth]=await Promise.all([
      api('/api/lesson-context/'+encodeURIComponent(id)),
      api('/api/methodology')
    ]);
    currentData=data;
    currentMethodology=meth.text||meth;

    // Sources
    const sp=$('sourcesPanel');
    sp.innerHTML='';
    if(data.sources?.length){
      for(const s of data.sources){
        sp.innerHTML+='<div class="source-item"><span class="sefer">'+esc(s.sefer)+'</span> <span class="loc">'+esc(s.location||'')+'</span> ('+esc(s.source_type)+')'+
          '<div class="text">'+esc(s.raw_text?.slice(0,300)||(s.raw_text||''))+'</div></div>';
      }
    }else{sp.textContent='אין מקורות'}

    // Context info
    const ctx=data.context;
    const badgeClass=ctx.position==='opener'?'badge-opener':ctx.position==='closer'?'badge-closer':'badge-middle';
    $('contextInfo').innerHTML='<span class="context-badge '+badgeClass+'">'+ctx.position+' ('+ctx.position_index+'/'+ctx.total_in_section+')</span>'+
      '<p style="margin-top:8px;font-size:.85em">פרק: '+esc(ctx.chapter)+' — '+esc(ctx.chapter_desc||'')+'</p>'+
      '<p style="font-size:.85em">סעיף: '+esc(ctx.section_heading||'')+'</p>';

    // Before/After
    if(ctx.lesson_before){
      $('beforePanel').innerHTML='<div class="neighbor"><div class="n-title">'+esc(ctx.lesson_before.title||'')+'</div><div class="n-body">'+esc(ctx.lesson_before.body?.slice(0,150)||'')+'</div></div>';
    }else{$('beforePanel').textContent='—'}
    if(ctx.lesson_after){
      $('afterPanel').innerHTML='<div class="neighbor"><div class="n-title">'+esc(ctx.lesson_after.title||'')+'</div><div class="n-body">'+esc(ctx.lesson_after.body?.slice(0,150)||'')+'</div></div>';
    }else{$('afterPanel').textContent='—'}

    // Build prompt
    buildPrompt(data,currentMethodology);

    $('contextPanel').classList.remove('hidden');
    $('resultPanel').classList.add('hidden');
    $('status').textContent='';
  }catch(e){
    $('status').textContent='שגיאה: '+e.message;
  }
}

function buildPrompt(data,meth){
  const ctx=data.context;
  const lesson=data.lesson;
  let sourcesText='';
  for(const s of (data.sources||[])){
    sourcesText+='\\n- ['+s.source_type+'] '+s.sefer+' ('+s.location+'): '+s.raw_text;
  }
  const beforeText=ctx.lesson_before?'כותרת: '+ctx.lesson_before.title+'\\nגוף: '+ctx.lesson_before.body:'(אין — זה השיעור הראשון)';
  const afterText=ctx.lesson_after?'כותרת: '+ctx.lesson_after.title+'\\nגוף: '+ctx.lesson_after.body:'(אין — זה השיעור האחרון)';

  const prompt=meth+'\\n\\n═══════════════════════════════\\nMISSION: Write lesson '+lesson.id+'\\n═══════════════════════════════\\n\\n'+
    'Chapter: '+ctx.chapter+' — '+ctx.chapter_desc+'\\n'+
    'Section: '+ctx.section_heading+'\\n'+
    'Position: '+ctx.position+' ('+ctx.position_index+'/'+ctx.total_in_section+')\\n\\n'+
    '── SOURCES ──'+sourcesText+'\\n\\n'+
    '── LESSON BEFORE ──\\n'+beforeText+'\\n\\n'+
    '── LESSON AFTER ──\\n'+afterText+'\\n\\n'+
    '── CURRENT LESSON (to rewrite) ──\\n'+
    'Title: '+(lesson.human_title||'(empty)')+'\\n'+
    'Body: '+(lesson.human_body||'(empty)')+'\\n\\n'+
    '── INSTRUCTIONS ──\\n'+
    'Generate a new title and body for this lesson following SKILL-v2 methodology exactly.\\n'+
    'Title: 5-9 Hebrew words ending with ":"\\n'+
    'Body: One flowing sentence, ~46 words, elevated Lashon Hakodesh.\\n'+
    (ctx.position!=='opener'?'Start body with a connector word (וכן, ולפיכך, ועוד ש, גם, אף, יתר על כן, ומכאן ש).\\n':'')+
    '\\nOutput format:\\nכותרת: <title>\\nגוף: <body>';

  $('prompt').value=prompt;
}

async function generate(){
  const key=$('apiKey').value;
  if(!key){alert('הכנס Claude API Key');return}
  const prompt=$('prompt').value;
  if(!prompt){alert('אין פרומפט');return}

  $('generateBtn').disabled=true;
  $('status').innerHTML='מחולל שיעור...<span class="spinner"></span>';
  $('resultPanel').classList.add('hidden');

  try{
    const r=await fetch(API+'/api/generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt,api_key:key})
    });
    const d=await r.json();
    if(d.error){throw new Error(d.error)}
    const text=d.text||'';

    // Parse output
    const titleMatch=text.match(/כותרת:\\s*(.+)/);
    const bodyMatch=text.match(/גוף:\\s*(.+)/);
    const title=titleMatch?titleMatch[1].trim():text.split('\\n')[0];
    const body=bodyMatch?bodyMatch[1].trim():text;

    $('resultTitle').textContent=title;
    $('resultBody').textContent=body;

    // Stats
    const tw=title.replace(/:$/,'').trim().split(/\\s+/).length;
    const bw=body.trim().split(/\\s+/).length;
    const periods=(body.match(/\\./g)||[]).length;
    $('resultStats').innerHTML=
      '<span class="stat">מילות כותרת: <b>'+tw+'</b> (5-9)</span>'+
      '<span class="stat">מילות גוף: <b>'+bw+'</b> (~46)</span>'+
      '<span class="stat">נקודות: <b>'+periods+'</b> (0-1)</span>'+
      '<span class="stat">נקודתיים: <b>'+(title.endsWith(':')?'✓':'✗')+'</b></span>';

    $('resultPanel').classList.remove('hidden');
    $('status').textContent='';

    currentData._generated={title,body};
  }catch(e){
    $('status').textContent='שגיאה: '+e.message;
  }finally{
    $('generateBtn').disabled=false;
  }
}

async function saveVersion(){
  if(!currentData?._generated){alert('אין תוצאה');return}
  const id=currentData.lesson.id;
  const{title,body}=currentData._generated;
  $('status').innerHTML='שומר גרסה...<span class="spinner"></span>';
  try{
    await fetch(API+'/api/save-version',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lesson_id:id,generated_title:title,generated_body:body})
    });
    $('status').textContent='נשמר בהצלחה!';
    setTimeout(()=>$('status').textContent='',3000);
  }catch(e){
    $('status').textContent='שגיאה: '+e.message;
  }
}

function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

init();
</script>
</body>
</html>`;

// ═══════════════════════════════════════════════════════════════
//  MCP Protocol Handler
// ═══════════════════════════════════════════════════════════════

const SERVER_INFO = {
  name: "shefa-yoel",
  version: "2.0.0",
};

function jsonrpc(id: any, result: any) {
  return { jsonrpc: "2.0", id, result };
}

function jsonrpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMcpMessage(msg: any): Promise<any> {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return jsonrpc(id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
      return null;

    case "ping":
      return jsonrpc(id, {});

    case "tools/list":
      return jsonrpc(id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) return jsonrpcError(id, -32601, `Unknown tool: ${params?.name}`);
      try {
        const content = await tool.handler(params?.arguments || {});
        return jsonrpc(id, { content, isError: false });
      } catch (e: any) {
        return jsonrpc(id, {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        });
      }
    }

    default:
      return jsonrpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ═══════════════════════════════════════════════════════════════
//  CORS
// ═══════════════════════════════════════════════════════════════

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

// ═══════════════════════════════════════════════════════════════
//  Worker entry point
// ═══════════════════════════════════════════════════════════════

interface Env {
  CLAUDE_API_KEY?: string;
}

export default {
  async fetch(request: Request, env?: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── App UI ──
    if (url.pathname === "/app" && request.method === "GET") {
      return new Response(APP_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8", ...CORS },
      });
    }

    // ── REST API for the App ──
    if (url.pathname === "/api/chapters" && request.method === "GET") {
      return Response.json(await fetchChapters(), { headers: CORS });
    }

    if (url.pathname === "/api/sections" && request.method === "GET") {
      const ch = url.searchParams.get("chapter");
      if (!ch) return Response.json({ error: "chapter required" }, { status: 400, headers: CORS });
      return Response.json(await fetchSections(ch), { headers: CORS });
    }

    if (url.pathname === "/api/lessons" && request.method === "GET") {
      const ch = url.searchParams.get("chapter");
      if (!ch) return Response.json({ error: "chapter required" }, { status: 400, headers: CORS });
      const sh = url.searchParams.get("section_heading") || undefined;
      return Response.json(await fetchLessons(ch, sh), { headers: CORS });
    }

    if (url.pathname.startsWith("/api/lesson-context/") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/api/lesson-context/".length));
      const data = await fetchLessonContext(id);
      if (!data) return Response.json({ error: "not found" }, { status: 404, headers: CORS });
      return Response.json(data, { headers: CORS });
    }

    if (url.pathname === "/api/methodology" && request.method === "GET") {
      const text = await fetchMethodology();
      return Response.json({ text }, { headers: CORS });
    }

    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const { prompt, api_key } = await request.json() as any;
        const key = api_key || env?.CLAUDE_API_KEY;
        if (!key) return Response.json({ error: "No API key provided" }, { status: 401, headers: CORS });
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2048,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const result = await resp.json() as any;
        if (result.error) return Response.json({ error: result.error.message || JSON.stringify(result.error) }, { headers: CORS });
        const text = result.content?.[0]?.text || "";
        return Response.json({ text }, { headers: CORS });
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers: CORS });
      }
    }

    if (url.pathname === "/api/save-version" && request.method === "POST") {
      try {
        const { lesson_id, generated_title, generated_body } = await request.json() as any;
        const data = await saveNewVersion(lesson_id, generated_title, generated_body);
        return Response.json(data, { headers: CORS });
      } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500, headers: CORS });
      }
    }

    if (url.pathname === "/mcp" && request.method === "POST") {
      try {
        const body = await request.json() as any;

        if (Array.isArray(body)) {
          const results = [];
          for (const msg of body) {
            const res = await handleMcpMessage(msg);
            if (res) results.push(res);
          }
          return new Response(JSON.stringify(results), {
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const result = await handleMcpMessage(body);
        if (!result) {
          return new Response("", { status: 202, headers: CORS });
        }
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      } catch (e: any) {
        return new Response(
          JSON.stringify(jsonrpcError(null, -32700, `Parse error: ${e.message}`)),
          { status: 400, headers: { "Content-Type": "application/json", ...CORS } }
        );
      }
    }

    if (url.pathname === "/sse" && request.method === "GET") {
      const sessionId = crypto.randomUUID();
      const messageUrl = `${url.origin}/sse/message?sessionId=${sessionId}`;

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`event: endpoint\ndata: ${messageUrl}\n\n`));
          const interval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": ping\n\n"));
            } catch {
              clearInterval(interval);
            }
          }, 30000);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...CORS,
        },
      });
    }

    if (url.pathname === "/sse/message" && request.method === "POST") {
      try {
        const body = await request.json() as any;
        const result = await handleMcpMessage(body);
        if (!result) {
          return new Response("", { status: 202, headers: CORS });
        }
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      } catch (e: any) {
        return new Response(
          JSON.stringify(jsonrpcError(null, -32700, `Parse error: ${e.message}`)),
          { status: 400, headers: { "Content-Type": "application/json", ...CORS } }
        );
      }
    }

    // Health check / redirect to app
    if (url.pathname === "/") {
      return Response.redirect(`${url.origin}/app`, 302);
    }
    return new Response(
      `Shefa Yoel MCP Server v2.1\n\nApp:  ${url.origin}/app\nSSE:  ${url.origin}/sse\nHTTP: ${url.origin}/mcp`,
      { headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS } }
    );
  },
};