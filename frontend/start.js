import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname);

const vite = join(__dirname, 'node_modules', '.bin', 'vite');
const port = process.env.PORT || '5173';
const child = spawn(process.execPath, [vite, '--port', port], {
  stdio: 'inherit',
  cwd: __dirname,
  env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` }
});
child.on('exit', (code) => process.exit(code));
