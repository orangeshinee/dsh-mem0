/**
 * Agent tools: the dsh-native way to read and write a self-hosted mem0.
 * Every tool talks to the same REST client the plugin configures, so a
 * server + API key set once (settings section or config entry) is
 * immediately operable by any agent.
 */
import type { Mem0Config } from './config.js';
import type { Mem0Client } from './mem0-client.js';
/** The add tool: `POST /memories`. */
export declare function mem0AddTool(client: Mem0Client, config: () => Mem0Config): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The search tool: `POST /search`. */
export declare function mem0SearchTool(client: Mem0Client, config: () => Mem0Config): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The read tool: `GET /memories` (list) and `GET /memories/{id}` (one). */
export declare function mem0GetTool(client: Mem0Client, config: () => Mem0Config): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The update tool: `PUT /memories/{id}`. */
export declare function mem0UpdateTool(client: Mem0Client): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The delete tool: `DELETE /memories/{id}` or `DELETE /memories`. */
export declare function mem0DeleteTool(client: Mem0Client, config: () => Mem0Config): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The history tool: `GET /memories/{id}/history`. */
export declare function mem0HistoryTool(client: Mem0Client): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The reset tool: `POST /reset` (admin). */
export declare function mem0ResetTool(client: Mem0Client): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** The status tool: health + auth + configuration check. */
export declare function mem0StatusTool(client: Mem0Client): import("@deepseek-ai/dsh-tools").ToolDefinition;
