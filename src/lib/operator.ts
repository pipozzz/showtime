// Who runs this instance — shown on /terms and /privacy. Read at build time for static
// sites and at runtime in server mode, so one image works for any operator.
export const operator = () => ({
  name: process.env.OPERATOR_NAME?.trim() || '',
  email: process.env.OPERATOR_EMAIL?.trim() || '',
  address: process.env.OPERATOR_ADDRESS?.trim() || '',
  country: process.env.OPERATOR_COUNTRY?.trim() || '',
  updated: process.env.LEGAL_UPDATED?.trim() || '2026-10-20',
});
