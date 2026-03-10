import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import './Viewer.css'

export default function Viewer() {
  const [data, setData] = useState([])
  const [chapter, setChapter] = useState('all')
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [activeChNum, setActiveChNum] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: lessons, error: lErr }, { data: sources, error: sErr }] = await Promise.all([
        supabase.from('lessons').select('*').order('id'),
        supabase.from('lesson_sources').select('*').order('footnote_number'),
      ])

      if (lErr || sErr) {
        console.error('Supabase error:', lErr || sErr)
        setLoading(false)
        return
      }

      // Index sources by lesson_id
      const sourceMap = {}
      for (const s of sources || []) {
        if (!sourceMap[s.lesson_id]) sourceMap[s.lesson_id] = []
        sourceMap[s.lesson_id].push(s)
      }

      // Group lessons into chapters → sections → lessons
      const chapterMap = new Map()
      for (const l of lessons || []) {
        if (!chapterMap.has(l.chapter)) {
          chapterMap.set(l.chapter, {
            number: l.chapter,
            description: l.chapter_desc || '',
            sections: new Map(),
          })
        }
        const ch = chapterMap.get(l.chapter)
        const secKey = l.section_heading || l.section || 'כללי'
        if (!ch.sections.has(secKey)) {
          ch.sections.set(secKey, {
            heading: l.section_heading || '',
            verse: l.section || '',
            lessons: [],
          })
        }

        // Build footnotes from lesson_sources
        const lessonSources = sourceMap[l.id] || []
        const footnoteNums = [...new Set(lessonSources.map(s => s.footnote_number).filter(Boolean))]
        const footnotes = {}
        for (const s of lessonSources) {
          const num = s.footnote_number
          if (!num) continue
          if (!footnotes[num]) footnotes[num] = { raw: s.raw_text, sources: [] }
          footnotes[num].sources.push({
            sefer: s.sefer,
            location: s.location,
            quote: s.raw_text,
            language: s.language,
            is_supporting: s.source_type === 'supporting',
          })
        }

        ch.sections.get(secKey).lessons.push({
          id: l.id,
          title: l.human_title || '',
          body: l.human_body || '',
          footnote_refs: footnoteNums,
          endnote_refs: [],
          footnotes,
          endnotes_data: {},
        })
      }

      const result = [...chapterMap.values()].map(ch => ({
        ...ch,
        sections: [...ch.sections.values()],
      }))

      setData(result)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    let chapters = chapter === 'all' ? data : data.filter(c => c.number === chapter)
    if (!search) return chapters
    const q = search.toLowerCase()
    return chapters.map(ch => ({
      ...ch,
      sections: ch.sections.map(sec => ({
        ...sec,
        lessons: sec.lessons.filter(l => {
          const hay = [l.title, l.body,
            ...Object.values(l.footnotes || {}).map(f => f?.raw || ''),
            ...Object.values(l.endnotes_data || {}).map(e => e?.raw || '')
          ].join(' ').toLowerCase()
          return hay.includes(q)
        })
      })).filter(s => s.lessons.length)
    })).filter(c => c.sections.length)
  }, [data, chapter, search])

  const totalLessons = useMemo(() =>
    filtered.reduce((sum, ch) => sum + ch.sections.reduce((s2, sec) => s2 + sec.lessons.length, 0), 0),
    [filtered]
  )

  const found = useMemo(() => {
    if (!activeId) return null
    for (const ch of data) {
      if (activeChNum && ch.number !== activeChNum) continue
      for (const sec of ch.sections)
        for (const l of sec.lessons)
          if (l.id === activeId) return { ch, sec, lesson: l }
    }
    return null
  }, [data, activeId, activeChNum])

  const selectLesson = useCallback((id, chNum) => {
    setActiveId(id)
    setActiveChNum(chNum)
  }, [])

  if (loading) {
    return <div className="viewer"><div className="empty-state">טוען...</div></div>
  }

  return (
    <div className="viewer">
      <div className="v-header">
        <h1>שפע יואל</h1>
        <span className="pipe">|</span>
        <div className="search-box">
          <input
            type="text"
            placeholder="חיפוש..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="header-stats">{totalLessons} הוראות</div>
      </div>

      <div className="v-main">
        <div className="panel-list">
          <div className="panel-list-header">
            <select className="chapter-select" value={chapter} onChange={e => setChapter(e.target.value)}>
              <option value="all">כל הפרקים</option>
              {data.map(ch => (
                <option key={ch.number} value={ch.number}>פרק {ch.number} — {ch.description || ''}</option>
              ))}
            </select>
          </div>
          <div className="lesson-list">
            {filtered.map(ch => ch.sections.map(sec => (
              <div className="list-section" key={`${ch.number}-${sec.heading}`}>
                <div className="list-section-title">פרק {ch.number} · {sec.heading}</div>
                {sec.verse && <div className="list-section-verse">{sec.verse}</div>}
                {sec.lessons.map(l => (
                  <div
                    key={l.id}
                    className={`list-item ${l.id === activeId ? 'active' : ''}`}
                    onClick={() => selectLesson(l.id, ch.number)}
                  >
                    <div className="list-item-id">{l.id}</div>
                    <div className="list-item-title">{l.title}</div>
                    <div className="list-item-meta">
                      {l.footnote_refs?.length > 0 && <span className="list-badge fn">{l.footnote_refs.length} הערות</span>}
                      {l.endnote_refs?.length > 0 && <span className="list-badge en">{l.endnote_refs.length} הערות סוף</span>}
                    </div>
                  </div>
                ))}
              </div>
            )))}
          </div>
        </div>

        <div className="panel-detail">
          {!found ? (
            <div className="empty-state">← בחר הוראה מהרשימה</div>
          ) : (
            <LessonDetail {...found} />
          )}
        </div>
      </div>
    </div>
  )
}

