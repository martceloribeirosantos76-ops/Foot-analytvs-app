import { Router } from "express";
import { prisma } from "./prisma";
import { footScore } from "./footScore";
import { ExternalFootballProvider } from "./provider";

const router = Router();

const LEAGUE_ID = 39;
const SEASON_YEAR = 2026;
const COMPETITION_NAME = "Premier League";
const COMPETITION_COUNTRY = "England";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Erro desconhecido";
}

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "foot-analytics-api",
    version: "0.1.0",
  });
});

/**
 * Testa a conexão com a API-Football.
 */
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
      error: getErrorMessage(error),
    });
  }
});

/**
 * Importa os times da competição.
 */
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
      error: getErrorMessage(error),
    });
  }
});

/**
 * Importa as partidas da competição.
 */
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
          name: COMPETITION_NAME,
          country: COMPETITION_COUNTRY,
        },
        create: {
          name: COMPETITION_NAME,
          country: COMPETITION_COUNTRY,
        },
      });

    let season = await prisma.season.findFirst({
      where: {
        competitionId: competition.id,
        name: String(SEASON_YEAR),
      },
    });

    if (!season) {
      season = await prisma.season.create({
        data: {
          name: String(SEASON_YEAR),
          competitionId: competition.id,
        },
      });
    }

    const importedMatches = [];

    for (const match of matches) {
      const homeTeam =
        await prisma.team.findUnique({
          where: {
            externalId: match.homeExternalId,
          },
        });

      const awayTeam =
        await prisma.team.findUnique({
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

      /**
       * O Match não possui externalId no schema.
       *
       * Portanto identificamos a partida por:
       * data + time mandante + time visitante.
       */
      const existingMatch =
        await prisma.match.findFirst({
          where: {
            kickoff: match.kickoff,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
          },
        });

      if (existingMatch) {
        const updatedMatch =
          await prisma.match.update({
            where: {
              id: existingMatch.id,
            },
            data: {
              status: match.status,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
              competitionId: competition.id,
              seasonId: season.id,
            },
          });

        importedMatches.push(updatedMatch);
      } else {
        const savedMatch =
          await prisma.match.create({
            data: {
              kickoff: match.kickoff,
              status: match.status,
              competitionId: competition.id,
              seasonId: season.id,
              homeTeamId: homeTeam.id,
              awayTeamId: awayTeam.id,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
            },
          });

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
      error: getErrorMessage(error),
    });
  }
});

/**
 * Importa estatísticas das partidas.
 *
 * Importante:
 * Primeiro buscamos todas as partidas externas UMA vez.
 * Depois fazemos o cruzamento com as partidas do banco.
 */
