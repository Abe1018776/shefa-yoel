"""
Normalize sefer names in parsed data to canonical forms.
"""

import json
from pathlib import Path

# Map variant forms to canonical sefer names
SEFER_ALIASES = {
    'ובדברות קודש': 'דברות קודש',
    'ובדברי יואל': 'דברי יואל',
    'ובחידושי תורה': 'חידושי תורה',
    'שם': '(שם)',  # ibid - keep as marker
    'וזה לשון רבינו': '(לשון רבינו)',  # intro phrase, not a sefer
    'ובזה מבאר רבינו': '(ביאור רבינו)',
    'ויש לציין לדברים נפלאים שדיבר רבינו בקדשו': '(דברי רבינו)',
    'ראה לעיל': '(ראה לעיל)',  # cross-reference
}

def normalize_sefer(name):
    if not name:
        return name
    return SEFER_ALIASES.get(name, name)

def normalize_chapter(chapter):
    for section in chapter.get('sections', []):
        for lesson in section.get('lessons', []):
            for fn_id, fn_data in lesson.get('footnotes', {}).items():
                if not fn_data:
                    continue
                for key in ('primary', *[f'supporting_{i}' for i in range(10)]):
                    pass
                # Normalize all sources
                for src in fn_data.get('sources', []):
                    src['sefer_original'] = src.get('sefer')
                    src['sefer'] = normalize_sefer(src.get('sefer'))
                if fn_data.get('primary'):
                    fn_data['primary']['sefer_original'] = fn_data['primary'].get('sefer')
                    fn_data['primary']['sefer'] = normalize_sefer(fn_data['primary'].get('sefer'))
                for s in fn_data.get('supporting', []):
                    s['sefer_original'] = s.get('sefer')
                    s['sefer'] = normalize_sefer(s.get('sefer'))
    return chapter

def main():
    data_dir = Path(r'C:\Users\Main\shefa-yoel\data')

    # Load combined
    with open(data_dir / 'combined.json', encoding='utf-8') as f:
        chapters = json.load(f)

    for ch in chapters:
        normalize_chapter(ch)

    # Save normalized combined
    with open(data_dir / 'combined.json', 'w', encoding='utf-8') as f:
        json.dump(chapters, f, ensure_ascii=False, indent=2)

    # Save individual chapters
    for ch in chapters:
        ch_num = ch.get('number', 'unknown')
        with open(data_dir / f'chapter_{ch_num}.json', 'w', encoding='utf-8') as f:
            json.dump(ch, f, ensure_ascii=False, indent=2)

    # Rebuild sources index with normalized names
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
                                sources[sefer] = {'sefer': sefer, 'count': 0, 'citations': []}
                            sources[sefer]['count'] += 1
                            sources[sefer]['citations'].append({
                                'chapter': ch['number'],
                                'lesson_id': lesson['id'],
                                'location': src.get('location'),
                            })

    with open(data_dir / 'sources_index.json', 'w', encoding='utf-8') as f:
        json.dump(sources, f, ensure_ascii=False, indent=2)

    print("Normalized sources:")
    for sefer, data in sorted(sources.items(), key=lambda x: -x[1]['count'])[:15]:
        print(f"  {data['count']:3d}x  {sefer}")
    print(f"\nTotal unique sources: {len(sources)}")

if __name__ == '__main__':
    main()
