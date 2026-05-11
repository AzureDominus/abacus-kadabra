import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import clsx from 'clsx'
import {
  BookOpen,
  ChevronLeft,
  Clock3,
  Divide,
  Gauge,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  TimerReset,
  Trophy,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

type Operation = 'addition' | 'subtraction' | 'multiplication' | 'division'
type Mode = 'menu' | 'teach' | 'train'
type ChallengeKind = 'timed' | 'free' | 'guided'
type Rod = { upper: boolean; lower: number }

type Settings = {
  rods: number
  operation: Operation
  difficulty: number
  digits: number
  challenge: ChallengeKind
  timeLimit: number
  sound: boolean
}

type Problem = {
  id: string
  left: number
  right: number
  operation: Operation
  answer: number
  prompt: string
}

type Progress = {
  attempted: number
  correct: number
  streak: number
  bestStreak: number
  totalMs: number
  byOperation: Record<Operation, { attempted: number; correct: number; totalMs: number }>
  weak: Operation[]
}

type LessonStep = {
  title: string
  body: string
  target: number
  highlight: number[]
}

const operations: Record<Operation, { label: string; symbol: string }> = {
  addition: { label: 'Add', symbol: '+' },
  subtraction: { label: 'Subtract', symbol: '-' },
  multiplication: { label: 'Multiply', symbol: 'x' },
  division: { label: 'Divide', symbol: '/' },
}

const defaultSettings: Settings = {
  rods: 6,
  operation: 'addition',
  difficulty: 2,
  digits: 2,
  challenge: 'timed',
  timeLimit: 90,
  sound: true,
}

const storageKey = 'abacus-kadabra-state-v1'

const emptyProgress = (): Progress => ({
  attempted: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0,
  totalMs: 0,
  byOperation: {
    addition: { attempted: 0, correct: 0, totalMs: 0 },
    subtraction: { attempted: 0, correct: 0, totalMs: 0 },
    multiplication: { attempted: 0, correct: 0, totalMs: 0 },
    division: { attempted: 0, correct: 0, totalMs: 0 },
  },
  weak: [],
})

function createRods(count: number): Rod[] {
  return Array.from({ length: count }, () => ({ upper: false, lower: 0 }))
}

function rodDigit(rod: Rod) {
  return (rod.upper ? 5 : 0) + rod.lower
}

function rodsValue(rods: Rod[]) {
  return rods.reduce((sum, rod, index) => sum + rodDigit(rod) * 10 ** index, 0)
}

function numberToRods(value: number, count: number) {
  const digits = String(Math.max(0, Math.floor(value))).padStart(count, '0').slice(-count).split('').reverse()
  return digits.map((digit) => {
    const parsed = Number(digit)
    return { upper: parsed >= 5, lower: parsed % 5 }
  })
}

function maxForDigits(digits: number) {
  return 10 ** digits - 1
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function makeProblem(settings: Settings): Problem {
  const digits = Math.min(settings.digits, settings.rods)
  const cap = maxForDigits(digits)
  const low = Math.max(1, 10 ** Math.max(0, digits - 2))
  let left = randomInt(low, cap)
  let right = randomInt(1, Math.max(2, Math.floor(cap / (5 - settings.difficulty))))
  let answer = 0

  if (settings.operation === 'addition') {
    answer = left + right
    if (answer > maxForDigits(settings.rods)) return makeProblem({ ...settings, digits: Math.max(1, digits - 1) })
  }

  if (settings.operation === 'subtraction') {
    right = randomInt(1, left)
    answer = left - right
  }

  if (settings.operation === 'multiplication') {
    right = randomInt(2, settings.difficulty + 5)
    left = randomInt(2, Math.min(cap, settings.difficulty * 18))
    answer = left * right
    if (answer > maxForDigits(settings.rods)) return makeProblem({ ...settings, digits: Math.max(1, digits - 1) })
  }

  if (settings.operation === 'division') {
    right = randomInt(2, settings.difficulty + 5)
    answer = randomInt(1, Math.min(cap, settings.difficulty * 14))
    left = answer * right
  }

  return {
    id: `${Date.now()}-${Math.random()}`,
    left,
    right,
    operation: settings.operation,
    answer,
    prompt: `${left} ${operations[settings.operation].symbol} ${right}`,
  }
}

function lessonFor(operation: Operation): LessonStep[] {
  const lessons: Record<Operation, LessonStep[]> = {
    addition: [
      { title: 'Set the first addend', body: 'Move lower beads toward the beam to make 23. Ones live on the right rod, tens just to the left.', target: 23, highlight: [0, 1] },
      { title: 'Add the ones', body: 'Add 4 on the ones rod. When lower beads run out, trade five lower beads for the upper bead.', target: 27, highlight: [0] },
      { title: 'Read the answer', body: 'Every bead touching the beam is active. The abacus now reads 27.', target: 27, highlight: [0, 1] },
    ],
    subtraction: [
      { title: 'Start from the minuend', body: 'Set 42. The two active beads on the tens rod mean forty.', target: 42, highlight: [0, 1] },
      { title: 'Take away ones', body: 'Remove 6 by clearing one lower bead and borrowing ten from the tens rod when needed.', target: 36, highlight: [0, 1] },
      { title: 'Check the result', body: 'The rods show 36. Subtraction is clearing value while keeping place value steady.', target: 36, highlight: [0, 1] },
    ],
    multiplication: [
      { title: 'Think in partial products', body: 'For 12 x 3, begin with 12 and plan three groups.', target: 12, highlight: [0, 1] },
      { title: 'Add repeated groups', body: 'Add another 12, then another 12. The active rods track the running total.', target: 36, highlight: [0, 1] },
      { title: 'Read the product', body: 'The product is 36. Bigger products use more rods to the left.', target: 36, highlight: [0, 1, 2] },
    ],
    division: [
      { title: 'Divide as sharing', body: 'For 48 / 4, imagine sharing 48 into four equal groups.', target: 48, highlight: [0, 1] },
      { title: 'Track the quotient', body: 'Each equal group is 12, so set 12 as the quotient after the sharing is complete.', target: 12, highlight: [0, 1] },
      { title: 'Verify by multiplying', body: '12 x 4 returns 48. Division and multiplication check each other.', target: 12, highlight: [0, 1, 2] },
    ],
  }

  return lessons[operation]
}

function loadState() {
  if (typeof window === 'undefined') return { settings: defaultSettings, progress: emptyProgress() }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as Partial<{ settings: Settings; progress: Progress }>
    const base = emptyProgress()
    return {
      settings: { ...defaultSettings, ...parsed.settings },
      progress: { ...base, ...parsed.progress, byOperation: { ...base.byOperation, ...parsed.progress?.byOperation } },
    }
  } catch {
    return { settings: defaultSettings, progress: emptyProgress() }
  }
}

function clickFeedback(enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.value = 520
  gain.gain.setValueAtTime(0.05, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.045)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.05)
}

