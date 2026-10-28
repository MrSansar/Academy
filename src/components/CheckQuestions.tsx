import { useState, type FormEvent } from 'react'
import { errorMessage, supabase } from '../lib/supabase'
import { choicesOf, type Question } from '../lib/types'

interface Feedback {
  correct: boolean
  explanation: string
}

/** End-of-lesson practice questions. Not graded; students can retry as often as they like. */
export function CheckQuestions({ questions }: { questions: Question[] }) {
  if (questions.length === 0) return null
  return (
    <section className="card check" aria-labelledby="check-h">
      <h2 id="check-h">Check yourself</h2>
      <p className="muted">Practice, not a grade. Try again as many times as you like.</p>
      {questions.map((q, i) => (
        <QuestionItem key={q.id} q={q} n={i + 1} />
      ))}
    </section>
  )
}

function QuestionItem({ q, n }: { q: Question; n: number }) {
  const choices = choicesOf(q)
  const [choice, setChoice] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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
    if (row) setFeedback({ correct: row.is_correct, explanation: row.explanation })
  }

  return (
    <form className="question" onSubmit={submit}>
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
        <button className="btn btn--small" disabled={busy}>
          {feedback && !feedback.correct ? 'Check again' : 'Check'}
        </button>
        <div aria-live="polite" className="question__feedback">
          {feedback && (
            <p className={feedback.correct ? 'fb fb--ok' : 'fb fb--no'}>
              <strong>{feedback.correct ? '✓ Correct.' : '✗ Not quite. Try another answer.'}</strong>{' '}
              {feedback.explanation}
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </form>
  )
}
