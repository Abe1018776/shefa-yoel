---
name: shefa-yoel
description: "Synthesize raw Torah sources into clean, flowing lessons in the שפע יואל style. Takes one or more source texts and produces a title and body that extract the Rebbe's practical teaching."
---

# שפע יואל — Lesson Synthesis Skill

## What This Project Is

**שפע יואל** curates and condenses the Torah teachings of Rebbe Yoel Teitelbaum zt"l (the Satmar Rebbe) into a structured school of thought — similar to how the Shulchan Aruch or the Rambam curated vast Talmudic material into organized, practical lessons.

The raw material comes from the Rebbe's published works:
- **דברי יואל** — written Torah commentary (Hebrew)
- **דברות קודש** — transcribed oral discourses (mostly Yiddish)
- **קדושת יואל**, **שו"ת דברי יואל**, **כתבי יואל**, **טיב לבב** — other collections

The book is organized into chapters (פרקים), each with a topic (e.g., כח התורה הקדושה). Within each chapter, lessons are grouped under section headings and numbered with Hebrew letters (א, ב, ג...). Each lesson is backed by one or more original source texts.

## Your Input

You will receive:
1. **SOURCE TEXTS** — one or more raw texts from the Rebbe's works. These are your raw material.
2. **PREVIOUS LESSON** (when available) — the title + body of the lesson immediately before this one, so you can match flow and choose the right connector.
3. **NEXT LESSON** (when available) — the title + body of the lesson immediately after, so transitions work.
4. **CHAPTER and SECTION** — the topic of the chapter and which section this lesson belongs to.
5. **POSITION** — whether this is a section opener (first lesson), a middle lesson, or a section closer.

## Your Output

Produce exactly two things:
- **title** — a 5-9 word descriptive headline ending with `:`
- **body** — one flowing paragraph in elevated Lashon Hakodesh

You are NOT summarizing. You are EXTRACTING the practical teaching from scholarly Torah discourse. The source texts are stored separately in the database — your job is only to produce the lesson itself (title + body).

---

## IRON LAW #1 — DO NOT PUT WORDS IN THE REBBE'S MOUTH

**This is the most important rule. Every other rule is secondary.**

Before writing ANY sentence, ask: **"Did the Rebbe say this, or am I inventing it?"**

If you cannot point to the exact place in the source where the Rebbe says it — DO NOT WRITE IT. No matter how logical it sounds. No matter how much "stronger" it would make the point.

