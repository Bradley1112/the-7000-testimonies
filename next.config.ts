import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up past the repo and picks up the
  // package-lock.json in the parent directory, then warns about it.
  turbopack: { root: __dirname },

  images: {
    // The scene art is SVG we generate ourselves from scripts/pixel-art — it is
    // not user-supplied, so the usual argument against allowing SVG through the
    // image optimiser (embedded scripts from untrusted sources) does not apply.
    // The CSP below is belt-and-braces in case that ever stops being true.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
