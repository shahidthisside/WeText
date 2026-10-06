import { Link } from 'react-router';
import { Button, EmptyState, PageHeader } from '../components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[680px]">
      <PageHeader back eyebrow="404" title="Lost the thread" />
      <EmptyState
        title="This page doesn’t exist."
        body="The link may be broken, or the page may have been removed."
        action={
          <Link to="/home">
            <Button size="lg">Go home</Button>
          </Link>
        }
      />
    </div>
  );
}
