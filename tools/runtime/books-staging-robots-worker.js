const STAGING_ROBOTS_TXT = `User-agent: facebookexternalhit
Disallow:
Allow: /

User-agent: Facebot
Disallow:
Allow: /

User-agent: meta-externalagent
Disallow:
Allow: /

User-agent: *
Disallow:
Allow: /

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
