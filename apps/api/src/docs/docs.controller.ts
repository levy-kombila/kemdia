import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { buildOpenApiDocument } from "./openapi.js";

const UI_DIR = dirname(
  createRequire(import.meta.url).resolve("swagger-ui-dist/swagger-ui-bundle.js"),
);

/**
 * Politique de sécurité de la page de documentation, plus souple que celle de l'API (qui interdit tout) :
 * scripts et styles servis par l'API elle-même uniquement — aucun CDN, aucun script tiers.
 * (Swagger UI pose des attributs `style`, d'où 'unsafe-inline' pour les styles seulement.)
 */
export const DOCS_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const INIT_SCRIPT = `window.addEventListener("load", function () {
  window.ui = SwaggerUIBundle({
    url: "/api/v1/openapi.json",
    dom_id: "#swagger-ui",
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis],
    layout: "BaseLayout",
    supportedSubmitMethods: ["get", "post"],
    defaultModelsExpandDepth: 0
  });
});
`;

const PAGE = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>API Kemdia — documentation</title>
  <link rel="stylesheet" href="/api/docs/assets/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/docs/assets/swagger-ui-bundle.js"></script>
  <script src="/api/docs/assets/init.js"></script>
</body>
</html>
`;

/** Liste fermée des fichiers servis : rien d'autre du paquet n'est exposé. */
const ASSETS: Record<string, { type: string; body: string }> = {
  "swagger-ui.css": {
    type: "text/css; charset=utf-8",
    body: readFileSync(join(UI_DIR, "swagger-ui.css"), "utf8"),
  },
  "swagger-ui-bundle.js": {
    type: "text/javascript; charset=utf-8",
    body: readFileSync(join(UI_DIR, "swagger-ui-bundle.js"), "utf8").replace(
      /\n\/\/# sourceMappingURL=.*$/m,
      "",
    ),
  },
  "init.js": { type: "text/javascript; charset=utf-8", body: INIT_SCRIPT },
};

/** Documentation : description OpenAPI (JSON) et page interactive. Activée par API_DOCS. */
@Controller({ version: VERSION_NEUTRAL })
@SkipThrottle()
export class DocsController {
  private readonly document = buildOpenApiDocument();

  @Get("v1/openapi.json")
  @Header("Cache-Control", "public, max-age=300")
  openapi() {
    return this.document;
  }

  @Get("docs")
  @Header("Cache-Control", "no-cache")
  page(@Res({ passthrough: true }) res: Response): string {
    res.setHeader("Content-Security-Policy", DOCS_CSP);
    res.type("html");
    return PAGE;
  }

  @Get("docs/assets/:file")
  @Header("Cache-Control", "public, max-age=86400")
  asset(@Param("file") file: string, @Res({ passthrough: true }) res: Response): string {
    const asset = Object.hasOwn(ASSETS, file) ? ASSETS[file] : undefined;
    if (!asset) throw new NotFoundException();
    res.setHeader("Content-Security-Policy", DOCS_CSP);
    res.type(asset.type);
    return asset.body;
  }
}
