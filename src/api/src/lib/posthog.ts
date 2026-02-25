const POSTHOG_INGEST_URL = 'https://us.i.posthog.com/capture/';

interface CaptureParams {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}

export async function capturePostHogEvent(
  apiKey: string,
  params: CaptureParams,
): Promise<void> {
  if (!apiKey) return;
  try {
    await fetch(POSTHOG_INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        event: params.event,
        distinct_id: params.distinctId,
        properties: { ...params.properties, $lib: 'framefast-api' },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.warn('[PostHog]', err instanceof Error ? err.message : err);
  }
}
