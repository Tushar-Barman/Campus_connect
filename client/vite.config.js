import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = path.dirname(fileURLToPath(import.meta.url));

// Components import the real-time layer as '@p3/lib/socket.js' and '@p3/hooks/<hook>.js'.
//  - P3's real files (src/lib/socket.js + src/hooks/*) are used when they exist and mocks are off.
//  - Otherwise P2's stand-ins (src/p3-standins/*, same signatures) are used, so the UI runs in mock mode
//    and before P3's code is merged. Force stand-ins with VITE_P3_STANDINS=true.
function realtimeRoot(env) {
  const p3Merged =
    fs.existsSync(path.join(here, 'src/lib/socket.js')) && fs.existsSync(path.join(here, 'src/hooks/useMessages.js'));
  const useStandins = env.VITE_USE_MOCKS === 'true' || env.VITE_P3_STANDINS === 'true' || !p3Merged;
  return { dir: useStandins ? 'src/p3-standins' : 'src', label: useStandins ? "P2 stand-ins (src/p3-standins)" : "P3's hooks (src/hooks)" };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, '');
  const root = realtimeRoot(env);
  console.log(`[campusconnect] real-time layer: ${root.label}`);
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@p3': path.join(here, root.dir) } },
    server: { port: 5173 },
  };
});
