import { defineTheme } from '../define';
import './style.css';
export default defineTheme({
  id: 'broadway',
  name: 'Broadway',
  description: 'Opening night: gold marquee lights on theatre velvet.',
  author: { name: 'Starring', url: 'https://github.com/pipozzz/starring' },
  scheme: 'dark',
  tokens: { bg: '#1c0707', fg: '#fff3d6', muted: '#c79e70', line: '#4b1c13', accent: '#ffc93c', accentInk: '#1c0707', redact: '#fff3d6' },
  fonts: { display: 'Limelight', body: 'Josefin Sans:wght@400;600;700', mono: 'Courier Prime:wght@400;700' },
});
