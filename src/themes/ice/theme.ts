import { defineTheme } from '../define';

export default defineTheme({
  id: 'ice',
  name: 'Ice',
  description: 'Cold cyan on black. Calm, precise, slightly dangerous.',
  author: { name: 'Starring', url: 'https://github.com/pipozzz/starring' },
  scheme: 'dark',
  tokens: { bg: '#0a0a0a', fg: '#f2f0e9', muted: '#8a877e', line: '#2a2926', accent: '#5ce1ff', accentInk: '#0a0a0a', redact: '#f2f0e9' },
  fonts: { display: 'Anton', body: 'Space Grotesk:wght@400;500;700', mono: 'JetBrains Mono:wght@400;600' },
});
