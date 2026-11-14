/**
 * Flat, solid theme in the style of a Windows business app: Segoe UI, a navy top bar,
 * white panels with grey borders, square corners and one solid blue for actions.
 * The colour names stay Tailwind's (slate, blue, emerald, amber, red) so every screen
 * picks up these sober shades; no gradients, glows or soft pastel shadows.
 */

/** Neutral greys used for text, borders and backgrounds. */
const slate = {
  50: '#F7F8F9',
  100: '#F0F1F3',
  200: '#E2E4E7',
  300: '#CBCFD4',
  400: '#9BA1A8',
  500: '#6D747C',
  600: '#535A62',
  700: '#3D434A',
  800: '#2A2F35',
  900: '#1C1F23',
  950: '#121417',
};

/** The one action colour: buttons, links, the selected step. 950 is the top bar. */
const blue = {
  50: '#EEF3FA',
  100: '#DCE7F5',
  200: '#B9CFEB',
  300: '#8DB0DC',
  400: '#5585C4',
  500: '#2E6AB4',
  600: '#1A5BA6',
  700: '#154B8A',
  800: '#113C6F',
  900: '#0D2E55',
  950: '#0B2240',
};

/** Done and saved. */
const emerald = {
  50: '#F0F7F2',
  100: '#DDEFE2',
  200: '#BEE0C8',
  300: '#8ECA9F',
  400: '#4FA96A',
  500: '#2B8C49',
  600: '#1F7A3B',
  700: '#196531',
  800: '#144F27',
  900: '#0F3B1D',
  950: '#082613',
};

/** Needs a look: changed defaults, slow site, retries. */
const amber = {
  50: '#FEF8EC',
  100: '#FCEFD3',
  200: '#F7DDA3',
  300: '#EFC468',
  400: '#E2A63B',
  500: '#C98A1F',
  600: '#A86F13',
  700: '#87570E',
  800: '#6A440C',
  900: '#4F330A',
  950: '#2E1E05',
};

/** Stopped, errors, logged out. */
const red = {
  50: '#FDF2F1',
  100: '#F9E0DE',
  200: '#F1BDB8',
  300: '#E5928B',
  400: '#D5675F',
  500: '#C1463D',
  600: '#A8342B',
  700: '#8C2A22',
  800: '#6F211B',
  900: '#521914',
  950: '#330F0C',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { slate, blue, emerald, amber, red, page: '#ECEEF1' },
      fontFamily: {
        sans: ['"Segoe UI"', '-apple-system', 'BlinkMacSystemFont', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['Consolas', '"Cascadia Mono"', '"Courier New"', 'monospace'],
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '3px',
        md: '3px',
        lg: '3px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '6px',
      },
      boxShadow: {
        card: '0 1px 1px rgba(0, 0, 0, 0.04)',
        sm: '0 1px 1px rgba(0, 0, 0, 0.06)',
        DEFAULT: '0 1px 2px rgba(0, 0, 0, 0.08)',
        md: '0 2px 6px rgba(0, 0, 0, 0.10)',
        lg: '0 4px 12px rgba(0, 0, 0, 0.14)',
        xl: '0 6px 18px rgba(0, 0, 0, 0.16)',
        '2xl': '0 10px 30px rgba(0, 0, 0, 0.22)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        'slide-in': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'pop-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: {
        shimmer: 'shimmer 1.4s linear infinite',
        'slide-in': 'slide-in 0.18s ease-out',
        'fade-in': 'fade-in 0.15s ease-out',
        'pop-in': 'pop-in 0.15s ease-out',
      },
    },
  },
  plugins: [],
};
