/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ledger: {
          background: '#f4f1e9',
          surface: '#fdfcf8',
          'surface-lowest': '#ece8da',
          'surface-low': '#f9f7f0',
          'surface-container': '#fdfcf8',
          'surface-high': '#f1ede2',
          'surface-highest': '#e5e0d1',
          primary: '#23408e',
          'primary-bright': '#2d52b8',
          'on-primary': '#f7f4ec',
          secondary: '#1e7a4c',
          tertiary: '#a66102',
          error: '#a8322d',
          'error-container': '#f3dedc',
          'on-surface': '#1d1b14',
          'on-surface-variant': '#5c574b',
          outline: '#8a8474',
          'outline-variant': '#d8d2c2',
        },
      },
      fontFamily: {
        headline: ['Fraunces', 'Georgia', 'serif'],
        body: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Spline Sans Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sharp: '0.1875rem',
      },
      boxShadow: {
        ambient: '0 1px 2px rgba(29, 27, 20, 0.05), 0 4px 16px rgba(29, 27, 20, 0.04)',
        lifted: '0 2px 4px rgba(29, 27, 20, 0.06), 0 12px 32px rgba(29, 27, 20, 0.10)',
      },
      animation: {
        gauge: 'gauge 1s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'stamp-in': 'stampIn 0.35s cubic-bezier(0.2, 1.4, 0.4, 1) forwards',
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
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        stampIn: {
          '0%': { opacity: '0', transform: 'scale(1.3) rotate(-4deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
      },
    },
  },
  plugins: [],
}
