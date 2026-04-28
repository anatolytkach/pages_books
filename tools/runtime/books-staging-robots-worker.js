const STAGING_ROBOTS_TXT = `User-agent: facebookexternalhit
Allow: /s/
Allow: /books/content/

User-agent: Facebot
Allow: /s/
Allow: /books/content/

User-agent: meta-externalagent
Allow: /s/
Allow: /books/content/

User-agent: *
Allow: /book/
Allow: /author/
Allow: /category/
Allow: /sitemap.xml
Allow: /sitemaps/
Disallow: /books/reader/
Disallow: /books/api/

Sitemap: https://books-staging.reader.pub/sitemap.xml
`;

export default {
  fetch() {
    return new Response(STAGING_ROBOTS_TXT, {
      headers: {
        "cache-control": "public, max-age=300, s-maxage=600",
        "content-type": "text/plain; charset=utf-8",
        "x-reader-route": "staging-robots",
        "x-reader-worker": "1",
      },
    });
  },
};
