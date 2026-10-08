import { Bookmark, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { InfiniteFeed } from '../components/Feed';
import { ConfirmDialog, EmptyState, IconButton, Menu, MenuContent, MenuItem, MenuTrigger, PageHeader } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuthedMe } from '../lib/auth';
import { queryClient } from '../lib/query';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export default function Bookmarks() {
  const me = useAuthedMe();
  useDocumentTitle('Saved');
  const [confirm, setConfirm] = useState(false);
  async function clearAll() {
    try {
      await api.del('/me/bookmarks');
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast('Saved list cleared');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setConfirm(false);
    }
  }
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader
        eyebrow="Only you can see this"
        title="Saved"
        subtitle={`Notes @${me.username} wants to come back to`}
        right={
          <Menu>
            <MenuTrigger asChild>
              <IconButton label="More" className="border border-line bg-card">
                <MoreHorizontal className="size-5" />
              </IconButton>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirm(true)}>
                Clear all saved
              </MenuItem>
            </MenuContent>
          </Menu>
        }
      />
      <InfiniteFeed
        masonry
        queryKey={['bookmarks']}
        url="/me/bookmarks"
        empty={<EmptyState icon={<Bookmark />} title="Nothing saved yet" body="Tap the bookmark on any note to keep it here. Only you can see what you save." />}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear everything you saved?"
        body="This can’t be undone. The notes themselves aren’t deleted."
        confirmLabel="Clear"
        onConfirm={clearAll}
      />
    </div>
  );
}
