import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import './Compare.css'

// ── Word-level diff ──────────────────────────────────────────
function diffWords(textA, textB) {
  if (!textA && !textB) return []
  if (!textA) return (textB || '').split(/(\s+)/).map(w => ({ type: 'added', text: w }))
  if (!textB) return (textA || '').split(/(\s+)/).map(w => ({ type: 'removed', text: w }))
  const a = textA.split(/(\s+)/), b = textB.split(/(\s+)/)
  const m = a.length, n = b.length
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  const result = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { result.unshift({ type: 'same', text: a[i - 1] }); i--; j-- }
    else if (dp[i - 1][j] > dp[i][j - 1]) { result.unshift({ type: 'removed', text: a[i - 1] }); i-- }
    else { result.unshift({ type: 'added', text: b[j - 1] }); j-- }
  }
  while (i > 0) { result.unshift({ type: 'removed', text: a[i - 1] }); i-- }
  while (j > 0) { result.unshift({ type: 'added', text: b[j - 1] }); j-- }
  return result
}

// ── Word export ──────────────────────────────────────────────
async function exportToWord(lesson, sources, versions) {
  const children = [
    new Paragraph({
      children: [new TextRun({ text: lesson.human_title || '(ללא כותרת)', bold: true, size: 32, rightToLeft: true })],
      heading: HeadingLevel.HEADING_1, bidirectional: true,
    }),
    new Paragraph({
      children: [new TextRun({ text: lesson.human_body || '', size: 24, rightToLeft: true })],
      bidirectional: true, spacing: { after: 300 },
    }),
  ]
  if (sources.length) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'מקורות', bold: true, size: 28, rightToLeft: true })],
      heading: HeadingLevel.HEADING_2, bidirectional: true,
    }))
    sources.forEach(s => children.push(new Paragraph({
      children: [
        new TextRun({ text: `${s.sefer} ${s.location || ''}`, bold: true, size: 22, rightToLeft: true }),
        new TextRun({ text: ` — ${s.raw_text || ''}`, size: 22, rightToLeft: true }),
      ],
      bidirectional: true, spacing: { after: 120 },
    })))
  }
  versions.forEach(v => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `גרסה ${v.version_number}${v.is_favorite ? ' ★' : ''}${v.is_human ? ' (אנושי)' : ''}`, bold: true, size: 28, rightToLeft: true })],
        heading: HeadingLevel.HEADING_2, bidirectional: true, spacing: { before: 400 },
      }),
      new Paragraph({
        children: [new TextRun({ text: v.generated_title || '', bold: true, size: 24, rightToLeft: true })],
        bidirectional: true,
      }),
      new Paragraph({
        children: [new TextRun({ text: v.generated_body || '', size: 24, rightToLeft: true })],
        bidirectional: true, spacing: { after: 200 },
      }),
    )
    if (v.human_comment) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `הערה: ${v.human_comment}`, italics: true, size: 20, rightToLeft: true })],
        bidirectional: true,
      }))
    }
  })
  const doc = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${lesson.id}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════════
