import type { MetadataRoute } from "next";

// Staff-only site: ask every crawler to stay out entirely. (The pages also send `noindex`, see
// layout.tsx -- robots.txt alone only asks crawlers not to visit, it does not stop a linked page from
// being listed.)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
