// Claude Code hook events → island state.
// Port of HookServer.processEvent / processPermissionRequest from the macOS app.
// Difference from macOS: no terminal filter. On Windows the hook fires from any
// terminal (Windows Terminal, VS Code, PowerShell…) and all of them are handled.

import { Bridge, onEvent } from "../core/bridge";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import type { Island } from "./island";
import { resolveSessionTask, type HookPayload } from "./session-routing";

/** Clears the approval card if no decision was made before the hook gave up. */
let pendingTimeout: number | null = null;


function lastPathComponent(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, "");
  const idx = Math.max(cleaned.lastIndexOf("\\"), cleaned.lastIndexOf("/"));
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

/** frenchStep() — same labels as the macOS app. */
const TOOL_LABELS: Record<string, string> = {
  Bash: "Exécute",
  Read: "Lit",
  Write: "Écrit",
  Edit: "Modifie",
  Glob: "Cherche",
  Grep: "Recherche",
  WebSearch: "Recherche web",
  WebFetch: "Récupère",
  TodoWrite: "Tâches",
  Task: "Agent",
  LS: "Liste",
  MultiEdit: "Modifie",
  NotebookEdit: "Notebook",
  PowerShell: "Exécute",
  run_shell_command: "Runs",
  read_file: "Reads",
  read_many_files: "Reads",
  write_file: "Writes",
  replace: "Edits",
  apply_patch: "Edits",
  exec_command: "Runs",
};

function stepLabel(tool: string, input: Record<string, unknown>): string {
  const label = TOOL_LABELS[tool] ?? tool;
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : null);
  const cmd = str("command");
  if (cmd) return `${label} · ${cmd.slice(0, 40)}`;
  const codexCmd = str("cmd");
  if (codexCmd) return `${label} · ${codexCmd.slice(0, 40)}`;
  const path = str("path");
  if (path) return `${label} · ${lastPathComponent(path)}`;
  const file = str("file_path");
  if (file) return `${label} · ${lastPathComponent(file)}`;
  const query = str("query");
  if (query) return `${label} · ${query.slice(0, 40)}`;
  return label;
}

/**
 * What the Allow button actually authorises. Approving "Write" tells you nothing
 * — approving `Write · C:\…\.env` tells you everything, and the difference is
 * the whole point of approving from the island rather than blind.
 *
 * Ordered by how specific the field is, so an unfamiliar tool still shows
 * whatever identifying string it carries instead of falling back to its name.
 */
const APPROVAL_FIELDS = [
  "command", // Bash, PowerShell
  "cmd",
  "file_path", // Write, Edit, MultiEdit, NotebookEdit
  "path", // Read, LS
  "url", // WebFetch
  "query", // WebSearch
  "pattern", // Glob, Grep
  "prompt", // Task
] as const;

function approvalTarget(tool: string, input: Record<string, unknown>): string {
  for (const field of APPROVAL_FIELDS) {
    const value = input[field];
    if (typeof value === "string" && value.trim()) {
      return `${tool} · ${value.trim()}`;
    }
  }
  return tool;
}


export function registerHookHandlers(island: Island) {
  void onEvent<HookPayload>("hook", (payload) => handleHook(island, payload));
}

