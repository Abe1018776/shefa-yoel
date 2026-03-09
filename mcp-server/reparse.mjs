/**
 * Re-parse .docx chapters and update Supabase database.
 * Improved parser matching the quality of the original Python docx_parser.py.
 * Uses adm-zip to read docx XML directly.
 */
import pg from "pg";
import AdmZip from "adm-zip";

const client = new pg.Client({
  host: "db.idbvezfpkodmohebrwkc.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "ShefaYoel2026!",
  ssl: { rejectUnauthorized: false },
});

// ── XML helpers ─────────────────────────────────────────────────────

function getTextFromXml(xml) {
  const texts = [];
  const regex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    texts.push(match[1]);
  }
  return texts.join("");
}

function getTextsFromParagraphs(xml) {
  const paras = [];
  const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const text = getTextFromXml(match[0]);
    if (text.trim()) paras.push(text.trim());
  }
  return paras;
}

// ── Extract notes ───────────────────────────────────────────────────

function extractNotes(zip, filename) {
  const notes = {};
  const entry = zip.getEntry(filename);
  if (!entry) return notes;

  const xml = zip.readAsText(filename);
  const tagName = filename.includes("footnote") ? "w:footnote" : "w:endnote";
  const regex = new RegExp(
    `<${tagName}[^>]*\\bw:id="(\\d+)"[\\s\\S]*?<\\/${tagName}>`,
    "g"
  );
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const id = parseInt(m[1]);
    if (id <= 0) continue;
    const paras = getTextsFromParagraphs(m[0]);
    if (paras.length > 0) {
      notes[id] = paras.join("\n");
    }
  }
  return notes;
}

// ── Parse paragraph properties from XML ─────────────────────────────

function parseParagraph(pXml) {
  const text = getTextFromXml(pXml).trim();

  const styleMatch = pXml.match(/<w:pStyle\s+w:val="([^"]+)"/);
  const style = styleMatch ? styleMatch[1] : "Normal";

  const hasBold =
    /<w:b\/>/.test(pXml) ||
    /<w:b\s*>/.test(pXml) ||
    (/<w:b\s+w:val="/.test(pXml) && !/<w:b\s+w:val="(false|0)"/.test(pXml));

  const sizes = [];
  const szRegex = /<w:sz\s+w:val="(\d+)"/g;
  let szMatch;
  while ((szMatch = szRegex.exec(pXml)) !== null) {
    sizes.push(parseInt(szMatch[1]) / 2);
  }
  const fontSize = sizes.length > 0 ? Math.max(...sizes) : 0;

  const alignMatch = pXml.match(/<w:jc\s+w:val="([^"]+)"/);
  const align = alignMatch ? alignMatch[1] : "";

  const fnRefs = [];
  const fnRefRegex = /<w:footnoteReference\s+w:id="(\d+)"/g;
  let fnRefMatch;
  while ((fnRefMatch = fnRefRegex.exec(pXml)) !== null) {
    fnRefs.push(parseInt(fnRefMatch[1]));
  }

  const enRefs = [];
  const enRefRegex = /<w:endnoteReference\s+w:id="(\d+)"/g;
  let enRefMatch;
  while ((enRefMatch = enRefRegex.exec(pXml)) !== null) {
    enRefs.push(parseInt(enRefMatch[1]));
  }

  return { text, style, bold: hasBold, fontSize, align, fnRefs, enRefs };
}

// ── Paragraph classifier (mirrors Python classify_paragraph) ────────

function classifyParagraph(p, headerCount, hasSectionStarted) {
  if (!p.text) return "empty";

  const isCenter = p.align === "center";
  const isNormal = p.style === "Normal";
  const isBody = p.style.includes("List") || p.style === "ListParagraph" || p.style === "a9";
  const endsWithColon = p.text.endsWith(":") || p.text.endsWith("::");

  if (headerCount < 3 && isNormal && p.bold && isCenter) {
    return "chapter_header";
  }

  if (
    p.style === "Heading2" ||
    p.style === "2" ||
    p.style.includes("Heading")
  ) {
    return "section_heading";
  }

  if (p.fontSize > 18 && isCenter) {
    return "skip_large";
  }

  if (
    p.style === "3" || p.style === "5" || p.style === "1" ||
    p.style === "NormalWeb" || p.style === "af4" ||
    p.style.includes("\u05de\u05db\u05d5\u05df")
  ) {
    return "skip_source_material";
  }

  if (!hasSectionStarted && !isBody) {
    return "skip_preamble";
  }

  if (isBody && p.bold && p.fontSize <= 14 && endsWithColon) {
    return "lesson_title";
  }

  if (
    p.bold &&
    !isBody &&
    p.fontSize <= 18
  ) {
    return "lesson_title";
  }

  if (isBody && !p.bold && p.fontSize > 0 && p.fontSize <= 14 && p.fnRefs.length === 0) {
    return "skip_source_material";
  }

  if (isBody) {
    return "lesson_body";
  }

  if (isNormal && !p.bold && p.fontSize <= 18 && p.fnRefs.length === 0) {
    return "skip_reference";
  }

  if (isNormal && !p.bold && p.fontSize <= 18) {
    return "continuation";
  }

  return "other";
}

