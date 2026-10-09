import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, User } from 'lucide-react';
import AuthLayout from '../components/AuthLayout.jsx';
import Button from '../components/ui/Button.jsx';
import Input, { PasswordInput } from '../components/ui/Input.jsx';
import { Alert } from '../components/ui/Feedback.jsx';
import CampusSelect from '../components/campus/CampusSelect.jsx';
import { useCampuses } from '../lib/campuses.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../lib/api.js';
import { normaliseEmail, PASSWORD_MIN, validateRegister } from '../lib/validation.js';

function passwordStrength(password) {
  if (!password) return null;
  let score = 0;
  if (password.length >= PASSWORD_MIN) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length < PASSWORD_MIN) return { label: 'Too short', bars: 1, tone: 'bg-danger' };
  if (score <= 2) return { label: 'Okay', bars: 2, tone: 'bg-star' };
  if (score === 3) return { label: 'Good', bars: 3, tone: 'bg-brand-500' };
  return { label: 'Strong', bars: 4, tone: 'bg-success' };
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const { campuses } = useCampuses();
  const [form, setForm] = useState({ name: '', email: '', campus: '', password: '', confirmPassword: '' });
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
    const found = { ...validateRegister(form), ...(form.campus ? {} : { campus: 'Choose your campus' }) };
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    setServerError('');
    try {
      await register({ name: form.name.trim(), email: normaliseEmail(form.email), password: form.password, campus: form.campus });
      navigate('/chat', { replace: true });
    } catch (error) {
      setServerError(getErrorMessage(error, 'Could not create your account. Please try again.'));
      setSubmitting(false);
    }
  };

  const strength = passwordStrength(form.password);

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes less than a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {serverError ? <Alert>{serverError}</Alert> : null}
        <Input
          label="Full name"
          icon={User}
          autoComplete="name"
          placeholder="Aarav Sharma"
          value={form.name}
          onChange={update('name')}
          error={errors.name}
          maxLength={50}
          autoFocus
        />
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
        />
        <CampusSelect
          campuses={campuses}
          value={form.campus}
          onChange={(campus) => {
            setForm((f) => ({ ...f, campus }));
            setErrors((e) => ({ ...e, campus: undefined }));
            if (serverError) setServerError('');
          }}
          error={errors.campus}
          hint="People search starts with your campus. You can change it later."
        />
        <div>
          <PasswordInput
            label="Password"
            autoComplete="new-password"
            placeholder={`At least ${PASSWORD_MIN} characters`}
            value={form.password}
            onChange={update('password')}
            error={errors.password}
          />
          {strength && !errors.password ? (
            <div className="mt-2 flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} className={`h-1 flex-1 rounded-full ${i <= strength.bars ? strength.tone : 'bg-surface-muted'}`} />
                ))}
              </div>
              <span className="text-xs text-ink-subtle">{strength.label}</span>
            </div>
          ) : null}
        </div>
        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Type it again"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          error={errors.confirmPassword}
        />
        <Button type="submit" size="lg" fullWidth loading={submitting}>
          {submitting ? 'Creating account' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