function App() {
  const [loaded] = useState(loadState)
  const [mode, setMode] = useState<Mode>('menu')
  const [settings, setSettings] = useState<Settings>(() => loaded.settings)
  const [progress, setProgress] = useState<Progress>(() => loaded.progress)
  const [rods, setRods] = useState(() => createRods(loaded.settings.rods))
  const [problem, setProblem] = useState(() => makeProblem(loaded.settings))
  const [lessonIndex, setLessonIndex] = useState(0)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [timeLeft, setTimeLeft] = useState(loaded.settings.timeLimit)
  const [flash, setFlash] = useState<'win' | 'hint' | null>(null)
  const acceptedRef = useRef(false)

  const value = rodsValue(rods)
  const lesson = lessonFor(settings.operation)
  const currentLesson = lesson[lessonIndex]

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ settings, progress }))
  }, [settings, progress])

  useEffect(() => {
    if (mode !== 'train' || settings.challenge !== 'timed') return
    const timer = window.setInterval(() => setTimeLeft((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [mode, settings.challenge])

  const nextProblem = useCallback(() => {
    acceptedRef.current = false
    setProblem(makeProblem(settings))
    setStartedAt(Date.now())
    setRods(createRods(settings.rods))
  }, [settings])

  const recordMiss = useCallback(() => {
    setProgress((current) => {
      const op = current.byOperation[problem.operation]
      const nextByOperation = {
        ...current.byOperation,
        [problem.operation]: { ...op, attempted: op.attempted + 1 },
      }
      const weak = (Object.keys(nextByOperation) as Operation[]).filter((operation) => {
        const stats = nextByOperation[operation]
        return stats.attempted >= 2 && stats.correct / stats.attempted < 0.75
      })
      return {
        ...current,
        attempted: current.attempted + 1,
        streak: 0,
        byOperation: nextByOperation,
        weak,
      }
    })
  }, [problem.operation])

  useEffect(() => {
    if (mode !== 'train' || acceptedRef.current || value !== problem.answer) return
    acceptedRef.current = true
    const elapsed = Date.now() - startedAt
    setFlash('win')
    confetti({ particleCount: 48, spread: 52, origin: { y: 0.65 }, disableForReducedMotion: true })
    setProgress((current) => {
      const op = current.byOperation[problem.operation]
      const nextByOperation = {
        ...current.byOperation,
        [problem.operation]: { attempted: op.attempted + 1, correct: op.correct + 1, totalMs: op.totalMs + elapsed },
      }
      const weak = (Object.keys(nextByOperation) as Operation[]).filter((operation) => {
        const stats = nextByOperation[operation]
        return stats.attempted >= 3 && stats.correct / stats.attempted < 0.75
      })
      return {
        ...current,
        attempted: current.attempted + 1,
        correct: current.correct + 1,
        streak: current.streak + 1,
        bestStreak: Math.max(current.bestStreak, current.streak + 1),
        totalMs: current.totalMs + elapsed,
        byOperation: nextByOperation,
        weak,
      }
    })
    window.setTimeout(() => {
      setFlash(null)
      nextProblem()
    }, 650)
  }, [mode, nextProblem, problem.answer, problem.operation, startedAt, value])

  const setModeAndReset = (nextMode: Mode) => {
    setMode(nextMode)
    setLessonIndex(0)
    setProblem(makeProblem(settings))
    setStartedAt(Date.now())
    setTimeLeft(settings.timeLimit)
    setRods(nextMode === 'teach' ? numberToRods(lessonFor(settings.operation)[0].target, settings.rods) : createRods(settings.rods))
  }

  const backToMenu = () => {
    setMode('menu')
    setRods(createRods(settings.rods))
    setFlash(null)
  }

  const updateRod = (index: number, patch: Partial<Rod>) => {
    setRods((current) => current.map((rod, rodIndex) => (rodIndex === index ? { ...rod, ...patch } : rod)))
    clickFeedback(settings.sound)
  }

  const changeSetting = <Key extends keyof Settings>(key: Key, next: Settings[Key]) => {
    setSettings((current) => {
      const updated = { ...current, [key]: next }
      if (key === 'rods') {
        updated.digits = Math.min(updated.digits, Number(next))
        setRods((currentRods) => {
          const resized = createRods(Number(next))
          currentRods.slice(0, Number(next)).forEach((rod, index) => {
            resized[index] = rod
          })
          return resized
        })
      }
      return updated
    })
  }

  const applyLessonTarget = () => {
    setRods(numberToRods(currentLesson.target, settings.rods))
    setFlash('hint')
    window.setTimeout(() => setFlash(null), 450)
  }

  return (
    <main className="shell">
      <TopBar mode={mode} value={value} progress={progress} timeLeft={timeLeft} challenge={settings.challenge} onBack={backToMenu} />
      <AnimatePresence mode="wait">
        {mode === 'menu' && (
          <motion.section className="menu" key="menu" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <div className="brand-lockup">
              <div className="mark"><Sparkles size={24} /></div>
              <div>
                <h1>Abacus Kadabra</h1>
                <p>Fast bead practice for mental math.</p>
              </div>
            </div>
            <div className="menu-grid">
              <button className="mode-tile primary" onClick={() => setModeAndReset('train')}>
                <Play size={26} />
                <span>Train</span>
                <small>{operations[settings.operation].label} / {settings.challenge}</small>
              </button>
              <button className="mode-tile" onClick={() => setModeAndReset('teach')}>
                <BookOpen size={26} />
                <span>Learn</span>
                <small>Guided {operations[settings.operation].label.toLowerCase()}</small>
              </button>
            </div>
            <SettingsPanel settings={settings} progress={progress} onChange={changeSetting} onReset={() => setProgress(emptyProgress())} />
          </motion.section>
        )}

        {mode === 'teach' && (
          <motion.section className="play-stage" key="teach" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LessonCard
              step={currentLesson}
              index={lessonIndex}
              total={lesson.length}
              operation={settings.operation}
              onTarget={applyLessonTarget}
              onNext={() => {
                const next = (lessonIndex + 1) % lesson.length
                setLessonIndex(next)
                setRods(numberToRods(lesson[next].target, settings.rods))
              }}
            />
            <AbacusBoard rods={rods} highlight={currentLesson.highlight} target={currentLesson.target} flash={flash} onChange={updateRod} />
          </motion.section>
        )}

        {mode === 'train' && (
          <motion.section className="play-stage" key="train" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ProblemCard
              problem={problem}
              settings={settings}
              value={value}
              flash={flash}
              timeLeft={timeLeft}
              onSkip={() => {
                recordMiss()
                nextProblem()
              }}
              onClear={() => setRods(createRods(settings.rods))}
            />
            <AbacusBoard
              rods={rods}
              highlight={settings.challenge === 'guided' ? numberToRods(problem.answer, settings.rods).map((rod, index) => (rodDigit(rod) ? index : -1)).filter((index) => index >= 0) : []}
              target={problem.answer}
              flash={flash}
              onChange={updateRod}
            />
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  )
}

function TopBar({
  mode,
  value,
  progress,
  timeLeft,
  challenge,
  onBack,
}: {
  mode: Mode
  value: number
  progress: Progress
  timeLeft: number
  challenge: ChallengeKind
  onBack: () => void
}) {
  return (
    <header className="topbar">
      <button className={clsx('icon-button', mode === 'menu' && 'ghosted')} onClick={onBack} aria-label="Back to menu">
        <ChevronLeft size={20} />
      </button>
      <div className="readout">
        <span className="readout-label">Value</span>
        <strong>{value.toLocaleString()}</strong>
      </div>
      <div className="top-metrics">
        {mode === 'train' && challenge === 'timed' && <Pill icon={<Clock3 size={15} />} label={`${timeLeft}s`} tone={timeLeft < 15 ? 'hot' : 'cool'} />}
        <Pill icon={<Trophy size={15} />} label={`${progress.streak} streak`} />
      </div>
    </header>
  )
}

function Pill({ icon, label, tone = 'cool' }: { icon: React.ReactNode; label: string; tone?: 'cool' | 'hot' }) {
  return <span className={clsx('pill', tone)}>{icon}{label}</span>
}

function SettingsPanel({
  settings,
  progress,
  onChange,
  onReset,
}: {
  settings: Settings
  progress: Progress
  onChange: <Key extends keyof Settings>(key: Key, next: Settings[Key]) => void
  onReset: () => void
}) {
  const avg = progress.correct ? Math.round(progress.totalMs / progress.correct / 100) / 10 : 0
  return (
    <section className="settings-panel">
      <div className="panel-heading">
        <Settings2 size={18} />
        <span>Setup</span>
      </div>
      <div className="control-row">
        {(Object.keys(operations) as Operation[]).map((operation) => (
          <button key={operation} className={clsx('seg', settings.operation === operation && 'active')} onClick={() => onChange('operation', operation)}>
            {operation === 'addition' && <Plus size={16} />}
            {operation === 'subtraction' && <Minus size={16} />}
            {operation === 'multiplication' && <X size={16} />}
            {operation === 'division' && <Divide size={16} />}
            {operations[operation].label}
          </button>
        ))}
      </div>
      <div className="compact-controls">
        <label>
          Rods
          <input type="range" min="3" max="9" value={settings.rods} onChange={(event) => onChange('rods', Number(event.target.value))} />
          <strong>{settings.rods}</strong>
        </label>
        <label>
          Digits
          <input type="range" min="1" max={Math.min(6, settings.rods)} value={settings.digits} onChange={(event) => onChange('digits', Number(event.target.value))} />
          <strong>{settings.digits}</strong>
        </label>
        <label>
          Difficulty
          <input type="range" min="1" max="4" value={settings.difficulty} onChange={(event) => onChange('difficulty', Number(event.target.value))} />
          <strong>{settings.difficulty}</strong>
        </label>
        <label>
          Limit
          <input type="range" min="30" max="180" step="15" value={settings.timeLimit} onChange={(event) => onChange('timeLimit', Number(event.target.value))} />
          <strong>{settings.timeLimit}s</strong>
        </label>
      </div>
      <div className="control-row">
        {(['timed', 'free', 'guided'] as ChallengeKind[]).map((kind) => (
          <button key={kind} className={clsx('seg', settings.challenge === kind && 'active')} onClick={() => onChange('challenge', kind)}>
            {kind === 'timed' && <TimerReset size={16} />}
            {kind === 'free' && <Gauge size={16} />}
            {kind === 'guided' && <Sparkles size={16} />}
            {kind}
          </button>
        ))}
      </div>
      <div className="progress-strip">
        <span>{progress.correct}/{progress.attempted} solved</span>
        <span>{progress.bestStreak} best</span>
        <span>{avg}s avg</span>
        {progress.weak.length > 0 && <span>drill {operations[progress.weak[0]].label.toLowerCase()}</span>}
        <button onClick={onReset}><RotateCcw size={15} /> Reset</button>
      </div>
    </section>
  )
}

function ProblemCard({
  problem,
  settings,
  value,
  flash,
  timeLeft,
  onSkip,
  onClear,
}: {
  problem: Problem
  settings: Settings
  value: number
  flash: 'win' | 'hint' | null
  timeLeft: number
  onSkip: () => void
  onClear: () => void
}) {
  const timedOut = settings.challenge === 'timed' && timeLeft === 0
  return (
    <aside className={clsx('side-card', flash === 'win' && 'success')}>
      <span className="eyebrow">{settings.challenge} {operations[problem.operation].label}</span>
      <h2>{timedOut ? 'Time' : problem.prompt}</h2>
      <div className="answer-track">
        <span>{value.toLocaleString()}</span>
        <small>{timedOut ? `answer was ${problem.answer}` : 'target locks automatically'}</small>
      </div>
      <div className="button-row">
        <button onClick={onClear}><RotateCcw size={16} /> Clear</button>
        <button onClick={onSkip}>{timedOut ? 'New round' : 'Skip'}</button>
      </div>
    </aside>
  )
}

function LessonCard({
  step,
  index,
  total,
  operation,
  onTarget,
  onNext,
}: {
  step: LessonStep
  index: number
  total: number
  operation: Operation
  onTarget: () => void
  onNext: () => void
}) {
  return (
    <aside className="side-card">
      <span className="eyebrow">{operations[operation].label} lesson {index + 1}/{total}</span>
      <h2>{step.title}</h2>
      <p>{step.body}</p>
      <div className="answer-track">
        <span>{step.target}</span>
        <small>lesson target</small>
      </div>
      <div className="button-row">
        <button onClick={onTarget}><Sparkles size={16} /> Show</button>
        <button onClick={onNext}>Next</button>
      </div>
    </aside>
  )
}

function AbacusBoard({
  rods,
  highlight,
  target,
  flash,
  onChange,
}: {
  rods: Rod[]
  highlight: number[]
  target: number
  flash: 'win' | 'hint' | null
  onChange: (index: number, patch: Partial<Rod>) => void
}) {
  return (
    <section className={clsx('abacus-frame', flash)} aria-label="Interactive soroban abacus">
      <div className="abacus-target">Target {target.toLocaleString()}</div>
      <div className="beam" />
      <div className="rods" style={{ gridTemplateColumns: `repeat(${rods.length}, minmax(42px, 1fr))` }}>
        {rods.map((rod, index) => {
          const place = 10 ** index
          return (
            <div key={index} className={clsx('rod', highlight.includes(index) && 'highlight')} style={{ '--rod-delay': `${index * 24}ms` } as React.CSSProperties}>
              <button className={clsx('bead heaven', rod.upper && 'active')} aria-label={`Toggle five bead on ${place} place`} onClick={() => onChange(index, { upper: !rod.upper })} />
              <div className="rod-line" />
              <div className="lower-stack">
                {[4, 3, 2, 1].map((count) => (
                  <button
                    key={count}
                    className={clsx('bead earth', rod.lower >= count && 'active')}
                    aria-label={`Set ${count} lower beads on ${place} place`}
                    onClick={() => onChange(index, { lower: rod.lower === count ? count - 1 : count })}
                  />
                ))}
              </div>
              <span className="place-label">{place.toLocaleString()}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default App
