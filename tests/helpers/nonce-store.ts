/**
 * In-memory stand-in for prisma.mcpNonce with the one property that matters:
 * a second create() with the same id rejects with Prisma's P2002, even when
 * two creates race (the check-and-set happens after an await, like a real
 * round trip).
 */
export function makeNonceStore() {
  const rows = new Map<string, Record<string, unknown>>();
  let failNext: Error | null = null;
  const mcpNonce = {
    create: async ({ data }: { data: { id: string } & Record<string, unknown> }) => {
      await new Promise((r) => setTimeout(r, 1));
      if (failNext) {
        const e = failNext;
        failNext = null;
        throw e;
      }
      if (rows.has(data.id)) {
        throw Object.assign(new Error("Unique constraint failed on the fields: (`id`)"), { code: "P2002" });
      }
      rows.set(data.id, data);
      return data;
    },
    deleteMany: async () => ({ count: 0 }),
  };
  return {
    mcpNonce,
    rows,
    failNextWith(err: Error) {
      failNext = err;
    },
    reset() {
      rows.clear();
      failNext = null;
    },
  };
}
