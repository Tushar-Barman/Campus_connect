import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/Feedback.jsx';
import { buttonClass } from '../components/ui/Button.jsx';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={
          <Link to="/" className={buttonClass({ variant: 'secondary' })}>
            Back to home
          </Link>
        }
      />
    </div>
  );
}