export default function Compare() {
  const [lessons, setLessons] = useState([])
  const [versionCounts, setVersionCounts] = useState({})
  const [currentLesson, setCurrentLesson] = useState(null)
  const [sources, setSources] = useState([])
  const [versions, setVersions] = useState([])
  const [activeVersion, setActiveVersion] = useState(null)
  const [chapter, setChapter] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [showExamples, setShowExamples] = useState(false)
  const [examples, setExamples] = useState([])
  // drag and drop
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)

  useEffect(() => {
    async function init() {
      const { data: lessonData } = await supabase.from('lessons').select('*').order('chapter').order('section').order('point_number')
      const { data: versionData } = await supabase.from('versions').select('lesson_id,id')
      const counts = {}
      ;(versionData || []).forEach(v => { counts[v.lesson_id] = (counts[v.lesson_id] || 0) + 1 })
      setLessons(lessonData || [])
      setVersionCounts(counts)
    }
    init()
  }, [])

  const filtered = useMemo(() => {
    let result = lessons
    if (chapter) result = result.filter(l => l.chapter === chapter)
    if (status) result = result.filter(l => l.status === status)
    if (search) result = result.filter(l =>
      (l.human_title || '').includes(search) || (l.human_body || '').includes(search) || l.id.includes(search)
    )
    return result
  }, [lessons, chapter, status, search])

  // Group by section for drag-drop
  const sections = useMemo(() => {
    const map = new Map()
    filtered.forEach(l => {
      const key = `${l.chapter}|${l.section_heading || l.section || ''}`
      if (!map.has(key)) map.set(key, { chapter: l.chapter, heading: l.section_heading || l.section || '', lessons: [] })
      map.get(key).lessons.push(l)
    })
    return [...map.values()]
  }, [filtered])

  const totalVersions = useMemo(() =>
    Object.values(versionCounts).reduce((a, b) => a + b, 0), [versionCounts])

  async function selectLesson(lesson) {
    setCurrentLesson(lesson)
    setShowExamples(false)
    const { data: srcData } = await supabase.from('lesson_sources').select('*').eq('lesson_id', lesson.id).order('footnote_number')
    const { data: verData } = await supabase.from('versions').select('*').eq('lesson_id', lesson.id).order('version_number')
    setSources(srcData || [])
    setVersions(verData || [])
    setActiveVersion(verData?.[0] || null)
  }

  async function loadExamples() {
    const { data } = await supabase.from('skill_examples').select('*').order('id')
    setExamples(data || [])
    setShowExamples(true)
    setCurrentLesson(null)
  }

  // Drag and drop reorder
  async function handleDrop(targetLesson, sectionLessons) {
    if (!dragId || dragId === targetLesson.id) { setDragId(null); setDragOverId(null); return }
    const ordered = [...sectionLessons]
    const fromIdx = ordered.findIndex(l => l.id === dragId)
    const toIdx = ordered.findIndex(l => l.id === targetLesson.id)
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); setDragOverId(null); return }
    const [moved] = ordered.splice(fromIdx, 1)
    ordered.splice(toIdx, 0, moved)
    // Update point_numbers
    const updates = ordered.map((l, i) => ({ id: l.id, point_number: i + 1 }))
    for (const u of updates) {
      await supabase.from('lessons').update({ point_number: u.point_number, updated_at: new Date().toISOString() }).eq('id', u.id)
    }
    // Refresh
    setLessons(prev => {
      const next = [...prev]
      updates.forEach(u => {
        const idx = next.findIndex(l => l.id === u.id)
        if (idx >= 0) next[idx] = { ...next[idx], point_number: u.point_number }
      })
      next.sort((a, b) => (a.chapter || '').localeCompare(b.chapter || '') || (a.section || '').localeCompare(b.section || '') || (a.point_number || 0) - (b.point_number || 0))
      return next
    })
    setDragId(null)
    setDragOverId(null)
  }

  function onLessonUpdated(updated) {
    setLessons(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
    setCurrentLesson(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev)
  }

  function onVersionsChanged(newVersions) {
    setVersions(newVersions)
    setVersionCounts(prev => ({ ...prev, [currentLesson.id]: newVersions.length }))
  }

  return (
    <div className="compare">
      <div className="c-header">
        <h1>שפע יואל — השוואת גרסאות</h1>
        <div className="c-stats">{lessons.length} שיעורים | {totalVersions} גרסאות</div>
      </div>

      <div className="c-controls">
        <select value={chapter} onChange={e => setChapter(e.target.value)}>
          <option value="">כל הפרקים</option>
          <option value="א">פרק א</option>
          <option value="ב">פרק ב</option>
          <option value="ג">פרק ג</option>
          <option value="ד">פרק ד</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">כל הסטטוסים</option>
          <option value="imported">imported</option>
          <option value="finalized">finalized</option>
          <option value="empty">empty</option>
          <option value="review">review</option>
        </select>
        <input type="text" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200 }} />
        <button onClick={loadExamples}>דוגמאות מיומנות</button>
      </div>

      <div className="c-main">
        <div className="c-lesson-list">
          {sections.map(sec => (
            <div key={`${sec.chapter}|${sec.heading}`}>
              <div className="c-section-header">{sec.heading || `פרק ${sec.chapter}`}</div>
              {sec.lessons.map(l => (
                <div
                  key={l.id}
                  className={`c-lesson-item ${currentLesson?.id === l.id ? 'active' : ''} ${dragOverId === l.id ? 'drag-over' : ''}`}
                  draggable
                  onDragStart={() => setDragId(l.id)}
                  onDragOver={e => { e.preventDefault(); setDragOverId(l.id) }}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={e => { e.preventDefault(); handleDrop(l, sec.lessons) }}
                  onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                  onClick={() => selectLesson(l)}
                >
                  <span className="c-drag-handle">⠿</span>
                  <span className="c-id">{l.id}</span>
                  <span className="c-title">{(l.human_title || '').substring(0, 50)}</span>
                  {versionCounts[l.id] > 0 && <span className="badge has-versions">{versionCounts[l.id]}</span>}
                  {l.status === 'empty' && <span className="badge empty">ריק</span>}
                  {l.status === 'finalized' && <span className="badge finalized">סופי</span>}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="c-content">
          {showExamples ? (
            <ExamplesView examples={examples} />
          ) : currentLesson ? (
            <LessonCompare
              lesson={currentLesson}
              sources={sources}
              versions={versions}
              activeVersion={activeVersion}
              onSelectVersion={setActiveVersion}
              onLessonUpdated={onLessonUpdated}
              onVersionsChanged={onVersionsChanged}
            />
          ) : (
            <div className="c-empty">
              <h2>בחר שיעור מהרשימה</h2>
              <p>גרור שיעורים כדי לשנות סדר</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  LESSON COMPARE — Main detail view
// ════════════════════════════════════════════════════════════
function LessonCompare({ lesson, sources, versions, activeVersion, onSelectVersion, onLessonUpdated, onVersionsChanged }) {
  // Edit lesson
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editStatus, setEditStatus] = useState('')
  // New human version
  const [showNewHuman, setShowNewHuman] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  // Manual scoring
  const [editingScores, setEditingScores] = useState(false)
  const [scores, setScores] = useState({})
  // Comment
  const [editingComment, setEditingComment] = useState(false)
  const [commentText, setCommentText] = useState('')
  // Diff
  const [showDiff, setShowDiff] = useState(false)
  const [diffBase, setDiffBase] = useState('human') // 'human' or version id
  // Source highlighting
  const [highlightedWords, setHighlightedWords] = useState(new Set())
  // Saving indicator
  const [saving, setSaving] = useState(false)

  // Reset state when lesson changes
  useEffect(() => { setEditing(false); setShowNewHuman(false); setEditingScores(false); setEditingComment(false); setShowDiff(false); setHighlightedWords(new Set()) }, [lesson.id])

  function toggleHighlightWord(word) {
    setHighlightedWords(prev => {
      const next = new Set(prev)
      if (next.has(word)) next.delete(word); else next.add(word)
      return next
    })
  }

  function startEdit() {
    setEditTitle(lesson.human_title || '')
    setEditBody(lesson.human_body || '')
    setEditStatus(lesson.status || '')
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    const { error } = await supabase.from('lessons').update({
      human_title: editTitle, human_body: editBody, status: editStatus, updated_at: new Date().toISOString()
    }).eq('id', lesson.id)
    if (!error) {
      onLessonUpdated({ id: lesson.id, human_title: editTitle, human_body: editBody, status: editStatus })
      setEditing(false)
    }
    setSaving(false)
  }

  async function saveNewHumanVersion() {
    if (!newTitle.trim() && !newBody.trim()) return
    setSaving(true)
    const maxVer = versions.reduce((mx, v) => Math.max(mx, v.version_number || 0), 0)
    const { data, error } = await supabase.from('versions').insert({
      lesson_id: lesson.id, version_number: maxVer + 1,
      generated_title: newTitle, generated_body: newBody,
      is_human: true, model: 'human',
    }).select()
    if (!error && data) {
      const newVersions = [...versions, data[0]].sort((a, b) => a.version_number - b.version_number)
      onVersionsChanged(newVersions)
      onSelectVersion(data[0])
      setShowNewHuman(false)
      setNewTitle('')
      setNewBody('')
    }
    setSaving(false)
  }

  async function toggleFavorite(version) {
    const newVal = !version.is_favorite
    const { error } = await supabase.from('versions').update({ is_favorite: newVal }).eq('id', version.id)
    if (!error) {
      const updated = versions.map(v => v.id === version.id ? { ...v, is_favorite: newVal } : v)
      onVersionsChanged(updated)
      if (activeVersion?.id === version.id) onSelectVersion({ ...activeVersion, is_favorite: newVal })
    }
  }

  function startScoring() {
    setScores({
      score_source_fidelity: activeVersion?.score_source_fidelity || '',
      score_iron_law: activeVersion?.score_iron_law || '',
      score_style: activeVersion?.score_style || '',
      score_bombshell: activeVersion?.score_bombshell || '',
      score_overall: activeVersion?.score_overall || '',
    })
    setEditingScores(true)
  }

  async function saveScores() {
    if (!activeVersion) return
    setSaving(true)
    const numScores = {}
    for (const [k, v] of Object.entries(scores)) {
      numScores[k] = v === '' ? null : Number(v)
    }
    const { error } = await supabase.from('versions').update(numScores).eq('id', activeVersion.id)
    if (!error) {
      const updated = versions.map(v => v.id === activeVersion.id ? { ...v, ...numScores } : v)
      onVersionsChanged(updated)
      onSelectVersion({ ...activeVersion, ...numScores })
      setEditingScores(false)
    }
    setSaving(false)
  }

  function startComment() {
    setCommentText(activeVersion?.human_comment || '')
    setEditingComment(true)
  }

  async function saveComment() {
    if (!activeVersion) return
    setSaving(true)
    const { error } = await supabase.from('versions').update({ human_comment: commentText }).eq('id', activeVersion.id)
    if (!error) {
      const updated = versions.map(v => v.id === activeVersion.id ? { ...v, human_comment: commentText } : v)
      onVersionsChanged(updated)
      onSelectVersion({ ...activeVersion, human_comment: commentText })
      setEditingComment(false)
    }
    setSaving(false)
  }

  // Diff computation
  const diffResult = useMemo(() => {
    if (!showDiff || !activeVersion) return null
    let baseTitle = '', baseBody = ''
    if (diffBase === 'human') {
      baseTitle = lesson.human_title || ''
      baseBody = lesson.human_body || ''
    } else {
      const bv = versions.find(v => v.id === diffBase)
      if (bv) { baseTitle = bv.generated_title || ''; baseBody = bv.generated_body || '' }
    }
    return {
      title: diffWords(baseTitle, activeVersion.generated_title || ''),
      body: diffWords(baseBody, activeVersion.generated_body || ''),
    }
  }, [showDiff, diffBase, activeVersion, lesson, versions])

  return (
    <>
      {/* ── Action bar ── */}
      <div className="c-action-bar">
        <button onClick={startEdit} disabled={editing}>עריכה</button>
        <button onClick={() => setShowNewHuman(!showNewHuman)}>גרסה אנושית חדשה</button>
        <button onClick={() => exportToWord(lesson, sources, versions)}>ייצוא ל-Word</button>
        {activeVersion && <button onClick={() => setShowDiff(!showDiff)}>{showDiff ? 'סגור השוואה' : 'השוואת הבדלים'}</button>}
      </div>

      {/* ── Sources ── */}
      <div className="c-sources-panel">
        <h3>מקורות ({sources.length})</h3>
        {highlightedWords.size > 0 && (
          <div className="c-highlight-bar">
            <span>מילים מסומנות: {[...highlightedWords].join(' | ')}</span>
            <button onClick={() => setHighlightedWords(new Set())}>נקה הכל</button>
          </div>
        )}
        {sources.map(s => (
          <div key={s.id} className={`c-source-item ${s.source_type === 'supporting' ? 'supporting' : ''}`}>
            <span className="c-sefer">{s.source_type === 'supporting' ? '@ ' : ''}{s.sefer} {s.location ? `(${s.location})` : ''}</span>
            <div className="c-raw">
              <HighlightableText text={s.raw_text || ''} highlighted={highlightedWords} onToggle={toggleHighlightWord} />
            </div>
          </div>
        ))}
      </div>

      {/* ── New human version form ── */}
      {showNewHuman && (
        <div className="c-new-human">
          <h3>גרסה אנושית חדשה</h3>
          <label>כותרת</label>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="כותרת..." />
          <label>גוף</label>
          <textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder="גוף השיעור..." rows={4} />
          <div className="c-form-actions">
            <button className="btn-primary" onClick={saveNewHumanVersion} disabled={saving}>{saving ? 'שומר...' : 'שמור גרסה'}</button>
            <button onClick={() => setShowNewHuman(false)}>ביטול</button>
          </div>
        </div>
      )}

      {/* ── Comparison panels ── */}
      <div className="c-comparison">
        {/* Human panel */}
        <div className="c-panel human">
          <h3>גרסת יואל (מקור)</h3>
          {editing ? (
            <>
              <div className="c-label">כותרת</div>
              <input className="c-edit-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
              <div className="c-label">גוף</div>
              <textarea className="c-edit-textarea" value={editBody} onChange={e => setEditBody(e.target.value)} rows={5} />
              <div className="c-label">סטטוס</div>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                <option value="imported">imported</option>
                <option value="finalized">finalized</option>
                <option value="empty">empty</option>
                <option value="review">review</option>
              </select>
              <div className="c-form-actions">
                <button className="btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'שומר...' : 'שמור'}</button>
                <button onClick={() => setEditing(false)}>ביטול</button>
              </div>
            </>
          ) : (
            <>
              <div className="c-label">כותרת</div>
              <div className="c-title-text">{lesson.human_title || '(ריק)'}</div>
              <div className="c-label">גוף</div>
              <div className="c-body-text">{lesson.human_body || '(ריק)'}</div>
              <div className="c-status">סטטוס: {lesson.status}</div>
            </>
          )}
        </div>

        {/* AI / versions panel */}
        <div className={`c-panel ai ${activeVersion?.is_positive_example ? 'positive' : activeVersion?.is_negative_example ? 'negative' : ''}`}>
          <h3>גרסאות {activeVersion?.is_positive_example ? '✓' : activeVersion?.is_negative_example ? '✗' : ''}</h3>
          {versions.length === 0 ? (
            <div className="c-empty" style={{ padding: 30 }}><p>אין עדיין גרסאות</p></div>
          ) : (
            <>
              {versions.length > 1 && (
                <div className="version-tabs">
                  {versions.map(v => (
                    <div
                      key={v.id}
                      className={`version-tab ${v.id === activeVersion?.id ? 'active' : ''} ${v.is_positive_example ? 'positive' : v.is_negative_example ? 'negative' : ''} ${v.is_human ? 'human-tab' : ''}`}
                      onClick={() => onSelectVersion(v)}
                    >
                      {v.is_favorite && <span className="fav-star">★</span>}
                      v{v.version_number}
                      {v.is_human ? ' 👤' : ''}
                    </div>
                  ))}
                </div>
              )}
              {activeVersion && (
                <>
                  <div className="c-version-actions">
                    <button className={`btn-fav ${activeVersion.is_favorite ? 'active' : ''}`} onClick={() => toggleFavorite(activeVersion)} title="סמן כמועדף">
                      {activeVersion.is_favorite ? '★' : '☆'}
                    </button>
                    <button className="btn-sm" onClick={startScoring}>ניקוד ידני</button>
                    <button className="btn-sm" onClick={startComment}>הערה</button>
                  </div>

                  {/* Diff viewer */}
                  {showDiff && (
                    <div className="c-diff-controls">
                      <label>השוואה מול:</label>
                      <select value={diffBase} onChange={e => setDiffBase(e.target.value === 'human' ? 'human' : Number(e.target.value))}>
                        <option value="human">גרסת מקור</option>
                        {versions.filter(v => v.id !== activeVersion.id).map(v => (
                          <option key={v.id} value={v.id}>v{v.version_number}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="c-label">כותרת</div>
                  {showDiff && diffResult ? (
                    <div className="c-title-text"><DiffDisplay chunks={diffResult.title} /></div>
                  ) : (
                    <div className="c-title-text">{activeVersion.generated_title || '(ריק)'}</div>
                  )}

                  <div className="c-label">גוף</div>
                  {showDiff && diffResult ? (
                    <div className="c-body-text"><DiffDisplay chunks={diffResult.body} /></div>
                  ) : (
                    <div className="c-body-text">{activeVersion.generated_body || '(ריק)'}</div>
                  )}

                  {/* Manual scoring */}
                  {editingScores ? (
                    <div className="c-scoring-form">
                      {[
                        ['score_source_fidelity', 'נאמנות'],
                        ['score_iron_law', 'חוקי ברזל'],
                        ['score_style', 'סגנון'],
                        ['score_bombshell', 'פצצה'],
                        ['score_overall', 'כללי'],
                      ].map(([key, label]) => (
                        <div key={key} className="c-score-input">
                          <label>{label}</label>
                          <input type="number" min="1" max="10" value={scores[key] || ''} onChange={e => setScores(prev => ({ ...prev, [key]: e.target.value }))} />
                        </div>
                      ))}
                      <div className="c-form-actions">
                        <button className="btn-primary" onClick={saveScores} disabled={saving}>{saving ? 'שומר...' : 'שמור ניקוד'}</button>
                        <button onClick={() => setEditingScores(false)}>ביטול</button>
                      </div>
                    </div>
                  ) : (
                    (activeVersion.score_overall || activeVersion.score_source_fidelity) && (
                      <div className="c-scores">
                        <Score label="נאמנות" value={activeVersion.score_source_fidelity} />
                        <Score label="חוקי ברזל" value={activeVersion.score_iron_law} />
                        <Score label="סגנון" value={activeVersion.score_style} />
                        <Score label="פצצה" value={activeVersion.score_bombshell} />
                        <Score label="כללי" value={activeVersion.score_overall} />
                      </div>
                    )
                  )}

                  {/* Comment */}
                  {editingComment ? (
                    <div className="c-comment-form">
                      <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="הוסף הערה..." rows={3} />
                      <div className="c-form-actions">
                        <button className="btn-primary" onClick={saveComment} disabled={saving}>{saving ? 'שומר...' : 'שמור הערה'}</button>
                        <button onClick={() => setEditingComment(false)}>ביטול</button>
                      </div>
                    </div>
                  ) : activeVersion.human_comment ? (
                    <div className="c-comment" onClick={startComment}>
                      <strong>הערה:</strong> {activeVersion.human_comment}
                    </div>
                  ) : null}

                  {activeVersion.evaluation_notes && <div className="c-eval-notes">{activeVersion.evaluation_notes}</div>}
                  <div className="c-status">{activeVersion.model || ''} | {new Date(activeVersion.created_at).toLocaleDateString('he')}</div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {(lesson.context_before || lesson.context_after) && (
        <div className="c-sources-panel">
          <h3>הקשר</h3>
          {lesson.context_before && <div className="c-source-item"><span className="c-sefer">לפני:</span><div className="c-raw">{lesson.context_before}</div></div>}
          {lesson.context_after && <div className="c-source-item"><span className="c-sefer">אחרי:</span><div className="c-raw">{lesson.context_after}</div></div>}
        </div>
      )}
    </>
  )
}

// ── Highlightable source text ────────────────────────────────
function HighlightableText({ text, highlighted, onToggle }) {
  const words = text.split(/(\s+)/)
  return (
    <span>
      {words.map((w, i) => {
        if (/^\s+$/.test(w)) return <span key={i}>{w}</span>
        const clean = w.replace(/[^\u0590-\u05FF\u0600-\u06FFa-zA-Zא-ת]/g, '')
        const isHighlighted = clean && highlighted.has(clean)
        return (
          <span
            key={i}
            className={`source-word-highlight ${isHighlighted ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); if (clean) onToggle(clean) }}
          >
            {w}
          </span>
        )
      })}
    </span>
  )
}

// ── Diff display component ──────────────────────────────────
function DiffDisplay({ chunks }) {
  return (
    <span>
      {chunks.map((c, i) => (
        c.type === 'same' ? <span key={i}>{c.text}</span> :
        c.type === 'added' ? <span key={i} className="diff-added">{c.text}</span> :
        <span key={i} className="diff-removed">{c.text}</span>
      ))}
    </span>
  )
}

function Score({ label, value }) {
  return (
    <div className="c-score">
      <div className="c-score-value">{value || '-'}</div>
      <div className="c-score-name">{label}</div>
    </div>
  )
}

function ExamplesView({ examples }) {
  return (
    <>
      <h2 style={{ marginBottom: 20, color: 'var(--accent)' }}>דוגמאות מיומנות ({examples.length})</h2>
      {examples.map((ex, i) => (
        <div key={ex.id} style={{ marginBottom: 30 }}>
          <h3 style={{ color: 'var(--accent)', marginBottom: 8 }}>{i + 1}. {ex.category} — {ex.rule_reference || ''}</h3>
          {ex.source_text && (
            <div className="c-sources-panel">
              <h3>מקור</h3>
              <div className="c-source-item">
                <div className="c-raw">{ex.source_text.substring(0, 300)}{ex.source_text.length > 300 ? '...' : ''}</div>
              </div>
            </div>
          )}
          <div className="c-comparison">
            <div className="c-panel ai negative">
              <h3>✗ גרסה שגויה</h3>
              <div className="c-body-text">{ex.bad_version || ''}</div>
              <div className="c-eval-notes">{ex.bad_reason || ''}</div>
            </div>
            <div className="c-panel ai positive">
              <h3>✓ גרסה נכונה</h3>
              <div className="c-body-text">{ex.good_version || ''}</div>
              <div className="c-eval-notes">{ex.good_reason || ''}</div>
            </div>
          </div>
          {ex.conversation_context && (
            <div className="c-eval-notes" style={{ marginBottom: 10 }}><strong>יואל:</strong> {ex.conversation_context}</div>
          )}
        </div>
      ))}
    </>
  )
}
