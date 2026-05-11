import {
  Award,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Menu,
  RotateCcw,
  Settings,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

type Theme = 'classic' | 'night' | 'paper'
type Panel = 'menu' | 'settings' | 'tutorials' | 'relax' | null
type Operation = 'addition' | 'subtraction' | 'multiplication' | 'division'
type Rod = { heaven: boolean; earth: number }
type Lesson = { id: Operation | 'intro'; title: string; steps: LessonStep[] }
type LessonStep = { title: string; body: string; target: number; highlight: number[] }
type Challenge = { prompt: string; answer: number; op: Operation }

type Preferences = {
  columns: 7 | 9
  showDigits: boolean
  highlightActive: boolean
  resetGesture: boolean
  sound: boolean
  vibrate: boolean
  anzan: boolean
  theme: Theme
}

type Progress = {
  solved: number
  badges: string[]
  byOperation: Record<Operation, number>
}

const storageKey = 'soroban-remake-v2'

const defaultPreferences: Preferences = {
  columns: 7,
  showDigits: true,
  highlightActive: true,
  resetGesture: true,
  sound: true,
  vibrate: true,
  anzan: false,
  theme: 'classic',
}

const defaultProgress: Progress = {
  solved: 0,
  badges: [],
  byOperation: { addition: 0, subtraction: 0, multiplication: 0, division: 0 },
}

const lessons: Lesson[] = [
  {
    id: 'intro',
    title: 'Basic Tutorial',
    steps: [
      { title: 'Welcome', body: 'Each rod represents one digit. Ones are on the far right; rods to the left are tens, hundreds, and so on.', target: 0, highlight: [0, 1, 2] },
      { title: 'Earth beads', body: 'The four lower beads are earth beads. Each one is worth 1 when moved toward the beam.', target: 3, highlight: [0] },
      { title: 'Heaven bead', body: 'The top bead is the heaven bead. It is worth 5 when moved down toward the beam.', target: 5, highlight: [0] },
      { title: 'Read a digit', body: 'Five plus two earth beads makes 7. Active beads are the beads touching the center beam.', target: 7, highlight: [0] },
      { title: 'Place value', body: 'This is 213: hundreds on the third rod, tens on the second, units on the rightmost rod.', target: 213, highlight: [0, 1, 2] },
    ],
  },
  {
    id: 'addition',
    title: 'Addition',
    steps: [
      { title: 'Start simple', body: 'Set 1 on the units rod. We will calculate 1 + 2.', target: 1, highlight: [0] },
      { title: 'Add two', body: 'Move two more earth beads toward the beam. The units rod now reads 3.', target: 3, highlight: [0] },
      { title: 'Use five', body: 'To add 4 to 3, think 4 = 5 - 1. Add the heaven bead, then clear one earth bead.', target: 7, highlight: [0] },
      { title: 'Carry ten', body: 'To add 6 to 7, make 13: clear the units adjustment and add 1 to the tens rod.', target: 13, highlight: [0, 1] },
    ],
  },
  {
    id: 'subtraction',
    title: 'Subtraction',
    steps: [
      { title: 'Set 83', body: 'Start with a two digit number. The tens rod has 8; the units rod has 3.', target: 83, highlight: [0, 1] },
      { title: 'Subtract 21', body: 'Clear one earth bead from the units rod, then clear two from the tens rod.', target: 62, highlight: [0, 1] },
      { title: 'Borrow ten', body: 'For 62 - 8, think -8 = -10 + 2. Borrow from the tens rod and add 2 units.', target: 54, highlight: [0, 1] },
    ],
  },
  {
    id: 'multiplication',
    title: 'Multiplication',
    steps: [
      { title: 'Example 673 x 4', body: 'Enter 673 on the left rods and leave output rods on the right.', target: 673000, highlight: [3, 4, 5] },
      { title: 'First partial', body: 'Multiply the hundreds digit by 4. Six times four is 24, so write 24 in the output area.', target: 673024, highlight: [0, 1, 5] },
      { title: 'Next column', body: 'Move right. Seven times four is 28. Add it one column over.', target: 673292, highlight: [0, 1, 4] },
      { title: 'Last column', body: 'Three times four is 12. Add it to finish the product: 2692.', target: 2692, highlight: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'division',
    title: 'Division',
    steps: [
      { title: 'Example 741 / 3', body: 'Enter 741 in the input columns. The quotient will be written on the right.', target: 741000, highlight: [3, 4, 5] },
      { title: 'First digit', body: '7 / 3 = 2. Write 2 in the output column and subtract 6 from the input.', target: 141200, highlight: [2, 5] },
      { title: 'Next digit', body: '14 / 3 = 4. Write 4 in the next output column and subtract 12.', target: 21240, highlight: [1, 4] },
      { title: 'Final digit', body: '21 / 3 = 7. Write 7 in the output column. The quotient is 247.', target: 247, highlight: [0, 1, 2] },
    ],
  },
]

function emptyRods(columns: number): Rod[] {
  return Array.from({ length: columns }, () => ({ heaven: false, earth: 0 }))
}

function digitOf(rod: Rod) {
  return (rod.heaven ? 5 : 0) + rod.earth
}

function valueOf(rods: Rod[]) {
  return rods.reduce((sum, rod, index) => sum + digitOf(rod) * 10 ** index, 0)
}

function rodsFromNumber(value: number, columns: number) {
  return String(Math.max(0, Math.floor(value)))
    .padStart(columns, '0')
    .slice(-columns)
    .split('')
    .reverse()
    .map((digit) => {
      const parsed = Number(digit)
      return { heaven: parsed >= 5, earth: parsed % 5 }
    })
}

function readState() {
  if (typeof window === 'undefined') return { preferences: defaultPreferences, progress: defaultProgress }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as Partial<{ preferences: Preferences; progress: Progress }>
    return {
      preferences: { ...defaultPreferences, ...parsed.preferences },
      progress: { ...defaultProgress, ...parsed.progress, byOperation: { ...defaultProgress.byOperation, ...parsed.progress?.byOperation } },
    }
  } catch {
    return { preferences: defaultPreferences, progress: defaultProgress }
  }
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function makeChallenge(op: Operation, columns: number): Challenge {
  const cap = Math.min(999, 10 ** Math.min(columns - 1, 3) - 1)
  if (op === 'addition') {
    const left = randomInt(5, cap)
    const right = randomInt(2, Math.min(99, cap))
    return { prompt: `${left} + ${right}`, answer: left + right, op }
  }
  if (op === 'subtraction') {
    const left = randomInt(20, cap)
    const right = randomInt(1, left)
    return { prompt: `${left} - ${right}`, answer: left - right, op }
  }
  if (op === 'multiplication') {
    const left = randomInt(2, Math.min(99, cap))
    const right = randomInt(2, 9)
    return { prompt: `${left} x ${right}`, answer: left * right, op }
  }
  const divisor = randomInt(2, 9)
  const answer = randomInt(2, Math.min(99, cap))
  return { prompt: `${answer * divisor} / ${divisor}`, answer, op }
}

function playClick(preferences: Preferences) {
  if (preferences.vibrate && 'vibrate' in navigator) navigator.vibrate(8)
  if (!preferences.sound) return
  const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return
  const audio = new Context()
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.frequency.value = 360
  gain.gain.setValueAtTime(0.045, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.035)
  osc.connect(gain).connect(audio.destination)
  osc.start()
  osc.stop(audio.currentTime + 0.04)
}

function App() {
  const [initial] = useState(readState)
  const [preferences, setPreferences] = useState<Preferences>(initial.preferences)
  const [progress, setProgress] = useState<Progress>(initial.progress)
  const [rods, setRods] = useState(() => emptyRods(initial.preferences.columns))
  const [panel, setPanel] = useState<Panel>(null)
  const [lessonId, setLessonId] = useState<Lesson['id']>('intro')
  const [stepIndex, setStepIndex] = useState(0)
  const [challengeOp, setChallengeOp] = useState<Operation>('addition')
  const [challenge, setChallenge] = useState(() => makeChallenge('addition', initial.preferences.columns))
  const [flash, setFlash] = useState<'correct' | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const acceptedChallenge = useRef<string | null>(null)

  const value = valueOf(rods)
  const activeLesson = lessons.find((lesson) => lesson.id === lessonId) ?? lessons[0]
  const activeStep = activeLesson.steps[stepIndex]

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ preferences, progress }))
  }, [preferences, progress])

  const acceptChallenge = useCallback(() => {
    const challengeKey = `${challenge.prompt}-${challenge.answer}`
    if (acceptedChallenge.current === challengeKey) return
    acceptedChallenge.current = challengeKey
    setFlash('correct')
    setProgress((current) => {
      const solved = current.solved + 1
      const badges = new Set(current.badges)
      if (solved >= 1) badges.add('First bead')
      if (solved >= 10) badges.add('Ten calm solves')
      if (solved >= 25) badges.add('Soroban regular')
      return {
        solved,
        badges: [...badges],
        byOperation: {
          ...current.byOperation,
          [challenge.op]: current.byOperation[challenge.op] + 1,
        },
      }
    })
    window.setTimeout(() => {
      setFlash(null)
      setRods(emptyRods(preferences.columns))
      const nextChallenge = makeChallenge(challengeOp, preferences.columns)
      acceptedChallenge.current = null
      setChallenge(nextChallenge)
    }, 500)
  }, [challenge.answer, challenge.op, challenge.prompt, challengeOp, preferences.columns])

  const reset = useCallback(() => {
    setRods(emptyRods(preferences.columns))
    playClick(preferences)
  }, [preferences])

  const updatePreferences = <Key extends keyof Preferences>(key: Key, next: Preferences[Key]) => {
    setPreferences((current) => {
      const updated = { ...current, [key]: next }
      if (key === 'columns') {
        setRods((currentRods) => {
          const resized = emptyRods(Number(next))
          currentRods.slice(0, Number(next)).forEach((rod, index) => {
            resized[index] = rod
          })
          return resized
        })
      }
      return updated
    })
  }

  const setRod = (index: number, patch: Partial<Rod>) => {
    const nextRods = rods.map((rod, rodIndex) => (rodIndex === index ? { ...rod, ...patch } : rod))
    setRods(nextRods)
    playClick(preferences)
    if (panel === 'relax' && valueOf(nextRods) === challenge.answer) acceptChallenge()
  }

  const showLessonStep = (lesson: Lesson, step: number) => {
    setLessonId(lesson.id)
    setStepIndex(step)
    setRods(rodsFromNumber(lesson.steps[step].target, preferences.columns))
    setPanel('tutorials')
  }

  const nextStep = (direction: 1 | -1) => {
    const next = Math.max(0, Math.min(activeLesson.steps.length - 1, stepIndex + direction))
    showLessonStep(activeLesson, next)
  }

  const startRelax = (op: Operation) => {
    setChallengeOp(op)
    setChallenge(makeChallenge(op, preferences.columns))
    acceptedChallenge.current = null
    setRods(emptyRods(preferences.columns))
    setPanel('relax')
  }

  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (!preferences.resetGesture || !touchStart.current) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - touchStart.current.x
    const dy = Math.abs(touch.clientY - touchStart.current.y)
    if (dx > 90 && dy < 45) reset()
    touchStart.current = null
  }

  return (
    <main className={clsx('app', `theme-${preferences.theme}`, preferences.anzan && 'anzan')} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <header className="top-app-bar">
        <button aria-label="Menu" onClick={() => setPanel('menu')}><Menu size={23} /></button>
        <div>
          <strong>Simple Soroban</strong>
          <span>{preferences.columns}-column soroban</span>
        </div>
        <output>{value.toLocaleString()}</output>
        <button aria-label="Reset" onClick={reset}><RotateCcw size={22} /></button>
      </header>

      <SorobanBoard rods={rods} preferences={preferences} highlight={panel === 'tutorials' ? activeStep.highlight : []} flash={flash} onSetRod={setRod} />

      <footer className="bottom-actions">
        <button onClick={() => setPanel('tutorials')}><BookOpen size={20} /> Tutorial</button>
        <button onClick={() => setPanel('relax')}><Award size={20} /> Relax</button>
        <button onClick={() => setPanel('settings')}><Settings size={20} /> Settings</button>
      </footer>

      <AnimatePresence>
        {panel && (
          <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
              <button className="close" aria-label="Close" onClick={() => setPanel(null)}><X size={22} /></button>
              {panel === 'menu' && <MenuPanel onOpen={setPanel} onReset={reset} progress={progress} />}
              {panel === 'settings' && <SettingsPanel preferences={preferences} onChange={updatePreferences} />}
              {panel === 'tutorials' && (
                <TutorialPanel
                  lessons={lessons}
                  activeLesson={activeLesson}
                  activeStep={activeStep}
                  stepIndex={stepIndex}
                  onSelect={(lesson) => showLessonStep(lesson, 0)}
                  onStep={nextStep}
                />
              )}
              {panel === 'relax' && <RelaxPanel challenge={challenge} progress={progress} onStart={startRelax} onNext={() => setChallenge(makeChallenge(challengeOp, preferences.columns))} />}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}

function SorobanBoard({
  rods,
  preferences,
  highlight,
  flash,
  onSetRod,
}: {
  rods: Rod[]
  preferences: Preferences
  highlight: number[]
  flash: 'correct' | null
  onSetRod: (index: number, patch: Partial<Rod>) => void
}) {
  return (
    <section className={clsx('soroban', flash)} aria-label="Interactive soroban">
      <div className="soroban-frame">
        <div className="beam" />
        <div className="place-dots">
          {rods.map((_, index) => index % 3 === 0 && <i key={index} style={{ right: `${((index + 0.5) / rods.length) * 100}%` }} />)}
        </div>
        <div className="rods" style={{ gridTemplateColumns: `repeat(${rods.length}, minmax(38px, 1fr))` }}>
          {Array.from({ length: rods.length }).map((_, index) => {
            const logicalIndex = rods.length - 1 - index
            const rod = rods[logicalIndex]
            const digit = digitOf(rod)
            const place = 10 ** logicalIndex
            return (
              <div key={logicalIndex} className={clsx('rod', highlight.includes(logicalIndex) && 'tutorial-highlight')}>
                <div className="rail" />
                <button
                  className={clsx('bead heaven', rod.heaven && 'active', preferences.highlightActive && rod.heaven && 'lit')}
                  aria-label={`Toggle five bead in ${place} column`}
                  onClick={() => onSetRod(logicalIndex, { heaven: !rod.heaven })}
                />
                <div className="earth">
                  {[4, 3, 2, 1].map((count) => (
                    <button
                      key={count}
                      className={clsx('bead', rod.earth >= count && 'active', preferences.highlightActive && rod.earth >= count && 'lit')}
                      aria-label={`Set ${count} earth beads in ${place} column`}
                      onClick={() => onSetRod(logicalIndex, { earth: rod.earth === count ? count - 1 : count })}
                    />
                  ))}
                </div>
                {preferences.showDigits && <span className="digit">{digit}</span>}
              </div>
            )
          })}
        </div>
      </div>
      {preferences.anzan && (
        <div className="anzan-label">
          <EyeOff size={18} />
          Invisible Soroban
        </div>
      )}
    </section>
  )
}

function MenuPanel({ onOpen, onReset, progress }: { onOpen: (panel: Panel) => void; onReset: () => void; progress: Progress }) {
  return (
    <>
      <h2>Simple Soroban</h2>
      <p className="muted">A clean abacus for free practice, tutorials, and no-stress challenges.</p>
      <div className="panel-grid">
        <button onClick={() => onOpen('tutorials')}><BookOpen /> Tutorial</button>
        <button onClick={() => onOpen('relax')}><Award /> Relax mode</button>
        <button onClick={() => onOpen('settings')}><Settings /> Settings</button>
        <button onClick={onReset}><RotateCcw /> Reset</button>
      </div>
      <div className="stat-card">
        <strong>{progress.solved}</strong>
        <span>relax problems solved</span>
      </div>
    </>
  )
}

function SettingsPanel({
  preferences,
  onChange,
}: {
  preferences: Preferences
  onChange: <Key extends keyof Preferences>(key: Key, next: Preferences[Key]) => void
}) {
  return (
    <>
      <h2>Settings</h2>
      <div className="setting-row">
        <span>Columns</span>
        <div className="segmented">
          <button className={clsx(preferences.columns === 7 && 'selected')} onClick={() => onChange('columns', 7)}>7</button>
          <button className={clsx(preferences.columns === 9 && 'selected')} onClick={() => onChange('columns', 9)}>9</button>
        </div>
      </div>
      <Toggle label="Show digit values" checked={preferences.showDigits} onChange={(checked) => onChange('showDigits', checked)} />
      <Toggle label="Highlight active beads" checked={preferences.highlightActive} onChange={(checked) => onChange('highlightActive', checked)} />
      <Toggle label="Enable reset gesture" checked={preferences.resetGesture} onChange={(checked) => onChange('resetGesture', checked)} />
      <Toggle label="Play sounds" checked={preferences.sound} onChange={(checked) => onChange('sound', checked)} icon={<Volume2 size={18} />} />
      <Toggle label="Vibrate" checked={preferences.vibrate} onChange={(checked) => onChange('vibrate', checked)} />
      <Toggle label="Anzan mode" checked={preferences.anzan} onChange={(checked) => onChange('anzan', checked)} icon={<EyeOff size={18} />} />
      <div className="setting-row">
        <span>Select Soroban Theme</span>
        <div className="segmented">
          {(['classic', 'night', 'paper'] as Theme[]).map((theme) => (
            <button key={theme} className={clsx(preferences.theme === theme && 'selected')} onClick={() => onChange('theme', theme)}>{theme}</button>
          ))}
        </div>
      </div>
    </>
  )
}

function TutorialPanel({
  lessons: allLessons,
  activeLesson,
  activeStep,
  stepIndex,
  onSelect,
  onStep,
}: {
  lessons: Lesson[]
  activeLesson: Lesson
  activeStep: LessonStep
  stepIndex: number
  onSelect: (lesson: Lesson) => void
  onStep: (direction: 1 | -1) => void
}) {
  return (
    <>
      <h2>Tutorial</h2>
      <div className="lesson-tabs">
        {allLessons.map((lesson) => (
          <button key={lesson.id} className={clsx(activeLesson.id === lesson.id && 'selected')} onClick={() => onSelect(lesson)}>{lesson.title}</button>
        ))}
      </div>
      <article className="tutorial-card">
        <small>{activeLesson.title} {stepIndex + 1}/{activeLesson.steps.length}</small>
        <h3>{activeStep.title}</h3>
        <p>{activeStep.body}</p>
        <div className="target-line">
          <span>Target</span>
          <strong>{activeStep.target.toLocaleString()}</strong>
        </div>
      </article>
      <div className="step-actions">
        <button disabled={stepIndex === 0} onClick={() => onStep(-1)}><ChevronLeft /> Back</button>
        <button disabled={stepIndex === activeLesson.steps.length - 1} onClick={() => onStep(1)}>Next <ChevronRight /></button>
      </div>
    </>
  )
}

function RelaxPanel({
  challenge,
  progress,
  onStart,
  onNext,
}: {
  challenge: Challenge
  progress: Progress
  onStart: (op: Operation) => void
  onNext: () => void
}) {
  return (
    <>
      <h2>Relax Mode</h2>
      <p className="muted">Solve Soroban problems with no timer and no stress. Matching the answer on the abacus advances automatically.</p>
      <div className="operation-grid">
        {(['addition', 'subtraction', 'multiplication', 'division'] as Operation[]).map((op) => (
          <button key={op} onClick={() => onStart(op)}>{op}</button>
        ))}
      </div>
      <div className="challenge-card">
        <span>Current problem</span>
        <strong>{challenge.prompt}</strong>
        <button onClick={onNext}>Skip</button>
      </div>
      <div className="badges">
        <strong>My Simple Soroban badges</strong>
        {progress.badges.length === 0 ? <span>No badges yet</span> : progress.badges.map((badge) => <em key={badge}><Sparkles size={15} /> {badge}</em>)}
      </div>
    </>
  )
}

function Toggle({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (checked: boolean) => void; icon?: React.ReactNode }) {
  return (
    <label className="toggle">
      <span>{icon}{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i><Check size={15} /></i>
    </label>
  )
}

export default App
