"""
Benchmark: Can Claude replicate the human-authored שער התורה lessons?

Given the raw source material (footnotes), the SKILL methodology, and the style guide,
test whether Claude can produce comparable top-layer lessons (title + body).

Usage:
    set ANTHROPIC_API_KEY=sk-ant-...
    python benchmark/benchmark.py [--samples N] [--model MODEL]
"""

import json
import os
import sys
import time
import argparse
from pathlib import Path
from datetime import datetime

import anthropic

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / 'data'
SKILL_DIR = BASE_DIR / 'skill'
RESULTS_DIR = BASE_DIR / 'benchmark' / 'results'


def load_skill():
    """Load the SKILL.md methodology."""
    with open(SKILL_DIR / 'SKILL.md', encoding='utf-8') as f:
        return f.read()


def load_style_guide():
    """Load the style examples reference."""
    with open(SKILL_DIR / 'references' / 'style-examples.md', encoding='utf-8') as f:
        return f.read()


def load_chapters():
    """Load all parsed chapters."""
    with open(DATA_DIR / 'combined.json', encoding='utf-8') as f:
        return json.load(f)


def select_samples(chapters, n=20):
    """Select representative samples across all chapters for benchmarking.

    Prioritizes lessons with:
    - Multiple footnotes (richer source material)
    - Both primary and supporting sources
    - Variety across chapters and sections
    """
    candidates = []
    for ch in chapters:
        for section in ch['sections']:
            for lesson in section['lessons']:
                fn_count = len(lesson['footnote_refs'])
                has_supporting = any(
                    fn.get('supporting')
                    for fn in lesson['footnotes'].values()
                    if fn
                )
                candidates.append({
                    'chapter_num': ch['number'],
                    'chapter_desc': ch['description'],
                    'section_heading': section['heading'],
                    'lesson': lesson,
                    'score': fn_count + (2 if has_supporting else 0)
                })

    # Sort by score (richest material first), then take distributed samples
    candidates.sort(key=lambda x: -x['score'])

    # Take top candidates but ensure distribution across chapters
    selected = []
    per_chapter = max(1, n // 4)
    for ch_num in ['א', 'ב', 'ג', 'ד']:
        ch_candidates = [c for c in candidates if c['chapter_num'] == ch_num]
        selected.extend(ch_candidates[:per_chapter])

    # Fill remaining slots from overall top
    remaining = n - len(selected)
    selected_ids = {s['lesson']['id'] for s in selected}
    for c in candidates:
        if remaining <= 0:
            break
        if c['lesson']['id'] not in selected_ids:
            selected.append(c)
            remaining -= 1

    return selected[:n]


def build_source_material(lesson):
    """Extract the raw source material from a lesson's footnotes (what the human had to work with)."""
    sources = []
    for fn_id in sorted(lesson['footnote_refs']):
        fn_key = str(fn_id)
        if fn_key in lesson['footnotes'] and lesson['footnotes'][fn_key]:
            fn = lesson['footnotes'][fn_key]
            sources.append(fn.get('raw', ''))
    return '\n\n---\n\n'.join(sources)


def build_context(lesson, section_heading, chapter_desc):
    """Build contextual info about where this lesson sits."""
    return (
        f"פרק: {chapter_desc}\n"
        f"נושא/סימן: {section_heading}\n"
        f"מיקום: הוראה מספר {lesson['id']}"
    )


def run_benchmark_single(client, model, skill_text, style_text, sample):
    """Run a single benchmark: give Claude the sources and ask it to produce the lesson."""
    lesson = sample['lesson']
    source_material = build_source_material(lesson)
    context = build_context(lesson, sample['section_heading'], sample['chapter_desc'])

    if not source_material.strip():
        return None

    system_prompt = f"""You are an expert Torah scholar and editor working on the שפע יואל project.
Your task is to take raw source material from the Satmar Rebbe's writings and produce
a practical lesson (הוראה) in the שער התורה format.

## METHODOLOGY
{skill_text}

## STYLE GUIDE
{style_text}"""

    user_prompt = f"""Based on the following source material (footnotes), produce a single practical lesson (הוראה)
consisting of:
1. A bold headline (כותרת) — 5-15 words, actionable, ending with a colon
2. A body paragraph (גוף ההוראה) — 2-5 sentences in elevated Lashon Hakodesh

## Context
{context}

## Raw Source Material (the footnotes you have to work with)
{source_material}

## Instructions
- Follow the Iron Laws exactly
- The top layer must be traceable to these sources — do not invent
- Use the approved vocabulary and patterns from the style guide
- Find the "bombshell" — the most powerful, concrete teaching in the sources
- Output ONLY the headline and body paragraph in Hebrew, nothing else"""

    response = client.messages.create(
        model=model,
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}]
    )

    return {
        'lesson_id': lesson['id'],
        'model': model,
        'human_title': lesson['title'],
        'human_body': lesson['body'],
        'claude_output': response.content[0].text,
        'source_material': source_material,
        'context': context,
        'input_tokens': response.usage.input_tokens,
        'output_tokens': response.usage.output_tokens,
        'timestamp': datetime.now().isoformat()
    }


