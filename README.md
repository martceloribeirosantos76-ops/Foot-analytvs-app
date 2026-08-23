# FOOT ANALYTICS — V1

MVP inicial de análise de futebol, sem apostas.

## Stack
- Node.js + TypeScript
- Express
- Prisma + PostgreSQL
- Flutter (estrutura inicial)
- FOOT SCORE

## Backend
1. Copie `.env.example` para `.env`.
2. Configure `DATABASE_URL`.
3. `npm install`
4. `npx prisma generate`
5. `npx prisma migrate dev --name init`
6. `npm run dev`

API:
- GET /api/health
- GET /api/teams
- GET /api/players
- GET /api/matches
- GET /api/matches/:id
- GET /api/matches/:id/analysis

A integração com um provedor externo de dados deve ser adicionada em `src/services/provider.ts`.

## Observação
Este pacote é uma base de desenvolvimento. Não inclui credenciais de API nem dados proprietários de terceiros.
