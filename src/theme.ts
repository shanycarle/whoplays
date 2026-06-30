// The whole app is themed from just TWO user-chosen colors (the team's colors).
// Everything else (text contrast, borders, tab bar…) is derived from them so
// that swapping the two colors instantly re-skins the entire UI.

export const DEFAULT_PRIMARY = '#0B3D2E'; // deep forest green
export const DEFAULT_SECONDARY = '#C9A227'; // gold

export type Palette = { primary: string; secondary: string };

export const radius = { sm: 10, md: 14, lg: 22, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

/** Curated team-color choices offered in the profile color picker. */
export const SWATCHES: string[] = [
  '#0B3D2E', '#1B5E20', '#0D47A1', '#1A237E', '#4A148C', '#880E4F',
  '#B71C1C', '#E65100', '#00695C', '#263238', '#3E2723', '#000000',
  '#C9A227', '#FFC107', '#FF8F00', '#FFD54F', '#E53935', '#26A69A',
  '#42A5F5', '#AB47BC', '#EC407A', '#90A4AE', '#FFFFFF', '#9E9E9E',
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Pick black-ish or white text for legibility on top of an arbitrary color. */
export function contrastText(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#10231B' : '#FFFFFF';
}

/** Same color with an alpha suffix (e.g. for subtle dividers/overlays). */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${hex.replace('#', '').slice(0, 6)}${a}`;
}

export type Theme = {
  primary: string;
  secondary: string;
  onPrimary: string; // legible text/icons over primary
  onSecondary: string; // legible text/icons over secondary
  screenBg: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  muted: string;
  placeholderBg: string;
  divider: string;
};

export function deriveTheme({ primary, secondary }: Palette): Theme {
  return {
    primary,
    secondary,
    onPrimary: contrastText(primary),
    onSecondary: contrastText(secondary),
    screenBg: '#FFFFFF',
    cardBg: '#FFFFFF',
    cardBorder: '#E7E7DF',
    text: '#13241D',
    muted: '#7C8B84',
    placeholderBg: '#F3F2ED',
    divider: withAlpha(secondary, 0.45),
  };
}
