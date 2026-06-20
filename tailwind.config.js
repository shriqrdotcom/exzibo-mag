/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        terracotta: {
          DEFAULT: '#E07A5F',
          light: '#E8956D',
          dark: '#C4634A',
        },
      },
    },
  },
  plugins: [],
}
