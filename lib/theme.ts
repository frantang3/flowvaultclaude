// lib/theme.ts
// App design tokens: color roles, spacing, radii, type sizes, FONTS

const theme = {
  spacing: {
    xs: 6,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radii: {
    sm: 6,
    md: 12,
    lg: 18,
  },
  type: {
    h1: 28,
    h2: 22,
    h3: 18,
    body: 16,
    small: 13,
  },
  fonts: {
    // Headers: Manrope Bold (700) and SemiBold (600)
    heading: {
      fontFamily: 'Manrope-Bold',
    },
    headingSemiBold: {
      fontFamily: 'Manrope-SemiBold',
    },
    // Body + UI: Inter Regular (400), Medium (500), SemiBold (600)
    body: {
      fontFamily: 'Inter-Regular',
    },
    bodySemiBold: {
      fontFamily: 'Inter-Medium',
    },
    bodyBold: {
      fontFamily: 'Inter-SemiBold',
    },
    // Numbers: Inter Medium (500)
    number: {
      fontFamily: 'Inter-Medium',
    },
  },
  colors: {
    primary: '#6C5CE7', // playful purple
    onPrimary: '#FFFFFF',
    surface: '#FFFFFF',
    background: '#F7F8FB',
    surfaceVariant: '#F1F2F6',
    onSurfaceVariant: '#98A0B3',
    outline: '#E6E7EE',
    error: '#FF6B6B',
    success: '#2ECC71',
    text: '#0F1724',
    muted: '#6B7280',
    glass: 'rgba(255,255,255,0.65)'
  }
}

export default theme