import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentAccount: () => Promise.resolve({ status: "guest" }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({ authClient: {} }));

const { default: LoginPage } = await import("./page");
const { LOGGED_OUT_EVERYWHERE } = await import("@/lib/auth/messages");

type Props = Parameters<typeof LoginPage>[0];
const noticeFor = async (deconnecte: string) => {
  const page = (await LoginPage({
    searchParams: Promise.resolve({ deconnecte }),
  } as Props)) as { props: { children: { props: { notice: unknown } } } };
  return page.props.children.props.notice;
};

describe("page de connexion", () => {
  it("avis « déconnecté de tous vos appareils » seulement pour la valeur prévue", async () => {
    expect(await noticeFor("tous")).toBe(LOGGED_OUT_EVERYWHERE);
    // Un lien piégé (?deconnecte=toString, __proto__…) ne doit rien transmettre au formulaire
    for (const value of ["toString", "__proto__", "constructor", "autre"])
      expect(await noticeFor(value)).toBeNull();
  });
});
