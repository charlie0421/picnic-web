/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      keyframes: {
        'fade-in-out': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '20%': { opacity: '1', transform: 'translateY(0)' },
          '80%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-10px)' },
        },
        'rank-pulse': {
          '0%': { transform: 'translateX(-50%) scale(1)' },
          '50%': { transform: 'translateX(-50%) scale(1.1)' },
          '100%': { transform: 'translateX(-50%) scale(1)' },
        },
        'blob': {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        'shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
        },
        'loading-bar': {
          '0%': { width: '0%' },
          '50%': { width: '70%' },
          '100%': { width: '100%' },
        },
      },
      animation: {
        'fade-in-out': 'fade-in-out 1s ease-in-out forwards',
        'rank-pulse': 'rank-pulse 0.5s ease-in-out',
        'blob': 'blob 7s infinite',
        'shake': 'shake 0.82s cubic-bezier(.36,.07,.19,.97) both',
        'loading-bar': 'loading-bar 2s ease-in-out infinite',
      },
      colors: {
        primary: {
          DEFAULT: '#9374FF',
          50: '#F5F2FF',
          100: '#E6DFFF',
          200: '#CCBDFF',
          300: '#B29AFF',
          400: '#9374FF',
          500: '#7A56FF',
          600: '#6138FD',
          700: '#491AE1',
          800: '#3712B3',
          900: '#260D7A',
        },
        secondary: {
          DEFAULT: '#83FBC8',
          50: '#EFFFFA',
          100: '#D4FFF0',
          200: '#AEFEE1',
          300: '#83FBC8',
          400: '#4FF7AD',
          500: '#1AED8D',
          600: '#0BC46B',
          700: '#089452',
          800: '#056339',
          900: '#033D23',
        },
        sub: {
          DEFAULT: '#CDFB5D',
          50: '#F9FFEB',
          100: '#F2FFCF',
          200: '#E6FEA0',
          300: '#CDFB5D',
          400: '#B8F31A',
          500: '#94D00A',
          600: '#6FA108',
          700: '#547505',
          800: '#3A5004',
          900: '#223001',
        },
        point: {
          DEFAULT: '#FFA9BD',
          50: '#FFF5F7',
          100: '#FFE5EC',
          200: '#FFD0DD',
          300: '#FFA9BD',
          400: '#FF809D',
          500: '#FF4D77',
          600: '#FF1A51',
          700: '#E6002E',
          800: '#B30024',
          900: '#7A0019',
        },
        point900: {
          DEFAULT: '#EB4A71',
        }
      }
    },
  },
  plugins: [],
} 