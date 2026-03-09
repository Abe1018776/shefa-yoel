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
  "Get the SKILL.md lesson-generation methodology. Read this FIRST before writing any lesson.",
  {},
  [],
  async () => {
    const rows = await sb("content?key=eq.methodology&select=value");
    return [{ type: "text", text: rows?.[0]?.value || "Not found" }];
  }
);

defineTool(
  "get_style_examples",
  "Get detailed style examples showing good vs bad lesson writing patterns",
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
    chapter: { type: "string", description: "Chapter letter: א, ב, ג, or ד" },
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
  "Get a single lesson with all its sources, context, and metadata",
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
//  WRITE
// ═══════════════════════════════════════════════════════════════

defineTool(
  "create_lesson",
  "Create a new lesson in a chapter/section",
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
  "Update fields of an existing lesson",
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
  version: "1.0.0",
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
      return null; // No response for notifications

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

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Streamable HTTP transport: POST /mcp
    if (url.pathname === "/mcp" && request.method === "POST") {
      try {
        const body = await request.json() as any;

        // Handle batch requests
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

        // Single message
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

    // SSE transport: GET /sse → establish SSE stream, POST /sse/message → send message
    if (url.pathname === "/sse" && request.method === "GET") {
      const sessionId = crypto.randomUUID();
      const messageUrl = `${url.origin}/sse/message?sessionId=${sessionId}`;

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`event: endpoint\ndata: ${messageUrl}\n\n`));
          // Keep connection alive with periodic pings
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

    // Health check
    return new Response(
      `Shefa Yoel MCP Server\n\nSSE:  ${url.origin}/sse\nHTTP: ${url.origin}/mcp`,
      { headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS } }
    );
  },
};
