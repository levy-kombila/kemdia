import { describe, expect, it } from "vitest";
import type { Email, MailTransport } from "../../../mail/mail-transport.js";
import { MailShipmentMailer } from "./shipment-mailer.js";

class Capture implements MailTransport {
  readonly name = "capture";
  emails: Email[] = [];
  send(email: Email) {
    this.emails.push(email);
    return Promise.resolve();
  }
}

describe("e-mails de livraison (contenu)", () => {
  it("« en route » : commande et ville ; prénom nettoyé et échappé en HTML", async () => {
    const capture = new Capture();
    await new MailShipmentMailer(capture).send("marie@exemple.ga", "handed_over", {
      firstName: "<b>Marie</b>\u0000\n",
      reference: "KMD-7F3K9Q",
      cityName: "Port-Gentil",
    });
    const [mail] = capture.emails;
    expect(mail!.subject).toBe("Votre commande KMD-7F3K9Q est en route");
    expect(mail!.text).toContain("en route vers Port-Gentil");
    expect(mail!.text.split("\n")[0]).toBe("<b>Marie</b>,");
    expect(mail!.html).toContain("&lt;b&gt;Marie&lt;/b&gt;,");
    expect(mail!.html).not.toContain("<b>");
    expect(mail!.tag).toBe("kemdia-livraisons");
  });

  it("« livrée » ; sans transport : erreur", async () => {
    const capture = new Capture();
    await new MailShipmentMailer(capture).send("marie@exemple.ga", "delivered", {
      firstName: "Marie",
      reference: "KMD-7F3K9Q",
      cityName: "Libreville",
    });
    expect(capture.emails[0]!.subject).toBe("Votre commande KMD-7F3K9Q a été livrée");
    const none = new MailShipmentMailer(null);
    expect(none.available).toBe(false);
    await expect(
      none.send("x@exemple.ga", "delivered", {
        firstName: "",
        reference: "KMD-7F3K9Q",
        cityName: "",
      }),
    ).rejects.toThrow();
  });
});
