// Internal links that work at a domain root and under a GitHub Pages project path (/repo/).
const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');

export const link = (path = '') => BASE + path.replace(/^\//, '');

/** A page URL in its canonical form: always with a trailing slash (what static hosts serve). */
export const pageLink = (path = '') => link(path).replace(/\/?$/, '/');
