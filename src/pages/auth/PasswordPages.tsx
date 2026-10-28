import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { AuthLayout } from '../../components/Layout'
import { ErrorNote, Field } from '../../components/ui'
import { errorMessage, siteUrl, supabase } from '../../lib/supabase'

export function ResetPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else setSent(true)
  }

  return (
    <AuthLayout title="Reset your password" intro={<p>We’ll email you a link to choose a new password.</p>}>
      {sent ? (
        <p role="status">If an account exists for {email}, a reset link is on its way.</p>
      ) : (
        <form onSubmit={submit}>
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorNote>{error}</ErrorNote>
          <button className="btn btn--block" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <p className="form__alt">
        <Link to="/signin">Back to sign in</Link>
      </p>
    </AuthLayout>
  )
}

/** Shown after following a reset link (Supabase fires PASSWORD_RECOVERY). */
export function SetPassword() {
  const { finishRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    finishRecovery()
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout title="Choose a new password" intro={<p>Then you’ll go straight to your assignments.</p>}>
      <form onSubmit={submit}>
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorNote>{error}</ErrorNote>
        <button className="btn btn--block" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </AuthLayout>
  )
}
