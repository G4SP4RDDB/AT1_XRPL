// Visual language for the Order Book section only, modeled on app.tenor.finance's
// off-white ("blanc cassé") trading terminal look — kept local to this feature rather than
// touching the app's global CSS variables (index.css), which the rest of the app still uses.
export const bookTheme = {
  pageBg: '#FBFAF9',
  panelBg: '#FFFFFF',
  border: '#EAE6DF',
  borderStrong: '#DDD7CC',
  textMuted: '#8C8677',
  textSecondary: '#5C574C',
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
} as const
