// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetcher(path: string, opt?: Record<string, unknown>): Promise<any> {
  const response = await window.fetch(path, opt);
  if (response.status >= 400 && response.status < 600) {
    throw response;
  }
  const contentType = response.headers.get('Content-Type');
  if (contentType?.includes('text/')) return response.text();
  return response.json();
}

export const apiPaths = {
  WORKSHOP: ({ workshopId }: { workshopId: string }): string => `/api/workshop/${workshopId}`,
};
