import { avatarColor, initials } from '../lib/contact';

const SIZE = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm' } as const;

export function Avatar({ label, size = 'md' }: { label: string; size?: keyof typeof SIZE }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZE[size]} ${avatarColor(label)}`}>
      {initials(label)}
    </span>
  );
}
