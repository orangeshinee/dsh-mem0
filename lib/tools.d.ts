/**
 * Agent tools: the dsh-native way to read and write a self-hosted mem0.
 * Every tool talks to the same REST client the plugin configures, so a
 * server + API key set once (settings section or config entry) is
 * immediately operable by any agent.
 *
 * Definitions are built WITHOUT the runtime `@deepseek-ai/dsh-tools` import:
 * `parameters` / `output.schema` are already raw JSON Schema (equivalent to
 * what `defineTool` would compile from the DSL), and `ctx.tools.register`
 * accepts plain definitions. Keeping the runtime import would hard-depend on
 * a package that is ALSO a harness bundle row (`tools`); a profile-hoisted
 * copy then shadows the harness's, splitting the module-level
 * TOOL_RUNTIME_SCHEDULER Symbol and breaking every tool call with
 * "Cannot read properties of undefined (reading 'prepare')". See AGENTS.md.
 */
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { Mem0Config } from './config.js';
import type { Mem0Client } from './mem0-client.js';
/** The add tool: `POST /memories`. */
export declare function mem0AddTool(client: Mem0Client, config: () => Mem0Config): ToolDefinition;
/** The search tool: `POST /search`. */
export declare function mem0SearchTool(client: Mem0Client, config: () => Mem0Config): ToolDefinition;
/** The read tool: `GET /memories` (list) and `GET /memories/{id}` (one). */
export declare function mem0GetTool(client: Mem0Client, config: () => Mem0Config): ToolDefinition;
/** The update tool: `PUT /memories/{id}`. */
export declare function mem0UpdateTool(client: Mem0Client): ToolDefinition;
/** The delete tool: `DELETE /memories/{id}` or `DELETE /memories`. */
export declare function mem0DeleteTool(client: Mem0Client, config: () => Mem0Config): ToolDefinition;
/** The history tool: `GET /memories/{id}/history`. */
export declare function mem0HistoryTool(client: Mem0Client): ToolDefinition;
/** The reset tool: `POST /reset` (admin). */
export declare function mem0ResetTool(client: Mem0Client): ToolDefinition;
/** The status tool: health + auth + configuration check. */
export declare function mem0StatusTool(client: Mem0Client): ToolDefinition;
