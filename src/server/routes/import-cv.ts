// POST /api/import/cv — multipart { file: PDF | DOCX } or JSON { text } → { profile, notes, provider }.
// Signed-in only (every call costs the operator money), 10 per user per day and a daily cap
// for the instance (CV_IMPORT_DAILY_LIMIT, default 200). Nothing is stored.
import type { APIRoute } from 'astro';
import { cvToProfile } from '../../lib/importers/cv';
import { getSession } from '../auth';
import { CvImportError, cvInput, cvProvider, readCv } from '../cv-import';
import { fail, json, sameOrigin } from '../http';
import { rateLimited } from '../moderation';

export const prerender = false;

let day = '';
let today = 0;
const instanceCapHit = () => {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) { day = d; today = 0; }
  const cap = Number(process.env.CV_IMPORT_DAILY_LIMIT ?? 200);
  return ++today > cap;
};

export const POST: APIRoute = async ({ request }) => {
  if (!cvProvider()) return fail(404, 'CV import is not enabled on this instance');
  if (!sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const session = await getSession(request);
  if (!session) return fail(401, 'Sign in to import a CV');
  if (rateLimited(`cv|${session.user.id}`, 10, 24 * 3600e3)) return fail(429, 'That’s 10 imports today — fill in the rest by hand, or try again tomorrow');
  if (instanceCapHit()) return fail(429, 'CV import is busy today — try again tomorrow');

  try {
    let input;
    if ((request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return fail(400, 'Choose a file');
      input = cvInput({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }, null);
    } else {
      const body = (await request.json().catch(() => ({}))) as { text?: unknown };
      input = cvInput(null, typeof body.text === 'string' ? body.text : null);
    }
    const { draft, provider } = await readCv(input);
    const { profile, notes } = cvToProfile(draft as Parameters<typeof cvToProfile>[0]);
    return json({ profile, notes, provider });
  } catch (e) {
    if (e instanceof CvImportError) return fail(e.status, e.message);
    throw e;
  }
};
