import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import {
  ProblemReportIdParamsSchema,
  ProblemReportListParamsSchema,
  ProblemReportRequestSchema,
  ProblemReportStatusRequestSchema,
  type AdminProblemReport,
  type AdminProblemReportPage,
  type ProblemReportListParams,
  type ProblemReportReceipt,
  type ProblemReportRequest,
  type ProblemReportStatusRequest,
} from "@kemdia/contracts";
import { auditContextOf } from "../../audit/index.js";
import {
  AccountRateLimit,
  Authorize,
  CurrentSession,
  SessionGuard,
  describeDevice,
  type AuthenticatedSession,
} from "../../identity/index.js";
import { ProblemService, type Reporter } from "../application/problem.service.js";
import type { ProblemCursor } from "../application/ports.js";
import type { ProblemReport } from "../domain/problem-report.js";
import { withFeedbackErrors } from "./feedback-http-errors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function presentProblem(
  report: ProblemReport,
  reporter: Reporter | null,
): AdminProblemReport {
  return {
    id: report.id,
    category: report.category,
    message: report.message,
    page: report.page,
    device: report.device,
    status: report.status,
    reporter,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

export function encodeProblemCursor(cursor: ProblemCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString(
    "base64url",
  );
}

export function decodeProblemCursor(raw: string): ProblemCursor | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 2) return undefined;
    const [date, id] = value as unknown[];
    if (typeof date !== "string" || typeof id !== "string" || !UUID.test(id)) return undefined;
    const createdAt = new Date(date);
    return Number.isNaN(createdAt.getTime()) ? undefined : { createdAt, id };
  } catch {
    return undefined;
  }
}

/** « Signaler un problème » (`/api/v1/feedback/problems`, S8-T02) : compte connecté, 5 par minute. */
@Controller("feedback/problems")
export class ProblemController {
  constructor(private readonly problems: ProblemService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  @AccountRateLimit(5)
  async report(
    @CurrentSession() session: AuthenticatedSession,
    @Body({ schema: ProblemReportRequestSchema }) body: ProblemReportRequest,
    @Headers("x-kemdia-user-agent") userAgent?: string,
  ): Promise<ProblemReportReceipt> {
    // Appareil choisi dans des listes fixes : rien de ce que le navigateur envoie n'est recopié
    const device = userAgent ? describeDevice(userAgent) : null;
    const report = await withFeedbackErrors(() =>
      this.problems.report(session.account.id, body, device),
    );
    return { id: report.id, createdAt: report.createdAt.toISOString() };
  }
}

/** Signalements à suivre (`/api/v1/admin/problems`) : service client, avec la double authentification. */
@Controller("admin/problems")
@Authorize("support", { secondFactor: true })
export class AdminProblemController {
  constructor(private readonly problems: ProblemService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @Query({ schema: ProblemReportListParamsSchema }) query: ProblemReportListParams,
  ): Promise<AdminProblemReportPage> {
    const page = await this.problems.queue({
      status: query.status,
      limit: query.limit,
      after: query.after ? decodeProblemCursor(query.after) : undefined,
    });
    return {
      items: page.items.map(({ report, reporter }) => presentProblem(report, reporter)),
      nextCursor: page.next ? encodeProblemCursor(page.next) : null,
    };
  }

  @Post(":problemId/status")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async setStatus(
    @CurrentSession() session: AuthenticatedSession,
    @Param({ schema: ProblemReportIdParamsSchema }) params: { problemId: string },
    @Body({ schema: ProblemReportStatusRequestSchema }) body: ProblemReportStatusRequest,
    @Req() req: Request,
  ): Promise<AdminProblemReport> {
    const { report, reporter } = await withFeedbackErrors(() =>
      this.problems.setStatus(
        session.account.id,
        params.problemId,
        body.status,
        new Date(body.version),
        auditContextOf(req),
      ),
    );
    return presentProblem(report, reporter);
  }
}
