"""
Prepare fine-tuning dataset for Gemini 2.5 Pro on Vertex AI.

Reads the combined.json data (lessons + sources) and the SKILL.md prompt,
then produces a JSONL file in Vertex AI supervised fine-tuning format:
  {"contents": [{"role": "user", "parts": [{"text": "..."}]}, {"role": "model", "parts": [{"text": "..."}]}]}

Each example:
  - INPUT (user): The skill rules + sources for a lesson
  - OUTPUT (model): The human-written lesson (title + body) as JSON
"""
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
COMBINED_PATH = os.path.join(REPO_DIR, 'data', 'combined.json')
SKILL_PATH = os.path.join(REPO_DIR, 'skill', 'SKILL.md')
STYLE_EXAMPLES_PATH = os.path.join(REPO_DIR, 'skill', 'references', 'style-examples.md')
OUTPUT_PATH = os.path.join(SCRIPT_DIR, 'dataset.jsonl')


def load_skill():
    with open(SKILL_PATH, encoding='utf-8') as f:
        return f.read()


def load_style_examples():
    with open(STYLE_EXAMPLES_PATH, encoding='utf-8') as f:
        return f.read()


def load_combined():
    with open(COMBINED_PATH, encoding='utf-8') as f:
        return json.load(f)


def format_sources(footnotes: dict) -> str:
    """Format footnotes into a sources block for the prompt."""
    lines = []
    for fn_num, fn_data in sorted(footnotes.items(), key=lambda x: int(x[0])):
        primary = fn_data.get('primary', {})
        sefer = primary.get('sefer', '')
        location = primary.get('location', '')
        quote = primary.get('quote', '') or primary.get('raw', '')
        language = primary.get('language', 'hebrew')

        lang_note = " [אידיש]" if language == 'yiddish' else ""
        ref = f"{sefer} ({location})" if sefer else ""
        lines.append(f"{ref}{lang_note}")
        lines.append(quote)
        lines.append("")

        # Supporting sources
        for sup in fn_data.get('supporting', []):
            sup_sefer = sup.get('sefer', '')
            sup_location = sup.get('location', '')
            sup_quote = sup.get('quote', '') or sup.get('raw', '')
            sup_lang = " [אידיש]" if sup.get('language') == 'yiddish' else ""
            sup_ref = f"{sup_sefer} ({sup_location})" if sup_sefer else ""
            lines.append(f"@{sup_ref}{sup_lang}")
            lines.append(sup_quote)
            lines.append("")

    return "\n".join(lines).strip()


def build_user_prompt(lesson, section_heading, chapter_desc, sources_text, skill_text, style_examples_text):
    """Build the user prompt (input) for one training example."""
    prompt = f"""אתה כותב נקודה אחת בספר "שפע יואל" - שער התורה.

## הכללים (SKILL):
{skill_text}

## דוגמאות סגנון:
{style_examples_text}

## הנקודה הנוכחית:
מספר: {lesson['id']}
פרק: {chapter_desc}
נושא: {section_heading}

## מקורות (הערות שוליים):
{sources_text if sources_text else '(אין מקורות)'}

## המשימה:
כתוב גירסה של הנקודה הזאת על בסיס המקורות הנ"ל. תן:
1. **כותרת** - כותרת פעולתית, לא תיאורית (5-15 מילים, נגמרת ב-`:`)
2. **גוף** - טקסט בלשון הקודש מרוממת, כאב המדבר לבנו (2-5 משפטים)

זכור: מצא את הבומבשל. אל תשים מילים בפי הרבי. חסר, אל תוסיף. שמור על מילותיו של הרבי עצמו.

ענה בפורמט JSON:
{{"title": "...", "body": "..."}}"""
    return prompt


def build_model_response(lesson):
    """Build the model response (ideal output) for one training example."""
    return json.dumps({
        "title": lesson['title'],
        "body": lesson['body']
    }, ensure_ascii=False)


def create_dataset():
    """Create the full fine-tuning dataset."""
    skill_text = load_skill()
    style_examples_text = load_style_examples()
    chapters = load_combined()

    examples = []
    skipped = 0

    for chapter in chapters:
        chapter_desc = chapter.get('description', '') or chapter.get('title', '')
        for section in chapter.get('sections', []):
            section_heading = section.get('heading', '')
            for lesson in section.get('lessons', []):
                # Skip lessons with no body or no sources
                body = lesson.get('body', '').strip()
                footnotes = lesson.get('footnotes', {})
                if not body:
                    skipped += 1
                    continue
                if not footnotes:
                    skipped += 1
                    continue

                sources_text = format_sources(footnotes)
                if not sources_text.strip():
                    skipped += 1
                    continue

                user_prompt = build_user_prompt(
                    lesson, section_heading, chapter_desc,
                    sources_text, skill_text, style_examples_text
                )
                model_response = build_model_response(lesson)

                example = {
                    "contents": [
                        {"role": "user", "parts": [{"text": user_prompt}]},
                        {"role": "model", "parts": [{"text": model_response}]}
                    ]
                }
                examples.append(example)

    # Write JSONL
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + '\n')

    print(f"Dataset created: {OUTPUT_PATH}")
    print(f"  Total examples: {len(examples)}")
    print(f"  Skipped (no body/sources): {skipped}")

    # Basic stats
    if examples:
        import statistics
        user_lens = [len(ex['contents'][0]['parts'][0]['text']) for ex in examples]
        model_lens = [len(ex['contents'][1]['parts'][0]['text']) for ex in examples]
        print(f"  Avg user prompt length: {statistics.mean(user_lens):.0f} chars")
        print(f"  Avg model response length: {statistics.mean(model_lens):.0f} chars")
        print(f"  Max user prompt length: {max(user_lens)} chars")
        print(f"  Max model response length: {max(model_lens)} chars")


if __name__ == '__main__':
    create_dataset()
