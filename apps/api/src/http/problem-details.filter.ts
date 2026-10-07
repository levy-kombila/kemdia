import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { BusinessException } from "./business-exception.js";

/** Réponse d'erreur au format standard « Problem Details » (RFC 9457). */
export interface ProblemDetails {
  type: "about:blank";
  title: string;
  status: number;
  detail?: string;
  /** Code d'erreur métier stable (erreurs prévues des modules, ex. « CODE_INVALIDE ») */
  code?: string;
  requestId?: string;
}

const TITLES: Partial<Record<number, string>> = {
  400: "Requête invalide",
  401: "Authentification requise",
  403: "Accès refusé",
  404: "Ressource introuvable",
  405: "Méthode non autorisée",
  409: "Conflit",
  410: "Ressource expirée",
  413: "Requête trop volumineuse",
  415: "Format non pris en charge",
  423: "Compte bloqué",
  422: "Données invalides",
  429: "Trop de requêtes",
  500: "Erreur interne",
  503: "Service indisponible",
};

/**
 * Transforme toute erreur en réponse JSON uniforme.
 * - Erreurs prévues (HttpException < 500) : le message pensé pour l'utilisateur est renvoyé.
 * - Tout le reste : message générique ; le détail (pile d'appels) va **seulement** dans les journaux.
 *   Leçon de l'ancien site : jamais de trace technique affichée au client.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Erreurs");

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string }>();
    const res = http.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : // Erreurs du lecteur de corps Express (JSON mal formé, corps trop gros) : déjà un statut 4xx
          statusFromBodyParser(exception);

    const problem: ProblemDetails = {
      type: "about:blank",
      title: TITLES[status] ?? (status >= 500 ? "Erreur interne" : "Requête refusée"),
      status,
      requestId: req.id,
    };

    const detail =
      status < 500 || exception instanceof BusinessException
        ? safeDetail(exception, status)
        : undefined;
    if (detail) problem.detail = detail;
    if (exception instanceof BusinessException) {
      problem.code = exception.code;
      if (exception.retryAfterSeconds !== undefined) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil(exception.retryAfterSeconds))));
      }
    }

    if (status >= 500 && !(exception instanceof BusinessException)) {
      this.logger.error(
        { err: exception, requestId: req.id },
        exception instanceof Error ? exception.message : "Erreur inconnue",
      );
    }

    if (res.headersSent) return;
    res.status(status).type("application/problem+json").json(problem);
  }
}

function statusFromBodyParser(exception: unknown): number {
  if (typeof exception === "object" && exception !== null && "type" in exception) {
    const { status, type } = exception as { status?: unknown; type?: unknown };
    if (typeof type === "string" && typeof status === "number" && status >= 400 && status < 500) {
      return status;
    }
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/** Message d'une erreur prévue, sauf les messages automatiques qui recopient l'URL (« Cannot GET /… »). */
function safeDetail(exception: unknown, status: number): string | undefined {
  if (exception instanceof BusinessException) return exception.message;
  if (status === 404 || !(exception instanceof HttpException)) return undefined;
  const body = exception.getResponse();
  const message =
    typeof body === "string" ? body : ((body as { message?: unknown }).message ?? undefined);
  if (Array.isArray(message)) return message.filter((m) => typeof m === "string").join(" ; ");
  return typeof message === "string" ? message : undefined;
}
