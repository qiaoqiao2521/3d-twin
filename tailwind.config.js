/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './src/**/*.{ts,tsx}',
    './integrations/automotive/auto-atlas/src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      zIndex: {
        25: '25'
      }
    }
  },
  plugins: []
};
