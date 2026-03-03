type WorkerLogLevel = 'info' | 'warn' | 'error';

type WorkerLogEnv = {
  NODE_ENV: string;
  GRAFANA_LOKI_URL?: string;
  LOKI_USER?: string;
  LOKI_TOKEN?: string;
};

type WorkerLogFields = Record<string, unknown>;

function hasWaitUntil(
  ctx: ExecutionContext | undefined,
): ctx is ExecutionContext & { waitUntil: (promise: Promise<unknown>) => void } {
  return Boolean(ctx && typeof ctx.waitUntil === 'function');
}

export function emitWorkerLog(
  env: WorkerLogEnv,
  level: WorkerLogLevel,
  event: string,
  fields: WorkerLogFields,
  ctx?: ExecutionContext,
): void {
  const body = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  const line = JSON.stringify(body);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }

  const lokiUrl = env.GRAFANA_LOKI_URL?.trim();
  const lokiUser = env.LOKI_USER?.trim();
  const lokiToken = env.LOKI_TOKEN?.trim();
  if (!lokiUrl || !lokiUser || !lokiToken) return;

  const pushUrl = `${lokiUrl.replace(/\/+$/, '')}/loki/api/v1/push`;
  const nsTimestamp = `${Date.now()}000000`;
  const payload = {
    streams: [
      {
        stream: {
          service: 'framefast-api',
          env: env.NODE_ENV,
          event,
          level,
          source: 'worker-queue',
        },
        values: [[nsTimestamp, line]],
      },
    ],
  };

  const pushPromise = fetch(pushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${lokiUser}:${lokiToken}`)}`,
    },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      if (response.ok) return;
      const rejectedBody = await response.text().catch(() => '');
      console.warn(
        `[observability] Loki push rejected: status=${response.status} body=${rejectedBody}`,
      );
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[observability] Loki push failed: ${message}`);
    });

  if (hasWaitUntil(ctx)) {
    ctx.waitUntil(pushPromise);
  } else {
    void pushPromise;
  }
}
