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
<title>Bindo</title>
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
    width: 72px;
    height: 72px;
    margin: 0 auto 28px;
    color: #d22030;
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
    <svg class="mark" viewBox="55 5 85 80" xmlns="http://www.w3.org/2000/svg" fill="currentColor" role="img" aria-label="BTECH mark">
      <path d="M87.8,48.5h0s0,0,0,.1c0,5.8,4.7,10.6,10.6,10.6s10.6-4.7,10.6-10.6-4.7-10.6-10.6-10.6h-5.9v-11.7h5.9c7.9,0,14.8,4.1,18.7,10.3l14.5-8.4c-.9-1.4-2.1-2.5-3.3-3.2l-24.6-14.2c-3-1.7-7.8-1.7-10.8,0l-3.1,1.8-2-4.9v40.9Z" />
      <path d="M132.6,29.9l-14.5,8.4c1.6,3.1,2.6,6.6,2.6,10.4,0,12.3-10,22.3-22.3,22.3s-14.9-4.2-18.9-10.4l-14.4,8.3c.9,1.4,2.1,2.5,3.3,3.2l24.6,14.2c3,1.7,7.8,1.7,10.8,0l24.6-14.2c3-1.7,5.4-5.9,5.4-9.4v-28.4c0-1.4-.4-3-1.2-4.5Z" />
      <path d="M76.1,48.7V16.6l-2.2,5.2-5.5,3.2c-3,1.7-5.4,5.9-5.4,9.4v28.4c0,1.4.4,3,1.2,4.5l14.4-8.3c-1.6-3.1-2.5-6.5-2.5-10.2Z" />
    </svg>
    <h1>Bindo is under construction</h1>
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
