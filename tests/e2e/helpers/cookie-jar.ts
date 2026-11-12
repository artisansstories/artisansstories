/**
 * The test "browser": cookies and request headers served by the mocked
 * next/headers. Deliberately imports nothing from the app (the next/headers
 * mock factory loads this module, and app modules import next/headers).
 */
const jar = new Map<string, string>();

export const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
  has: (name: string) => jar.has(name),
  set: (name: string | { name: string; value: string }, value?: string) => {
    if (typeof name === "object") jar.set(name.name, name.value);
    else jar.set(name, value ?? "");
  },
  delete: (name: string) => {
    jar.delete(name);
  },
};

export function clearJar(): void {
  jar.clear();
}

export function jarValue(name: string): string | undefined {
  return jar.get(name);
}

let currentHeaders = new Headers({ host: "artisansstories.com" });
export function headerStore(): Headers {
  return currentHeaders;
}
export function setRequestHost(host: string): void {
  currentHeaders = new Headers({ host });
}
export function resetHeaders(): void {
  currentHeaders = new Headers({ host: "artisansstories.com" });
}
