export interface FootballTeam {
  externalId: number;
  name: string;
  country?: string;
  logoUrl?: string;
}

export interface FootballDataProvider {
  getTeams(leagueId: number, season: number): Promise<FootballTeam[]>;
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

    console.log("API-FOOTBALL STATUS:", response.status);
    console.log(
      "API-FOOTBALL DATA:",
      JSON.stringify(data)
    );

    if (!response.ok) {
      throw new Error(
        `API-Football respondeu HTTP ${response.status}`
      );
    }

    if (
      data.errors &&
      Object.keys(data.errors).length > 0
    ) {
      throw new Error(
        `API-Football retornou erro: ${JSON.stringify(data.errors)}`
      );
    }

    return (data.response ?? []).map((item: any) => ({
      externalId: item.team.id,
      name: item.team.name,
      country: item.team.country ?? undefined,
      logoUrl: item.team.logo ?? undefined,
    }));
  }
}
