// Signalix mobile design tokens — soft teal → lavender gradients on a
// pure-black base, frosted translucent surfaces, white type.

export const colors = {
  bg: '#000000',
  bgElev: '#141418',
  bgElev2: '#1e1e24',
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.62)',
  textDim: 'rgba(255,255,255,0.4)',
  border: 'rgba(255,255,255,0.12)',
  accent: '#a79fd6',
  accentStrong: '#8b80cc',
  danger: '#ff6b6b',
  online: '#34c759',
  glass: 'rgba(255,255,255,0.22)',
  glassStrong: 'rgba(255,255,255,0.32)',
  glassDark: 'rgba(40,40,48,0.55)',
  bubbleMine: 'rgba(52,52,62,0.62)',
  bubbleTheirs: 'rgba(255,255,255,0.3)',
};

/** Gradient stops for the chat-list hero card. */
export const heroGradient = ['#8fb6b2', '#a3a6cc', '#a296c9'] as const;

/** Gradient stops for the conversation canvas. */
export const canvasGradient = ['#b7b9be', '#a49cca', '#9e94c6', '#a2b4c4'] as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 36,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

/** Display type: big, bold and tightly tracked. */
export const display = {
  fontSize: 44,
  lineHeight: 46,
  fontWeight: '800' as const,
  letterSpacing: -1.8,
  color: colors.text,
};
