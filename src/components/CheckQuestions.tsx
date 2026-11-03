import { useRef, useState, type FormEvent } from 'react'
import { burstFrom } from '../lib/confetti'
import { cheerFor, nudgeFor } from '../lib/fun'
import { errorMessage, supabase } from '../lib/supabase'
import { choicesOf, type Question } from '../lib/types'
import { Tick } from './Notebook'

interface Feedback {
  correct: boolean
  explanation: string
}

const LETTERS = 'ABCDEFGH'

/** End-of-lesson practice questions, styled as an answer sheet. Not graded; retry as often as you like. */
export function CheckQuestions({ questions }: { questions: Question[] }) {
  const [solved, setSolved] = useState<Set<string>>(new Set())
  if (questions.length === 0) return null
  const allSolved = questions.every((q) => solved.has(q.id))
  return (
    <section className="sheet" aria-labelledby="check-h">
      <h2 id="check-h" className="rulehead">
        Check yourself <span className="rulehead__aside">practice, not a grade</span>
      </h2>
      {questions.map((q, i) => (
        <QuestionItem
          key={q.id}
          q={q}
          n={i + 1}
          onCorrect={() => setSolved((s) => (s.has(q.id) ? s : new Set(s).add(q.id)))}
        />
      ))}
      {allSolved && (
        <p className="sheet__done" role="status">
          All {questions.length} right. You’re ready to talk about this in class.
        </p>
      )}
    </section>
  )
}

function QuestionItem({ q, n, onCorrect }: { q: Question; n: number; onCorrect: () => void }) {
  const choices = choicesOf(q)
  const [choice, setChoice] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const name = `q-${q.id}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (choice === null) return setError('Pick an answer first.')
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('submit_answer', { p_question_id: q.id, p_choice: choice })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    const row = data?.[0]
    if (!row) return
    setFeedback({ correct: row.is_correct, explanation: row.explanation })
    if (row.is_correct) {
      burstFrom(buttonRef.current, { count: 36, power: 7 })
      onCorrect()
    } else setShake((k) => k + 1)
  }

  const right = feedback?.correct === true
  const wrong = feedback?.correct === false
  // Alternating between two shake classes restarts the animation on every wrong answer.
  const cls = ['q', right && 'q--right', wrong && 'q--wrong', shake > 0 && `q--shake${shake % 2}`].filter(Boolean).join(' ')

  return (
    <form className={cls} onSubmit={submit}>
      <fieldset>
        <legend className="q__prompt">
          <span className="q__n">{n}</span>
          <span>{q.prompt}</span>
          {right && <Tick className="q__tick" />}
        </legend>
        <div className="q__choices">
          {choices.map((c, i) => (
            <label key={i} className="bubble">
              <input
                type="radio"
                name={name}
                value={i}
                checked={choice === i}
                onChange={() => {
                  setChoice(i)
                  setFeedback(null)
                }}
              />
              <span className="bubble__letter" aria-hidden="true">
                {LETTERS[i] ?? i + 1}
              </span>
              <span className="bubble__text">{c}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="q__actions">
        <button ref={buttonRef} className="btn btn--small" disabled={busy}>
          {wrong ? 'Check again' : 'Check'}
        </button>
        <div aria-live="polite" className="q__feedback">
          {feedback && (
            <p className={right ? 'verdict verdict--right' : 'verdict verdict--wrong'}>
              <strong className="verdict__word">
                {right ? cheerFor(q.id + choice) : `${nudgeFor(q.id + choice)} Try another answer.`}
              </strong>{' '}
              <span className="verdict__why">{feedback.explanation}</span>
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </form>
  )
}
