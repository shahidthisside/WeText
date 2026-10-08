import type { GroupMember } from '../../lib/types';
import { firstName, groupInitials, memberColor } from '../../lib/chat';
import { cn } from '../../lib/utils';

/** Single tile inside the collage: the member photo, or their initial on a tint. */
function Tile({ member, className }: { member: GroupMember; className?: string }) {
  const initial = (firstName(member.displayName)[0] ?? '?').toUpperCase();
  return (
    <span className={cn('relative block overflow-hidden bg-bg-muted', className)}>
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt="" className="size-full object-cover" loading="lazy" draggable={false} />
      ) : (
        <span
          className="flex size-full items-center justify-center font-display text-[0.7em] font-bold text-white"
          style={{ background: memberColor(member.id) }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}

/**
 * A group's avatar. With two or more member photos it renders a round collage
 * of up to four of them; otherwise it falls back to the group's initials on a
 * tinted disc. Decorative only — the group's title carries the accessible name.
 */
export function GroupAvatar({
  title,
  members,
  size = 52,
  className,
}: {
  title?: string;
  members?: GroupMember[];
  size?: number;
  className?: string;
}) {
  const people = (members ?? []).slice(0, 4);

  if (people.length < 2) {
    return (
      <span
        aria-hidden
        className={cn('flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white', className)}
        style={{ width: size, height: size, background: memberColor(title ?? 'group'), fontSize: size * 0.36 }}
      >
        {groupInitials(title)}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 gap-px overflow-hidden rounded-full bg-line', className)}
      style={{ width: size, height: size, fontSize: size, gridTemplateColumns: '1fr 1fr', gridTemplateRows: people.length === 2 ? '1fr' : '1fr 1fr' }}
    >
      {people.length === 2 ? (
        people.map((m) => <Tile key={m.id} member={m} />)
      ) : people.length === 3 ? (
        <>
          <Tile member={people[0]!} className="row-span-2" />
          <Tile member={people[1]!} />
          <Tile member={people[2]!} />
        </>
      ) : (
        people.map((m) => <Tile key={m.id} member={m} />)
      )}
    </span>
  );
}
