import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

const repositoryBase = '/Th-o/';

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? repositoryBase : '/',
  plugins: [react()],
}));