router.get("/import-statistics", async (_req, res) => {
  try {
    const provider = new ExternalFootballProvider();

    /**
     * Busca as partidas existentes no banco.
     */
    const databaseMatches =
      await prisma.match.findMany({
        include: {
          homeTeam: true,
          awayTeam: true,
        },
        orderBy: {
          kickoff: "asc",
        },
      });

    /**
     * Busca todas as partidas da API apenas uma vez.
     */
    const externalMatches =
      await provider.getMatches(
        LEAGUE_ID,
        SEASON_YEAR
      );

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    const details: Array<{
      matchId: number;
      externalFixtureId?: number;
      status: string;
      statistics?: number;
      error?: string;
    }> = [];

    for (const match of databaseMatches) {
      try {
        /**
         * Localiza a partida externa pelos times e horário.
         */
        const externalMatch =
          externalMatches.find((item) => {
            const sameHomeTeam =
              item.homeExternalId ===
              match.homeTeam.externalId;

            const sameAwayTeam =
              item.awayExternalId ===
              match.awayTeam.externalId;

            const timeDifference =
              Math.abs(
                item.kickoff.getTime() -
                  match.kickoff.getTime()
              );

            const sameDate =
              timeDifference <
              24 * 60 * 60 * 1000;

            return (
              sameHomeTeam &&
              sameAwayTeam &&
              sameDate
            );
          });

        if (!externalMatch) {
          skipped++;

          details.push({
            matchId: match.id,
            status: "fixture-not-found",
          });

          continue;
        }

        /**
         * Agora buscamos as estatísticas
         * usando o ID real do fixture externo.
         */
        const statistics =
          await provider.getMatchStatistics(
            externalMatch.externalId
          );

        if (
          !statistics ||
          statistics.length === 0
        ) {
          skipped++;

          details.push({
            matchId: match.id,
            externalFixtureId:
              externalMatch.externalId,
            status: "no-statistics",
          });

          continue;
        }

        for (const statistic of statistics) {
          const team =
            await prisma.team.findUnique({
              where: {
                externalId:
                  statistic.teamExternalId,
              },
            });

          if (!team) {
            console.warn(
              `Time não encontrado: ${statistic.teamExternalId}`
            );

            continue;
          }

          const existing =
            await prisma.matchStatistic.findFirst({
              where: {
                matchId: match.id,
                teamId: team.id,
              },
            });

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
            corners: statistic.corners,
            fouls: statistic.fouls,
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
        }

        imported++;

        details.push({
          matchId: match.id,
          externalFixtureId:
            externalMatch.externalId,
          status: "imported",
          statistics: statistics.length,
        });
      } catch (error) {
        errors++;

        details.push({
          matchId: match.id,
          status: "error",
          error: getErrorMessage(error),
        });

        console.error(
          `Erro nas estatísticas da partida ${match.id}:`,
          error
        );
      }
    }

    res.json({
      ok: true,
      totalMatches: databaseMatches.length,
      imported,
      skipped,
      errors,
      details,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: getErrorMessage(error),
    });
  }
});

/**
 * Lista todos os times.
 */
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
      error: getErrorMessage(error),
    });
  }
});

/**
 * Lista todos os jogadores.
 */
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
      error: getErrorMessage(error),
    });
  }
});

/**
 * Lista todas as partidas.
 */
router.get("/matches", async (_req, res) => {
  try {
    const matches =
      await prisma.match.findMany({
        include: {
          homeTeam: true,
          awayTeam: true,
          competition: true,
          season: true,
          statistics: true,
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
      error: getErrorMessage(error),
    });
  }
});

/**
 * Busca uma partida específica.
 */
router.get("/matches/:id", async (req, res) => {
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
          season: true,
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
      error: getErrorMessage(error),
    });
  }
});

/**
 * Gera análise estatística de uma partida.
 */
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
          (statistic) =>
            statistic.teamId ===
            match.homeTeamId
        );

      const away =
        match.statistics.find(
          (statistic) =>
            statistic.teamId ===
            match.awayTeamId
        );

      const toMetrics = (
        statistic:
          | typeof home
          | undefined
      ) => ({
        attack: Math.min(
          100,
          (statistic?.xg ?? 0) * 40 +
            (statistic?.shotsOnTarget ?? 0) *
              5
        ),

        defense: 70,

        creation:
          statistic?.passesAccuracy ?? 70,

        form: 70,

        efficiency: 70,

        homeAway: 70,
      });

      const homeScore =
        footScore(toMetrics(home));

      const awayScore =
        footScore(toMetrics(away));

      const summary =
        homeScore > awayScore
          ? `${match.homeTeam.name} apresenta maior índice estatístico no modelo atual.`
          : awayScore > homeScore
            ? `${match.awayTeam.name} apresenta maior índice estatístico no modelo atual.`
            : "As duas equipes apresentam índices estatísticos equivalentes no modelo atual.";

      /**
       * Salva/atualiza a análise no banco.
       */
      const analysis =
        await prisma.analysis.upsert({
          where: {
            matchId: id,
          },
          update: {
            homeScore,
            awayScore,
            summary,
          },
          create: {
            matchId: id,
            homeScore,
            awayScore,
            summary,
          },
        });

      res.json({
        ok: true,
        matchId: id,
        home: {
          team: match.homeTeam.name,
          footScore: homeScore,
          statistics: home ?? null,
        },
        away: {
          team: match.awayTeam.name,
          footScore: awayScore,
          statistics: away ?? null,
        },
        summary,
        analysis,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error: getErrorMessage(error),
      });
    }
  }
);

export default router;
