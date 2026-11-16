import type { SVGProps } from 'react';

// Hand-built 24x24 stroke icons. Paths use currentColor so they follow the theme.
const PATHS = {
  play: 'M7 4.5v15l12-7.5Z',
  pause: 'M8 5v14M16 5v14',
  book: 'M12 6c-2-1.5-4.7-2-8-2v14c3.3 0 6 .500 8 2 2-1.5 4.7-2 8-2V4c-3.3 0-6 .500-8 2ZM12 6v14',
  upload: 'M12 16V4M7 9l5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
  download: 'M12 4v12M7 11l5 5 5-5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
  settings:
    'M10.3 3h3.4l.600 2.6 1.7.700 2.3-1.4 2.4 2.4-1.4 2.3.700 1.7 2.6.600v3.4l-2.6.600-.700 1.7 1.4 2.3-2.4 2.4-2.3-1.4-1.7.700-.600 2.6h-3.4l-.600-2.6-1.7-.700-2.3 1.4-2.4-2.4 1.4-2.3-.700-1.7L3 13.7v-3.4l2.6-.600.7-1.7-1.4-2.3 2.4-2.4 2.3 1.4 1.7-.700ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  save: 'M5 4h11l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM8 4v5h7V4M8 20v-6h8v6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  mic: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3M9 21h6',
  send: 'M4 12 20 4l-5 16-3.5-6.5ZM11.5 13.5 20 4',
  dice: 'M12 2.5 20.5 7v10L12 21.5 3.5 17V7ZM12 2.5v6M3.5 7l5.5 5M20.5 7 15 12M12 21.5V17M3.5 17 9 14.5M20.5 17 15 14.5M12 8.5 15 12l-3 5-3-5Z',
  volume: 'M4 9.5v5h3.5L12 19V5L7.5 9.5ZM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9.5v5h3.5L12 19V5L7.5 9.5ZM16 9.5l5 5M21 9.5l-5 5',
  check: 'M4.5 12.5 10 18 19.5 6.5',
  x: 'M6 6l12 12M18 6 6 18',
  alert: 'M12 3.5 22 20H2ZM12 10v4.5M12 17.2v.300',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7.5v.300',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8ZM19 15l.800 2.2L22 18l-2.2.800L19 21l-.800-2.2L16 18l2.2-.800Z',
  chevronRight: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronDown: 'M5 9l7 7 7-7',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.2a3.5 3.5 0 0 1 0 6.6M17.5 14.3c2.4.700 4 2.8 4 5.7',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3.5 2',
  image: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM3 16l5-5 4 4 3-3 6 6M15.5 9.5v.100',
  music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  flip: 'M4 8h13l-3-3M20 16H7l3 3',
  key: 'M14.5 9.5a5 5 0 1 0-4.3 4.9L12 16h2v2h2v2h4v-3.5l-5.7-5.7c.100-.400.2-.800.2-1.3ZM8.5 8.5v.100',
  plus: 'M12 5v14M5 12h14',
  home: 'M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-6h4v6',
  swords: 'M4 4l10 10M4 4v3.5M4 4h3.5M20 4 10 14M20 4v3.5M20 4h-3.5M6.5 14.5l3 3M5 19l3-3M17.5 14.5l-3 3M19 19l-3-3',
  heart: 'M12 20c-5-3.7-8.5-7-8.5-11A4.5 4.5 0 0 1 12 6.8 4.5 4.5 0 0 1 20.5 9c0 4-3.5 7.3-8.5 11Z',
  shield: 'M12 3l8 2.5V12c0 4.7-3.2 7.8-8 9.5-4.8-1.7-8-4.8-8-9.5V5.5Z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  skip: 'M5 5l9 7-9 7ZM18 5v14',
  refresh: 'M20 5v5h-5M4 19v-5h5M19.5 10A8 8 0 0 0 5.3 8M4.5 14a8 8 0 0 0 14.2 2',
  file: 'M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v4h4M8.5 12h7M8.5 16h7',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2.5h9a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z',
  thumbUp: 'M7 10v10H4V10ZM7 10l4-7c1.5 0 2.5 1 2.2 2.6L12.6 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7',
  thumbDown: 'M7 14V4H4v10ZM7 14l4 7c1.5 0 2.5-1 2.2-2.6L12.6 15H19a2 2 0 0 0 2-2.3l-1.2-7A2 2 0 0 0 17.8 4H7',
  star: 'M12 3.5l2.6 5.4 5.9.800-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.800Z',
  eye: 'M2.5 12c2.5-4.3 5.7-6.5 9.5-6.5s7 2.2 9.5 6.5c-2.5 4.3-5.7 6.5-9.5 6.5S5 16.3 2.5 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  stop: 'M6 6h12v12H6Z',
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Accessible label. Without one the icon is decorative and hidden from screen readers. */
  label?: string;
}

export function Icon({ name, size = 18, label, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
