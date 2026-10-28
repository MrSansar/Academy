import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the build works at https://<user>.github.io/<repo>/ without
  // hard-coding the repo name. Routes are hash-based (#/lesson/...), so GitHub Pages never
  // has to serve a deep link.
  base: './',
  plugins: [react()],
})
