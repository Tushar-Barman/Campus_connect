import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import AuthLayout from '../components/AuthLayout.jsx';
import Button from '../components/ui/Button.jsx';
import Input, { PasswordInput } from '../components/ui/Input.jsx';
import { Alert } from '../components/ui/Feedback.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage, USE_MOCKS } from '../lib/api.js';
import { MOCK_SEED_EMAILS, MOCK_SEED_PASSWORD } from '../lib/mock/mockApi.js';
import { normaliseEmail, validateLogin } from '../lib/validation.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => {
    setForm((f) => ({ ...f, [field]: event.target.value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
    if (serverError) setServerError('');
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const found = validateLogin(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    setServerError('');
    try {
      await login({ email: normaliseEmail(form.email), password: form.password });
      navigate(location.state?.from?.pathname || '/chat', { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error, 'Could not log in. Please try again.'));
      setSubmitting(false);
    }
  };

  const fillDemo = () => setForm({ email: MOCK_SEED_EMAILS[0], password: MOCK_SEED_PASSWORD });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to pick up your conversations."
      footer={
        <>
          New to CampusConnect?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError ? <Alert>{serverError}</Alert> : null}
        <Input
          label="Email"
          type="email"
          icon={Mail}
          autoComplete="email"
          inputMode="email"
          placeholder="you@students.iitmandi.ac.in"
          value={form.email}
          onChange={update('email')}
          error={errors.email}
          autoFocus
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
          value={form.password}
          onChange={update('password')}
          error={errors.password}
        />
        <Button type="submit" size="lg" fullWidth loading={submitting}>
          {submitting ? 'Logging in' : 'Log in'}
        </Button>
        {USE_MOCKS ? (
          <button type="button" onClick={fillDemo} className="w-full text-center text-xs font-medium text-ink-subtle hover:text-brand-700">
            Mock mode: fill a demo account
          </button>
        ) : null}
      </form>
    </AuthLayout>
  );
}
