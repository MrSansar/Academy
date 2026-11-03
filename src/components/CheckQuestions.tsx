import { useRef, useState, type FormEvent } from 'react'
import { burstFrom } from '../lib/confetti'
import { cheerFor, nudgeFor } from '../lib/fun'
import { errorMessage, supabase } from '../lib/supabase'
import { choicesOf, type Question } from '../lib/types'

interface Feedback {
  correct: boolean
  explanation: string
}

/** End-of-lesson practice questions. Not graded; students can retry as often as they like. */
export function CheckQuestions({ questions }: { questions: Question[] }) {
  const [solved, setSolved] = useState<Set<string>>(new Set())
  if (questions.length === 0) return null
  const allSolved = questions.every((q) => solved.has(q.id))
  return (
    <section className="card check" aria-labelledby="check-h">
      <div className="check__head">
        <h2 id="check-h">
          <span aria-hidden="true">🧠 </span>Check yourself
        </h2>
        <p className="check__tally" aria-hidden="true">
          {questions.map((q) => (
            <span key={q.id} className={solved.has(q.id) ? 'pip pip--on' : 'pip'} />
          ))}
        </p>
      </div>
      <p className="muted">Practice, not a grade. Try again as many times as you like.</p>
      {questions.map((q, i) => (
        <QuestionItem
          key={q.id}
          q={q}
          n={i + 1}
          onCorrect={() => setSolved((s) => (s.has(q.id) ? s : new Set(s).add(q.id)))}
        />
      ))}
      {allSolved && (
        <p className="check__done" role="status">
          <span aria-hidden="true">🎉</span> You got every question. You’re ready to talk about this in class.
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
      burstFrom(buttonRef.current, { count: 40, power: 7 })
      onCorrect()
    } else setShake((n) => n + 1)
  }

  return (
    <form
      // Alternating between two shake classes restarts the animation on every wrong answer.
      className={`question${feedback?.correct ? ' question--right' : ''}${shake ? ` question--shake${shake % 2}` : ''}`}
      onSubmit={submit}
    >
      <fieldset>
        <legend>
          <span className="question__n">{n}.</span> {q.prompt}
        </legend>
        {choices.map((c, i) => (
          <label key={i} className="choice">
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
            <span>{c}</span>
          </label>
        ))}
      </fieldset>
      <div className="question__actions">
        <button ref={buttonRef} className="btn btn--small" disabled={busy}>
          {feedback && !feedback.correct ? 'Check again' : 'Check'}
        </button>
        <div aria-live="polite" className="question__feedback">
          {feedback && (
            <p className={feedback.correct ? 'fb fb--ok' : 'fb fb--no'}>
              <strong>
                {feedback.correct ? `✓ ${cheerFor(q.id + choice)}` : `✗ ${nudgeFor(q.id + choice)} Try another answer.`}
              </strong>{' '}
              {feedback.explanation}
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </form>
  )
}
