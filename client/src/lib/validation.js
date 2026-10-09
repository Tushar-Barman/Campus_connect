// Client-side checks mirror the server rules in PROJECT_INSTRUCTIONS §6/§8.
// They give instant feedback; the server still validates everything.

export const PASSWORD_MIN = 8;
export const NAME_MIN = 2;
export const NAME_MAX = 50;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(email = '') {
  return email.trim().toLowerCase();
}

export function validateEmail(email = '') {
  const value = normaliseEmail(email);
  if (!value) return 'Email is required';
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address';
  return null;
}

export function validatePassword(password = '') {
  if (!password) return 'Password is required';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  return null;
}

export function validateName(name = '') {
  const value = name.trim();
  if (!value) return 'Name is required';
  if (value.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters`;
  if (value.length > NAME_MAX) return `Name must be at most ${NAME_MAX} characters`;
  return null;
}

function compact(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
}

export function validateLogin({ email, password }) {
  return compact({
    email: validateEmail(email),
    password: password ? null : 'Password is required',
  });
}

export function validateRegister({ name, email, password, confirmPassword }) {
  return compact({
    name: validateName(name),
    email: validateEmail(email),
    password: validatePassword(password),
    confirmPassword:
      confirmPassword === undefined || confirmPassword === password ? null : 'Passwords do not match',
  });
}
