import { defineTheme } from '../define';
import './style.css';
export default defineTheme({
  id: 'vhs',
  name: 'VHS',
  description: 'Rewind to 1989: magenta glow, chromatic edges, scanlines.',
  author: { name: 'Starring', url: 'https://github.com/pipozzz/starring' },
  scheme: 'dark',
  tokens: { bg: '#130a20', fg: '#f6eaff', muted: '#9c88b8', line: '#2f2049', accent: '#ff3ec8', accentInk: '#130a20', redact: '#f6eaff' },
  fonts: { display: 'Bungee', body: 'Space Grotesk:wght@400;500;700', mono: 'VT323' },
});
