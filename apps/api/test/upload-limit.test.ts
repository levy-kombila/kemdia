import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { isImageUpload, limitConcurrentUploads } from "../src/http/configure-app.js";

const TOKEN = "a".repeat(43);
const upload = (headers: Record<string, string> = {}, url = "/api/v1/vendors/products/p/images") =>
  ({
    method: "POST",
    url,
    headers: { "content-type": "image/jpeg", authorization: `Bearer ${TOKEN}`, ...headers },
  }) as unknown as IncomingMessage;

class FakeResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = "";
  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }
  end(body = "") {
    this.body = body;
  }
}

describe("Envoi de photos : corps lu seulement si utile, et en nombre borné (S6-T04)", () => {
  it("corps binaire lu seulement pour un envoi de photo avec un jeton de session bien formé", () => {
    expect(isImageUpload(upload())).toBe(true);
    expect(isImageUpload(upload({ "content-type": "image/png; charset=x" }))).toBe(true);
    for (const req of [
      upload({ authorization: "" }),
      upload({ authorization: "Bearer x" }),
      upload({ authorization: `Basic ${TOKEN}` }),
      upload({ "content-type": "image/svg+xml" }),
      upload({ "content-type": "application/json" }),
      upload({}, "/api/v1/vendors/products"),
      upload({}, "/api/v1/vendors/products/p/images/x"),
      { ...upload(), method: "PUT" } as IncomingMessage,
    ]) {
      expect(isImageUpload(req)).toBe(false);
    }
  });

  it("au-delà du plafond : 503 sans lire le fichier ; une place libérée resservie", () => {
    const limit = limitConcurrentUploads(2);
    const passed: number[] = [];
    const responses = [0, 1, 2].map(() => new FakeResponse());
    responses.forEach((res, i) =>
      limit(upload(), res as unknown as ServerResponse, () => passed.push(i)),
    );
    expect(passed).toEqual([0, 1]);
    expect(responses[2]!.statusCode).toBe(503);
    expect(responses[2]!.headers["retry-after"]).toBe("5");
    expect(JSON.parse(responses[2]!.body)).toMatchObject({ status: 503 });

    // Les autres requêtes ne sont jamais comptées ni bloquées
    const other = new FakeResponse();
    let otherPassed = false;
    limit(
      upload({ "content-type": "application/json" }),
      other as unknown as ServerResponse,
      () => {
        otherPassed = true;
      },
    );
    expect(otherPassed).toBe(true);

    responses[0]!.emit("close");
    const again = new FakeResponse();
    limit(upload(), again as unknown as ServerResponse, () => passed.push(3));
    expect(passed).toEqual([0, 1, 3]);
  });
});
