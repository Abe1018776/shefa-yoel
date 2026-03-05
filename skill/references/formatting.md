# שפע יואל — Document Formatting Specifications

## Page Setup

- Direction: RTL (Right-to-Left)
- Bidi language: he-IL
- Default font size: 12pt (sz=24, szCs=24)
- Line spacing: 278 twips, lineRule=auto
- After spacing: 160 twips
- Font: Theme minorBidi (typically David, Narkisim, or similar Hebrew font)

## Element Hierarchy and Formatting

### 1. Opening Epigraph
- Style ID: "a" (custom style "מכון תוצאות")
- Font size: 16pt (sz=32, szCs=32)
- Alignment: justified (both)
- Direction: bidi
- Content pattern: `דברי יואל (פרשה עמ' xxx): "quote text".`
- The source name (דברי יואל) is bold, the rest is regular

### 2. Chapter Title (פרק א / פרק ב / etc.)
- No named style (inline formatting)
- Font size: 33pt (sz=66, szCs=66)
- Bold: yes
- Alignment: center

### 3. Pasuk Subtitle
- No named style (inline formatting)
- Font size: 27pt (sz=54, szCs=54)
- Bold: yes
- Alignment: center
- Content: A verse from Tanach relevant to the chapter

### 4. Topic Title
- No named style (inline formatting)
- Font size: 20pt (sz=40, szCs=40)
- Bold: yes
- Alignment: center
- Content: The topic name (e.g., "כח התורה הקדושה וסגולתה")

### 5. Section Heading
- Style: Heading2
- Font size: 16pt (sz=32, szCs=32)
- Color: #0F4761
- Alignment: center
- Keep with next: yes
- Keep lines together: yes
- Outline level: 1
- Content pattern: `Theme A / Theme B` (two related themes separated by ` / `)

### 6a. Bold Sub-Title (actionable headline)
- No named style (inline formatting, bold run)
- Font size: 12pt (sz=24, szCs=24) — same as body text
- Bold: yes
- Alignment: default RTL
- Ends with `:`
- NOT numbered, NOT indented

### 6b. Numbered Paragraph (summary content)
- Style: ListParagraph
- Font size: 12pt (sz=24, szCs=24)
- Bold: no
- Alignment: justified (both)
- Numbering: hebrew1 format
- Indent: standard list paragraph indent
- Contains footnote references

### 7. Footnote Text
- Style: FootnoteText (style ID: "FootnoteText")
- Font size: 10pt (sz=20, szCs=20)
- Alignment: justified (both)
- Line spacing: as defined in style

## Numbering Configuration

- Abstract numbering format: hebrew1
- Level 0 text pattern: `%1.` (Hebrew letter followed by period)
- Alignment: left
- Numbers restart at each new section (under each Heading2)
- Within sub-sections that have their own sub-heading, numbers restart from א.

## Footnote Structure

Each footnote contains:
1. Footnote reference mark (automatic)
2. Space + source citation in bold or regular
3. Full quote text
4. Optional: `@` prefix line for supporting sources

### Footnote Citation Formats:
```
דברי יואל (פרשה עמ' xxx):
דברות קודש (פרשה שנה):
קדושת יואל (פרשה אות x):
חידו"ת (שנה):
```

### Supporting Source Format:
```
@ובדברי יואל (פרשה עמ' xxx): "quote"
@ובדברות קודש (פרשה שנה): "quote"
```

## Color Palette

| Element | Color |
|---------|-------|
| Heading2 | #0F4761 |
| All other text | Default (black / auto) |

## Key Technical Notes

- Document uses footnotes (not endnotes) for the source layer
- All text is RTL with bidi=true on Normal style
- Footnote references in the body text are standard Word footnote references (superscript numbers)
- The original documents show [1][2] style in plain text export, but in the actual docx these are proper footnote reference marks
- When editing existing documents: unpack → edit XML → repack (per docx skill)
- When creating new documents: use docx-js (per docx skill)
