import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban, CalendarDays, Flag, Link2, Lock, Mail, MapPin, MoreHorizontal, UserX, VenetianMask, VolumeX, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { InfiniteFeed } from '../components/Feed';
import { ImageUpload, InterestPicker } from '../components/ProfileFields';
import { PostCard } from '../components/PostCard';
import { FollowButton } from '../components/UserRow';
import {
  Avatar,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Modal,
  PageHeader,
  PageSpinner,
  Tabs,
  TextArea,
  TextInput,
  VerifiedLock,
} from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { setMe, useAuthedMe } from '../lib/auth';
import { queryClient } from '../lib/query';
import type { Me, Post, Profile } from '../lib/types';
import { cn, compact, lastSeen } from '../lib/utils';
import { Lightbox } from '../components/Media';
import { ReportDialog } from '../components/ReportDialog';
import { VibeCheck } from '../components/VibeCheck';
import { openComposer } from '../lib/composer';
import { useDocumentTitle } from '../lib/useDocumentTitle';

type Tab = 'posts' | 'replies' | 'media' | 'likes' | 'anonymous';

/** Returns a safe http(s) href, or null if the value isn't a usable web URL. */
function parseHttpUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const { username = '' } = useParams();
  const me = useAuthedMe();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['profile', username.toLowerCase()],
    queryFn: () => api.get<{ user: Profile; canViewContent: boolean }>(`/users/${encodeURIComponent(username)}`),
  });
  const [tab, setTab] = useState<Tab>('posts');
  const [editing, setEditing] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [report, setReport] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useDocumentTitle(q.data?.user ? `${q.data.user.displayName} (@${q.data.user.username})` : `@${username}`);

  if (q.isPending)
    return (
      <div className="mx-auto max-w-[1020px] pt-4">
        <PageHeader back title="Profile" />
        <PageSpinner />
      </div>
    );
  if (q.isError) {
    const nf = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="mx-auto max-w-[1020px] pt-4">
        <PageHeader back title="Profile" />
        {nf ? <EmptyState title="This account doesn’t exist" body="Try searching for another." /> : <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      </div>
    );
  }

  const u = q.data.user;
  const v = u.viewer;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['profile', username.toLowerCase()] });

  async function act(kind: 'mute' | 'unmute' | 'block' | 'unblock' | 'remove') {
    try {
      if (kind === 'mute') await api.post(`/users/${u.username}/mute`);
      if (kind === 'unmute') await api.del(`/users/${u.username}/mute`);
      if (kind === 'block') await api.post(`/users/${u.username}/block`);
      if (kind === 'unblock') await api.del(`/users/${u.username}/block`);
      if (kind === 'remove') await api.del(`/users/${u.username}/follower`);
      toast(
        {
          mute: `Muted @${u.username}`,
          unmute: `Unmuted @${u.username}`,
          block: `Blocked @${u.username}`,
          unblock: `Unblocked @${u.username}`,
          remove: `@${u.username} no longer follows you`,
        }[kind],
      );
      refresh();
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setConfirmBlock(false);
    }
  }

  async function message() {
    try {
      const r = await api.post<{ conversation: { id: string } }>('/conversations', { username: u.username });
      navigate(`/chats/${r.conversation.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const seen = u.isOnline ? 'Online now' : lastSeen(u.lastSeenAt);
  const tabs: { value: Tab; label: string }[] = [
    { value: 'posts', label: 'Posts' },
    { value: 'replies', label: 'Replies' },
    { value: 'media', label: 'Media' },
    ...(u.isSelf ? ([{ value: 'likes', label: 'Likes' }, { value: 'anonymous', label: 'Whispers' }] as const) : []),
  ];

  const showVibe = !u.isSelf && !v?.blockedBy && !v?.blocking;
  return (
    <div className="mx-auto max-w-[1020px] pt-4">
      <section className="overflow-hidden rounded-[32px] border border-line bg-card shadow-paper">
        <div className="relative aspect-[3/1] max-h-[230px] w-full overflow-hidden bg-accent-soft">
          {u.bannerUrl && !bannerFailed ? (
            <button className="size-full" onClick={() => setPhoto(u.bannerUrl)} aria-label="View header image">
              <img src={u.bannerUrl} alt="" className="size-full object-cover" onError={() => setBannerFailed(true)} />
            </button>
          ) : (
            <>
              <div aria-hidden className="absolute -bottom-10 right-16 size-40 rounded-full bg-accent/20" />
              <div aria-hidden className="absolute -bottom-16 right-2 size-40 rounded-full bg-accent/15" />
            </>
          )}
          <IconButton label="Back" className="absolute left-4 top-4 bg-card/90 shadow-paper" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/home'))}>
            <ArrowLeft className="size-[18px]" />
          </IconButton>
        </div>

        <div className="px-5 pb-6 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
            <button className="-mt-14 shrink-0 rounded-[36%] ring-[5px] ring-card" onClick={() => u.avatarUrl && setPhoto(u.avatarUrl)} aria-label="View profile photo" disabled={!u.avatarUrl}>
              <Avatar user={u} size={112} />
            </button>
            <div className="ml-auto flex items-center gap-2 pt-3">
              {u.isSelf ? (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Edit profile
                </Button>
              ) : v?.blockedBy ? null : v?.blocking ? (
                <Button variant="danger" onClick={() => act('unblock')}>
                  Unblock
                </Button>
              ) : (
                <>
                  <Menu>
                    <MenuTrigger asChild>
                      <IconButton label="More" className="border border-line-strong bg-card">
                        <MoreHorizontal className="size-5" />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem
                        icon={<Link2 />}
                        onSelect={() => {
                          navigator.clipboard.writeText(`${location.origin}/${u.username}`);
                          toast('Link copied');
                        }}
                      >
                        Copy link to profile
                      </MenuItem>
                      {v?.muting ? (
                        <MenuItem icon={<Volume2 />} onSelect={() => act('unmute')}>
                          Unmute @{u.username}
                        </MenuItem>
                      ) : (
                        <MenuItem icon={<VolumeX />} onSelect={() => act('mute')}>
                          Mute @{u.username}
                        </MenuItem>
                      )}
                      {v?.followedBy && (
                        <MenuItem icon={<UserX />} onSelect={() => act('remove')}>
                          Remove this follower
                        </MenuItem>
                      )}
                      <MenuItem icon={<Ban />} danger onSelect={() => setConfirmBlock(true)}>
                        Block @{u.username}
                      </MenuItem>
                      <MenuItem icon={<Flag />} danger onSelect={() => setReport(true)}>
                        Report @{u.username}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                  {v?.canMessage && (
                    <IconButton label="Message" className="border border-line-strong bg-card" onClick={message}>
                      <Mail className="size-5" />
                    </IconButton>
                  )}
                  {v && <FollowButton user={u} state={v.following} followsYou={v.followedBy} />}
                </>
              )}
            </div>
          </div>

          <div className="mt-4 min-w-0">
            <h1 className="flex items-start gap-2 text-[2rem] font-extrabold leading-tight sm:text-[2.4rem]">
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{u.displayName}</span>
              <span className="mt-1.5 shrink-0">
                <VerifiedLock show={u.isPrivate} />
              </span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-[0.9375rem] text-fg-muted">
              <span>@{u.username}</span>
              {v?.followedBy && <span className="rounded-full bg-bg-muted px-2 py-0.5 text-[0.75rem] font-semibold">follows you</span>}
              {seen && !v?.blockedBy && (
                <span className="flex items-center gap-1.5 text-[0.8125rem]">
                  {u.isOnline && <span className="size-2 rounded-full bg-online" />}
                  {seen}
                </span>
              )}
            </div>
          </div>

          {v?.blockedBy ? (
            <p className="mt-4 text-[0.9375rem] text-fg-muted">@{u.username} has blocked you.</p>
          ) : (
            <>
              {u.bio && <p className="mt-4 max-w-[60ch] whitespace-pre-wrap text-[1.0625rem] leading-relaxed">{u.bio}</p>}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.875rem] text-fg-muted">
                {u.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-4" /> {u.location}
                  </span>
                )}
                {u.website &&
                  (() => {
                    const href = parseHttpUrl(u.website);
                    const shown = u.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
                    return href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer ugc nofollow" className="flex min-w-0 items-center gap-1.5 text-accent hover:underline">
                        <Link2 className="size-4 shrink-0 text-fg-muted" /> <span className="truncate">{shown}</span>
                      </a>
                    ) : (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Link2 className="size-4 shrink-0 text-fg-muted" /> <span className="truncate">{shown}</span>
                      </span>
                    );
                  })()}
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-4" /> Joined {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
              </div>
              {u.interests.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {u.interests.map((i) => {
                    const shared = !u.isSelf && me.interests.includes(i);
                    return (
                      <span key={i} className={cn('rounded-full px-3 py-1 text-[0.8125rem] font-semibold', shared ? 'bg-accent-soft text-accent' : 'bg-bg-muted text-fg-muted')} title={shared ? 'You’re both into this' : undefined}>
                        {i}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <StatLink to={`/${u.username}/followers`} n={u.followersCount} label={u.followersCount === 1 ? 'follower' : 'followers'} />
                <StatLink to={`/${u.username}/following`} n={u.followingCount} label="following" />
                <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-bg-muted px-4 text-[0.875rem]">
                  <b className="font-display">{compact(u.postsCount)}</b> <span className="text-fg-muted">{u.postsCount === 1 ? 'note' : 'notes'}</span>
                </span>
              </div>
              {v && v.mutualCount > 0 && (
                <Link to={`/${u.username}/followers`} className="-my-1.5 mt-4 flex items-center gap-2 py-1.5 text-[0.8125rem] text-fg-muted hover:underline">
                  <span className="flex -space-x-2">
                    {v.mutualFollowers.map((m) => (
                      <Avatar key={m.id} user={m} size={22} className="rounded-[36%] ring-2 ring-card" />
                    ))}
                  </span>
                  Followed by {v.mutualFollowers.slice(0, 2).map((m) => m.displayName).join(', ')}
                  {v.mutualCount > 2 && `, and ${v.mutualCount - 2} other${v.mutualCount - 2 === 1 ? '' : 's'} you follow`}
                </Link>
              )}
            </>
          )}
        </div>
      </section>

      {v?.blockedBy ? null : v?.blocking ? (
        <EmptyState title={`@${u.username} is blocked`} body="They can’t follow you, see your notes, or message you. Unblock to see their notes." />
      ) : (
        <div className={cn('mt-6 grid gap-6', showVibe && 'lg:grid-cols-[1fr_340px]')}>
          <div className="min-w-0 lg:order-1">
            {!q.data.canViewContent ? (
              <EmptyState
                icon={<Lock />}
                title="These notes are private"
                body={`Only approved followers can see @${u.username}’s notes. ${v?.following === 'pending' ? 'Your request is pending.' : 'Follow to send a request.'}`}
              />
            ) : (
              <>
                <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />
                {tab === 'anonymous' ? (
                  <AnonymousPosts />
                ) : (
                  <InfiniteFeed
                    key={tab}
                    masonry={showVibe ? false : 'narrow'}
                    queryKey={['profile-posts', u.username.toLowerCase(), tab]}
                    url={`/users/${u.username}/posts?tab=${tab}`}
                    empty={
                      <EmptyState
                        title={tab === 'likes' ? 'Nothing liked yet' : tab === 'media' ? 'No photos yet' : tab === 'replies' ? 'No replies yet' : u.isSelf ? 'You haven’t written anything yet' : `${u.displayName.split(' ')[0]} hasn’t posted yet`}
                        body={tab === 'likes' ? 'Only you can see your likes.' : undefined}
                        action={u.isSelf && tab === 'posts' ? <Button onClick={() => openComposer()}>Write your first note</Button> : undefined}
                      />
                    }
                  />
                )}
              </>
            )}
          </div>
          {showVibe && (
            <aside className="lg:sticky lg:top-24 lg:order-2 lg:self-start">
              <VibeCheck username={u.username} name={u.displayName} />
            </aside>
          )}
        </div>
      )}

      {u.isSelf && editing && <EditProfile me={me} open={editing} onOpenChange={setEditing} />}
      <ConfirmDialog
        open={confirmBlock}
        onOpenChange={setConfirmBlock}
        title={`Block @${u.username}?`}
        body="They won’t be able to follow you, see your notes, or message you. They won’t be notified."
        confirmLabel="Block"
        onConfirm={() => act('block')}
      />
      <Lightbox media={photo ? [{ url: photo }] : []} index={photo ? 0 : null} onClose={() => setPhoto(null)} onIndex={() => {}} />
      {!u.isSelf && (
        <ReportDialog
          open={report}
          onOpenChange={setReport}
          target={{
            type: 'user',
            id: u.id,
            username: u.username,
            onBlock: () => act('block'),
            onMute: v?.muting ? undefined : () => act('mute'),
          }}
        />
      )}
    </div>
  );
}

function StatLink({ to, n, label }: { to: string; n: number; label: string }) {
  return (
    <Link to={to} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-bg-muted px-4 text-[0.875rem] transition-colors hover:bg-line">
      <b className="font-display">{compact(n)}</b> <span className="text-fg-muted">{label}</span>
    </Link>
  );
}

function AnonymousPosts() {
  const q = useQuery({ queryKey: ['profile-posts', 'me', 'anonymous'], queryFn: () => api.get<{ items: Post[] }>('/users/me/anonymous') });
  if (q.isPending) return <PageSpinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.items.length)
    return <EmptyState icon={<VenetianMask />} title="No whispers yet" body="Whispers you write show up here. Only you can see this tab, and nobody can tell they’re yours." />;
  return (
    <>
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-[0.875rem] text-fg-muted">
        <VenetianMask className="mt-0.5 size-4 shrink-0" />
        <p>Only you can see this tab. Everyone else sees these as “Someone, anonymously”.</p>
      </div>
      <div className="masonry columns-1 md:columns-2">
        {q.data.items.map((p) => (
          <div key={p.id}>
            <PostCard post={p} />
          </div>
        ))}
      </div>
    </>
  );
}

function EditProfile({ me, open, onOpenChange }: { me: Me; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [f, setF] = useState({
    displayName: me.displayName,
    bio: me.bio,
    location: me.location,
    website: me.website,
    avatarUrl: me.avatarUrl,
    bannerUrl: me.bannerUrl,
    interests: me.interests,
  });
  const [busy, setBusy] = useState(false);
  const [showInterests, setShowInterests] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const r = await api.patch<{ user: Me }>('/me', f);
      setMe(r.user);
      queryClient.invalidateQueries({ queryKey: ['profile', me.username.toLowerCase()] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      onOpenChange(false);
      toast('Profile updated');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit profile"
      wide
      headerRight={
        <Button variant="inverse" size="sm" onClick={save} loading={busy} disabled={!f.displayName.trim()}>
          Save
        </Button>
      }
    >
      <ImageUpload kind="banner" url={f.bannerUrl} onChange={(bannerUrl) => setF((prev) => ({ ...prev, bannerUrl }))} />
      <div className="px-4">
        <ImageUpload kind="avatar" url={f.avatarUrl} onChange={(avatarUrl) => setF((prev) => ({ ...prev, avatarUrl }))} user={me} className="-mt-12 w-fit" />
        <div className="space-y-5 py-5">
          <TextInput label="Name" value={f.displayName} counter={50} onChange={(e) => setF((prev) => ({ ...prev, displayName: e.target.value }))} />
          <TextArea label="Bio" value={f.bio} counter={160} onChange={(e) => setF((prev) => ({ ...prev, bio: e.target.value }))} />
          <TextInput label="Location" value={f.location} counter={30} onChange={(e) => setF((prev) => ({ ...prev, location: e.target.value }))} />
          <TextInput label="Website" value={f.website} counter={100} onChange={(e) => setF((prev) => ({ ...prev, website: e.target.value }))} inputMode="url" />
          <div className="rounded-md border border-line-strong">
            <button type="button" className="flex w-full items-center justify-between px-3 py-3 text-left" onClick={() => setShowInterests((s) => !s)}>
              <span>
                <span className="block text-[0.8125rem] text-fg-muted">Interests</span>
                <span className="block text-[0.9375rem]">{f.interests.length ? f.interests.join(', ') : 'None selected'}</span>
              </span>
              <span className="text-[0.875rem] font-semibold text-accent">{showInterests ? 'Done' : 'Edit'}</span>
            </button>
            {showInterests && (
              <div className="border-t border-line p-3">
                <InterestPicker value={f.interests} onChange={(interests) => setF((prev) => ({ ...prev, interests }))} />
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
