// Gate everything except the API behind a simple "under construction" page
// while auth and the storage backend are still being wired up. The real app
// is already deployed underneath this (it's the static build Pages is
// serving), but nobody should land on a working-looking reader that has no
// login and no real backend yet. Remove this file once the app is ready to
// go live for real.
//
// Deliberately self-contained (inline SVG mark, system fonts, no external
// assets) so it can intercept every non-API path without needing to reason
// about which static asset requests to let through.

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Iterverse Reader</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f7f7f8;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #232326;
    padding: 24px;
  }
  .card {
    max-width: 440px;
    text-align: center;
  }
  .mark {
    width: 64px;
    height: 64px;
    margin: 0 auto 28px;
  }
  h1 {
    font-size: 1.5rem;
    margin: 0 0 12px;
    letter-spacing: -0.01em;
  }
  p {
    font-size: 1rem;
    line-height: 1.6;
    color: #56565b;
    margin: 0;
  }
  .tag {
    display: inline-block;
    margin-top: 24px;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #6a6d70;
    border: 1px solid #d7d7d8;
    border-radius: 999px;
    padding: 4px 14px;
  }
</style>
</head>
<body>
  <div class="card">
    <svg class="mark" viewBox="0 0 92 92" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Iterverse mark">
      <polygon points="30,18 62,18 78,46 62,74 30,74 14,46" fill="none" stroke="#d22030" stroke-width="11" stroke-linejoin="miter" />
      <rect x="41.5" y="31" width="9" height="30" fill="#36393b" />
    </svg>
    <h1>Iterverse Reader is under construction</h1>
    <p>We're building the next version of the college's ebook reader. Check back soon.</p>
    <span class="tag">Bridgerland Technical College</span>
  </div>
</body>
</html>`;

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (url.pathname.startsWith("/api/")) {
    return ctx.next();
  }
  // Narrow exception for the LTI launch handoff (see functions/api/lti/launch.ts):
  // the app uses HashRouter, so "/lti/bridge" is never an actual server-side
  // path -- every client route resolves to a request for "/" here, and this
  // query param is the only way to single out just that one redirect. It's
  // server-generated, not something a visitor would stumble into, and letting
  // it through only exposes the app shell, not any real data.
  if (url.searchParams.has("lti_launch")) {
    return ctx.next();
  }
  return new Response(PAGE, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};
