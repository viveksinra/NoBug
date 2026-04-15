/**
 * HTTP client for calling the NoBug web app REST API.
 * Authenticates via API key (nb_key_ prefix) passed as Bearer token.
 */

const DEFAULT_BASE_URL = "http://localhost:3000";

export interface ApiClientConfig {
  apiKey: string;
  baseUrl: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ApiClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
  }

  static fromEnv(): ApiClient {
    const apiKey = process.env.NOBUG_API_KEY;
    if (!apiKey) {
      throw new Error(
        "NOBUG_API_KEY environment variable is required. " +
          "Generate one at your NoBug dashboard under Settings > API Keys."
      );
    }
    if (!apiKey.startsWith("nb_key_")) {
      throw new Error(
        "NOBUG_API_KEY must start with 'nb_key_' prefix. " +
          "Check your API key and try again."
      );
    }

    const baseUrl = process.env.NOBUG_API_URL || DEFAULT_BASE_URL;
    return new ApiClient({ apiKey, baseUrl });
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "@nobug/mcp-server",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let errorMessage: string;
      try {
        const parsed = JSON.parse(text);
        errorMessage = parsed.error || parsed.message || text;
      } catch {
        errorMessage = text || `HTTP ${response.status} ${response.statusText}`;
      }

      if (response.status === 401) {
        throw new Error(`Authentication failed: ${errorMessage}. Check your NOBUG_API_KEY.`);
      }
      if (response.status === 403) {
        throw new Error(`Permission denied: ${errorMessage}. Your API key may lack the required permissions.`);
      }
      if (response.status === 404) {
        throw new Error(`Not found: ${errorMessage}`);
      }
      throw new Error(`API error (${response.status}): ${errorMessage}`);
    }

    const json = await response.json() as ApiResponse<T>;
    if (json.success === false) {
      throw new Error(json.error || "Unknown API error");
    }
    return (json.data !== undefined ? json.data : json) as T;
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }
}
