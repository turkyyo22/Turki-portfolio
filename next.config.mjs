/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,

  images: {
    // Project images are uploaded to imgbb. Next.js resizes and converts them to
    // WebP per screen size instead of sending the original file to every visitor.
    remotePatterns: [new URL("https://i.ibb.co/**")],
    // An imgbb URL never changes its content, so optimized copies can be kept for 31 days.
    minimumCacheTTL: 2678400,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
