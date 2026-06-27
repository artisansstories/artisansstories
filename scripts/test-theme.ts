/**
 * test-theme.ts — Theme guardrail validation test (P5)
 *
 * Pure unit checks on src/lib/theme.ts — no DB, no env needed. Asserts that the
 * validator rejects an off-allowlist font and a malformed hex, accepts a valid
 * theme, and that themeToCssVars / radiusToken produce the expected output.
 *
 * Run:  npx tsx scripts/test-theme.ts   → prints THEME_VALIDATION_PASS, exit 0
 */
import {
  validateThemeInput,
  themeToCssVars,
  radiusToken,
  isValidHex,
} from "../src/lib/theme";

function fail(reason: string): never {
  console.log(`THEME_VALIDATION_FAIL: ${reason}`);
  process.exit(1);
}

function assert(cond: boolean, reason: string) {
  if (!cond) fail(reason);
}

// ── 1. Bad font is rejected ──────────────────────────────────────────────────
{
  const r = validateThemeInput({ fontHeading: "Comic Monstrosity" });
  assert(!r.ok, "expected bad font to be rejected");
  assert(
    r.errors.some((e) => e.includes("fontHeading")),
    "expected an error mentioning fontHeading",
  );
}

// ── 2. Bad hex is rejected ───────────────────────────────────────────────────
{
  const r = validateThemeInput({ primaryColor: "#zzz" });
  assert(!r.ok, "expected bad hex to be rejected");
  assert(
    r.errors.some((e) => e.includes("primaryColor")),
    "expected an error mentioning primaryColor",
  );
  assert(!isValidHex("#zzz"), "isValidHex should reject #zzz");
  assert(isValidHex("#1f6feb") && isValidHex("#fff"), "isValidHex should accept valid hex");
}

// ── 3. Unknown field is rejected ─────────────────────────────────────────────
{
  const r = validateThemeInput({ evilField: "drop tables" });
  assert(!r.ok, "expected unknown field to be rejected");
}

// ── 4. Bad asset URL is rejected ─────────────────────────────────────────────
{
  const r = validateThemeInput({ logoUrl: "javascript:alert(1)" });
  assert(!r.ok, "expected javascript: logo url to be rejected");
}

// ── 5. A valid theme is accepted + coerced ───────────────────────────────────
{
  const r = validateThemeInput({
    primaryColor: "#0F4C81",
    secondaryColor: "#1b2a4a",
    accentColor: "#E8B04B",
    fontHeading: "Playfair Display",
    fontBody: "Poppins",
    radius: "lg",
    logoUrl: "https://cdn.example.com/logo.png",
    faviconUrl: "/favicon.ico",
  });
  assert(r.ok, `expected valid theme to be accepted, got: ${r.errors.join("; ")}`);
  assert(r.value.primaryColor === "#0f4c81", "primaryColor should be lowercased/coerced");
  assert(r.value.fontHeading === "Playfair Display", "fontHeading should pass through");
  assert(r.value.radius === "lg", "radius should pass through");
  assert(r.value.logoUrl === "https://cdn.example.com/logo.png", "logoUrl should pass through");

  const vars = themeToCssVars(r.value);
  assert(vars["--brand-primary"] === "#0f4c81", "css var --brand-primary mismatch");
  assert(vars["--brand-radius"] === "16px", "lg radius should map to 16px");
  assert(typeof vars["--brand-on-primary"] === "string", "expected --brand-on-primary contrast color");
}

// ── 6. radiusToken mapping ───────────────────────────────────────────────────
{
  assert(radiusToken("none") === "0px", "none → 0px");
  assert(radiusToken("sm") === "4px", "sm → 4px");
  assert(radiusToken("md") === "8px", "md → 8px");
  assert(radiusToken("lg") === "16px", "lg → 16px");
}

console.log("THEME_VALIDATION_PASS");
