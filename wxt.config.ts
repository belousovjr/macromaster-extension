import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'MacroMaster',
    description: 'Расширение MacroMaster для записи и управления макросами',
    permissions: ['storage', 'tabs'],
  },
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  webExt: {
    disabled: true,
  },
});
