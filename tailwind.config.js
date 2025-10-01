import { type Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        atelier: {
          dark: '#0b0b0f',
          accent: '#f7a400'
        }
      }
    }
  },
  plugins: []
} satisfies Config;
