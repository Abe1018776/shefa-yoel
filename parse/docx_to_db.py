"""
Parse updated .docx chapters and update the Supabase database.
Extracts: bold headlines → body paragraphs → footnotes → sources
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from docx import Document
import psycopg2

DB_CONFIG = {
    "host": "db.idbvezfpkodmohebrwkc.supabase.co",
    "port": 5432,
    "dbname": "postgres",
    "user": "postgres",
    "password": "ShefaYoel2026!"
}

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}


def extract_footnotes(filepath):
    """Extract footnotes from docx XML."""
    footnotes = {}
    with zipfile.ZipFile(filepath) as z:
        if 'word/footnotes.xml' not in z.namelist():
            return footnotes

        fn_xml = z.read('word/footnotes.xml')
        root = ET.fromstring(fn_xml)

        for fn in root.findall('.//w:footnote', NS):
            fn_id = fn.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id')
            if fn_id in ('0', '-1'):
                continue

            fn_text = ''
            for p in fn.findall('.//w:p', NS):
                p_text = ''
                for r in p.findall('.//w:r', NS):
                    for t in r.findall('.//w:t', NS):
                        if t.text:
                            p_text += t.text
                if p_text.strip():
                    fn_text += p_text.strip() + '\n'

            footnotes[int(fn_id)] = fn_text.strip()

    return footnotes


def count_footnote_refs(paragraph):
    """Count footnote reference marks in a paragraph's XML."""
    refs = []
    for run in paragraph.runs:
        # Check the run's XML for footnoteReference
        run_xml = run._element.xml
        for match in re.finditer(r'w:id="(\d+)"', run_xml):
            if 'footnoteReference' in run_xml:
                refs.append(int(match.group(1)))
    return refs


def parse_chapter(filepath, chapter_num, chapter_desc):
    """Parse a docx file into structured lessons."""
    doc = Document(filepath)
    footnotes = extract_footnotes(filepath)

    lessons = []
    current_section = None
    current_section_heading = None
    current_headline = None
    lesson_counter = 0
    section_counter = 0

    # Track footnote assignment
    fn_counter = 1  # Footnotes are numbered sequentially

    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue

        # Detect element type by font size and formatting
        is_bold = any(r.bold for r in p.runs if r.text.strip()) if p.runs else False
        style = p.style.name if p.style else ''
        font_size = None
        for r in p.runs:
            if r.font.size:
                font_size = r.font.size.pt
                break

        # Chapter title (33pt) or pasuk (27pt) - skip
        if font_size and font_size > 25:
            continue

        # Section heading (Heading 2 style)
        if 'Heading' in style:
            section_counter += 1
            current_section = text
            current_section_heading = text
            lesson_counter = 0  # Reset per section
            continue

        # Topic title (20pt bold, not Heading style) - skip
        if font_size and font_size > 18:
            continue

        # Epigraph (style 'מכון תוצאות' or similar non-standard style with דברי יואל)
        if 'מכון' in style or (lesson_counter == 0 and section_counter == 0 and is_bold and 'דברי יואל' in text):
            continue

        # Bold headline (13pt bold, typically ends with colon)
        if is_bold and 'List' not in style:
            current_headline = text
            continue

        # Body paragraph (List Paragraph style)
        if 'List' in style:
            lesson_counter += 1

            # Count footnote refs in this paragraph
            # We'll estimate by counting [x] patterns or sequential footnotes
            fn_refs = []
            # Look for footnote reference marks in the XML
            p_xml = p._element.xml
            for match in re.finditer(r'w:footnoteReference w:id="(\d+)"', p_xml):
                fn_refs.append(int(match.group(1)))

            lesson_id = f"{chapter_num}.{section_counter}.{lesson_counter}"

            lesson = {
                'id': lesson_id,
                'chapter': chapter_num,
                'chapter_desc': chapter_desc,
                'section': current_section,
                'section_heading': current_section_heading,
                'point_number': lesson_counter,
                'human_title': current_headline,
                'human_body': text,
                'footnote_refs': fn_refs,
                'footnotes': {}
            }

            # Attach footnotes
            for fn_id in fn_refs:
                if fn_id in footnotes:
                    lesson['footnotes'][fn_id] = footnotes[fn_id]

            lessons.append(lesson)
            current_headline = None  # Reset

    return lessons, footnotes


