/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        macOS: {
          bg: '#f5f5f7',
          sidebar: 'rgba(245, 245, 247, 0.8)',
          glass: 'rgba(255, 255, 255, 0.65)',
          border: 'rgba(0, 0, 0, 0.05)',
          accent: '#007AFF',
          danger: '#FF3B30',
          success: '#34C759',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

