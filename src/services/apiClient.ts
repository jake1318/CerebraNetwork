/**
 * Base URL for API requests to the backend
 * In production, this should be the deployed backend URL
 */
export const API_BASE_URL = "https://cerebra-network-e8h5.vercel.app";

/**
 * Helper to construct API URLs consistently
 * @param path - API endpoint path (should start with '/')
 * @returns Complete URL with base
 */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/**
 * Basic fetch wrapper with common options
 * @param path - API endpoint path
 * @param options - Fetch options
 */
export async function apiRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(apiUrl(path), options);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
