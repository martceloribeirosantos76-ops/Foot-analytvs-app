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

export interface FootballDataProvider {
  getTeams(leagueId: number, season: number): Promise<FootballTeam[]>;
  getMatches(leagueId: number, season: number): Promise<FootballMatch[]>;
}

export class ExternalFootballProvider implements FootballDataProvider {
  private readonly baseUrl = "https://v3.football.api-sports.io";

  private get apiKey(): string {
    const key = process.env.API_FOOTBALL_KEY;

    if (!key) {
      throw new Error("API_FOOTBALL_KEY não configurada.");
    }

    return key;
  }

  async getTeams(
    leagueId: number,
    season: number
  ): Promise<FootballTeam[]> {
    const url =
      `${this.baseUrl}/teams?league=${leagueId}&season=${season}`;

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": this.apiKey,
      },
    });

    const data = await response.json();

    if (!response.ok || data.errors?.length || Object.keys(data.errors ?? {}).length) {
      throw new Error(
        `API-Football retornou erro: ${JSON.stringify(data.errors ?? data)}`
      );
    }

    return (data.response ?? []).map((item: any) => ({
      externalId: item.team.id,
      name: item.team.name,
      country: item.team.country ?? undefined,
      logoUrl: item.team.logo ?? undefined,
    }));
  }

  async getMatches(
    leagueId: number,
    season: number
  ): Promise<FootballMatch[]> {
    const url =
      `${this.baseUrl}/fixtures?league=${leagueId}&season=${season}`;

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": this.apiKey,
      },
    });

    const data = await response.json();

    if (!response.ok || data.errors?.length || Object.keys(data.errors ?? {}).length) {
      throw new Error(
        `API-Football retornou erro: ${JSON.stringify(data.errors ?? data)}`
      );
    }

    return (data.response ?? []).map((item: any) => ({
      externalId: item.fixture.id,
      kickoff: new Date(item.fixture.date),
      status: item.fixture.status?.short ?? "UNKNOWN",
      homeExternalId: item.teams.home.id,
      awayExternalId: item.teams.away.id,
      homeScore: item.goals.home ?? undefined,
      awayScore: item.goals.away ?? undefined,
    }));
  }
}
