/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        kairos: {
          bg: '#0a0b18',
          panel: 'rgba(15, 18, 30, 0.78)',
          border: 'rgba(240,192,64,0.12)',
          accent: '#f0c040',
          gold: '#f0c040',
          silver: '#a8b8cc',
          amber: '#f39c12',
          emerald: '#3fb27f',
          crimson: '#e74c3c',
          danger: '#ef4444',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'Rajdhani', 'system-ui', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
};