function handleHook(island: Island, payload: HookPayload) {
  if (State.paused) {
    // Silence here used to cost Claude Code nearly two minutes: the relay waited
    // for a decision from an island that had already decided not to look. Say so,
    // and the terminal takes the question immediately.
    if (payload.request_id) void Bridge.approvalDecline(payload.request_id);
    return;
  }

  const name = payload.hook_event_name ?? "";
  const task = resolveSessionTask(State.tasks, payload);
  const taskId = task.id;
  const focused = State.focusId === taskId;
  const revision = task.revision;
  if (["SessionEnd", "SessionInterrupted", "Stop"].includes(name) && State.pendingApproval?.taskId === taskId) {
    void Bridge.approvalDecline(State.pendingApproval.requestId);
    State.pendingApproval = null;
    State.isPinned = false;
    if (pendingTimeout != null) window.clearTimeout(pendingTimeout);
    pendingTimeout = null;
    island.dropPin();
    if (State.view === "approval") island.setView(State.defaultView());
  }

  /** Alerts force the island open; work events only reveal the compact island. */
  const surface = (view: Parameters<Island["alert"]>[0], isAlert: boolean) => {
    if (State.pendingApproval && view !== "approval") return;
    if (State.mode === "expanded") {
      if (isAlert) island.setView(view);
      else if (focused && ["finished", "error", "question"].includes(State.view)) island.setView("overview");
    } else if (isAlert) {
      island.alert(view);
    } else if (State.mode === "hidden") {
      island.reveal();
    }
  };

  switch (name) {
    case "SessionStart":
      surface("overview", false);
      Sound.play("work");
      break;

    case "UserPromptSubmit": {
      State.updateTask(taskId, "thinking");
      // The field is `prompt`; reading `message` meant this step was always blank.
      const asked = payload.prompt ?? payload.message;
      if (asked) State.appendStep(taskId, asked.slice(0, 60));
      surface("overview", false);
      break;
    }

    case "PreToolUse": {
      State.updateTask(taskId, "working");
      const tool = payload.tool_name ?? "Tool";
      State.appendStep(taskId, stepLabel(tool, payload.tool_input ?? {}));
      surface("overview", false);
      break;
    }

    case "PostToolUse":
      State.updateTask(taskId, "working");
      break;

    case "PostToolUseFailure":
      State.updateTask(taskId, "working");
      State.appendStep(taskId, "⚠ failed");
      break;

    case "Notification": {
      const message = payload.message ?? "";
      const lower = message.toLowerCase();
      if (lower.includes("rate limit") || lower.includes("limite d")) {
        State.updateTask(taskId, "ratelimit");
        Sound.play("rate");
      } else if (message) {
        State.updateTask(taskId, "question");
        State.appendStep(taskId, message);
        if (focused) surface("question", true);
        else { State.setPillBadge(taskId, "approval"); island.reveal(); }
      }
      break;
    }

    case "Stop":
      State.updateTask(taskId, "finished");
      if (payload.message) State.appendStep(taskId, payload.message.slice(0, 60));
      Sound.play("finish");
      if (focused) surface("finished", true);
      else State.setPillBadge(taskId, "finished");
      window.setTimeout(() => {
        // A new prompt/tool event cancels the old turn's visual reset.
        if (task.revision !== revision) return;
        State.updateTask(taskId, "idle");
        State.setPillBadge(taskId, null);
      }, 5200);
      break;

    case "StopFailure":
      State.updateTask(taskId, "error");
      if (payload.message) State.appendStep(taskId, payload.message.slice(0, 240));
      Sound.play("error");
      if (focused) surface("error", true);
      else State.setPillBadge(taskId, "error");
      break;

    case "SessionEnd":
      State.updateTask(taskId, "idle");
      task.steps = [];
      task.stepIndex = 0;
      task.sessionId = undefined;
      task.pillBadge = null;
      if (task.id.includes(":")) {
        State.tasks = State.tasks.filter((t) => t.id !== taskId);
        if (focused) State.focusId = "integration_codex";
      }
      break;

    case "SessionInterrupted":
      State.updateTask(taskId, "idle");
      State.appendStep(taskId, "Interrupted");
      break;

    case "SubagentStart":
      State.appendStep(taskId, "+ subagent");
      break;

    case "SubagentStop":
      State.appendStep(taskId, "• subagent done");
      break;

    case "PermissionRequest": {
      const requestId = payload.request_id ?? "";
      if (!requestId || (payload.provider === "gemini" && payload.client_name !== "Coucou Gemini PC control")) {
        if (requestId) void Bridge.approvalDecline(requestId);
        break;
      }
      // One card, one request. A second one must never quietly replace the first
      // — that would leave a human staring at request B while request A waits for
      // a decision nobody can give. Hand it straight back to the terminal.
      if (State.pendingApproval && State.pendingApproval.requestId !== requestId) {
        if (requestId) void Bridge.approvalDecline(requestId);
        break;
      }
      if (pendingTimeout != null) window.clearTimeout(pendingTimeout);
      const tool = payload.tool_name ?? "Tool";
      const input = payload.tool_input ?? {};
      State.pendingApproval = {
        taskId,
        requestId,
        sessionId: payload.session_id ?? "",
        tool,
        command: approvalTarget(tool, input),
      };
      // The relay's short ack window closes in 800 ms; everything below this
      // line is synchronous, so the card really is up by the time it lands.
      if (requestId) void Bridge.approvalAck(requestId);
      State.updateTask(taskId, "approval");
      State.isPinned = true;
      Sound.play("approval");
      if (focused) {
        island.alert("approval");
      } else {
        // Another agent holds the view, so the card would yank it away. The badge
        // is the signal instead — but it has to be on screen for that to mean
        // anything, hence the reveal. We just told the relay a human can act.
        State.setPillBadge(taskId, "approval");
        island.reveal();
      }
      // Coucou answers within 108 s or not at all; after that the terminal has
      // taken over and the card would be lying.
      pendingTimeout = window.setTimeout(() => {
        pendingTimeout = null;
        if (!State.pendingApproval) return;
        State.pendingApproval = null;
        State.isPinned = false;
        island.dropPin();
        State.updateTask(taskId, "working");
        State.setPillBadge(taskId, null);
        if (State.view === "approval") island.setView(State.defaultView());
        State.notify();
      }, 107_000);
      break;
    }

    default:
      break;
  }
  State.notify();
}
