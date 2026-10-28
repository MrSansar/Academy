import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { AuthLayout } from '../../components/Layout'
import { ErrorNote, Field } from '../../components/ui'
import { errorMessage, siteUrl, supabase } from '../../lib/supabase'

export function SignUp() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checkEmail, setCheckEmail] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Use at least 8 characters for your password.')
    setBusy(true)
    try {
      const { data: valid, error: codeError } = await supabase.rpc('join_code_is_valid', { p_code: code })
      if (codeError) throw codeError
      if (!valid) {
        setError('That class join code was not found. Check it with your teacher.')
        return
      }
      // The join code travels as user metadata; a database trigger enrolls the new account.
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim(), join_code: code },
          emailRedirectTo: siteUrl(),
        },
      })
      if (error) throw error
      if (data.session) navigate('/', { replace: true })
      else setCheckEmail(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (checkEmail) {
    return (
      <AuthLayout title="Check your email" intro={<p>We sent a confirmation link to {email}.</p>}>
        <p>Open the link to finish creating your account, then sign in.</p>
        <p className="form__alt">
          <Link to="/signin">Back to sign in</Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      intro={<p>You need the class join code from your teacher. Only your teacher can see your progress.</p>}
    >
      <form onSubmit={submit}>
        <Field label="Your name" autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
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
        <ErrorNote>{error}</ErrorNote>
        <button className="btn btn--block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="form__alt">
        Already have an account? <Link to="/signin">Sign in</Link>, then choose “Join a class” to add another class.
      </p>
    </AuthLayout>
  )
}
