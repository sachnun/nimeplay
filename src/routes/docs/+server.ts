import { openApiDocument } from '#lib/server/utils/openapi'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = () => {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nimeplay API</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger"></div>
    <script type="application/json" id="openapi-spec">${JSON.stringify(openApiDocument).replace(/</g, '\\u003c')}</script>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.addEventListener('DOMContentLoaded', function () {
        var spec = JSON.parse(document.getElementById('openapi-spec').textContent);
        window.SwaggerUIBundle({ spec: spec, dom_id: '#swagger' });
      });
    </script>
  </body>
</html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
