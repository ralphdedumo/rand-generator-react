import { useState, useEffect, useRef } from 'react'
import './App.css'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'

let defaultQuestionPool = [
  { q: 'How much of the Earth is covered in water?', a: '71%' },
  { q: 'What gas do animals need to breathe to survive?', a: 'Oxygen' },
  { q: 'What is the largest star in our solar system?', a: 'The sun' },
  { q: 'What kind of blood cells fight infections?', a: 'White blood cells' },
  { q: 'How many states of matter are there?', a: 'Three' },
  { q: 'What planet is known as the “Red Planet”?', a: 'Mars' },
  { q: 'How many bones are in the human body?', a: '206' },
  { q: 'What gas do plants absorb from the atmosphere?', a: 'Carbon Dioxide' },
  { q: 'What is the largest organ in the human body?', a: 'The skin' },
  { q: 'Name the powerhouse of the cell.', a: 'The mitochondria' }
]

function shuffle(array) {
  const copy = [...array]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }
  return copy
}

function groupBySize(names, size) {
  if (size <= 0) return []
  const shuffled = shuffle(names)
  const groups = []
  for (let i = 0; i < shuffled.length; i += size) {
    groups.push(shuffled.slice(i, i + size))
  }
  return groups
}

function App() {
  const [names, setNames] = useState([])
  const [nameInput, setNameInput] = useState('')
  const [groupSize, setGroupSize] = useState(2)
  const [groups, setGroups] = useState([])
  const [groupQuestions, setGroupQuestions] = useState([]) // Array<[{q,a}]>
  const [questionPool, setQuestionPool] = useState(defaultQuestionPool)
  const [activeGroup, setActiveGroup] = useState(null) // number | null
  const [answers, setAnswers] = useState({}) // { [groupIndex]: string[] }
  const [submitted, setSubmitted] = useState({}) // { [groupIndex]: boolean }
  const [scores, setScores] = useState({}) // { [groupIndex]: number }
  const [timeLeft, setTimeLeft] = useState(60) // seconds for active group view
  const [timeLeftByGroup, setTimeLeftByGroup] = useState({}) // { [groupIndex]: seconds }
  const [theme, setTheme] = useState('dark') // 'dark' | 'light'
  const [showChart, setShowChart] = useState(false)
  const [chartData, setChartData] = useState([]) // [{ label, value, color }]
  const fileInputRef = useRef(null)
  const [showUploadHelp, setShowUploadHelp] = useState(false)
 
  function clearAll() {
    setNames([])
    setGroups([])
    setGroupQuestions([])
    setQuestionPool(defaultQuestionPool)
    setActiveGroup(null)
    setAnswers({})
    setSubmitted({})
    setScores({})
    setTimeLeft(60)
    setTimeLeftByGroup({})
    setShowChart(false)
    setChartData([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }


  function addName() {
    const trimmed = nameInput.trim()
    if (!trimmed) return
    if (names.includes(trimmed)) return
    setNames([...names, trimmed])
    setNameInput('')
  }

  function removeName(target) {
    setNames(names.filter(n => n !== target))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') addName()
  }

  function handleGroup() {
    const validSize = Math.max(1, Math.min(groupSize, names.length || 1))
    const newGroups = groupBySize(names, validSize)
    setGroups(newGroups)
    // assign 5 random questions per group
    const assigned = newGroups.map(() => shuffle(questionPool).slice(0, 5))
    setGroupQuestions(assigned)
    setActiveGroup(null)
    setSubmitted({})
    setScores({})
    setAnswers({})
    setTimeLeftByGroup({})
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.toLowerCase().split('.').pop()
    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
        // Expect two columns: Question | Answer
        const parsed = rows
          .filter(row => row && row.length >= 2)
          .map(row => ({ q: String(row[0] || '').trim(), a: String(row[1] || '').trim() }))
          .filter(x => x.q && x.a)
        if (parsed.length) setQuestionPool(parsed)
      } else if (ext === 'docx') {
        const buf = await file.arrayBuffer()
        const { value } = await mammoth.extractRawText({ arrayBuffer: buf })
        // parse lines expecting: Q: ... newline A: ...
        const lines = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        const parsed = []
        for (let i = 0; i < lines.length; i++) {
          const qMatch = lines[i].match(/^Q\s*[:\-]?\s*(.+)$/i) || lines[i].match(/^Question\s*[:\-]?\s*(.+)$/i)
          if (qMatch) {
            const next = lines[i + 1] || ''
            const aMatch = next.match(/^A\s*[:\-]?\s*(.+)$/i) || next.match(/^Answer\s*[:\-]?\s*(.+)$/i)
            if (aMatch) {
              parsed.push({ q: qMatch[1].trim(), a: aMatch[1].trim() })
              i++
            }
          }
        }
        if (parsed.length) setQuestionPool(parsed)
      } else if (ext === 'txt') {
        const text = await file.text()
        // format: each Q/A pair separated by blank line or lines: Q:..., A:...
        const blocks = text.split(/\n\s*\n/)
        const parsed = []
        blocks.forEach(block => {
          const q = (block.match(/^(?:Q|Question)\s*[:\-]?\s*(.+)$/im) || [])[1]
          const a = (block.match(/^(?:A|Answer)\s*[:\-]?\s*(.+)$/im) || [])[1]
          if (q && a) parsed.push({ q: q.trim(), a: a.trim() })
        })
        if (!parsed.length) {
          // fallback: split each line on the FIRST tab or comma only
          const lines = text.split(/\r?\n/)
          lines.forEach(line => {
            const match = line.match(/^(.*?)\s*(?:\t|,)\s*(.+)$/)
            if (match) {
              const q = match[1].trim()
              const a = match[2].trim()
              if (q && a) parsed.push({ q, a })
            }
          })
        }
        if (parsed.length) setQuestionPool(parsed)
      }
    } catch (err) {
      console.error('Failed to parse file', err)
    }
  }

  function openQuestionnaire(index) {
    if (submitted[index]) return
    const existing = (timeLeftByGroup[index] === undefined) ? 60 : timeLeftByGroup[index]
    setTimeLeft(existing)
    setActiveGroup(index)
  }

  function submitGroup(groupIndex) {
    const qs = groupQuestions[groupIndex] || []
    const ans = answers[groupIndex] || []
    let score = 0
    qs.forEach((q, i) => {
      if (isAnswerCorrect(ans[i] || '', q.a)) score += 1
    })
    setScores(prev => ({ ...prev, [groupIndex]: score }))
    setSubmitted(prev => ({ ...prev, [groupIndex]: true }))
  }

  // countdown timer for active group
  useEffect(() => {
    if (activeGroup === null) return
    if (submitted[activeGroup]) return
    if (timeLeft <= 0) {
      // time's up: mark as done/disabled
      setSubmitted(prev => ({ ...prev, [activeGroup]: true }))
      setTimeLeftByGroup(prev => ({ ...prev, [activeGroup]: 0 }))
      return
    }
    const id = setInterval(() => {
      setTimeLeft(t => {
        const next = t - 1
        setTimeLeftByGroup(prev => ({ ...prev, [activeGroup]: next }))
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [activeGroup, timeLeft, submitted])

  // apply theme like Tailwind: toggle `dark`/`light` on html element and persist
  useEffect(() => {
    const root = document.documentElement
    const dark = theme === 'dark'
    root.classList.toggle('dark', dark)
    root.classList.toggle('light', !dark)
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])

  // On mount, initialize theme from localStorage or system preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme')
      if (saved === 'dark' || saved === 'light') {
        setTheme(saved)
        return
      }
    } catch {}
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(prefersDark ? 'dark' : 'light')
  }, [])

  function computeQuestionCorrectCounts() {
    const counts = new Map()
    groupQuestions.forEach((qs, gi) => {
      if (!submitted[gi]) return
      const ans = answers[gi] || []
      qs.forEach((qObj, qi) => {
        const user = ans[qi] || ''
        const correct = isAnswerCorrect(user, qObj.a)
        if (correct) {
          counts.set(qObj.q, (counts.get(qObj.q) || 0) + 1)
        } else {
          counts.set(qObj.q, counts.get(qObj.q) || 0)
        }
      })
    })

    // map to array and sort by most correct
    const colorPalette = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#eab308', '#10b981', '#a855f7', '#f43f5e']
    const data = Array.from(counts.entries())
      .map(([label, value], idx) => ({ label, value, color: colorPalette[idx % colorPalette.length] }))
      .sort((a, b) => b.value - a.value)
    return data
  }

  function handleShowChart() {
    const data = computeQuestionCorrectCounts()
    setChartData(data)
    setShowChart(true)
  }

  function PieChart({ data, size = 260, innerRadius = 0 }) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1
    const center = size / 2
    let cumulative = 0
    const toXY = (angle) => {
      const rad = (angle - 90) * Math.PI / 180
      return [center + center * Math.cos(rad), center + center * Math.sin(rad)]
    }
    const arcs = data.map((d, i) => {
      const startAngle = (cumulative / total) * 360
      cumulative += d.value
      const endAngle = (cumulative / total) * 360
      const [x1, y1] = toXY(endAngle)
      const [x0, y0] = toXY(startAngle)
      const largeArc = endAngle - startAngle > 180 ? 1 : 0
      const path = `M ${center} ${center} L ${x0} ${y0} A ${center} ${center} 0 ${largeArc} 1 ${x1} ${y1} Z`
      return (
        <path key={i} d={path} fill={d.color} />
      )
    })
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>{arcs}</svg>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 20}}>
      <h1>Group Generator</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, marginTop: 15 }}>
        <input
          placeholder="Enter a name"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ border: '2.5px solid #ddd',borderRadius: 8, flex: 1, padding: 8 }}
        />
        <button class = "btn addButton" onClick={addName}>Add</button>
        <button class = "clearButton" onClick={clearAll}>Clear All</button>
      </div>

      {names.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Names ({names.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {names.map(n => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 8 }}>
                <span>{n}</span>
                <button class="removeButton"onClick={() => removeName(n)} aria-label={`remove ${n}`}>X</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'nowrap' }}>
        <label style={{border: '2.5px solid #ddd', borderRadius: 8}}>People per group:</label>
        <input
          type="number"
          min={1}
          value={groupSize}
          onChange={e => setGroupSize(Number(e.target.value))}
          style={{ width: 100, padding: 8, border: '2.5px solid #ddd', borderRadius: 8 }}
        />
        <button class = "generateButton" onClick={handleGroup} disabled={names.length === 0} >Generate Groups</button>
        <button class="showPie" onClick={handleShowChart} disabled={groups.length === 0}>Show Pie Chart</button>
        <button class = "themeButton" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <span
            onClick={() => setShowUploadHelp(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowUploadHelp(true) }}
            aria-label="Show formatting help for uploads"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: '1px solid #888',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              userSelect: 'none',
              color: '#555'
            }}
          >
            ?
          </span>
        <label for="fileUpload">
          <span style={{ marginRight: 8}}>Upload Q&A (.xlsx, .docx, .txt):</span>
          </label>
          <input type="file" accept=".xlsx,.xls,.docx,.txt" id="fileUpload"
          onChange={handleFileUpload} ref={fileInputRef} />
      
      </div>

      {showUploadHelp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-help-title"
          onClick={() => setShowUploadHelp(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              color: '#111',
              borderRadius: 10,
              maxWidth: 560,
              width: '92%',
              padding: 16,
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}
          >
            <div id="upload-help-title" style={{ fontWeight: 800, marginBottom: 8 }}>How to format your questions</div>
            <div style={{ lineHeight: 1.5 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>Excel:</strong> First sheet, two columns → <em>Question</em> | <em>Answer</em>.
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Word / TXT File:</strong> Line with <em>Q: ...</em> followed by next line <em>A: ...</em>.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button class="closeHelp" onClick={() => setShowUploadHelp(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {activeGroup === null && groups.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {groups.map((g, i) => (
            <div key={i} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Group {i + 1} ({g.length})</div>
              {g.length === 0 ? (
                <div style={{ color: '#666' }}>No members</div>
              ) : (
                <ul style={{ paddingLeft: 16, margin: 0 }}>
                  {g.map(member => (
                    <li key={member}>{member}</li>
                  ))}
                </ul>
              )}
              {!submitted[i] ? (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <button class="openQuestions" onClick={() => openQuestionnaire(i)}>Open Questionnaire</button>
                </div>
              ) : (
                <div style={{ marginTop: 10, width: '100%', textAlign: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#22c55e' }}>Done</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeGroup === null && showChart && chartData.length > 0 && (
        <div style={{ marginTop: 20, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>Questions by Correct Answers</div>
            <button class="closePie"onClick={() => setShowChart(false)}>Close</button>
          </div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            <PieChart data={chartData} />
            <div style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
              {chartData.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, background: d.color, borderRadius: 2 }} />
                  <span style={{ fontWeight: 600 }}>{d.value}</span>
                  <span>- {d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeGroup !== null && groupQuestions[activeGroup] && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>Group {activeGroup + 1} Questionnaire</div>
            <button class="backGroup" onClick={() => setActiveGroup(null)}>Back to Groups</button>
          </div>
          {submitted[activeGroup] && (
            <div style={{ textAlign: 'center', fontWeight: 700, color: '#22c55e', marginBottom: 10 }}>Done</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div class="timeLeft"style={{ fontWeight: 'bold' }}>Time left: {timeLeft}s</div>
            {submitted[activeGroup] !== undefined && (
              <div style={{ fontWeight: 700, border: '1px solid #ccc', borderRadius: 8, padding: 6 }}>
                Score: {scores[activeGroup] || 0}/5
              </div>
            )}
          </div>
          <div class="Members"style={{ marginBottom: 10, fontWeight: 'bold', border: '1px solid #ccc', borderRadius: 8}}>Members: {groups[activeGroup].join(', ')}</div>
          <ol style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 12 }}>
            {groupQuestions[activeGroup].map((item, idx) => {
              const isSubmitted = !!submitted[activeGroup]
              const currentAnswer = (answers[activeGroup]?.[idx]) || ''
              const correct = isSubmitted ? isAnswerCorrect(currentAnswer, item.a) : null
              return (
                <li key={idx}>
                  <div style={{ marginBottom: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{item.q}</div>
                  <input
                    placeholder="Your answer"
                    value={currentAnswer}
                    onChange={e => {
                      if (isSubmitted) return
                      setAnswers(prev => {
                        const existing = prev[activeGroup] || Array(groupQuestions[activeGroup].length).fill('')
                        const copy = [...existing]
                        copy[idx] = e.target.value
                        return { ...prev, [activeGroup]: copy }
                      })
                    }}
                    style={{ border: '2.5px solid #ddd', borderRadius: 8, width: '100%', padding: 8, borderColor: isSubmitted ? (correct ? '#22c55e' : '#ef4444') : undefined }}
                    disabled={isSubmitted}
                  />
                  {isSubmitted && (
                    <div style={{ marginTop: 6, fontSize: 14, color: correct ? '#22c55e' : '#ef4444' }}>
                      {correct ? 'Correct' : `Correct answer: ${item.a}`}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 16 }}>
            {!submitted[activeGroup] && (
              <button class="submitAnswer" onClick={() => submitGroup(activeGroup)}>
                Submit Answers
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function isAnswerCorrect(userAnswer, correctAnswer) {
  if (typeof userAnswer !== 'string' || typeof correctAnswer !== 'string') return false
  const normalize = s => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const stripNonAlnum = s => s.replace(/[^a-z0-9]+/g, '')

  // Replace common number words with digits to allow matches like "3" vs "three"
  const replaceNumberWordsWithDigits = (s) => {
    const map = {
      'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
      'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
      'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14', 'fifteen': '15',
      'sixteen': '16', 'seventeen': '17', 'eighteen': '18', 'nineteen': '19', 'twenty': '20'
    }
    return s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g, (m) => map[m])
  }

  const user = normalize(userAnswer)
  const correct = normalize(correctAnswer)
  if (!user) return false

  const userNoSpace = stripNonAlnum(user)
  const correctNoSpace = stripNonAlnum(correct)

  const userDigits = replaceNumberWordsWithDigits(user)
  const correctDigits = replaceNumberWordsWithDigits(correct)
  const userDigitsNoSpace = stripNonAlnum(userDigits)
  const correctDigitsNoSpace = stripNonAlnum(correctDigits)

  const contains = (a, b) => a.includes(b) || b.includes(a)

  return (
    contains(correct, user) ||
    contains(correctNoSpace, userNoSpace) ||
    contains(correctDigits, userDigits) ||
    contains(correctDigitsNoSpace, userDigitsNoSpace)
  )
}

// submitGroupFactory removed; inline submitGroup is used instead

export default App
