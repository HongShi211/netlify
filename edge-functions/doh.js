/**
 * Netlify Edge Function wrapper.
 * Env vars: DOH, TOKEN, PATH (optional)
 * Deploy:
 *   - Put this file at netlify/edge-functions/doh.js
 *   - Ensure netlify.toml declares the [[edge_functions]] paths
 *   - Add env vars in Netlify dashboard (make sure scope includes Functions)
 */
import { handleRequest } from "../shared/handler.js";

export default async (request, context) => {
  const platform = {
    name: "netlify",
    getEnv: (k) => (typeof Netlify !== "undefined" && Netlify.env && Netlify.env.get ? Netlify.env.get(k) : undefined),
    getClientIP: (req) => {
      // Netlify Edge: use context.ip when available
      try {
        return (context && context.ip) || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      } catch (_) { return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(); }
    },
  };
  return handleRequest(request, platform);
};

export const config = { path: "/*" }; // run for all paths; narrowed via netlify.toml
