declare namespace App {
  interface Locals {
    /** Set by the middleware when the request came in on a verified custom domain (CUSTOM_DOMAINS=true). */
    customDomain?: string;
  }
}
