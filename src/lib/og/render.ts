// Render a poster element to PNG: satori (JSX → SVG) + resvg (SVG → PNG).
// Fonts come from @fontsource packages (OFL), so no network is needed at build or runtime.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import type { ReactNode } from 'react';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const font = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`));

type Font = { name: string; data: Buffer; weight: 400 | 500 | 700; style: 'normal' };
let fonts: Font[] | undefined;
const loadFonts = (): Font[] =>
  (fonts ??= [
    // latin-ext (č, ő, ł, …) is registered as a separate family; posters list it as a fallback
    ...(['latin', 'latin-ext'] as const).flatMap((sub) => {
      const x = sub === 'latin' ? '' : ' Ext';
      return [
        { name: `Anton${x}`, data: font('@fontsource/anton', `anton-${sub}-400-normal.woff`), weight: 400 as const, style: 'normal' as const },
        { name: `Space Grotesk${x}`, data: font('@fontsource/space-grotesk', `space-grotesk-${sub}-500-normal.woff`), weight: 500 as const, style: 'normal' as const },
        { name: `Space Grotesk${x}`, data: font('@fontsource/space-grotesk', `space-grotesk-${sub}-700-normal.woff`), weight: 700 as const, style: 'normal' as const },
        { name: `JetBrains Mono${x}`, data: font('@fontsource/jetbrains-mono', `jetbrains-mono-${sub}-400-normal.woff`), weight: 400 as const, style: 'normal' as const },
      ];
    }),
  ]);

export async function renderPng(node: ReactNode) {
  const svg = await satori(node, { width: 1200, height: 630, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

export const pngResponse = (png: Uint8Array, maxAge = 3600) =>
  new Response(png as unknown as BodyInit, { headers: { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=86400` } });
