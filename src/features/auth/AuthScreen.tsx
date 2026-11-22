import { motion } from 'framer-motion'
import { ArrowRight, Lock, Mail, MonitorSmartphone } from 'lucide-react'
import { useState } from 'react'
import { Logo } from '@/app/nav'
import { Button } from '@/components/ui/Button'
import { Field, Segmented } from '@/components/ui/controls'
import { spring } from '@/components/motion'
import { APP_CONFIG } from '@/config'
import { chooseOffline, sendMagicLink, signInWithPassword, signUp } from '@/cloud/store'

type Mode = 'signin' | 'signup' | 'magic'

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    setNotice(null)
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.')
    if (mode !== 'magic' && password.length < 8)
      return setError('Use at least 8 characters for the password.')
    setBusy(true)
    try {
      if (mode === 'signin') await signInWithPassword(email, password)
      else if (mode === 'signup') {
        const r = await signUp(email, password)
        if (r === 'confirm-email')
          setNotice(`Check ${email} and click the link to confirm your account.`)
      } else {
        await sendMagicLink(email)
        setNotice(`We sent a sign-in link to ${email}. Open it on this device.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^[^:]+:\s*/, '') : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
        className="w-full max-w-sm"
      >
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <section className="glass glass-strong pad">
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Sync your MT5 trades automatically. <span className="serif text-fg">Just trade.</span>
          </p>
          <Segmented
            label="Sign-in method"
            className="mt-5 w-full"
            value={mode}
            onChange={(m) => {
              setMode(m)
              setError(null)
              setNotice(null)
            }}
            options={[
              { value: 'signin', label: 'Sign in' },
              { value: 'signup', label: 'Sign up' },
              { value: 'magic', label: 'Magic link' },
            ]}
          />
          <form
            className="mt-5 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <Field label="Email">
              {(id) => (
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                  <input
                    id={id}
                    data-autofocus
                    type="email"
                    autoComplete="email"
                    className="field pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              )}
            </Field>
            {mode !== 'magic' && (
              <Field label="Password">
                {(id) => (
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                    <input
                      id={id}
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="field pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </div>
                )}
              </Field>
            )}
            {error && (
              <p role="alert" className="text-sm text-neg">
                {error}
              </p>
            )}
            {notice && (
              <p
                role="status"
                className="rounded-[var(--radius-sm)] bg-accent/10 px-3 py-2 text-sm"
              >
                {notice}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={busy}
              className="w-full"
              icon={<ArrowRight />}
            >
              {busy
                ? 'Please wait…'
                : mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Email me a link'}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted">
            Your MT5 password is never asked for or stored. The terminal sends trades with a
            revocable sync key.
          </p>
        </section>
        <button
          type="button"
          onClick={() => chooseOffline(true)}
          className="mx-auto mt-5 flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          <MonitorSmartphone className="size-4" /> Continue on this device without an account
        </button>
        <p className="mt-6 text-center text-xs text-muted">{APP_CONFIG.disclaimer}</p>
      </motion.div>
    </main>
  )
}
