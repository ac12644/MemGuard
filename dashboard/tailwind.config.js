/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          background: '#0b1326',
          surface: '#0b1326',
          'surface-lowest': '#060e20',
          'surface-low': '#131b2e',
          'surface-container': '#171f33',
          'surface-high': '#222a3d',
          'surface-highest': '#2d3449',
          primary: '#adc6ff',
          'primary-bright': '#367ef2',
          'on-primary': '#002e6a',
          secondary: '#4edea3',
          tertiary: '#ffb95f',
          error: '#ffb4ab',
          'error-container': '#93000a',
          'on-surface': '#dae2fd',
          'on-surface-variant': '#c5c6cd',
          outline: '#8f9097',
          'outline-variant': '#44474d',
        },
      },
      fontFamily: {
        headline: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sharp: '0.125rem',
      },
      boxShadow: {
        ambient: '0px 8px 32px rgba(0, 0, 0, 0.4)',
        'ghost-border': 'inset 0 0 0 1px rgba(68, 71, 77, 0.15)',
      },
      animation: {
        'gauge': 'gauge 1s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        gauge: {
          '0%': { strokeDashoffset: 'var(--circumference)' },
          '100%': { strokeDashoffset: 'var(--offset)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