// ── Docx Parser ─────────────────────────────────────────────────────

function parseDocx(filepath) {
  const zip = new AdmZip(filepath);
  const docXml = zip.readAsText("word/document.xml");
  const footnotes = extractNotes(zip, "word/footnotes.xml");
  const endnotes = extractNotes(zip, "word/endnotes.xml");

  const paragraphs = [];
  const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let pMatch;
  while ((pMatch = pRegex.exec(docXml)) !== null) {
    paragraphs.push(parseParagraph(pMatch[0]));
  }

  return { paragraphs, footnotes, endnotes };
}

function parseChapter(filepath, chapterNum, chapterDesc) {
  console.log(`\nParsing: ${filepath}`);
  const { paragraphs, footnotes, endnotes } = parseDocx(filepath);
  console.log(
    `  ${paragraphs.length} paragraphs, ${Object.keys(footnotes).length} footnotes, ${Object.keys(endnotes).length} endnotes`
  );

  const lessons = [];
  let currentSection = null;
  let currentSectionHeading = null;
  let currentLesson = null;
  let currentTitlePara = null;
  let lessonCounter = 0;
  let sectionCounter = 0;
  let headerCount = 0;

  for (const p of paragraphs) {
    if (!p.text) continue;

    const role = classifyParagraph(p, headerCount, sectionCounter > 0);

    if (role === "chapter_header") {
      headerCount++;
      continue;
    }

    if (role === "section_heading") {
      sectionCounter++;
      const slashIdx = p.text.indexOf("/");
      if (slashIdx !== -1) {
        currentSectionHeading = p.text.slice(0, slashIdx).trim();
        currentSection = p.text.slice(slashIdx + 1).trim();
      } else {
        currentSectionHeading = p.text;
        currentSection = p.text;
      }
      lessonCounter = 0;
      currentLesson = null;
      currentTitlePara = null;
      continue;
    }

    if (role === "skip_large" || role === "skip_source_material" || role === "skip_reference" || role === "skip_preamble") {
      continue;
    }

    if (role === "lesson_title") {
      currentTitlePara = p;
      currentLesson = null;
      continue;
    }

    if (role === "lesson_body") {
      lessonCounter++;
      const lessonId = `${chapterNum}.${sectionCounter}.${lessonCounter}`;

      const allFnRefs = [];
      const allEnRefs = [];

      if (currentTitlePara) {
        allFnRefs.push(...currentTitlePara.fnRefs);
        allEnRefs.push(...currentTitlePara.enRefs);
      }
      allFnRefs.push(...p.fnRefs);
      allEnRefs.push(...p.enRefs);

      const lessonFootnotes = {};
      for (const fnId of allFnRefs) {
        if (footnotes[fnId]) {
          lessonFootnotes[fnId] = footnotes[fnId];
        }
      }

      const lessonEndnotes = {};
      for (const enId of allEnRefs) {
        if (endnotes[enId]) {
          lessonEndnotes[enId] = endnotes[enId];
        }
      }

      currentLesson = {
        id: lessonId,
        chapter: chapterNum,
        chapter_desc: chapterDesc,
        section: currentSection,
        section_heading: currentSectionHeading,
        point_number: lessonCounter,
        human_title: currentTitlePara ? currentTitlePara.text : null,
        human_body: p.text,
        footnote_refs: allFnRefs,
        endnote_refs: allEnRefs,
        footnotes: lessonFootnotes,
        endnotes_data: lessonEndnotes,
      };

      lessons.push(currentLesson);
      currentTitlePara = null;
      continue;
    }

    if (
      (role === "continuation" || role === "other") &&
      currentLesson !== null
    ) {
      currentLesson.human_body += "\n" + p.text;
      currentLesson.footnote_refs.push(...p.fnRefs);
      currentLesson.endnote_refs.push(...p.enRefs);
      for (const fnId of p.fnRefs) {
        if (footnotes[fnId]) {
          currentLesson.footnotes[fnId] = footnotes[fnId];
        }
      }
      for (const enId of p.enRefs) {
        if (endnotes[enId]) {
          currentLesson.endnotes_data[enId] = endnotes[enId];
        }
      }
      continue;
    }
  }

  for (const lesson of lessons) {
    lesson.footnote_refs = [...new Set(lesson.footnote_refs)].sort(
      (a, b) => a - b
    );
    lesson.endnote_refs = [...new Set(lesson.endnote_refs)].sort(
      (a, b) => a - b
    );
  }

  console.log(
    `  Found ${lessons.length} lessons across ${sectionCounter} sections`
  );
  return { lessons, footnotes, endnotes };
}

