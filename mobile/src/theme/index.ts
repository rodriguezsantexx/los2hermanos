export const colors = {
  primary: '#0057FF',
  primaryHover: '#0046CC',
  accent: '#FFD83D',
  accentHover: '#E6C237',
  background: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  border: '#E5E7EB',
};

export const typography = {
  // En Expo usaremos System fonts por defecto hasta cargar custom fonts
  h1: { fontSize: 32, fontWeight: 'bold', color: colors.text } as const,
  h2: { fontSize: 24, fontWeight: 'bold', color: colors.text } as const,
  body: { fontSize: 16, color: colors.text } as const,
  caption: { fontSize: 14, color: colors.textMuted } as const,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const theme = {
  colors,
  typography,
  spacing,
};
