/**
 * LINE Messaging API Client
 *
 * Factory for creating LINE SDK client with typed environment configuration.
 */

import { messagingApi } from "@line/bot-sdk";

/**
 * Environment configuration required for LINE client
 */
export interface LineEnv {
	LINE_CHANNEL_ACCESS_TOKEN: string;
}

/**
 * Create a LINE Messaging API client from environment bindings.
 *
 * @param env - Environment configuration with LINE credentials
 * @returns Configured MessagingApiClient instance
 *
 * @example
 * ```typescript
 * const client = createLineClient({
 *   LINE_CHANNEL_ACCESS_TOKEN: c.env.LINE_CHANNEL_ACCESS_TOKEN,
 * });
 *
 * await client.pushMessage({
 *   to: userId,
 *   messages: [{ type: "text", text: "Hello!" }],
 * });
 * ```
 */
export function createLineClient(
	env: LineEnv,
): messagingApi.MessagingApiClient {
	return new messagingApi.MessagingApiClient({
		channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
	});
}
