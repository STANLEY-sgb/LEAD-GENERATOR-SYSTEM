# LeadPilot - AI-powered multi-tenant lead generation SaaS

Next.js 16 · TypeScript · Supabase (Postgres, Auth, RLS) · Tailwind · Recharts · Stripe · OpenAI/Anthropic.

- Setup & deployment: [docs/SETUP.md](docs/SETUP.md)
- Architecture, decisions, checklist: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Security notes: [docs/SECURITY.md](docs/SECURITY.md) · HTTP API: [docs/openapi.yaml](docs/openapi.yaml)

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys (see docs/SETUP.md)
npm run dev                  # http://localhost:3000, check /api/health
npm test                     # unit + real-Postgres (PGlite) RLS/ingestion/queue tests
npm run typecheck && npm run lint
```
