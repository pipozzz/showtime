// Handles that would let someone pose as a company, a platform or the instance staff.
// Exact names and anything containing a "staff" word. Extend with BLOCKED_HANDLES
// (comma-separated); ADMIN_EMAILS may still claim them (e.g. for a real company page).
const BRANDS = [
  'google', 'alphabet', 'youtube', 'gmail', 'apple', 'icloud', 'microsoft', 'azure', 'github', 'gitlab', 'bitbucket',
  'atlassian', 'linkedin', 'meta', 'facebook', 'instagram', 'whatsapp', 'twitter', 'x-corp', 'openai', 'anthropic',
  'claude', 'chatgpt', 'amazon', 'aws', 'netflix', 'spotify', 'tesla', 'nvidia', 'intel', 'amd', 'ibm', 'oracle',
  'salesforce', 'adobe', 'stripe', 'paypal', 'visa', 'mastercard', 'uber', 'airbnb', 'shopify', 'slack', 'discord',
  'telegram', 'tiktok', 'bytedance', 'samsung', 'sony', 'disney', 'warnerbros', 'warner-bros', 'hbo', 'paramount',
  'economist', 'the-economist', 'nytimes', 'bbc', 'cnn', 'reuters', 'bloomberg', 'vercel', 'netlify', 'cloudflare',
  'docker', 'kubernetes', 'mozilla', 'firefox', 'wikipedia', 'reddit', 'dropbox', 'zoom', 'figma', 'notion',
];
const STAFF_WORDS = ['admin', 'administrator', 'support', 'official', 'staff', 'moderator', 'security', 'starring', 'abuse', 'postmaster', 'billing', 'root', 'system', 'noreply', 'no-reply'];

const extra = () => (process.env.BLOCKED_HANDLES ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
export const adminEmails = () => (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
export const isAdmin = (email?: string | null) => !!email && adminEmails().includes(email.toLowerCase());

/** Why a handle is blocked for impersonation reasons, or null. */
export function blockedReason(handle: string): string | null {
  const h = handle.toLowerCase();
  if (BRANDS.includes(h) || extra().includes(h)) return 'This name belongs to a company or brand — ask the operator if it’s yours';
  if (STAFF_WORDS.some((w) => h === w || h.split('-').includes(w))) return 'This handle looks official — pick another';
  return null;
}
