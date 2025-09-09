import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


// https://vite.dev/config/
export default defineConfig({
    // Use relative assets so the app works on GitHub Pages project sites
    base: './',
    plugins: [react(), tailwindcss()],
})