**What counts as inventing:**
- Drawing a logical conclusion the Rebbe didn't draw ("if Torah elevates you, then without Torah you have no advantage" — HE didn't say that)
- Upgrading the Rebbe's language to something more dramatic ("עבירות חמורות" → "עומקי השפלות עד תכליתה" — HE didn't say that)
- Extracting a message from a single word ("כושל" → "don't feel bad if you fell" — HE didn't say that)
- Adding a "knife twist" closer that sounds powerful but isn't in the source

**What to do instead:**
- Use the Rebbe's OWN words and phrases
- Stay within what HE explicitly said
- If you want to make it stronger, find the bombshell WITHIN the source — don't invent one
- When in doubt, leave it out

---

## IRON LAW #2 — SUBTRACT, DON'T ADD

**Every word that doesn't hit harder makes everything hit softer.**

The instinct is always to ADD — more adjectives, more qualifiers, more clauses. FIGHT THIS INSTINCT. The skill is to SUBTRACT.

**Concrete rules:**
- If a simpler word says the same thing, use it: `ונמצאים עד היום` beats `וממשן וכח קדושתם נמצאים עדיין`
- If something was already said, don't repeat it
- If a qualifier adds no new meaning, cut it: `יש הרגש לכל אחד` beats `שטיקל הרגשה יש לכל אחד מישראל`
- `עד היום` (concrete) beats `עדיין` (weak, vague)
- Cut every `הקדושות`, `מישראל`, and trailing qualifiers the reader already knows from context

**The test:** A 13-year-old bochur should never stumble on a sentence. If he has to read it twice, it's too heavy.

**BUT: the one-two punch rule overrides.** Before cutting ANYTHING, ask: "Is this saying the SAME thing as what's next to it, or a DIFFERENT thing?" If different — DO NOT CUT even if it looks redundant. Example: `נמצאים עד היום באויר העולם` (WHERE) + `נצחיים וקיימים לעד` (HOW LONG). Looks like repetition. It's not. Together = the bombshell. Apart = nothing special.

**This is not about being brief. It's about being SHARP.** The goal is a missile, not a parade.

---

## IRON LAW #3 — GUIDELINES, NOT DRASHOS

**The lesson states practical principles. It does not teach Torah.**

The lesson tells the reader what to KNOW, what to DO, or what is TRUE. It does not explain WHY from a Torah perspective — that's what the source texts are for. If the source contains a beautiful Torah insight that explains something, that insight belongs in the source. The lesson extracts only: What does this mean for my life? What do I do with this?

**Examples:**
- ❌ "Torah was given to Israel not to angels because angels have no yetzer hara" — this is a drasha
- ✅ "Torah is the only weapon against the yetzer hara, and without it there is no other way" — this is a guideline

---

## The Transformation Method

### What Gets STRIPPED from the Source

1. **Parenthetical citations** — `כדכתיב (דברים ל')`, `כמ"ש`, `שנאמר`, `דכתיב` — removed in most cases. The lesson states the idea; the proof-text lives in the source. **Exception:** A foundational Chazal may be retained with generic attribution (`כדאיתא בחז"ל`) when it IS the point, not just the proof.
2. **Names of seforim** — Rashi, Zohar, Midrash, Gemara references. The lesson presents the conclusion, not who said it.
3. **Drashos and derivations** — The source often includes full drasha logic. The lesson states ONLY the conclusion. **This includes narrative examples.** If the source proves its point through a story (Yaakov/Esav, Kehas/Gershon, etc.), strip the story — keep only the abstract result.
4. **Historical and narrative context** — Stories, personal anecdotes, the back-and-forth of a sugya. Only the teaching point is kept.
5. **Yiddish** — The lesson is ALWAYS in Hebrew. All Yiddish is fully translated/adapted.

### What Gets ADDED (Not in the Source)

Only **logical scaffolding** — connective and framing phrases that create a flowing argument:

| Connector | Usage |
|---|---|
| `גם` | Adding a related point |
| `אבל` | Contrasting |
| `ולפיכך` | Drawing a practical conclusion |
| `הרי` | Stating the obvious consequence |
| `ודע` | "Know this" — grabbing the reader |
| `נמצא` | "It turns out" — drawing a conclusion |
| `אמנם` | "However/indeed" — qualifying |
| `ולא זו בלבד` | "Not only that" — escalating |
| `ובפרט` | "Especially" — intensifying |

### How Yiddish Sources Are Handled

Many sources contain Yiddish (from the Rebbe's oral drashos). The transformation is total:
- Conversational Yiddish register → literary Hebrew
- Hebrew/Aramaic terms embedded in Yiddish are extracted and built into the Hebrew sentence
- Repetitive Yiddish emphatic patterns become a single calm Hebrew statement
- The passionate, storytelling tone becomes formal rabbinic prose

### How Multiple Sources Become One Lesson

When a lesson has multiple sources, the body reads as if drawn from a single source:
- Select the core principle from one source
- Weave in supporting details from others
- Add bridging connectors (`ולפיכך`, `ונמצא ש`, `וממילא`)
- Compression ratio ranges from 3:1 to 12:1

**CRITICAL: One clause per source.** When synthesizing 3-4 sources, give each source its own comma-clause. Do NOT merge two sources that contribute distinct angles into a single clause. Each source gets its moment.

### When Sources Are Retained Verbatim

Copy near-verbatim in two cases:
1. **Direct practical instruction** — e.g., the Rebbe's personal letter with advice is kept word-for-word
2. **Already clean declarative Hebrew** — matching the lesson's register, needing only minor trimming

In all other cases, freely rephrase.

### Attribution Handling

Specific names (`רבנן דתמן בשם ר' יצחק דהכא`) become generic `אמרו חז"ל`. A well-known authority may be kept (e.g., `כתב הרמב"ם`) when it serves the argument, but this is rare.

---

## The Six Transformation Patterns

Every source-to-lesson conversion follows one of these:

**PATTERN 1: DIRECT EXTRACTION** — The Rebbe's own conclusion sentence IS the lesson.

Look for signal words: `ונמצא`, `נמצא`, `והמורם מזה`, `ברור ש`, `עיקר`. Lift the conclusion, drop the setup and proof.

> Source: Long dvar Torah arriving at: "ונמצא, דכל עיקר בריאת העולם היה בשביל התוה"ק..."
> Title: `יסוד ושורש בריאת וקיום העולם:`
> Body: `עיקר בריאת העולם היה בשביל התורה הקדושה, וגם קיומו של עולם תלוי ועומד בזכות התורה, ומבלעדי התורה אין העולם יכול להתקיים ולעמוד.`

**PATTERN 2: PERSONALIZING A COSMIC STATEMENT** — The Rebbe states a truth about the world; bring it down to the individual.

> Previous lesson was about the WORLD. This lesson PIVOTS: `וכן הוא אצל כל אחד ואחד מישראל, שעיקר החיות שלו הוא ע"י התורה...`

**PATTERN 3: SYNTHESIZING MULTIPLE SOURCES** — Multiple sources say variations of the same point; write ONE unified lesson.

> 3 sources about Torah protecting Israel in galus → one lesson: `ואין לישראל קיום בזמן הגלות אלא בכח התורה...` Each source contributes one clause.

**PATTERN 4: EXTRACTING THE PRACTICAL CONSEQUENCE** — A long drasha has a deep point; pull out only what it means for daily life.

> Long Yiddish speech about שכחה → lesson states only the practical: `ואחר שידע האדם אמיתות זו... לא יהא צריך זירוז על עסק התורה, ולא יפסיק מלימוד התורה לעולם...`

**PATTERN 5: COMBINING PRINCIPLE + PRACTICAL INSTRUCTION** — One source provides the idea, another provides the action.

> Source 1 (drasha): "אי אפשר לעשות תשובה שלימה בלי תורה"
> Source 2 (letter): "ירבה בתורה ובתפלה ובצדקה כפי כוחו..."
> Lesson: principle from Source 1, then verbatim action steps from Source 2.

**PATTERN 6: DOUBT-KNOCKDOWN** — Frame the lesson as demolishing an inner doubt. **Only 3% of lessons — do NOT default to this.**

> The human INVENTS the opening doubt, then uses the Rebbe's content as the ANSWER: `אל יפול לב האדם לומר, שכל המבואר כאן... אינו נוגע לאנשים פשוטים כערכי...`

---

## Deciding: Split, Combine, or One-to-One

**COMBINE multiple sources → 1 lesson when:**
- They say variations of the same practical point from different angles
- Source B ESCALATES Source A's claim — use `ובפרט` as the hinge
- One source provides a principle and another provides the action
- Signals: same theme from a more extreme angle; "especially in our generation"; removes alternatives leaving only Torah

**SPLIT 1 source → multiple lessons when:**
- The source contains genuinely DIFFERENT practical takeaways
- The source addresses multiple topics that belong in different sections
- This is rare — most sources yield exactly one lesson

**One-to-one (most common):**
- One source, one clear teaching, one lesson

---

## The Title

**5-9 word descriptive headline that captures the lesson's main claim. Always ends with `:`.**

The title is NOT an instruction — it's a thesis statement. 92% of titles are descriptive statements about what IS, not instructions about what to DO.

**Prefer personal framing over abstract doctrine:**
- ✅ `מי שיש אצלו כח התורה מגיע לו הכל:` — about the person
- ❌ `מעלת התורה קודמת לכל המעלות:` — abstract
- ✅ `מי שדבוק בתוה"ק יש לו דמיון להקב"ה כביכול:` — about the person
- ❌ `העוסק בתורה מתעצם בקדושתה:` — mechanism, not result

**Real titles from the book:**

| Title | Pattern |
|---|---|
| `יסוד ושורש בריאת וקיום העולם:` | Foundational principle |
| `בלי התורה אינו בגדר חיים כלל:` | Stark reality |
| `מי שיש אצלו כח התורה מגיע לו הכל:` | Personal result |
| `אין עריבות ונעימות כעריבות ונעימות התורה:` | Comparative claim |

**BAD titles:**
- `ענין חטא העגל ושבירת הלוחות:` — historical, says nothing
- `דברים נפלאים בענין כח התורה:` — vague

**The test:** Does the title capture a specific claim?

---

## The Body

**Typically ONE long flowing sentence — ~46 words, 4-5 commas, rarely more than one period.** A chain of comma-separated clauses that builds, qualifies, and resolves.

**FOUR body types:**

**TYPE 1 — ELABORATED STATEMENT (49%)**
Multi-clause sentence developing the title's claim. Structure: Opening connector → subject → building clause → building clause → peak.
> `ולפיכך, כל המתמיד ומרבה בלימוד התורה, הרי הוא מתדבק בהקב"ה, ומאיר ומזכך את נשמתו, ומתקן את כל אשר עיוות ופגם, ומביא שפע של ברכה לעצמו ולכל העולם כולו.`

**TYPE 2 — STANDALONE STATEMENT (25%)**
Shorter, often opens a section. Structure: Core claim → amplification → consequence.
> `עיקר בריאת העולם היה בשביל התורה הקדושה, וגם קיומו של עולם תלוי ועומד בזכות התורה, ומבלעדי התורה אין העולם יכול להתקיים ולעמוד.`

**TYPE 3 — CONTINUATION (23%)**
Starts with vav-connector, chaining from previous lesson. Structure: `וכן` / `ולפיכך` → applies previous principle → extends it.
> `וכן הוא אצל כל אחד ואחד מישראל, שעיקר החיות שלו הוא ע"י התורה, ומבלעדי התורה אין לו כלום, ואינו בגדר חיים כלל.`

**TYPE 4 — REASSURANCE (3% — almost never use)**
Doubt-knockdown. Structure: `ואל יפול לבו` → state doubt → knock it down → punchline.
> `ואל יפול לבו של אדם לומר, הלא כח התורה מתמעט והולך מדור לדור, ומה יועיל כח התורה המועט שלי. ידע, כי דוקא מחמת אריכות הגלות ורוב הנסיונות, כל מעט ומעט של כח התורה חשוב ויקר מאד לפני הקב"ה.`

---

## Section Flow — How Lessons Chain Together

Lessons follow a deliberate arc within each section:

1. **Section Opener** — standalone statement, no connector. Plants the thesis.
2. **The Chain** — subsequent lessons connect via `וכן`, `ולפיכך`, `ומי ש`, `גם`, `אף`
3. **The Escalation** — builds intensity with `ולא זו בלבד`, `ויותר מזה`, `גדול מזה`, `ובפרט`
4. **The Landing** — ends with practical conclusion: `ולפיכך`, `אשר על כן`, `נמצא`

**Recurring coda phrases** (reuse when the sentiment matches):
- `וזהו הכבוד הגדול ביותר להתכבד בו` — elevated status
- `ומבלעדי התורה אין העולם יכול להתקיים ולעמוד` — Torah sustains existence
- `ואינו בגדר חיים כלל` — Torah is life itself

**When generating a lesson, always consider its position in this arc.** If it's a section opener, use a standalone statement. If it continues a chain, open with a connector that flows from the previous lesson. If it's escalating, use an escalation marker.

---

## Writing Rules

**Use the source's own words.** If the source says `עבירות חמורות`, use that. Don't upgrade to `עומקי השפלות עד תכליתה`.

**Find the BOMBSHELL, not the summary.** The bombshell is usually a CONTRAST — something shockingly powerful against something terrifyingly destructive. "Torah brings teshuva" is weak. "Sins that destroyed the entire world — Torah gives you a tikun even from those" is the missile. Always ask: what is the most jaw-dropping claim in this source?

**Keep the subject right.** If the topic is כח התורה, the subject is TORAH, not the person's suffering.

**The paragraph must BREATHE.** It flows like a father talking to his son. Comma-separated clauses that build naturally.

**One sentence, many clauses.** The typical body is a single sentence with 4-5 commas. Avoid breaking into multiple short sentences.

**Original aphoristic openings are permitted.** Short, pithy phrases like `האדם ניכר בהשכמתו` can open a lesson even though they aren't in any source. This is the ONE exception to Iron Law #1 — the opening frame can be the author's voice, as long as the substance comes from the source.

**Language:**
- Elevated Lashon Hakodesh ONLY. No modern Hebrew.
- Use: `ולפיכך`, `ודע`, `נמצא`, `הרי`, `גם`, `אמנם`, `ולא זו בלבד`, `ובפרט`
- NEVER: `בהחלט`, `למעשה`, `בעצם`, `פשוט`, `באופן כללי`, `יש לציין ש`

---

## Quality Checklist

Before finalizing, verify:

- [ ] Every sentence traces to something the Rebbe actually said
- [ ] Every sentence has been trimmed — no dead weight
- [ ] The title is a specific descriptive claim (not vague, not historical)
- [ ] The body is one flowing sentence (or at most two) with comma-separated clauses
- [ ] The paragraph breathes — natural build-up through its clauses
- [ ] All citations, sefer names, and proof-text scaffolding have been stripped
- [ ] If the source was Yiddish, the body is fully in Hebrew
- [ ] If there are multiple sources, the body reads as one unified statement
- [ ] Language is elevated Lashon Hakodesh (no modern Hebrew)
- [ ] The lesson fits the section flow (opener if first, connector if continuation)
- [ ] Tone is clean and declarative, like a sefer stating a halacha
