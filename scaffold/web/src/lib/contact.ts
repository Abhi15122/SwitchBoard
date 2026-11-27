const PALETTE = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-lime-100 text-lime-700',
];

export function avatarColor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** Two characters for an avatar: initials for a name, the last two digits for a phone number. */
export function initials(label: string): string {
  const digits = label.replace(/\D/g, '');
  if (label.startsWith('+') && digits.length >= 2) return digits.slice(-2);
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

/** +14155550101 reads as +1 (415) 555-0101. Other numbers are grouped for readability. */
export function formatPhone(raw: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(raw);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  const d = /^\+(\d{1,3})(\d+)$/.exec(raw);
  if (!d) return raw;
  return `+${d[1]} ${d[2]!.replace(/(\d{3,4})(?=\d{3,})/g, '$1 ')}`;
}
