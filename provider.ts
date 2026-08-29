export interface FootballTeam {
  externalId: number;
  name: string;
  country?: string;
  logoUrl?: string;
}

export interface FootballMatch {
  externalId: number;
  kickoff: Date;
  status: string;
  homeExternalId: number;
  awayExternalId: number;
  homeScore?: number;
  awayScore?: number;
}

export interface FootballMatchStatistics {
  teamExternalId: number;
  possession?: number;
  xg?: number;
  shots?: number;
  shotsOnTarget?: number;
  passesAccuracy?: number;
  corners?: number;
  fouls?: number;
  yellowCards?: number;
  redCards?: number;
}

export interface FootballDataProvider {
  getTeams(
    leagueId: number,
    season: number
  ): Promise<FootballTeam[]>;

  getMatches(
    leagueId: number,
    season: number
  ): Promise<FootballMatch[]>;

  getMatchStatistics(
    fixtureId: number
  ): Promise<FootballMatchStatistics[]>;
}

export class ExternalFootballProvider
  implements FootballDataProvider
{
  private readonly baseUrl =
    "https://v3.football.api-sports.io";

  private get apiKey(): string {
    const key = process.env.API_FOOTBALL_KEY;

    if (!key) {
      throw new Error(
        "API_FOOTBALL_KEY não configurada."
      );
    }

    return key;
  }

  private async request(
    endpoint: string
  ): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}${endpoint}`,
      {
        headers: {
          "x-apisports-key": this.apiKey,
        },
      }
    );

    const data = await response.json();

    const hasErrors =
      data.errors &&
      Object.keys(data.errors).length > 0;

    if (!response.ok || hasErrors) {
      throw new Error(
        `API-Football retornou erro: ${JSON.stringify(
          data.errors ?? data
        )}`
      );
    }

    return data;
  }

  async getTeams(
    leagueId: number,
    season: number
  ): Promise<FootballTeam[]> {
    const data = await this.request(
      `/teams?league=${leagueId}&season=${season}`
    );

    return (data.response ?? []).map(
      (item: any) => ({
        externalId: item.team.id,
        name: item.team.name,
        country:
          item.team.country ?? undefined,
        logoUrl:
          item.team.logo ?? undefined,
      })
    );
  }

  async getMatches(
    leagueId: number,
    season: number
  ): Promise<FootballMatch[]> {
    const data = await this.request(
      `/fixtures?league=${leagueId}&season=${season}`
    );

    return (data.response ?? []).map(
      (item: any) => ({
        externalId: item.fixture.id,

        kickoff: new Date(
          item.fixture.date
        ),

        status:
          item.fixture.status?.short ??
          "UNKNOWN",

        homeExternalId:
          item.teams.home.id,

        awayExternalId:
          item.teams.away.id,

        homeScore:
          item.goals.home ?? undefined,

        awayScore:
          item.goals.away ?? undefined,
      })
    );
  }

  async getMatchStatistics(
    fixtureId: number
  ): Promise<FootballMatchStatistics[]> {
    const data = await this.request(
      `/fixtures/statistics?fixture=${fixtureId}`
    );

    return (data.response ?? []).map(
      (teamData: any) => {
        const statistics =
          teamData.statistics ?? [];

        const getValue = (
          name: string
        ): any => {
          const item = statistics.find(
            (stat: any) =>
              stat.type === name
          );

          return item?.value ?? null;
        };

        const parseNumber = (
          value: any
        ): number | undefined => {
          if (
            value === null ||
            value === undefined
          ) {
            return undefined;
          }

          const parsed = Number(value);

          return Number.isNaN(parsed)
            ? undefined
            : parsed;
        };

        const parsePercentage = (
          value: any
        ): number | undefined => {
          if (
            value === null ||
            value === undefined
          ) {
            return undefined;
          }

          if (typeof value === "number") {
            return value;
          }

          const text = String(value)
            .replace("%", "")
            .trim();

          const parsed = Number(text);

          return Number.isNaN(parsed)
            ? undefined
            : parsed;
        };

        return {
          teamExternalId:
            teamData.team.id,

          possession:
            parsePercentage(
              getValue("Ball Possession")
            ),

          xg:
            parseNumber(
              getValue("Expected Goals")
            ),

          shots:
            parseNumber(
              getValue("Total Shots")
            ),

          shotsOnTarget:
            parseNumber(
              getValue("Shots on Goal")
            ),

          passesAccuracy:
            parsePercentage(
              getValue("Passes %")
            ),

          corners:
            parseNumber(
              getValue("Corner Kicks")
            ),

          fouls:
            parseNumber(
              getValue("Fouls")
            ),

          yellowCards:
            parseNumber(
              getValue("Yellow Cards")
            ),

          redCards:
            parseNumber(
              getValue("Red Cards")
            ),
        };
      }
    );
  }
}