// ── Source parsing ─────────────────────────────────────────────────

const YIDDISH_MARKERS = [
  "\u05d5\u05d5\u05d0\u05e1", "\u05d3\u05e2\u05e8", "\u05d0\u05d9\u05df", "\u05e4\u05d5\u05df", "\u05de\u05d9\u05d8", "\u05d0\u05d9\u05d6", "\u05e0\u05d9\u05d8", "\u05d0\u05d5\u05d9\u05e3",
  "\u05d6\u05d9\u05da", "\u05d4\u05d0\u05d8", "\u05d5\u05d5\u05e2\u05d8", "\u05e0\u05d0\u05e8", "\u05d3\u05d0\u05e1", "\u05d2\u05e2\u05d5\u05d5\u05e2\u05df", "\u05de\u05e2\u05df", "\u05d6\u05e2\u05e0\u05e2\u05df", "\u05d0\u05dc\u05e2", "\u05e0\u05d9\u05e9\u05d8",
];

function detectLanguage(text) {
  const sample = text.slice(0, 500);
  const count = YIDDISH_MARKERS.filter((m) => sample.includes(m)).length;
  return count >= 2 ? "yiddish" : "hebrew";
}

function parseSingleCitation(text) {
  const source = {
    sefer: "",
    location: "",
    quote: "",
    language: detectLanguage(text),
    page: "",
    siman: "",
    parsha: "",
  };

  const m = text.match(
    /^([\u0590-\u05FF\s"\u05f4'\u05f3.\-]+?)\s*\(([^)]+)\)\s*:?\s*([\s\S]*)/
  );
  if (m) {
    source.sefer = m[1].trim();
    source.location = m[2].trim();
    let quote = m[3].trim();
    if (quote.startsWith("\u201c") || quote.startsWith('"'))
      quote = quote.slice(1);
    if (quote.endsWith("\u201d") || quote.endsWith('"'))
      quote = quote.slice(0, -1);
    source.quote = quote || "";
  } else {
    const m2 = text.match(
      /^([\u0590-\u05FF\s"\u05f4'\u05f3.\-]+?)\s*:\s*([\s\S]*)/
    );
    if (m2) {
      source.sefer = m2[1].trim();
      source.quote = m2[2].trim();
    } else {
      source.quote = text;
    }
  }

  if (source.location) {
    const pageMatch = source.location.match(
      /\u05e2\u05de['\u05f4]?\s*([\u0590-\u05FF'\u05f4]+)/
    );
    if (pageMatch) source.page = pageMatch[1];

    const simanMatch = source.location.match(
      /\u05e1\u05d9['\u05f4]?\s*([\u0590-\u05FF'\u05f4]+)/
    );
    if (simanMatch) source.siman = simanMatch[1];

    const parsha = source.location.split(/,|\u05e2\u05de|\u05e1\u05d9/)[0].trim();
    if (parsha) source.parsha = parsha;
  }

  return source;
}

function parseSource(fnText) {
  const sources = [];
  const parts = fnText.split(/\n@/);

  for (let i = 0; i < parts.length; i++) {
    let part = parts[i].trim();
    if (!part) continue;

    if (i === 0 && part.startsWith("@")) {
      part = part.slice(1).trim();
    }

    const isSupporting = i > 0;
    const citation = parseSingleCitation(part);

    sources.push({
      source_type: isSupporting ? "supporting" : "primary",
      sefer: citation.sefer,
      location: citation.location,
      quote: citation.quote,
      raw_text: part,
      language: citation.language,
      page: citation.page,
      siman: citation.siman,
      parsha: citation.parsha,
    });
  }

  return sources;
}

// ── Database update ─────────────────────────────────────────────────

async function updateDatabase(lessons, chapterNum) {
  await client.query("DELETE FROM lesson_sources WHERE lesson_id LIKE $1", [
    `${chapterNum}.%`,
  ]);
  await client.query("DELETE FROM lessons WHERE chapter = $1", [chapterNum]);

  let insertedLessons = 0;
  let insertedSources = 0;

  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i];
    const ctxBefore = i > 0 ? lessons[i - 1].human_body : null;
    const ctxAfter =
      i < lessons.length - 1 ? lessons[i + 1].human_body : null;
    const status = l.human_body?.trim() ? "imported" : "empty";

    await client.query(
      `INSERT INTO lessons (id, chapter, chapter_desc, section, section_heading,
                            point_number, human_title, human_body, context_before,
                            context_after, status, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (id) DO UPDATE SET
         human_title=EXCLUDED.human_title, human_body=EXCLUDED.human_body,
         context_before=EXCLUDED.context_before, context_after=EXCLUDED.context_after,
         section=EXCLUDED.section, section_heading=EXCLUDED.section_heading,
         status=EXCLUDED.status, updated_at=NOW()`,
      [
        l.id,
        l.chapter,
        l.chapter_desc,
        l.section,
        l.section_heading,
        l.point_number,
        l.human_title,
        l.human_body,
        ctxBefore,
        ctxAfter,
        status,
      ]
    );
    insertedLessons++;

    for (const [fnId, fnText] of Object.entries(l.footnotes)) {
      const sources = parseSource(fnText);
      for (const src of sources) {
        await client.query(
          `INSERT INTO lesson_sources (lesson_id, source_type, sefer, location, raw_text, language, footnote_number)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            l.id,
            src.source_type,
            src.sefer,
            src.location,
            src.raw_text,
            src.language,
            parseInt(fnId),
          ]
        );
        insertedSources++;
      }
    }
  }

  return { insertedLessons, insertedSources };
}

// ── Main ────────────────────────────────────────────────────────────

const chapters = [
  {
    file: "C:\\Users\\chezk\\Downloads\\\u05e9\u05e2\u05e8 \u05d4\u05ea\u05d5\u05e8\u05d4 - \u05e4\u05e8\u05e7 \u05d0 \u05d4\u05d7\u05d3\u05e9.docx",
    num: "\u05d0",
    desc: "\u05db\u05d7 \u05d4\u05ea\u05d5\u05e8\u05d4 \u05d4\u05e7\u05d3\u05d5\u05e9\u05d4 \u05d5\u05e1\u05d2\u05d5\u05dc\u05ea\u05d4",
  },
  {
    file: "C:\\Users\\chezk\\Downloads\\\u05e9\u05e2\u05e8 \u05d4\u05ea\u05d5\u05e8\u05d4 - \u05e4\u05e8\u05e7 \u05d1 \u05d4\u05d7\u05d3\u05e9.docx",
    num: "\u05d1",
    desc: "\u05d7\u05d9\u05d5\u05d1 \u05dc\u05d9\u05de\u05d5\u05d3 \u05d4\u05ea\u05d5\u05e8\u05d4 \u05d5\u05e2\u05e8\u05d9\u05d1\u05d5\u05ea \u05d5\u05e0\u05e2\u05d9\u05de\u05d5\u05ea \u05d4\u05ea\u05d5\u05e8\u05d4",
  },
  {
    file: "C:\\Users\\chezk\\Downloads\\\u05e9\u05e2\u05e8 \u05d4\u05ea\u05d5\u05e8\u05d4 - \u05e4\u05e8\u05e7 \u05d2 \u05d4\u05d7\u05d3\u05e9.docx",
    num: "\u05d2",
    desc: "\u05d7\u05d9\u05d5\u05d1 \u05dc\u05d9\u05de\u05d5\u05d3 \u05d4\u05ea\u05d5\u05e8\u05d4 \u05dc\u05e9\u05de\u05d4 - \u05d3\u05e8\u05d2\u05d5\u05ea\u05d9\u05d4 \u05d5\u05d2\u05d3\u05e8\u05d9\u05d4",
  },
];

await client.connect();
console.log("Connected to Supabase PostgreSQL");

let totalLessons = 0;
let totalSources = 0;

for (const ch of chapters) {
  const { lessons } = parseChapter(ch.file, ch.num, ch.desc);

  for (const l of lessons.slice(0, 5)) {
    console.log(
      `  ${l.id}: title="${(l.human_title || "??").slice(0, 50)}" body="${l.human_body.slice(0, 50)}..." [${l.footnote_refs.length} fn, ${l.endnote_refs.length} en]`
    );
  }
  if (lessons.length > 5)
    console.log(`  ... and ${lessons.length - 5} more`);

  const { insertedLessons, insertedSources } = await updateDatabase(
    lessons,
    ch.num
  );
  totalLessons += insertedLessons;
  totalSources += insertedSources;
  console.log(`  DB: ${insertedLessons} lessons, ${insertedSources} sources`);
}

console.log(`\n=== TOTAL: ${totalLessons} lessons, ${totalSources} sources ===");

await client.end();
