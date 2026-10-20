import { defineTheme } from '../define';

export default defineTheme({
  id: 'blood',
  name: 'Blood',
  description: 'Same stage, red light. For people whose commits come with sirens.',
  author: { name: 'Starring', url: 'https://github.com/pipozzz/starring' },
  scheme: 'dark',
  tokens: { bg: '#0a0a0a', fg: '#f2f0e9', muted: '#8a877e', line: '#2a2926', accent: '#ff2d2d', accentInk: '#0a0a0a', redact: '#f2f0e9' },
  fonts: { display: 'Anton', body: 'Space Grotesk:wght@400;500;700', mono: 'JetBrains Mono:wght@400;600' },
});
