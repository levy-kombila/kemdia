import { Controller, Header, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import type { CatalogImportReport } from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { CatalogImportService } from "../application/catalog-import.service.js";
import { VendorsError } from "../domain/vendors-error.js";
import { withVendorsErrors } from "./vendors-http-errors.js";

/** Corps : le fichier CSV, lu en texte par le parseur dédié (configure-app.ts, `isCatalogImport`). */
function csvOf(req: Request): string {
  const body: unknown = req.body;
  if (typeof body !== "string" || body.trim() === "") {
    throw new VendorsError(
      "FICHIER_IMPORT_INVALIDE",
      "envoyez le fichier CSV lui-même (en-tête Content-Type text/csv, texte UTF-8, 2 Mo au plus)",
    );
  }
  return body;
}

/**
 * Import du vrai catalogue (`/api/v1/admin/catalog-import`, S8-T03, ADR-0058) : équipe Catalogue avec la double
 * authentification. `check` vérifie sans rien écrire ; l'import revérifie puis écrit tout ou rien.
 */
@Controller("admin/catalog-import")
@Authorize("catalog", { secondFactor: true })
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@AccountRateLimit(10)
export class CatalogImportController {
  constructor(private readonly imports: CatalogImportService) {}

  @Post("check")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  check(@Req() req: Request): Promise<CatalogImportReport> {
    return withVendorsErrors(() => this.imports.check(csvOf(req)));
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  run(
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ): Promise<CatalogImportReport> {
    return withVendorsErrors(() =>
      this.imports.import(session.account.id, csvOf(req), auditContextOf(req)),
    );
  }
}
