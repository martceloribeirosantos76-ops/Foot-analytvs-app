import { Router } from "express";
import { prisma } from "./prisma";
import { footScore } from "./footScore";
import { ExternalFootballProvider } from "./provider";

const router = Router();

const LEAGUE_ID = 39;
const SEASON_YEAR = 2024;

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "foot-analytics-api",
    version: "0.1.0",
  });
});

router.get("/test-provider", async (_req, res) => {
  try {
    const provider = new ExternalFootballProvider();

    const teams = await provider.getTeams(
      LEAGUE_ID,
      SEASON_YEAR
    );

    res.json({
      ok: true,
      count: teams.length,
      teams,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido",
    });
  }
});

router.get("/import-teams", async (_req, res) => {
  try {
    const provider = new ExternalFootballProvider();

    const teams = await provider.getTeams(
      LEAGUE_ID,
      SEASON_YEAR
    );

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
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido",
    });
  }
});

router.get("/import-matches", async (_req, res) => {
  try {
    const provider = new ExternalFootballProvider();

    const matches = await provider.getMatches(
      LEAGUE_ID,
      SEASON_YEAR
    );

    const competition =
      await prisma.competition.upsert({
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

    const season =
      await prisma.season.findFirst({
        where: {
          competitionId: competition.id,
          name: String(SEASON_YEAR),
        },
      });

    const savedSeason =
      season ??
      (await prisma.season.create({
        data: {
          name: String(SEASON_YEAR),
          competitionId: competition.id,
        },
      }));

    const importedMatches = [];

    for (const match of matches) {
      const homeTeam =
        await prisma.team.findUnique({
          where: {
            externalId:
              match.homeExternalId,
          },
        });

      const awayTeam =
        await prisma.team.findUnique({
          where: {
            externalId:
              match.awayExternalId,
          },
        });

      if (!homeTeam || !awayTeam) {
        console.warn(
          `Times não encontrados para a partida ${match.externalId}`
        );

        continue;
      }

      const savedMatch =
        await prisma.match.upsert({
          where: {
            externalId: match.externalId,
          },
          update: {
            kickoff: match.kickoff,
            status: match.status,
            competitionId:
              competition.id,
            seasonId:
              savedSeason.id,
            homeTeamId:
              homeTeam.id,
            awayTeamId:
              awayTeam.id,
            homeScore:
              match.homeScore,
            awayScore:
              match.awayScore,
          },
          create: {
            externalId:
              match.externalId,
            kickoff: match.kickoff,
            status: match.status,
            competitionId:
              competition.id,
            seasonId:
              savedSeason.id,
            homeTeamId:
              homeTeam.id,
            awayTeamId:
              awayTeam.id,
            homeScore:
              match.homeScore,
            awayScore:
              match.awayScore,
          },
        });

      importedMatches.push(savedMatch);
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
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido",
    });
  }
});

/*
 * Importa estatísticas das partidas.
 *
 * Agora usamos diretamente o externalId salvo
 * na tabela Match. Isso evita buscar novamente
 * todas as partidas da API-Football para cada jogo.
 */
router.get(
  "/import-statistics",
  async (_req, res) => {
    try {
      const provider =
        new ExternalFootballProvider();

      const matches =
        await prisma.match.findMany({
          orderBy: {
            kickoff: "asc",
          },
        });

      let imported = 0;
      let skipped = 0;
      let errors = 0;

      const details: Array<{
        matchId: number;
        externalId: number;
        status: string;
        statistics?: number;
        error?: string;
      }> = [];

      for (const match of matches) {
        try {
          const statistics =
            await provider.getMatchStatistics(
              match.externalId
            );

          if (
            !statistics ||
            statistics.length === 0
          ) {
            skipped++;

            details.push({
              matchId: match.id,
              externalId:
                match.externalId,
              status: "no-statistics",
            });

            continue;
          }

          let savedStatistics = 0;

          for (const statistic of statistics) {
            const team =
              await prisma.team.findUnique({
                where: {
                  externalId:
                    statistic.teamExternalId,
                },
              });

            if (!team) {
              continue;
            }

            const existing =
              await prisma.matchStatistic.findFirst(
                {
                  where: {
                    matchId: match.id,
                    teamId: team.id,
                  },
                }
              );

            const data = {
              matchId: match.id,
              teamId: team.id,
              possession:
                statistic.possession,
              xg: statistic.xg,
              shots: statistic.shots,
              shotsOnTarget:
                statistic.shotsOnTarget,
              passesAccuracy:
                statistic.passesAccuracy,
              corners:
                statistic.corners,
              fouls:
                statistic.fouls,
              yellowCards:
                statistic.yellowCards,
              redCards:
                statistic.redCards,
            };

            if (existing) {
              await prisma.matchStatistic.update({
                where: {
                  id: existing.id,
                },
                data,
              });
            } else {
              await prisma.matchStatistic.create({
                data,
              });
            }

            savedStatistics++;
          }

          if (savedStatistics === 0) {
            skipped++;

            details.push({
              matchId: match.id,
              externalId:
                match.externalId,
              status:
                "statistics-without-teams",
              statistics:
                statistics.length,
            });

            continue;
          }

          imported++;

          details.push({
            matchId: match.id,
            externalId:
              match.externalId,
            status: "imported",
            statistics:
              savedStatistics,
          });
        } catch (error) {
          errors++;

          details.push({
            matchId: match.id,
            externalId:
              match.externalId,
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Erro desconhecido",
          });

          console.error(
            `Erro nas estatísticas da partida ${match.id}:`,
            error
          );
        }
      }

      res.json({
        ok: true,
        totalMatches:
          matches.length,
        imported,
        skipped,
        errors,
        details,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro desconhecido",
      });
    }
  }
);

router.get("/teams", async (_req, res) => {
  try {
    const teams =
      await prisma.team.findMany({
        orderBy: {
          name: "asc",
        },
      });

    res.json(teams);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido",
    });
  }
});

