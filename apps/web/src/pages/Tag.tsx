import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { InfiniteFeed } from '../components/Feed';
import { Button, EmptyState, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { openComposer } from '../lib/composer';
import { plural } from '../lib/utils';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export default function TagPage() {
  const { tag = '' } = useParams();
  const t = tag.toLowerCase();
  useDocumentTitle(`#${t}`);
  const meta = useQuery({ queryKey: ['tag-meta', t], queryFn: () => api.get<{ total: number }>(`/tags/${encodeURIComponent(t)}`) });
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader back eyebrow="Tag" title={`#${t}`} subtitle={meta.data ? plural(meta.data.total, 'note') : undefined} />
      <InfiniteFeed
        masonry
        queryKey={['feed', 'tag', t]}
        url={`/tags/${encodeURIComponent(t)}`}
        empty={<EmptyState title={`Nobody’s written #${t} yet`} body="Start the conversation." action={<Button onClick={() => openComposer()}>Write a note</Button>} />}
      />
    </div>
  );
}
