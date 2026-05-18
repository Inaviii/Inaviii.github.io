/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mt-bg': '#323437',
        'mt-main': '#e2b714',
        'mt-caret': '#e2b714',
        'mt-sub': '#646669',
        'mt-sub-alt': '#2c2e31',
        'mt-text': '#d1d0c5',
        'mt-error': '#ca4754',
        'mt-error-extra': '#7e2a33',
      },
      fontFamily: {
        // Monkeytype uses Roboto Mono by default
        mono: ['"Roboto Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      }
    },
  },
  plugins: [],
}