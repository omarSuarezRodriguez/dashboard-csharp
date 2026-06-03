import pino from "pino";

export function createLogger() {
  const level = process.env.LOG_LEVEL ?? "info";
  const isDev = process.env.NODE_ENV !== "production";
  return pino({
    level,
    ...(isDev && {
      transport: { target: "pino-pretty", options: { colorize: true } },
    }),
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
