import { defineTheme } from '../define';
import './style.css';
export default defineTheme({
  id: 'paper',
  name: 'Paper',
  description: 'Light, editorial, serif. Reads like a magazine profile of you.',
  author: { name: 'Starring', url: 'https://github.com/pipozzz/starring' },
  scheme: 'light',
  tokens: { bg: '#f4f1ea', fg: '#151412', muted: '#625d54', line: '#d8d2c4', accent: '#c2350f', accentInk: '#ffffff', redact: '#151412' },
  fonts: { display: 'Instrument Serif:ital@0;1', body: 'Inter:wght@400;500;700', mono: 'IBM Plex Mono:wght@400;600' },
});
