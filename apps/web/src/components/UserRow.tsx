import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, errorMessage } from '../lib/api';
import { useMe } from '../lib/auth';
import { queryClient } from '../lib/query';
import type { FollowState, UserCard as UserCardT, UserSummary } from '../lib/types';
import { cn } from '../lib/utils';
import { Avatar, Button, ConfirmDialog, UserLink, VerifiedLock } from './ui';

export function FollowButton({
  user,
  state: initial,
  followsYou,
  size = 'md',
  onChange,
}: {
  user: Pick<UserSummary, 'username' | 'isPrivate'>;
  state: FollowState;
  followsYou?: boolean;
  size?: 'sm' | 'md';
  onChange?: (s: FollowState) => void;
}) {
  const { me } = useMe();
  const navigate = useNavigate();
  const [state, setState] = useState<FollowState>(initial);
  const [hover, setHover] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  // Keep in sync when parent data refreshes.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setState(initial);
  }

  async function run(next: 'follow' | 'unfollow') {
    if (!me) return navigate('/login');
    setBusy(true);
    const prev = state;
    setState(next === 'follow' ? (user.isPrivate ? 'pending' : 'active') : 'none');
    try {
      const r = next === 'follow' ? await api.post<{ status: FollowState }>(`/users/${user.username}/follow`) : await api.del<{ status: FollowState }>(`/users/${user.username}/follow`);
      setState(r.status);
      onChange?.(r.status);
      queryClient.invalidateQueries({ queryKey: ['profile', user.username] });
      queryClient.invalidateQueries({ queryKey: ['profile', me.username] });
      queryClient.invalidateQueries({ queryKey: ['feed', 'following'] });
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
      if (r.status === 'pending') toast('Follow request sent');
    } catch (e) {
      setState(prev);
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const btnSize = size === 'sm' ? 'sm' : 'md';
  if (state === 'none') {
    return (
      <Button size={btnSize} variant="inverse" disabled={busy} onClick={(e) => (e.stopPropagation(), run('follow'))}>
        {followsYou ? 'Follow back' : 'Follow'}
      </Button>
    );
  }
  return (
    <>
      <Button
        size={btnSize}
        variant="outline"
        disabled={busy}
        className={cn('min-w-[104px]', hover && 'border-danger/40 bg-danger/10 text-danger hover:bg-danger/10')}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (state === 'pending') run('unfollow');
          else setConfirm(true);
        }}
      >
        {state === 'pending' ? (hover ? 'Cancel' : 'Requested') : hover ? 'Unfollow' : 'Following'}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Unfollow @${user.username}?`}
        body="Their posts will no longer show up in your Following timeline. You can still view their profile."
        confirmLabel="Unfollow"
        danger={false}
        loading={busy}
        onConfirm={() => run('unfollow')}
      />
    </>
  );
}

export function UserRow({ user, showBio = true, right }: { user: UserCardT; showBio?: boolean; right?: React.ReactNode }) {
  const navigate = useNavigate();
  const { me } = useMe();
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/${user.username}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/${user.username}`)}
      className="flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-bg-hover"
    >
      <Avatar user={user} size={40} online={user.isOnline} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 leading-5">
            <UserLink user={user} className="-my-1 flex items-center gap-1 py-1 font-bold hover:underline">
              <span className="truncate">{user.displayName}</span>
              <VerifiedLock show={user.isPrivate} />
            </UserLink>
            <div className="flex items-center gap-1.5 text-[0.9375rem] text-fg-muted">
              <span className="truncate">@{user.username}</span>
              {user.viewer?.followedBy && <span className="shrink-0 rounded bg-bg-muted px-1 text-[0.6875rem] font-semibold">Follows you</span>}
            </div>
          </div>
          {right ?? (user.viewer && me && me.id !== user.id && <FollowButton user={user} state={user.viewer.following} followsYou={user.viewer.followedBy} size="sm" />)}
        </div>
        {showBio && user.bio && <p className="mt-1 line-clamp-2 text-[0.9375rem]">{user.bio}</p>}
      </div>
    </div>
  );
}
