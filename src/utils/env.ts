type ClientEnv = Record<string, string | undefined>;

const clientEnv = ((import.meta as unknown as { env?: ClientEnv }).env ?? {}) as ClientEnv;

export function getEnvValue(name: string, fallback = ""): string {
  return clientEnv[name] || fallback;
}
