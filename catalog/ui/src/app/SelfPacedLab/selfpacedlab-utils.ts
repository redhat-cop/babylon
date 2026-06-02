export const apiPaths = {
  SELF_PACED_LAB: ({ selfPacedLabId }: { selfPacedLabId: string }): string =>
    `/api/selfpacedlab/${selfPacedLabId}`,
};
