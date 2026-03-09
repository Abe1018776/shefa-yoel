import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import './Compare.css'

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

  useEffect(() => {
    async function init() {
      const { data: lessonData } = await supabase.from('lessons').select('*').order('id')
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

  const totalVersions = useMemo(() =>
    Object.values(versionCounts).reduce((a, b) => a + b, 0), [versionCounts])

  async function selectLesson(lesson) {
    setCurrentLesson(lesson)
    setShowExamples(false)

    const { data: srcData } = await supabase
      .from('lesson_sources')
      .select('*')
      .eq('lesson_id', lesson.id)
      .order('footnote_number')

    const { data: verData } = await supabase
      .from('versions')
      .select('*')
      .eq('lesson_id', lesson.id)
      .order('version_number')

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
          {filtered.map(l => (
            <div
              key={l.id}
              className={`c-lesson-item ${currentLesson?.id === l.id ? 'active' : ''}`}
              onClick={() => selectLesson(l)}
            >
              <span className="c-id">{l.id}</span>
              <span className="c-title">{(l.human_title || '').substring(0, 60)}</span>
              {versionCounts[l.id] > 0 && <span className="badge has-versions">{versionCounts[l.id]} גרסאות</span>}
              {l.status === 'empty' && <span className="badge empty">ריק</span>}
              {l.status === 'finalized' && <span className="badge finalized">סופי</span>}
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
            />
          ) : (
            <div className="c-empty">
              <h2>בחר שיעור מהרשימה</h2>
              <p>או לחץ על "דוגמאות מיומנות" לראות את כל הדוגמאות הטובות והרעות</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LessonCompare({ lesson, sources, versions, activeVersion, onSelectVersion }) {
  return (
    <>
      <div className="c-sources-panel">
        <h3>מקורות ({sources.length})</h3>
        {sources.map(s => (
          <div key={s.id} className={`c-source-item ${s.source_type === 'supporting' ? 'supporting' : ''}`}>
            <span className="c-sefer">{s.source_type === 'supporting' ? '@ ' : ''}{s.sefer} {s.location ? `(${s.location})` : ''}</span>
            <div className="c-raw">{s.raw_text}</div>
          </div>
        ))}
      </div>

      <div className="c-comparison">
        <div className="c-panel human">
          <h3>גרסת יואל (מקור)</h3>
          <div className="c-label">כותרת</div>
          <div className="c-title-text">{lesson.human_title || '(ריק)'}</div>
          <div className="c-label">גוף</div>
          <div className="c-body-text">{lesson.human_body || '(ריק)'}</div>
          <div className="c-status">סטטוס: {lesson.status}</div>
        </div>

        <div className={`c-panel ai ${activeVersion?.is_positive_example ? 'positive' : activeVersion?.is_negative_example ? 'negative' : ''}`}>
          <h3>גרסאות AI {activeVersion?.is_positive_example ? '✓' : activeVersion?.is_negative_example ? '✗' : ''}</h3>
          {versions.length === 0 ? (
            <div className="c-empty" style={{ padding: 30 }}><p>אין עדיין גרסאות AI</p></div>
          ) : (
            <>
              {versions.length > 1 && (
                <div className="version-tabs">
                  {versions.map(v => (
                    <div
                      key={v.id}
                      className={`version-tab ${v.id === activeVersion?.id ? 'active' : ''} ${v.is_positive_example ? 'positive' : v.is_negative_example ? 'negative' : ''}`}
                      onClick={() => onSelectVersion(v)}
                    >
                      v{v.version_number}
                    </div>
                  ))}
                </div>
              )}
              {activeVersion && (
                <>
                  <div className="c-label">כותרת</div>
                  <div className="c-title-text">{activeVersion.generated_title || '(ריק)'}</div>
                  <div className="c-label">גוף</div>
                  <div className="c-body-text">{activeVersion.generated_body || '(ריק)'}</div>
                  {activeVersion.score_overall && (
                    <div className="c-scores">
                      <Score label="נאמנות" value={activeVersion.score_source_fidelity} />
                      <Score label="חוקי ברזל" value={activeVersion.score_iron_law} />
                      <Score label="סגנון" value={activeVersion.score_style} />
                      <Score label="פצצה" value={activeVersion.score_bombshell} />
                      <Score label="כללי" value={activeVersion.score_overall} />
                    </div>
                  )}
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
