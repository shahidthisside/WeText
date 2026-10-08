import { useState } from 'react';
import { cn } from '../../lib/utils';

/** A compact, dependency-free emoji grid for the desktop composer. */
const CATEGORIES: { key: string; label: string; emojis: string[] }[] = [
  {
    key: 'smileys',
    label: 'Smileys',
    emojis: '😀 😁 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😜 🤪 🤗 🤔 🤭 😐 😴 😢 😭 😤 😠 🥳 😎 🤩 😏 😳 🥺'.split(' '),
  },
  {
    key: 'gestures',
    label: 'Gestures',
    emojis: '👍 👎 👌 ✌️ 🤞 🙏 👏 🙌 💪 🤝 👋 🤙 🫶 ✍️ 🫡 🤟'.split(' '),
  },
  {
    key: 'hearts',
    label: 'Hearts',
    emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💞 💓 💗 💖 💘 💝'.split(' '),
  },
  {
    key: 'things',
    label: 'Things',
    emojis: '🔥 ✨ ⭐ 🎉 🎊 🥂 🍕 ☕ 🎁 💡 📝 📷 🎵 ⚡ 🌙 ☀️ 🌈 💯 ✅ ❌'.split(' '),
  },
];

export function EmojiPicker({ onPick, className }: { onPick: (emoji: string) => void; className?: string }) {
  const [cat, setCat] = useState(CATEGORIES[0]!.key);
  const active = CATEGORIES.find((c) => c.key === cat) ?? CATEGORIES[0]!;
  return (
    <div className={cn('w-[280px] overflow-hidden rounded-2xl border border-line bg-card shadow-lg', className)}>
      <div className="grid max-h-[180px] grid-cols-7 gap-0.5 overflow-y-auto p-2" role="grid" aria-label={`${active.label} emojis`}>
        {active.emojis.map((e, i) => (
          <button
            key={`${e}-${i}`}
            type="button"
            onClick={() => onPick(e)}
            aria-label={`Insert ${e}`}
            className="flex size-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-bg-hover"
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex border-t border-line">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCat(c.key)}
            aria-label={c.label}
            aria-pressed={c.key === cat}
            className={cn('flex-1 py-2 text-lg transition-colors', c.key === cat ? 'bg-accent-soft' : 'hover:bg-bg-hover')}
          >
            {c.emojis[0]}
          </button>
        ))}
      </div>
    </div>
  );
}