def run_evaluation(client, model, result):
    """Use Claude to evaluate how the generated lesson compares to the human version."""
    eval_prompt = f"""You are evaluating a Torah lesson generation system. Compare the AI-generated lesson
to the human-authored original.

## Human-Authored Version
**Title:** {result['human_title']}
**Body:** {result['human_body']}

## AI-Generated Version
{result['claude_output']}

## Source Material (footnotes both had access to)
{result['source_material'][:3000]}

## Evaluation Criteria (score 1-5 each):

1. **Source Fidelity (נאמנות למקורות)**: Does every claim trace to the sources? No invented messages?
2. **Iron Law Compliance**: No words put in the Rebbe's mouth? Subtracted, not added?
3. **Style Match (התאמת סגנון)**: Uses approved vocabulary? Avoids banned words? Proper Lashon Hakodesh?
4. **Structural Match (מבנה)**: Correct headline format? Paragraph type (A or B)? Proper flow?
5. **Bombshell Capture (לכידת הנקודה)**: Did it find the same core powerful message as the human?
6. **Overall Quality**: How close is the AI output to the human version overall?

Respond in this exact JSON format:
{{
  "source_fidelity": <1-5>,
  "iron_law_compliance": <1-5>,
  "style_match": <1-5>,
  "structural_match": <1-5>,
  "bombshell_capture": <1-5>,
  "overall_quality": <1-5>,
  "strengths": "<brief note>",
  "weaknesses": "<brief note>",
  "key_differences": "<brief note>"
}}"""

    response = client.messages.create(
        model=model,
        max_tokens=1000,
        messages=[{"role": "user", "content": eval_prompt}]
    )

    try:
        # Extract JSON from response
        text = response.content[0].text
        # Find JSON block
        start = text.index('{')
        end = text.rindex('}') + 1
        return json.loads(text[start:end])
    except (ValueError, json.JSONDecodeError):
        return {'error': 'Failed to parse evaluation', 'raw': response.content[0].text}


def main():
    parser = argparse.ArgumentParser(description='Benchmark Claude on שער התורה lesson generation')
    parser.add_argument('--samples', type=int, default=5, help='Number of samples to test')
    parser.add_argument('--model', default='claude-sonnet-4-20250514', help='Model to use')
    parser.add_argument('--skip-eval', action='store_true', help='Skip evaluation step')
    parser.add_argument('--api-key', help='Anthropic API key (or set ANTHROPIC_API_KEY env var)')
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("ERROR: Set ANTHROPIC_API_KEY environment variable or pass --api-key")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    print(f"Loading data...")
    skill_text = load_skill()
    style_text = load_style_guide()
    chapters = load_chapters()

    print(f"Selecting {args.samples} samples...")
    samples = select_samples(chapters, args.samples)
    print(f"Selected lessons: {[s['lesson']['id'] for s in samples]}")

    results = []
    for i, sample in enumerate(samples):
        lesson_id = sample['lesson']['id']
        print(f"\n[{i+1}/{len(samples)}] Generating lesson {lesson_id}...")

        result = run_benchmark_single(client, args.model, skill_text, style_text, sample)
        if result is None:
            print(f"  Skipped (no source material)")
            continue

        print(f"  Generated ({result['output_tokens']} tokens)")
        print(f"  Human title: {result['human_title']}")
        print(f"  Claude output (first 150): {result['claude_output'][:150]}...")

        if not args.skip_eval:
            print(f"  Evaluating...")
            evaluation = run_evaluation(client, args.model, result)
            result['evaluation'] = evaluation
            if 'error' not in evaluation:
                scores = [evaluation[k] for k in
                         ['source_fidelity', 'iron_law_compliance', 'style_match',
                          'structural_match', 'bombshell_capture', 'overall_quality']]
                avg = sum(scores) / len(scores)
                print(f"  Scores: fidelity={evaluation['source_fidelity']}, "
                      f"style={evaluation['style_match']}, "
                      f"bombshell={evaluation['bombshell_capture']}, "
                      f"overall={evaluation['overall_quality']} (avg={avg:.1f})")

        results.append(result)
        time.sleep(1)  # rate limiting

    # Save results
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    out_path = RESULTS_DIR / f'benchmark_{timestamp}.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nResults saved to: {out_path}")

    # Print summary
    if results and not args.skip_eval:
        print("\n=== BENCHMARK SUMMARY ===")
        metrics = ['source_fidelity', 'iron_law_compliance', 'style_match',
                   'structural_match', 'bombshell_capture', 'overall_quality']
        for metric in metrics:
            values = [r['evaluation'][metric] for r in results
                     if 'evaluation' in r and metric in r.get('evaluation', {})]
            if values:
                avg = sum(values) / len(values)
                print(f"  {metric:25s}: {avg:.2f}/5.00")

        all_scores = []
        for r in results:
            if 'evaluation' in r and 'error' not in r['evaluation']:
                scores = [r['evaluation'][m] for m in metrics]
                all_scores.append(sum(scores) / len(scores))
        if all_scores:
            print(f"\n  {'OVERALL AVERAGE':25s}: {sum(all_scores)/len(all_scores):.2f}/5.00")

        total_input = sum(r.get('input_tokens', 0) for r in results)
        total_output = sum(r.get('output_tokens', 0) for r in results)
        print(f"\n  Total tokens: {total_input:,} input + {total_output:,} output")


if __name__ == '__main__':
    main()