def parse_source(fn_text):
    """Parse a footnote into source components."""
    sources = []

    # Split on @ for supporting sources
    parts = re.split(r'(?=@)', fn_text)

    for part in parts:
        part = part.strip()
        if not part:
            continue

        is_supporting = part.startswith('@')
        if is_supporting:
            part = part[1:].strip()

        # Try to extract sefer and location
        sefer = ''
        location = ''

        # Pattern: דברי יואל (location):
        m = re.match(r'[וב]*(דברי יואל|דברות קודש|קדושת יואל|חידו"ת|כתבי יואל|ישמח משה)\s*\(([^)]+)\)', part)
        if m:
            sefer = m.group(1)
            location = m.group(2)

        # Detect language (Yiddish has characteristic patterns)
        lang = 'hebrew'
        yiddish_markers = ['איז', 'האט', 'דאס', 'פון', 'מען', 'זענען', 'געווען', 'נישט']
        if any(marker in part for marker in yiddish_markers):
            lang = 'yiddish'

        sources.append({
            'source_type': 'supporting' if is_supporting else 'primary',
            'sefer': sefer,
            'location': location,
            'raw_text': part,
            'language': lang
        })

    return sources


def update_database(lessons, chapter_num):
    """Update the Supabase database with parsed lessons."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # First, delete existing data for this chapter
    cur.execute("DELETE FROM lesson_sources WHERE lesson_id LIKE %s", (f"{chapter_num}.%",))
    cur.execute("DELETE FROM lessons WHERE chapter = %s", (chapter_num,))

    inserted_lessons = 0
    inserted_sources = 0

    for i, lesson in enumerate(lessons):
        # Context
        ctx_before = lessons[i-1]['human_body'] if i > 0 else None
        ctx_after = lessons[i+1]['human_body'] if i < len(lessons)-1 else None

        # Status
        status = 'imported'
        body = lesson['human_body'] or ''
        if not body.strip() or body.strip() in ('.', ','):
            status = 'empty'

        cur.execute("""
            INSERT INTO lessons (id, chapter, chapter_desc, section, section_heading,
                                point_number, human_title, human_body, context_before,
                                context_after, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                human_title = EXCLUDED.human_title,
                human_body = EXCLUDED.human_body,
                context_before = EXCLUDED.context_before,
                context_after = EXCLUDED.context_after,
                section = EXCLUDED.section,
                section_heading = EXCLUDED.section_heading,
                status = EXCLUDED.status,
                updated_at = NOW()
        """, (lesson['id'], lesson['chapter'], lesson['chapter_desc'],
              lesson['section'], lesson['section_heading'], lesson['point_number'],
              lesson['human_title'], lesson['human_body'],
              ctx_before, ctx_after, status))
        inserted_lessons += 1

        # Insert sources from footnotes
        for fn_id, fn_text in lesson['footnotes'].items():
            sources = parse_source(fn_text)
            for src in sources:
                cur.execute("""
                    INSERT INTO lesson_sources (lesson_id, source_type, sefer, location,
                                               raw_text, language, footnote_number)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (lesson['id'], src['source_type'], src['sefer'], src['location'],
                      src['raw_text'], src['language'], fn_id))
                inserted_sources += 1

    conn.commit()
    cur.close()
    conn.close()

    return inserted_lessons, inserted_sources


if __name__ == '__main__':
    chapters = [
        ('/tmp/perek_a.docx', 'א', 'כח התורה הקדושה וסגולתה'),
        ('/tmp/perek_b.docx', 'ב', 'חיוב לימוד התורה לשמה - דרגותיה וגדריה'),
        ('/tmp/perek_g.docx', 'ג', 'חיוב לימוד התורה לשמה - דרגותיה וגדריה'),
    ]

    total_lessons = 0
    total_sources = 0

    for filepath, ch_num, ch_desc in chapters:
        print(f"\n=== Parsing פרק {ch_num} ===")
        lessons, footnotes = parse_chapter(filepath, ch_num, ch_desc)
        print(f"  Found {len(lessons)} lessons, {len(footnotes)} footnotes")

        # Show summary
        for l in lessons[:5]:
            fn_count = len(l['footnote_refs'])
            print(f"  {l['id']}: {(l['human_title'] or '??')[:60]} [{fn_count} fn]")
        if len(lessons) > 5:
            print(f"  ... and {len(lessons)-5} more")

        # Update DB
        n_lessons, n_sources = update_database(lessons, ch_num)
        total_lessons += n_lessons
        total_sources += n_sources
        print(f"  DB: {n_lessons} lessons, {n_sources} sources updated")

    print(f"\n=== TOTAL: {total_lessons} lessons, {total_sources} sources ===")
