import { ResultAsync } from 'neverthrow';
import type {
  StartUploadOrchestrationResult,
  StartUploadOrchestrationRequest,
} from '../types/orchestration-job';

export type ModalOrchestratorErrorType =
  | 'config'
  | 'request_timeout'
  | 'request_failed'
  | 'response_invalid'
  | 'remote_rejected';

export interface ModalOrchestratorError {
  type: ModalOrchestratorErrorType;
  message: string;
  retryable: boolean;
  status?: number;
  cause?: unknown;
}

const MODAL_ORCHESTRATOR_TIMEOUT_MS = 30_000;

type ModalOrchestratorEnv = {
  NODE_ENV: string;
  MODAL_KEY?: string;
  MODAL_SECRET?: string;
  API_BASE_URL?: string;
};

function getEnvString(env: ModalOrchestratorEnv, key: string): string | undefined {
  const raw = (env as unknown as Record<string, unknown>)[key];
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function resolveOrchestratorUrl(env: ModalOrchestratorEnv): string | null {
  const configured = getEnvString(env, 'MODAL_ORCHESTRATOR_URL');
  if (configured) return configured;
  return null;
}

export function startUploadOrchestration(
  env: ModalOrchestratorEnv,
  request: StartUploadOrchestrationRequest,
): ResultAsync<StartUploadOrchestrationResult, ModalOrchestratorError> {
  return ResultAsync.fromPromise(
    (async (): Promise<StartUploadOrchestrationResult> => {
      const orchestratorUrl = resolveOrchestratorUrl(env);
      const modalKey = env.MODAL_KEY?.trim();
      const modalSecret = env.MODAL_SECRET?.trim();

      if (!orchestratorUrl || !modalKey || !modalSecret) {
        throw {
          type: 'config',
          message:
            'Missing Modal orchestrator configuration (MODAL_ORCHESTRATOR_URL/MODAL_KEY/MODAL_SECRET)',
          retryable: false,
        } as ModalOrchestratorError;
      }

      const body: StartUploadOrchestrationRequest = request;

      const response = await fetch(orchestratorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Modal-Key': modalKey,
          'Modal-Secret': modalSecret,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(MODAL_ORCHESTRATOR_TIMEOUT_MS),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw {
          type: 'remote_rejected',
          message: `Modal orchestrator rejected request: ${response.status} ${text}`,
          status: response.status,
          retryable: response.status >= 500 || response.status === 429,
        } as ModalOrchestratorError;
      }

      const data = (await response.json()) as StartUploadOrchestrationResult;
      if (
        !data ||
        !data.runId ||
        !data.jobId ||
        !['accepted', 'completed', 'failed'].includes(data.phase)
      ) {
        throw {
          type: 'response_invalid',
          message: 'Modal orchestrator response missing required fields',
          retryable: true,
        } as ModalOrchestratorError;
      }
      return data;
    })(),
    (cause): ModalOrchestratorError => {
      if (typeof cause === 'object' && cause !== null && 'type' in cause && 'message' in cause) {
        return cause as ModalOrchestratorError;
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        type: 'request_failed',
        message: `Modal orchestrator request failed: ${message}`,
        retryable: true,
        cause,
      };
    },
  );
}
