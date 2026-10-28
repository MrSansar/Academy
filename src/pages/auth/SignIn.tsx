import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { AuthLayout } from '../../components/Layout'
import { ErrorNote, Field } from '../../components/ui'
import { errorMessage, supabase } from '../../lib/supabase'

export function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else navigate(from && from !== '/signin' ? from : '/', { replace: true })
  }

  return (
    <AuthLayout title="Sign in" intro={<p>Use the email and password you signed up with.</p>}>
      <form onSubmit={submit} noValidate={false}>
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorNote>{error}</ErrorNote>
        <button className="btn btn--block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="form__alt">
        New here? <Link to="/signup">Create an account with your class code</Link>
      </p>
      <p className="form__alt">
        <Link to="/reset">Forgot your password?</Link>
      </p>
    </AuthLayout>
  )
}
