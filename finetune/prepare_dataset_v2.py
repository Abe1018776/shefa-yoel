"""
Prepare fine-tuning dataset for Gemini 2.5 Pro on Vertex AI.

Uses system_instruction for the shared skill rules (not repeated per example).
Vertex AI supervised fine-tuning format with system instruction:
  {
    "systemInstruction": {"role": "system", "parts": [{"text": "..."}]},
    "contents": [
      {"role": "user", "parts": [{"text": "..."}]},
      {"role": "model", "parts": [{"text": "..."}]}
    ]
  }
"""
import json
import os
import statistics

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
COMBINED_PATH = os.path.join(REPO_DIR, 'data', 'combined.json')
SKILL_PATH = os.path.join(REPO_DIR, 'skill', 'SKILL.md')
STYLE_EXAMPLES_PATH = os.path.join(REPO_DIR, 'skill', 'references', 'style-examples.md')
OUTPUT_PATH = os.path.join(SCRIPT_DIR, 'dataset_v2.jsonl')


def load_file(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def format_sources(footnotes: dict) -> str:
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


def build_system_instruction(skill_text, style_examples_text):
    return f"""אתה כותב נקודות בספר "שפע יואל" - שער התורה.
המשימה: קבל מקורות תורניים (הערות שוליים) וכתוב נקודה אחת בפורמט הספר.

## הכללים:
{skill_text}

## דוגמאות סגנון:
{style_examples_text}

## פורמט תשובה:
תמיד ענה בפורמט JSON בלבד:
{{"title": "כותרת פעולתית (5-15 מילים, נגמרת ב-:)", "body": "גוף הנקודה בלשון הקודש מרוממת (2-5 משפטים)"}}

זכור תמיד: מצא את הבומבשל. אל תשים מילים בפי הרבי. חסר, אל תוסיף. שמור על מילותיו של הרבי עצמו."""


def build_user_message(lesson, section_heading, chapter_desc, sources_text):
    return f"""נקודה {lesson['id']}
פרק: {chapter_desc}
נושא: {section_heading}

מקורות:
{sources_text}"""


def create_dataset():
    skill_text = load_file(SKILL_PATH)
    style_examples_text = load_file(STYLE_EXAMPLES_PATH)
    chapters = json.loads(load_file(COMBINED_PATH))

    system_instruction = build_system_instruction(skill_text, style_examples_text)
    examples = []

    for chapter in chapters:
        chapter_desc = chapter.get('description', '') or chapter.get('title', '')
        for section in chapter.get('sections', []):
            section_heading = section.get('heading', '')
            for lesson in section.get('lessons', []):
                body = lesson.get('body', '').strip()
                footnotes = lesson.get('footnotes', {})
                if not body or not footnotes:
                    continue

                sources_text = format_sources(footnotes)
                if not sources_text.strip():
                    continue

                user_msg = build_user_message(lesson, section_heading, chapter_desc, sources_text)
                model_response = json.dumps({
                    "title": lesson['title'],
                    "body": body
                }, ensure_ascii=False)

                example = {
                    "systemInstruction": {
                        "role": "system",
                        "parts": [{"text": system_instruction}]
                    },
                    "contents": [
                        {"role": "user", "parts": [{"text": user_msg}]},
                        {"role": "model", "parts": [{"text": model_response}]}
                    ]
                }
                examples.append(example)

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + '\n')

    print(f"Dataset created: {OUTPUT_PATH}")
    print(f"  Total examples: {len(examples)}")

    if examples:
        sys_len = len(system_instruction)
        user_lens = [len(ex['contents'][0]['parts'][0]['text']) for ex in examples]
        model_lens = [len(ex['contents'][1]['parts'][0]['text']) for ex in examples]
        print(f"  System instruction length: {sys_len} chars (shared, not repeated)")
        print(f"  Avg user message length: {statistics.mean(user_lens):.0f} chars")
        print(f"  Avg model response length: {statistics.mean(model_lens):.0f} chars")
        print(f"  Max user message length: {max(user_lens)} chars")


if __name__ == '__main__':
    create_dataset()
