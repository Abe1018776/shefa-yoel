"""
Parser for שער התורה Word documents.
Extracts the two-layer structure (lessons + footnotes) into structured JSON.
"""

import json
import re
import sys
from pathlib import Path
from lxml import etree
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH

NSMAP = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
EMU_TO_PT = 12700  # 1 point = 12700 EMUs


def get_font_size_pt(paragraph):
    """Get the dominant font size in points from a paragraph's runs."""
    sizes = []
    for run in paragraph.runs:
        if run.font.size:
            sizes.append(run.font.size / EMU_TO_PT)
    return max(sizes) if sizes else 0


def is_bold(paragraph):
    """Check if paragraph has bold runs."""
    return any(r.bold for r in paragraph.runs if r.bold is not None)


def get_footnote_refs(paragraph):
    """Extract footnote reference IDs from paragraph XML."""
    refs = paragraph._element.findall('.//w:footnoteReference', NSMAP)
    return [int(r.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id'))
            for r in refs]


def get_endnote_refs(paragraph):
    """Extract endnote reference IDs from paragraph XML."""
    refs = paragraph._element.findall('.//w:endnoteReference', NSMAP)
    return [int(r.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}id'))
            for r in refs]


def extract_notes(doc, note_type='footnote'):
    """Extract all footnotes or endnotes from the document as {id: text}."""
    rel_suffix = 'footnotes' if note_type == 'footnote' else 'endnotes'
    notes = {}
    for rel in doc.part.rels.values():
        if rel_suffix in str(rel.reltype).lower():
            xml = etree.fromstring(rel.target_part.blob)
            tag = f'w:{note_type}'
            for note in xml.findall(f'.//{tag}', NSMAP):
                nid = int(note.get(f'{{{NSMAP["w"]}}}id'))
                if nid <= 0:  # skip system separator/continuation notes
                    continue
                # Extract full text preserving paragraph breaks
                paragraphs = note.findall('.//w:p', NSMAP)
                para_texts = []
                for p in paragraphs:
                    texts = p.findall('.//w:t', NSMAP)
                    ptext = ''.join(t.text or '' for t in texts)
                    if ptext.strip():
                        para_texts.append(ptext.strip())
                notes[nid] = '\n'.join(para_texts)
            break
    return notes


def parse_citation(footnote_text):
    """Parse a footnote into primary and supporting (@) sources with citation metadata."""
    if not footnote_text:
        return None

    # Split on @ marker for supporting sources
    # The @ appears at the start of a line/paragraph
    parts = re.split(r'\n@', footnote_text)

    sources = []
    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue

        # Remove leading @ if present (for the first part it won't be, for others it was split)
        if i == 0 and part.startswith('@'):
            part = part[1:].strip()

        source = parse_single_citation(part)
        source['is_supporting'] = (i > 0)
        sources.append(source)

    if not sources:
        return {'raw': footnote_text, 'sources': []}

    return {
        'raw': footnote_text,
        'primary': sources[0] if sources else None,
        'supporting': [s for s in sources[1:]] if len(sources) > 1 else [],
        'sources': sources
    }


def parse_single_citation(text):
    """Parse a single citation text into structured fields.

    Expected format: sefer_name (parsha/section, page): "quote..."
    """
    source = {
        'raw': text,
        'sefer': None,
        'location': None,
        'quote': None,
        'language': detect_language(text),
        'is_supporting': False
    }

    # Try to match: BookName (location): quote
    # Pattern: text before first ( = sefer, inside () = location, after ): = quote
    match = re.match(r'^([\u0590-\u05FF\s"״\'׳\.\-]+?)\s*\(([^)]+)\)\s*:?\s*(.*)', text, re.DOTALL)
    if match:
        source['sefer'] = match.group(1).strip()
        source['location'] = match.group(2).strip()
        quote = match.group(3).strip()
        # Remove surrounding quotes if present
        if quote.startswith('"') or quote.startswith('"'):
            quote = quote[1:]
        if quote.endswith('"') or quote.endswith('"'):
            quote = quote[:-1]
        source['quote'] = quote if quote else None
    else:
        # Fallback: try simpler patterns
        # Maybe just "sefer: quote" without parentheses
        match2 = re.match(r'^([\u0590-\u05FF\s"״\'׳\.\-]+?)\s*:\s*(.*)', text, re.DOTALL)
        if match2:
            source['sefer'] = match2.group(1).strip()
            source['quote'] = match2.group(2).strip()
        else:
            source['quote'] = text

    # Extract parsha and page from location if available
    if source['location']:
        loc = source['location']
        # Try to find page number: עמ' xxx or עמד xxx
        page_match = re.search(r'עמ[\'״]?\s*([\u0590-\u05FF\'"״]+)', loc)
        if page_match:
            source['page'] = page_match.group(1)
        # Try to find siman: סי' xxx
        siman_match = re.search(r'סי[\'״]?\s*([\u0590-\u05FF\'"״]+)', loc)
        if siman_match:
            source['siman'] = siman_match.group(1)
        # The parsha is usually the first word(s) before the page/siman
        parsha = re.split(r',|עמ|סי', loc)[0].strip()
        if parsha:
            source['parsha'] = parsha

    return source


def detect_language(text):
    """Detect if text is primarily Hebrew or Yiddish based on character patterns."""
    # Yiddish typically uses more vowel letters (וו, יי, ײ) and German-origin words
    # This is a rough heuristic
    yiddish_markers = ['וואס', 'דער', 'אין', 'פון', 'מיט', 'איז', 'ניט', 'אויף',
                       'זיך', 'האט', 'וועט', 'נאר', 'אלע', 'דאס']
    text_lower = text[:500]  # check first 500 chars
    yiddish_count = sum(1 for m in yiddish_markers if m in text_lower)
    return 'yiddish' if yiddish_count >= 2 else 'hebrew'


def classify_paragraph(para, prev_style=None):
    """Classify a paragraph into its structural role."""
    style = para.style.name
    text = para.text.strip()
    if not text:
        return 'empty'

    bold = is_bold(para)
    size = get_font_size_pt(para)
    align = para.alignment

    # Chapter title: Normal, centered, bold, very large (>28pt)
    if style == 'Normal' and bold and size > 28 and align == WD_ALIGN_PARAGRAPH.CENTER:
        return 'chapter_title'

    # Chapter subtitle: Normal, centered, bold, ~27pt
    if style == 'Normal' and bold and 25 < size < 29 and align == WD_ALIGN_PARAGRAPH.CENTER:
        return 'chapter_subtitle'

    # Chapter description: Normal, centered, bold, ~20pt
    if style == 'Normal' and bold and 19 < size < 22 and align == WD_ALIGN_PARAGRAPH.CENTER:
        return 'chapter_description'

    # Section heading: Heading 2
    if style == 'Heading 2':
        return 'section_heading'

    # Lesson title: Normal, bold, ends with colon, smaller font
    if style == 'Normal' and bold and text.endswith(':'):
        return 'lesson_title'

    # Lesson body: List Paragraph
    if style == 'List Paragraph':
        return 'lesson_body'

    # Normal bold without colon could be a sub-section header or special text
    if style == 'Normal' and bold:
        return 'bold_text'

    return 'other'


def parse_document(filepath):
    """Parse a single שער התורה Word document into structured data."""
    doc = Document(filepath)
    footnotes = extract_notes(doc, 'footnote')
    endnotes = extract_notes(doc, 'endnote')

    chapter = {
        'source_file': Path(filepath).name,
        'number': None,
        'title': None,
        'subtitle_verse': None,
        'description': None,
        'sections': [],
        'endnotes': {}
    }

    current_section = None
    current_lesson = None
    lesson_counter = 0

    # Position-based detection for the first 3 non-empty centered bold paragraphs
    # They are always: chapter_title, subtitle_verse, description
    header_count = 0

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        style = para.style.name
        bold = is_bold(para)
        align = para.alignment

        # First 3 non-empty, centered, bold, Normal-style paragraphs are the header
        if header_count < 3 and style == 'Normal' and bold and align == WD_ALIGN_PARAGRAPH.CENTER:
            if header_count == 0:
                chapter['title'] = text
                num_match = re.search(r'פרק\s+([\u0590-\u05FF\'\"]+)', text)
                if num_match:
                    chapter['number'] = num_match.group(1).rstrip("'\"")
            elif header_count == 1:
                chapter['subtitle_verse'] = text
            elif header_count == 2:
                chapter['description'] = text
            header_count += 1
            continue

        # After header, classify by style
        role = classify_paragraph(para)

        if role == 'section_heading':
            parts = text.split('/')
            heading = parts[0].strip()
            verse = parts[1].strip() if len(parts) > 1 else None
            current_section = {
                'heading': heading,
                'verse': verse,
                'lessons': []
            }
            chapter['sections'].append(current_section)
            lesson_counter = 0

        elif role == 'lesson_title':
            lesson_counter += 1
            section_idx = len(chapter['sections'])
            current_lesson = {
                'id': f"{chapter['number'] or '?'}.{section_idx}.{lesson_counter}",
                'title': text,
                'body': None,
                'footnote_refs': [],
                'endnote_refs': [],
                'footnotes': {},
                'endnotes_data': {}
            }
            fn_refs = get_footnote_refs(para)
            en_refs = get_endnote_refs(para)
            if fn_refs:
                current_lesson['footnote_refs'].extend(fn_refs)
            if en_refs:
                current_lesson['endnote_refs'].extend(en_refs)

            if current_section is None:
                current_section = {
                    'heading': '(ללא כותרת)',
                    'verse': None,
                    'lessons': []
                }
                chapter['sections'].append(current_section)

            current_section['lessons'].append(current_lesson)

        elif role == 'lesson_body':
            fn_refs = get_footnote_refs(para)
            en_refs = get_endnote_refs(para)

            if current_lesson is not None:
                if current_lesson['body'] is None:
                    current_lesson['body'] = text
                else:
                    current_lesson['body'] += '\n' + text
                current_lesson['footnote_refs'].extend(fn_refs)
                current_lesson['endnote_refs'].extend(en_refs)

        elif role in ('bold_text', 'other'):
            fn_refs = get_footnote_refs(para)
            en_refs = get_endnote_refs(para)
            if current_lesson is not None:
                if current_lesson['body'] is None:
                    current_lesson['body'] = text
                else:
                    current_lesson['body'] += '\n' + text
                current_lesson['footnote_refs'].extend(fn_refs)
                current_lesson['endnote_refs'].extend(en_refs)

    # Now resolve footnotes and endnotes for each lesson
    for section in chapter['sections']:
        for lesson in section['lessons']:
            # Deduplicate refs
            lesson['footnote_refs'] = sorted(set(lesson['footnote_refs']))
            lesson['endnote_refs'] = sorted(set(lesson['endnote_refs']))

            # Attach parsed footnote content
            for fn_id in lesson['footnote_refs']:
                if fn_id in footnotes:
                    lesson['footnotes'][str(fn_id)] = parse_citation(footnotes[fn_id])

            for en_id in lesson['endnote_refs']:
                if en_id in endnotes:
                    lesson['endnotes_data'][str(en_id)] = {
                        'raw': endnotes[en_id],
                        'language': detect_language(endnotes[en_id])
                    }

    # Store all endnotes at chapter level too
    chapter['endnotes'] = {
        str(k): {'raw': v, 'language': detect_language(v)}
        for k, v in endnotes.items()
    }

    return chapter


def build_sources_index(chapters):
    """Build an index of all unique sources referenced across all chapters."""
    sources = {}
    for ch in chapters:
        for section in ch['sections']:
            for lesson in section['lessons']:
                for fn_id, fn_data in lesson['footnotes'].items():
                    if not fn_data or 'sources' not in fn_data:
                        continue
                    for src in fn_data['sources']:
                        sefer = src.get('sefer', 'unknown')
                        if sefer and sefer != 'unknown':
                            if sefer not in sources:
                                sources[sefer] = {
                                    'sefer': sefer,
                                    'citations': [],
                                    'count': 0
                                }
                            sources[sefer]['count'] += 1
                            sources[sefer]['citations'].append({
                                'chapter': ch['number'],
                                'lesson_id': lesson['id'],
                                'location': src.get('location'),
                                'parsha': src.get('parsha'),
                                'page': src.get('page'),
                                'is_supporting': src.get('is_supporting', False)
                            })
    return sources


def build_lessons_index(chapters):
    """Build a flat index of all lessons across chapters."""
    lessons = []
    for ch in chapters:
        for section in ch['sections']:
            for lesson in section['lessons']:
                lessons.append({
                    'id': lesson['id'],
                    'chapter': ch['number'],
                    'chapter_desc': ch['description'],
                    'section': section['heading'],
                    'title': lesson['title'],
                    'footnote_count': len(lesson['footnote_refs']),
                    'endnote_count': len(lesson['endnote_refs']),
                    'source_seforim': list(set(
                        src.get('sefer', '')
                        for fn in lesson['footnotes'].values()
                        if fn and 'sources' in fn
                        for src in fn['sources']
                        if src.get('sefer')
                    ))
                })
    return lessons


def main():
    data_dir = Path(r'C:\Users\Main\shefa-yoel\data')
    downloads = Path(r'C:\Users\Main\Downloads')

    doc_files = [
        downloads / 'שער התורה - פרק א החדש.docx',
        downloads / 'שער התורה פרק ב החדש .docx',
        downloads / 'שער התורה פרק ג החדש.docx',
        downloads / 'שער התורה פרק ד החדש.docx',
    ]

    all_chapters = []

    for filepath in doc_files:
        print(f"Parsing: {filepath.name}")
        chapter = parse_document(str(filepath))
        all_chapters.append(chapter)

        # Save individual chapter
        ch_num = chapter['number'] or 'unknown'
        out_path = data_dir / f'chapter_{ch_num}.json'
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(chapter, f, ensure_ascii=False, indent=2)
        print(f"  -> {out_path.name}: {len(chapter['sections'])} sections, "
              f"{sum(len(s['lessons']) for s in chapter['sections'])} lessons")

    # Save combined
    combined_path = data_dir / 'combined.json'
    with open(combined_path, 'w', encoding='utf-8') as f:
        json.dump(all_chapters, f, ensure_ascii=False, indent=2)
    print(f"\nCombined: {combined_path}")

    # Build and save indices
    sources_idx = build_sources_index(all_chapters)
    with open(data_dir / 'sources_index.json', 'w', encoding='utf-8') as f:
        json.dump(sources_idx, f, ensure_ascii=False, indent=2)
    print(f"Sources index: {len(sources_idx)} unique seforim")

    lessons_idx = build_lessons_index(all_chapters)
    with open(data_dir / 'lessons_index.json', 'w', encoding='utf-8') as f:
        json.dump(lessons_idx, f, ensure_ascii=False, indent=2)
    print(f"Lessons index: {len(lessons_idx)} total lessons")

    # Print summary
    print("\n=== SUMMARY ===")
    for ch in all_chapters:
        total_lessons = sum(len(s['lessons']) for s in ch['sections'])
        total_fn = sum(len(l['footnote_refs']) for s in ch['sections'] for l in s['lessons'])
        total_en = sum(len(l['endnote_refs']) for s in ch['sections'] for l in s['lessons'])
        print(f"Chapter {ch['number']} ({ch['description']}): "
              f"{len(ch['sections'])} sections, {total_lessons} lessons, "
              f"{total_fn} footnotes, {total_en} endnotes")


if __name__ == '__main__':
    main()
