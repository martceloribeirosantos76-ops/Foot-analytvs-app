import { Router } from "express";
import { prisma } from "./prisma";
import { footScore } from "./footScore";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "foot-analytics-api", version: "0.1.0" });
});

router.get("/teams", async (_req, res) => {
  res.json(await prisma.team.findMany({ orderBy: { name: "asc" } }));
});

router.get("/players", async (_req, res) => {
  res.json(
    await prisma.player.findMany({
      include: { team: true },
      orderBy: { name: "asc" }
    })
  );
});

router.get("/matches", async (_req, res) => {
  const matches = await prisma.match.findMany({
    include: { homeTeam: true, awayTeam: true, competition: true },
    orderBy: { kickoff: "asc" }
  });

  res.json(matches);
});

router.get("/matches/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      homeTeam: true,
      awayTeam: true,
      competition: true,
      statistics: true,
      analysis: true
    }
  });

  if (!match) {
    return res.status(404).json({ error: "Partida não encontrada" });
  }

  res.json(match);
});

router.get("/matches/:id/analysis", async (req, res) => {
  const id = Number(req.params.id);

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      statistics: true,
      homeTeam: true,
      awayTeam: true
    }
  });

  if (!match) {
    return res.status(404).json({ error: "Partida não encontrada" });
  }

  const home = match.statistics.find(
    (s) => s.teamId === match.homeTeamId
  );

  const away = match.statistics.find(
    (s) => s.teamId === match.awayTeamId
  );

  const toMetrics = (s: typeof home) => ({
    attack: Math.min(
      100,
      (s?.xg ?? 0) * 40 + (s?.shotsOnTarget ?? 0) * 5
    ),
    defense: 70,
    creation: s?.passesAccuracy ?? 70,
    form: 70,
    efficiency: 70,
    homeAway: 70
  });

  const homeScore = footScore(toMetrics(home));
  const awayScore = footScore(toMetrics(away));

  res.json({
    matchId: id,
    home: {
      team: match.homeTeam.name,
      footScore: homeScore
    },
    away: {
      team: match.awayTeam.name,
      footScore: awayScore
    },
    summary:
      homeScore > awayScore
        ? `${match.homeTeam.name} apresenta maior índice estatístico no modelo atual.`
        : `${match.awayTeam.name} apresenta maior índice estatístico no modelo atual.`
  });
});

export default router;
