"""
Generate AI versions of Shefa Yoel lessons using the skill rules.
Pulls lesson + sources + context from Supabase, generates via Claude API,
stores the result back as a version.
"""
import json
import os
import sys
import psycopg2
import anthropic

DB_CONFIG = {
    "host": "db.idbvezfpkodmohebrwkc.supabase.co",
    "port": 5432,
    "dbname": "postgres",
    "user": "postgres",
    "password": "ShefaYoel2026!"
}

SKILL_PATH = os.path.join(os.path.dirname(__file__), '..', 'skill', 'SKILL.md')

# Fallback skill if file not found
SKILL_FALLBACK = open(
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 '..', '..', '.claude', 'projects', '-root', 'memory', 'shefa-yoel-skill.md')
).read() if not os.path.exists(SKILL_PATH) else ''


def load_skill():
    """Load the skill rules."""
    if os.path.exists(SKILL_PATH):
        with open(SKILL_PATH) as f:
            return f.read()
    return SKILL_FALLBACK


def get_lesson_with_context(lesson_id):
    """Fetch a lesson, its sources, and neighboring context."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Get the lesson
    cur.execute("SELECT * FROM lessons WHERE id = %s", (lesson_id,))
    cols = [desc[0] for desc in cur.description]
    row = cur.fetchone()
    if not row:
        print(f"Lesson {lesson_id} not found")
        return None, None
    lesson = dict(zip(cols, row))

    # Get sources
    cur.execute("""
        SELECT source_type, sefer, location, raw_text, language, footnote_number
        FROM lesson_sources WHERE lesson_id = %s
        ORDER BY footnote_number
    """, (lesson_id,))
    src_cols = [desc[0] for desc in cur.description]
    sources = [dict(zip(src_cols, r)) for r in cur.fetchall()]

    cur.close()
    conn.close()
    return lesson, sources


def get_skill_examples(category=None, limit=3):
    """Fetch relevant skill examples from DB."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    if category:
        cur.execute("""
            SELECT category, source_text, bad_version, bad_reason, good_version, good_reason
            FROM skill_examples WHERE category = %s LIMIT %s
        """, (category, limit))
    else:
        cur.execute("""
            SELECT category, source_text, bad_version, bad_reason, good_version, good_reason
            FROM skill_examples ORDER BY RANDOM() LIMIT %s
        """, (limit,))
    cols = [desc[0] for desc in cur.description]
    examples = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return examples


def build_prompt(lesson, sources, skill_text, examples):
    """Build the generation prompt."""
    # Format sources
    sources_text = ""
    for s in sources:
        prefix = "@" if s['source_type'] == 'supporting' else ""
        lang_note = " [אידיש]" if s['language'] == 'yiddish' else ""
        ref = f"{s['sefer']} ({s['location']})" if s['sefer'] else ""
        sources_text += f"{prefix}{ref}{lang_note}\n{s['raw_text']}\n\n"

    # Format examples
    examples_text = ""
    for ex in examples:
        examples_text += f"--- דוגמא ({ex['category']}) ---\n"
        if ex.get('bad_version'):
            examples_text += f"גרוע: {ex['bad_version'][:200]}\nלמה גרוע: {ex['bad_reason']}\n"
        if ex.get('good_version'):
            examples_text += f"טוב: {ex['good_version'][:200]}\nלמה טוב: {ex['good_reason']}\n"
        examples_text += "\n"

    prompt = f"""אתה כותב נקודה אחת בספר "שפע יואל" - שער התורה.

## הכללים (SKILL):
{skill_text}

## דוגמאות מאומנות:
{examples_text}

## הנקודה הנוכחית:
מספר: {lesson['id']}
פרק: {lesson['chapter']} - {lesson['chapter_desc']}
נושא: {lesson['section'] or 'כללי'}
כותרת מקורית: {lesson['human_title'] or '(אין)'}
גוף מקורי: {lesson['human_body'] or '(ריק)'}

## הקשר:
לפני: {lesson.get('context_before', '(אין)')[:200] if lesson.get('context_before') else '(אין)'}
אחרי: {lesson.get('context_after', '(אין)')[:200] if lesson.get('context_after') else '(אין)'}

## מקורות (הערות שוליים):
{sources_text if sources_text.strip() else '(אין מקורות)'}

## המשימה:
כתוב גירסה חדשה של הנקודה הזאת. תן:
1. **כותרת** - כותרת פעולתית, לא תיאורית
2. **גוף** - טקסט בלשון הקודש מרוממת, כאב המדבר לבנו

זכור: מצא את הבומבשל. אל תשים מילים בפי הרבי. חסר, אל תוסיף. משפט ראשון חייב להיות הפצצה.

ענה בפורמט JSON:
{{"title": "...", "body": "..."}}"""

    return prompt


def generate_version(lesson_id, model="claude-sonnet-4-20250514"):
    """Generate a new version for a lesson."""
    lesson, sources = get_lesson_with_context(lesson_id)
    if not lesson:
        return None

    skill_text = load_skill()
    examples = get_skill_examples(limit=4)
    prompt = build_prompt(lesson, sources, skill_text, examples)

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=model,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )

    result_text = response.content[0].text

    # Parse JSON from response
    try:
        # Try to find JSON in the response
        json_start = result_text.find('{')
        json_end = result_text.rfind('}') + 1
        if json_start >= 0:
            result = json.loads(result_text[json_start:json_end])
        else:
            result = {"title": "", "body": result_text}
    except json.JSONDecodeError:
        result = {"title": "", "body": result_text}

    # Store in DB
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Get next version number
    cur.execute("SELECT COALESCE(MAX(version_number), 0) + 1 FROM versions WHERE lesson_id = %s", (lesson_id,))
    version_num = cur.fetchone()[0]

    cur.execute("""
        INSERT INTO versions (lesson_id, version_number, generated_title, generated_body,
                             model, prompt_context)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (lesson_id, version_num, result.get('title', ''), result.get('body', ''),
          model, json.dumps({"sources_count": len(sources), "examples_count": len(examples)})))

    version_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()

    return {
        "version_id": version_id,
        "lesson_id": lesson_id,
        "version_number": version_num,
        "title": result.get('title', ''),
        "body": result.get('body', ''),
        "model": model
    }


def generate_batch(chapter=None, limit=5):
    """Generate versions for multiple lessons."""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    query = "SELECT id FROM lessons WHERE status = 'imported'"
    params = []
    if chapter:
        query += " AND chapter = %s"
        params.append(chapter)
    query += " ORDER BY id LIMIT %s"
    params.append(limit)

    cur.execute(query, params)
    lesson_ids = [r[0] for r in cur.fetchall()]
    cur.close()
    conn.close()

    results = []
    for lid in lesson_ids:
        print(f"Generating for {lid}...")
        try:
            result = generate_version(lid)
            if result:
                print(f"  v{result['version_number']}: {result['title'][:60]}")
                results.append(result)
        except Exception as e:
            print(f"  ERROR: {e}")

    return results


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python generate_version.py <lesson_id>          # Single lesson")
        print("  python generate_version.py --batch [chapter] [limit]  # Batch")
        sys.exit(1)

    if sys.argv[1] == '--batch':
        chapter = sys.argv[2] if len(sys.argv) > 2 else None
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 5
        results = generate_batch(chapter, limit)
        print(f"\nGenerated {len(results)} versions")
    else:
        lesson_id = sys.argv[1]
        result = generate_version(lesson_id)
        if result:
            print(f"\n=== Version {result['version_number']} for {result['lesson_id']} ===")
            print(f"כותרת: {result['title']}")
            print(f"גוף: {result['body']}")
