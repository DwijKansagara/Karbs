import type { AgentTask } from "../core/state";

export interface HookPayload {
  provider?: string;
  client_name?: string;
  hook_event_name?: string;
  request_id?: string;
  session_id?: string;
  cwd?: string;
  message?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/** Each provider/session gets independent steps, completion timers and approvals. */
export function resolveSessionTask(tasks: AgentTask[], payload: HookPayload): AgentTask {
  const provider = payload.provider === "codex" || payload.provider === "gemini" ? payload.provider : "claude";
  const source = provider === "claude" ? "claudeCode" : provider;
  const label = provider === "gemini" && ["Gemini IDE", "Gemini Website"].includes(payload.client_name ?? "") ? payload.client_name! :
    payload.client_name === "Coucou Gemini PC control" ? "Gemini" : { claude: "Claude Code", codex: "Codex", gemini: "Gemini CLI" }[provider];
  const baseId = `integration_${provider}`;
  const sessionId = payload.session_id || "default";
  let task = tasks.find((t) => t.source === source && t.sessionId === sessionId);
  if (!task) {
    task = tasks.find((t) => t.id === baseId && !t.sessionId);
    if (!task) {
      task = { id: `${baseId}:${sessionId}`, name: label,
        color: { claude: "#F5F6F8", codex: "#10A37F", gemini: "#4285F4" }[provider],
        source, isIntegration: true, state: "idle", steps: [], stepIndex: 0 };
      tasks.push(task);
    }
    task.sessionId = sessionId;
  }
  const project = (payload.cwd || "").replace(/[\\/]+$/, "").split(/[\\/]/).at(-1);
  task.surface = payload.client_name === "Gemini Website" ? "web" : "cli";
  task.name = project && task.surface !== "web" ? `${label} · ${project}` : label;
  if (payload.cwd) task.sessionCwd = payload.cwd;
  task.revision = (task.revision ?? 0) + 1;
  return task;
}