router.get("/players", async (_req, res) => {
  try {
    const players =
      await prisma.player.findMany({
        include: {
          team: true,
        },
        orderBy: {
          name: "asc",
        },
      });

    res.json(players);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido",
    });
  }
});

router.get("/matches", async (_req, res) => {
  try {
    const matches =
      await prisma.match.findMany({
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
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido",
    });
  }
});

router.get(
  "/matches/:id",
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "ID inválido",
      });
    }

    try {
      const match =
        await prisma.match.findUnique({
          where: {
            id,
          },
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
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro desconhecido",
      });
    }
  }
);

router.get(
  "/matches/:id/analysis",
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "ID inválido",
      });
    }

    try {
      const match =
        await prisma.match.findUnique({
          where: {
            id,
          },
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

      const home =
        match.statistics.find(
          (s) =>
            s.teamId ===
            match.homeTeamId
        );

      const away =
        match.statistics.find(
          (s) =>
            s.teamId ===
            match.awayTeamId
        );

      const toMetrics = (
        s: typeof home
      ) => ({
        attack: Math.min(
          100,
          (s?.xg ?? 0) * 40 +
            (s?.shotsOnTarget ?? 0) *
              5
        ),

        defense: 70,

        creation:
          s?.passesAccuracy ?? 70,

        form: 70,

        efficiency: 70,

        homeAway: 70,
      });

      const homeScore =
        footScore(
          toMetrics(home)
        );

      const awayScore =
        footScore(
          toMetrics(away)
        );

      res.json({
        matchId: id,

        home: {
          team:
            match.homeTeam.name,
          footScore:
            homeScore,
        },

        away: {
          team:
            match.awayTeam.name,
          footScore:
            awayScore,
        },

        summary:
          homeScore > awayScore
            ? `${match.homeTeam.name} apresenta maior índice estatístico no modelo atual.`
            : awayScore > homeScore
            ? `${match.awayTeam.name} apresenta maior índice estatístico no modelo atual.`
            : "As duas equipes apresentam índices estatísticos equivalentes no modelo atual.",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro desconhecido",
      });
    }
  }
);

export default router;
