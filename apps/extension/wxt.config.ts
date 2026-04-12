import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'NoBug — Bug Capture',
    description: 'Capture bugs with recording, console logs, network requests, and screenshots.',
    permissions: ['activeTab', 'storage'],
  },
});
