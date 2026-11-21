import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

// Store tracking (GA4 / Meta Pixel) must never load in the back office: no
// admin or platform file may render it, and it is not in the root layout
// (which wraps admin). Vercel Analytics drops admin/platform page views.

const root = path.resolve(__dirname, "../..");
const TRACKING = /StoreAnalytics|googletagmanager|fbevents|gtag\(|fbq\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(name) ? [p] : [];
  });
}

describe("admin pages never render store tracking", () => {
  for (const dir of ["src/app/admin", "src/app/platform", "src/components/admin"]) {
    it(`${dir} has no tracking`, () => {
      let all: string[] = [];
      try {
        all = files(path.join(root, dir));
      } catch {
        return; // directory absent
      }
      const offenders = all.filter((f) => TRACKING.test(readFileSync(f, "utf8")));
      expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
    });
  }

  it("the root layout does not load store tracking", () => {
    expect(readFileSync(path.join(root, "src/app/layout.tsx"), "utf8")).not.toMatch(TRACKING);
  });

  it("only storefront layouts mount StoreAnalytics", () => {
    const users = files(path.join(root, "src"))
      .filter((f) => /<StoreAnalytics[\s/]/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f))
      .sort();
    expect(users).toEqual(
      [
        "src/app/account/layout.tsx",
        "src/app/cart/layout.tsx",
        "src/app/checkout/layout.tsx",
        "src/app/shop/layout.tsx",
        "src/app/t/[tenantSlug]/layout.tsx",
        "src/components/StoreNoticeLayout.tsx",
      ].sort(),
    );
  });
});
