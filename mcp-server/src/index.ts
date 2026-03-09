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
  "update_content",
  "Update methodology, style examples, or any other content document in the database",
  {
    key: { type: "string", description: "Content key: 'methodology', 'style_examples', or custom" },
    value: { type: "string", description: "The full content text (markdown)" },
    description: { type: "string", description: "Short description" },
  },
  ["key", "value"],
  async ({ key, value, description }) => {
    const existing = await sb(`content?key=eq.${encodeURIComponent(key)}&select=key`);
    const body = { key, value, description, updated_at: new Date().toISOString() };
    let data;
    if (existing?.length) {
      data = await sb(`content?key=eq.${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ value, description, updated_at: new Date().toISOString() }),
      });
    } else {
      data = await sb("content", { method: "POST", body: JSON.stringify(body) });
    }
    return [{ type: "text", text: JSON.stringify(data, null, 2) }];
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
  "Save a new AI-generated version of a lesson",
  {
    lesson_id: { type: "string", description: "Lesson ID" },
    generated_title: { type: "string", description: "Generated title" },
    generated_body: { type: "string", description: "Generated body" },
  },
  ["lesson_id", "generated_title", "generated_body"],
  async ({ lesson_id, generated_title, generated_body }) => {
    const existing = await sb(
      `versions?lesson_id=eq.${encodeURIComponent(lesson_id)}&select=version_number&order=version_number.desc&limit=1`
    );
    const nextNum = existing?.length ? existing[0].version_number + 1 : 1;
    const data = await sb("versions", {
      method: "POST",
      body: JSON.stringify({ lesson_id, version_number: nextNum, generated_title, generated_body, model: "claude-via-mcp" }),
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

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
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

    return new Response(
      `Shefa Yoel MCP Server v2.0\n\nSSE:  ${url.origin}/sse\nHTTP: ${url.origin}/mcp`,
      { headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS } }
    );
  },
};