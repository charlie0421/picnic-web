/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
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
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': {
            transform: 'scale(0.33)',
            opacity: '1',
          },
          '80%, 100%': {
            transform: 'scale(2.4)',
            opacity: '0',
          },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { 
            opacity: '0',
            transform: 'translateY(20px)',
          },
          '100%': { 
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'scale-in': {
          '0%': { 
            opacity: '0',
            transform: 'scale(0.9)',
          },
          '100%': { 
            opacity: '1',
            transform: 'scale(1)',
          },
        },
        'scale-pulse': {
          '0%, 100%': { 
            transform: 'scale(1)',
          },
          '50%': { 
            transform: 'scale(1.1)',
          },
        },
      },
      animation: {
        'fade-in-out': 'fade-in-out 1s ease-in-out forwards',
        'rank-pulse': 'rank-pulse 0.5s ease-in-out',
        'blob': 'blob 7s infinite',
        'shake': 'shake 0.82s cubic-bezier(.36,.07,.19,.97) both',
        'loading-bar': 'loading-bar 2s ease-in-out infinite',
        'shimmer': 'shimmer 3s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.5s ease-out',
        'scale-in': 'scale-in 0.3s ease-out',
        'scale-pulse': 'scale-pulse 2s ease-in-out infinite',
      },
      colors: {
        primary: {
          DEFAULT: '#9374FF',
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
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
        },
        vote: {
          'success': '#10b981',
          'warning': '#f59e0b',
          'error': '#ef4444',
          'pending': '#6b7280',
          'accent': '#8b5cf6',
        }
      },
      boxShadow: {
        'vote-card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'vote-selected': '0 10px 15px -3px rgba(59, 130, 246, 0.3), 0 4px 6px -2px rgba(59, 130, 246, 0.05)',
        'vote-hover': '0 8px 12px -2px rgba(0, 0, 0, 0.15), 0 3px 6px -1px rgba(0, 0, 0, 0.1)',
      },
      gradientColorStops: theme => ({
        'vote-gold': '#ffd700',
        'vote-silver': '#c0c0c0', 
        'vote-bronze': '#cd7f32',
      }),
    },
  },
  plugins: [],
} 