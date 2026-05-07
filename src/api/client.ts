const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://xr0u2z6sq4.execute-api.ap-northeast-2.amazonaws.com';

class ApiClient {
  private baseURL: string;
  constructor(url: string) { this.baseURL = url; }

  private getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  private headers(): HeadersInit {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async get<T>(endpoint: string): Promise<T> {
    const res = await fetch(`${this.baseURL}${endpoint}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`GET ${endpoint} failed: ${res.status}`);
    return res.json();
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const res = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: this.headers(),
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) throw new Error(`POST ${endpoint} failed: ${res.status}`);
    return res.json();
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const res = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'PUT',
      headers: this.headers(),
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok) throw new Error(`PUT ${endpoint} failed: ${res.status}`);
    return res.json();
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
