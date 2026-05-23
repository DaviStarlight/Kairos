/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        kairos: {
          bg: '#0b0d12',
          panel: 'rgba(15, 18, 26, 0.72)',
          border: 'rgba(255,255,255,0.08)',
          accent: '#7dd3fc',
          gold: '#f5c97b',
          danger: '#ef4444',
        },
      },
      fontFamily: {
        display: ['Rajdhani', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
};
