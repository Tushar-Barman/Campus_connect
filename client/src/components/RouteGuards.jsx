import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorState, FullScreenLoader } from './ui/Feedback.jsx';

function SessionError({ onRetry }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas p-4">
      <ErrorState
        title="Can't reach CampusConnect"
        message="We couldn't check your session. Make sure you're online and the server is running."
        onRetry={onRetry}
      />
    </div>
  );
}

/** Only logged-in users get through; others go to /login and come back afterwards. */
export function ProtectedRoute() {
  const { status, retry } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <FullScreenLoader />;
  if (status === 'error') return <SessionError onRetry={retry} />;
  if (status !== 'authed') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Login/Register: a logged-in user is sent straight to the chats. */
export function GuestRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <FullScreenLoader />;
  if (status === 'authed') {
    const target = location.state?.from?.pathname || '/chat';
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