function LessonDetail({ ch, sec, lesson }) {
  const highlightSource = (elId) => {
    const el = document.getElementById(elId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('highlight')
    setTimeout(() => el.classList.remove('highlight'), 2000)
  }

  return (
    <>
      <div className="detail-chapter-badge">פרק {ch.number} — {ch.description}</div>
      <div className="detail-section-name">{sec.heading}{sec.verse ? ` / ${sec.verse}` : ''}</div>
      <div className="detail-title">{lesson.title}</div>
      <div className="detail-body">
        {lesson.body}
        <div style={{ marginTop: 14 }}>
          {(lesson.footnote_refs || []).map(fid => (
            <span key={`fn-${fid}`} className="ref-marker" onClick={() => highlightSource(`fn-${fid}`)}>{fid}</span>
          ))}
          {(lesson.endnote_refs || []).map(eid => (
            <span key={`en-${eid}`} className="ref-marker endnote" onClick={() => highlightSource(`en-${eid}`)}>ה{eid}</span>
          ))}
        </div>
      </div>

      <div className="sources-header">מקורות ({(lesson.footnote_refs?.length || 0) + (lesson.endnote_refs?.length || 0)})</div>

      {(lesson.footnote_refs || []).map(fnId => {
        const fn = lesson.footnotes?.[String(fnId)]
        if (!fn) return <SourceCard key={fnId} id={`fn-${fnId}`} fnId={fnId} />
        const sources = fn.sources || []
        if (sources.length === 0) {
          return (
            <div className="source-card" id={`fn-${fnId}`} key={fnId}>
              <div className="source-card-header"><span className="source-num">{fnId}</span><span className="source-sefer">(מקור)</span></div>
              <div className="source-quote">{fn.raw}</div>
            </div>
          )
        }
        return sources.map((src, i) => (
          <SourceCard key={`${fnId}-${i}`} id={i === 0 ? `fn-${fnId}` : undefined} fnId={fnId} src={src} isSupporting={src.is_supporting} hideNum={i > 0} />
        ))
      })}

      {(lesson.endnote_refs || []).map(enId => {
        const en = lesson.endnotes_data?.[String(enId)]
        if (!en) return null
        return (
          <div className="source-card endnote-card" id={`en-${enId}`} key={enId}>
            <div className="source-card-header">
              <span className="source-num">ה{enId}</span>
              <span className="endnote-label">הערת סוף</span>
            </div>
            <div className="source-quote">{en.raw}</div>
          </div>
        )
      })}
    </>
  )
}

function SourceCard({ id, fnId, src, isSupporting, hideNum }) {
  if (!src) {
    return (
      <div className="source-card" id={id}>
        <div className="source-card-header"><span className="source-num">{fnId}</span><span className="source-sefer">(לא נמצא)</span></div>
      </div>
    )
  }
  const langClass = src.language === 'yiddish' ? 'yiddish' : 'hebrew'
  const langLabel = src.language === 'yiddish' ? 'אידיש' : 'עברית'

  return (
    <div className={`source-card ${isSupporting ? 'supporting' : ''}`} id={id}>
      <div className="source-card-header">
        {!hideNum ? <span className="source-num">{fnId}</span> : <span style={{ width: 30 }} />}
        {isSupporting && <span className="source-at-label">@ מקור תומך</span>}
        <span className="source-sefer">{src.sefer || '—'}</span>
        {src.location && <span className="source-location">({src.location})</span>}
        <span className={`source-lang-tag ${langClass}`}>{langLabel}</span>
      </div>
      {src.quote && <div className="source-quote">{src.quote}</div>}
    </div>
  )
}
