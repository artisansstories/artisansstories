// Unit tests never touch a database. Point DATABASE_URL somewhere unroutable so
// that importing src/lib/prisma.ts (which builds a client lazily) can't reach
// the production database even by accident.
process.env.DATABASE_URL = "postgresql://unit-test:unit-test@127.0.0.1:1/unit_test";
process.env.MCP_TOKEN_SECRET = "unit-test-secret-unit-test-secret-0123456789";
process.env.MCP_ENABLED = "true";
process.env.NEXTAUTH_SECRET = "unit-test-nextauth-secret";
// Third-party clients are constructed at module load; give them inert dummies.
process.env.RESEND_API_KEY = "re_unit_test_dummy";
process.env.STRIPE_SECRET_KEY = "sk_test_unit_test_dummy";
process.env.SENDGRID_API_KEY = "SG.unit-test-dummy";
