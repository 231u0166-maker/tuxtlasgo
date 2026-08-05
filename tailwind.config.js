/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      colors: {
        jungle: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        // Dorado de vela ritual/copal — ya existía parcialmente (400-600),
        // se amplía para poder usarlo en fondos y bordes también, no
        // solo en acentos puntuales.
        sun: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Turquesa del lago-cráter de Catemaco — para todo lo
        // relacionado a mapa/agua, distinto del verde de jungle.
        laguna: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        // Papel de corteza / amate — crema cálido para fondos, en vez
        // de blanco plano.
        amate: {
          50: '#fdfbf3',
          100: '#faf3e3',
          200: '#f3e6c9',
          300: '#e8d2a0',
          400: '#d9b871',
        },
        // Piedra olmeca / obsidiana — casi negro con tinte cálido,
        // para superficies y texto oscuro.
        obsidiana: {
          800: '#292420',
          900: '#1c1917',
          950: '#0c0a09',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6.5s ease-in-out infinite 1.2s',
        'float-slow': 'float 7.5s ease-in-out infinite 2.4s',
        'crossfade-a': 'crossfade 9s ease-in-out infinite',
        'crossfade-b': 'crossfade 9s ease-in-out infinite -4.5s',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        crossfade: {
          '0%, 40%': { opacity: '1' },
          '50%, 90%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};