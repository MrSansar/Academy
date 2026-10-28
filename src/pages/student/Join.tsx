import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ErrorNote, Field } from '../../components/ui'
import { errorMessage, supabase } from '../../lib/supabase'

export function JoinForm({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('join_class', { p_code: code })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else {
      setCode('')
      onJoined()
    }
  }

  return (
    <form onSubmit={submit} className="inline-form">
      <Field
        label="Class join code"
        required
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="ABCD-2345"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <button className="btn" disabled={busy}>
        {busy ? 'Joining…' : 'Join class'}
      </button>
      <ErrorNote>{error}</ErrorNote>
    </form>
  )
}

export function Join() {
  const [joined, setJoined] = useState(false)
  return (
    <div className="page narrow">
      <h1>Join a class</h1>
      <p className="muted">Use the code your teacher gave you. You can be in more than one class.</p>
      {joined ? (
        <p role="status" className="success">
          You’re in. <Link to="/">See your assignments</Link>
        </p>
      ) : (
        <JoinForm onJoined={() => setJoined(true)} />
      )}
    </div>
  )
}
