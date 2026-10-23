import { describe, expect, it } from "vitest";
import { NO_REQUEST } from "../../audit/index.js";
import type { ProblemReport } from "../domain/problem-report.js";
import type { ProblemCursor, ProblemRepository } from "./ports.js";
import { ProblemService } from "./problem.service.js";

const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const STAFF = "33333333-3333-4333-8333-333333333333";

class InMemoryProblems implements ProblemRepository {
  readonly rows = new Map<string, ProblemReport>();
  create(report: ProblemReport) {
    this.rows.set(report.id, { ...report });
    return Promise.resolve();
  }
  findById(id: string) {
    const row = this.rows.get(id);
    return Promise.resolve(row ? { ...row } : null);
  }
  saveIfUnchanged(report: ProblemReport, version: Date) {
    const row = this.rows.get(report.id);
    if (!row || row.updatedAt.getTime() !== version.getTime()) return Promise.resolve(false);
    this.rows.set(report.id, { ...report });
    return Promise.resolve(true);
  }
  countOpen(accountId: string) {
    return Promise.resolve(
      [...this.rows.values()].filter((r) => r.accountId === accountId && r.status !== "resolved")
        .length,
    );
  }
  list(query: { status: ProblemReport["status"]; limit: number; after?: ProblemCursor }) {
    const items = [...this.rows.values()].filter((r) => r.status === query.status);
    return Promise.resolve({ items: items.slice(0, query.limit), next: null });
  }
  ofAccount(accountId: string) {
    return Promise.resolve([...this.rows.values()].filter((r) => r.accountId === accountId));
  }
  deleteOfAccount(accountId: string) {
    const ids = [...this.rows.values()].filter((r) => r.accountId === accountId).map((r) => r.id);
    ids.forEach((id) => this.rows.delete(id));
    return Promise.resolve(ids.length);
  }
  purgeResolvedBefore() {
    return Promise.resolve(0);
  }
}

function setup() {
  const problems = new InMemoryProblems();
  const audit: { entries: unknown[]; record(e: unknown): Promise<void> } = {
    entries: [],
    record(e) {
      this.entries.push(e);
      return Promise.resolve();
    },
  };
  let n = 0;
  let now = new Date("2026-10-24T09:00:00Z");
  const service = new ProblemService(
    problems,
    { run: (work) => work() },
    { uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` },
    {
      contactOf: (id) =>
        Promise.resolve(
          id === ACCOUNT ? { firstName: "Awa", lastName: "Ndong", email: "awa@exemple.ga" } : null,
        ),
    },
    audit,
  );
  service.clock = () => now;
  const tick = () => (now = new Date(now.getTime() + 1000));
  return { service, problems, audit, tick };
}

describe("Signaler un problème (S8-T02)", () => {
  it("enregistre le signalement et le montre au service client avec de quoi répondre", async () => {
    const { service } = setup();
    await service.report(
      ACCOUNT,
      {
        category: "payment",
        message: "Le paiement Airtel tourne sans fin.",
        page: "/commande?x=1",
      },
      "Chrome sur Android",
    );
    const queue = await service.queue({ status: "new", limit: 30 });
    expect(queue.items).toEqual([
      {
        report: expect.objectContaining({
          category: "payment",
          page: "/commande",
          device: "Chrome sur Android",
        }),
        reporter: { name: "Awa Ndong", email: "awa@exemple.ga" },
      },
    ]);
  });

  it("20 signalements non résolus au plus par compte", async () => {
    const { service } = setup();
    for (let i = 0; i < 20; i++) {
      await service.report(ACCOUNT, { category: "bug", message: `Problème numéro ${i} ici` }, null);
    }
    await expect(
      service.report(ACCOUNT, { category: "bug", message: "Un de trop pour aujourd'hui" }, null),
    ).rejects.toMatchObject({ code: "TROP_DE_SIGNALEMENTS" });
  });

  it("changer d'état : journalisé ; refusé si un collègue l'a changé depuis la lecture", async () => {
    const { service, audit, tick } = setup();
    const report = await service.report(
      ACCOUNT,
      { category: "bug", message: "Rien ne s'affiche ici." },
      null,
    );
    tick();
    const done = await service.setStatus(
      STAFF,
      report.id,
      "in_progress",
      report.updatedAt,
      NO_REQUEST,
    );
    expect(done.report).toMatchObject({ status: "in_progress", handledBy: STAFF });
    expect(audit.entries).toEqual([
      expect.objectContaining({
        action: "problem.updated",
        details: { from: "new", to: "in_progress" },
      }),
    ]);
    await expect(
      service.setStatus(STAFF, report.id, "resolved", report.updatedAt, NO_REQUEST),
    ).rejects.toMatchObject({ code: "SIGNALEMENT_MODIFIE" });
    await expect(
      service.setStatus(
        STAFF,
        "44444444-4444-4444-8444-444444444444",
        "resolved",
        report.updatedAt,
        NO_REQUEST,
      ),
    ).rejects.toMatchObject({ code: "SIGNALEMENT_INTROUVABLE" });
  });
});
