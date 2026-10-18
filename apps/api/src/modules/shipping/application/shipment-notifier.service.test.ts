import { describe, expect, it } from "vitest";
import type {
  ShipmentEmailKind,
  ShipmentEmailOutbox,
  ShipmentEmailRecord,
  ShipmentMailer,
  ShipmentNotice,
} from "./ports.js";
import { ShipmentNotifier, shipmentEmailRetryDelayMs } from "./shipment-notifier.service.js";

const NOW = new Date("2026-10-18T10:00:00Z");

function email(change: Partial<ShipmentEmailRecord> = {}): ShipmentEmailRecord {
  return {
    id: "e1",
    kind: "handed_over",
    accountId: "a1",
    orderReference: "KMD-7F3K9Q",
    attempts: 0,
    shipmentStatus: "in_transit",
    cityName: "Libreville",
    ...change,
  };
}

class FakeOutbox implements ShipmentEmailOutbox {
  claimed: { id: string; nextAt: Date }[] = [];
  sent: string[] = [];
  given: string[] = [];
  claimOk = true;
  constructor(private readonly list: ShipmentEmailRecord[]) {}
  enqueue() {
    return Promise.resolve();
  }
  due() {
    return Promise.resolve(this.list);
  }
  claim(id: string, _now: Date, nextAt: Date) {
    this.claimed.push({ id, nextAt });
    return Promise.resolve(this.claimOk);
  }
  markSent(id: string) {
    this.sent.push(id);
    return Promise.resolve();
  }
  giveUp(id: string) {
    this.given.push(id);
    return Promise.resolve();
  }
}

class FakeMailer implements ShipmentMailer {
  available = true;
  fail = false;
  mails: { to: string; kind: ShipmentEmailKind; notice: ShipmentNotice }[] = [];
  send(to: string, kind: ShipmentEmailKind, notice: ShipmentNotice) {
    if (this.fail) return Promise.reject(new Error("SMTP indisponible"));
    this.mails.push({ to, kind, notice });
    return Promise.resolve();
  }
}

const directory = (emailAddress: string | null) => ({
  contactOf: () => Promise.resolve({ firstName: "Marie", lastName: "Nze", email: emailAddress }),
});

function notifier(list: ShipmentEmailRecord[], address: string | null = "marie@exemple.ga") {
  const outbox = new FakeOutbox(list);
  const mailer = new FakeMailer();
  const service = new ShipmentNotifier(outbox, directory(address), mailer);
  service.clock = () => NOW;
  return { service, outbox, mailer };
}

describe("e-mails de livraison au client (S7-T02)", () => {
  it("« en route » : réservé, envoyé à l'adresse vérifiée, sans motif ni adresse de livraison", async () => {
    const { service, outbox, mailer } = notifier([email()]);
    expect(await service.sendPending()).toBe(1);
    expect(outbox.claimed[0]!.nextAt.getTime() - NOW.getTime()).toBe(60_000);
    expect(outbox.sent).toEqual(["e1"]);
    expect(mailer.mails).toEqual([
      {
        to: "marie@exemple.ga",
        kind: "handed_over",
        notice: { firstName: "Marie", reference: "KMD-7F3K9Q", cityName: "Libreville" },
      },
    ]);
  });

  it("plus d'objet : « en route » d'une commande déjà livrée ou annulée, « livrée » non livrée → abandon", async () => {
    const { service, outbox, mailer } = notifier([
      email({ id: "a", shipmentStatus: "delivered" }),
      email({ id: "b", shipmentStatus: "cancelled" }),
      email({ id: "c", kind: "delivered", shipmentStatus: "in_transit" }),
      email({ id: "d", shipmentStatus: "failed" }),
    ]);
    expect(await service.sendPending()).toBe(1);
    expect(outbox.given).toEqual(["a", "b", "c"]);
    expect(mailer.mails.map((m) => m.kind)).toEqual(["handed_over"]);
  });

  it("client sans adresse vérifiée : abandon, rien n'est réservé", async () => {
    const { service, outbox } = notifier([email()], null);
    expect(await service.sendPending()).toBe(0);
    expect(outbox.given).toEqual(["e1"]);
    expect(outbox.claimed).toEqual([]);
  });

  it("panne d'envoi : réservé (essai suivant plus tard), jamais noté envoyé ; pris par une autre instance : rien", async () => {
    const failing = notifier([email({ attempts: 2 })]);
    failing.mailer.fail = true;
    expect(await failing.service.sendPending()).toBe(0);
    expect(failing.outbox.sent).toEqual([]);
    expect(failing.outbox.claimed[0]!.nextAt.getTime() - NOW.getTime()).toBe(60 * 60_000);

    const taken = notifier([email()]);
    taken.outbox.claimOk = false;
    expect(await taken.service.sendPending()).toBe(0);
    expect(taken.mailer.mails).toEqual([]);
  });

  it("aucun transport d'e-mail : rien n'est lu", async () => {
    const { service, mailer, outbox } = notifier([email()]);
    mailer.available = false;
    expect(await service.sendPending()).toBe(0);
    expect(outbox.claimed).toEqual([]);
  });

  it("délais entre deux essais : 1 min, 10 min, 1 h, 6 h", () => {
    expect([1, 2, 3, 4, 5].map(shipmentEmailRetryDelayMs)).toEqual([
      60_000, 600_000, 3_600_000, 21_600_000, 21_600_000,
    ]);
  });
});
