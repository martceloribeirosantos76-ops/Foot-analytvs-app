import { Router } from "express";
import { prisma } from "./prisma";
import { footScore } from "./footScore";
import { ExternalFootballProvider } from "./provider";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "foot-analytics-api",
    version: "0.1.0"
  });
});

router.get("/test-provider", async (_req, res) => {
  try {
    const provider = new ExternalFootballProvider();

    const teams = await provider.getTeams(39, 2024);

    res.json({
      ok: true,
      count: teams.length,
      teams,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

router.get("/import-teams", async (_req, res) => {
  try {
    const provider = new ExternalFootballProvider();

    const teams = await provider.getTeams(39, 2024);

    const importedTeams = [];

    for (const team of teams) {
      const savedTeam = await prisma.team.upsert({
        where: {
          externalId: team.externalId,
        },
        update: {
          name: team.name,
          country: team.country,
          logoUrl: team.logoUrl,
        },
        create: {
          externalId: team.externalId,
          name: team.name,
          country: team.country,
          logoUrl: team.logoUrl,
        },
      });

      importedTeams.push(savedTeam);
    }

    res.json({
      ok: true,
      count: importedTeams.length,
      teams: importedTeams,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

router.get("/import-matches", async (_req, res) => {
  try {
    const provider = new ExternalFootballProvider();

    const leagueId = 39;
    const seasonYear = 2024;

    const matches = await provider.getMatches(
      leagueId,
      seasonYear
    );

    const competition = await prisma.competition.upsert({
      where: {
        id: 1,
      },
      update: {
        name: "Premier League",
        country: "England",
      },
      create: {
        name: "Premier League",
        country: "England",
      },
    });

    const season = await prisma.season.findFirst({
      where: {
        competitionId: competition.id,
        name: String(seasonYear),
      },
    });

    const savedSeason =
      season ??
      await prisma.season.create({
        data: {
          name: String(seasonYear),
          competitionId: competition.id,
        },
      });

    const importedMatches = [];

    for (const match of matches) {
      const homeTeam = await prisma.team.findUnique({
        where: {
          externalId: match.homeExternalId,
        },
      });

      const awayTeam = await prisma.team.findUnique({
        where: {
          externalId: match.awayExternalId,
        },
      });

      if (!homeTeam || !awayTeam) {
        console.warn(
          `Times não encontrados para a partida ${match.externalId}:`,
          match.homeExternalId,
          match.awayExternalId
        );

        continue;
      }

      const existingMatch = await prisma.match.findFirst({
        where: {
          kickoff: match.kickoff,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
        },
      });

      const savedMatch =
        existingMatch ??
        await prisma.match.create({
          data: {
            kickoff: match.kickoff,
            status: match.status,
            competitionId: competition.id,
            seasonId: savedSeason.id,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
          },
        });

      if (existingMatch) {
        const updatedMatch = await prisma.match.update({
          where: {
            id: existingMatch.id,
          },
          data: {
            status: match.status,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            competitionId: competition.id,
            seasonId: savedSeason.id,
          },
        });

        importedMatches.push(updatedMatch);
      } else {
        importedMatches.push(savedMatch);
      }
    }

    res.json({
      ok: true,
      count: importedMatches.length,
      matches: importedMatches,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

router.get("/teams", async (_req, res) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: {
        name: "asc",
      },
    });

    res.json(teams);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
});

router.get("/players", async (_req, res) => {
  res.json(
    await prisma.player.findMany({
      include: { team: true },
      orderBy: { name: "asc" },
    })
  );
});

router.get("/matches", async (_req, res) => {
  const matches = await prisma.match.findMany({
    include: {
      homeTeam: true,
      awayTeam: true,
      competition: true,
    },
    orderBy: {
      kickoff: "asc",
    },
  });

  res.json(matches);
});

router.get("/matches/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      error: "ID inválido",
    });
  }

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      homeTeam: true,
      awayTeam: true,
      competition: true,
      statistics: true,
      analysis: true,
    },
  });

  if (!match) {
    return res.status(404).json({
      error: "Partida não encontrada",
    });
  }

  res.json(match);
});

router.get("/matches/:id/analysis", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({
      error: "ID inválido",
    });
  }

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      statistics: true,
      homeTeam: true,
      awayTeam: true,
    },
  });

  if (!match) {
    return res.status(404).json({
      error: "Partida não encontrada",
    });
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
    homeAway: 70,
  });

  const homeScore = footScore(toMetrics(home));
  const awayScore = footScore(toMetrics(away));

  res.json({
    matchId: id,
    home: {
      team: match.homeTeam.name,
      footScore: homeScore,
    },
    away: {
      team: match.awayTeam.name,
      footScore: awayScore,
    },
    summary:
      homeScore > awayScore
        ? `${match.homeTeam.name} apresenta maior índice estatístico no modelo atual.`
        : `${match.awayTeam.name} apresenta maior índice estatístico no modelo atual.`,
  });
});

export default router;
