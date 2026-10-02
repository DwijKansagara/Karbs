import {invoke} from '@tauri-apps/api/core';
// Settings window — the place where anything that writes to disk is confirmed.
// Stage 2 covers the Claude Code hooks and the general preferences; API keys and
// integrations land here too in a later stage.

import "./settings.css";
import { Bridge, onEvent, type HookStatus } from "../core/bridge";
import { DEFAULT_SETTINGS, type Settings } from "../core/state";
import { h, clear } from "../views/dom";

let settings: Settings = { ...DEFAULT_SETTINGS };
let version = "";

const root = document.getElementById("settings-root")!;

async function save() {
  await Bridge.saveSettings(settings);
}

// ── Reusable bits ─────────────────────────────────────────────────────────────

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const el = h("button", { class: on ? "switch on" : "switch", "aria-pressed": on });
  el.addEventListener("click", () => {
    const next = !el.classList.contains("on");
    el.classList.toggle("on", next);
    onChange(next);
  });
  return el;
}

function statusDot(ok: boolean): HTMLElement {
  return h("i", { class: "dot", style: `background:${ok ? "#22c55e" : "#f4505e"}` });
}

function renderDiff(text: string): HTMLElement {
  const box = h("div", { class: "diff" });
  for (const line of text.split("\n")) {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx";
    box.append(h("div", { class: cls, text: line }));
  }
  return box;
}

// ── Claude Code section ───────────────────────────────────────────────────────

function claudeSection(status: HookStatus): HTMLElement {
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const section = h(
    "section",
    {},
    h("h2", {}, statusDot(status.installed), h("span", { text: "Claude Code" })),
    body,
  );

  const rebuild = async () => {
    const fresh = await Bridge.hooksStatus();
    if (fresh) Object.assign(status, fresh);
    clear(body);
    draw();
    const head = section.querySelector("h2")!;
    clear(head);
    head.append(statusDot(status.installed), h("span", { text: "Claude Code" }));
  };

  function draw() {
    body.append(
      h("div", {
        class: "hint",
        text: status.installed
          ? "Karbs is hooked into your Claude Code sessions. Tool calls, questions and permission requests show up in the island, and you can answer them there."
          : "Install the hooks to see your Claude Code sessions in the island and approve permissions without leaving what you are doing.",
      }),
      h("div", { class: "row" },
        h("label", { text: "settings.json" }),
        h("span", { class: "path", text: status.settingsPath }),
      ),
      h("div", { class: "row" },
        h("label", { text: "Relay" }),
        h("span", { class: "path", text: status.hookPath }),
        statusDot(status.hookReady),
      ),
    );

    if (!status.hookReady) {
      body.append(h("div", {
        class: "notice warn",
        text: "karbs-hook.exe is not in place yet. Restart Karbs; if it still fails, build it with `cargo build -p karbs-hook`.",
      }));
    }

    const actions = h("div", { class: "row" });
    const install = h("button", {
      class: "primary",
      text: status.installed ? "Reinstall hooks…" : "Install hooks…",
      onclick: () => showPreview(true),
    });
    // Writing hook commands that point at a relay which isn't there would give
    // every Claude Code session a broken hook and nothing to show for it.
    if (!status.hookReady) {
      install.disabled = true;
      install.title = "The relay isn't installed yet.";
    }
    actions.append(install);
    if (status.installed) {
      actions.append(h("button", {
        class: "danger",
        text: "Uninstall hooks…",
        onclick: () => showPreview(false),
      }));
    }
    body.append(actions);
  }

  async function showPreview(install: boolean) {
    let preview;
    try {
      preview = await Bridge.hooksPreview(install);
    } catch (err) {
      // An unreadable or invalid settings.json stops here rather than being
      // treated as empty and written over.
      clear(body);
      body.append(
        h("div", { class: "notice err", text: String(err).replace(/^Error:\s*/, "") }),
        h("div", { class: "row" }, h("button", {
          text: "Back",
          onclick: () => { clear(body); draw(); },
        })),
      );
      return;
    }
    if (!preview) return;
    clear(body);
    body.append(
      h("div", {
        class: "hint",
        text: install
          ? "This is exactly what will change in your settings.json. Your own hooks are left untouched."
          : "This removes Karbs' entries only. Your own hooks are left untouched.",
      }),
      renderDiff(preview.diff),
      h("div", { class: "row" },
        h("span", { class: "path", text: `Backup → ${preview.backup}` }),
      ),
    );
    const confirm = h("button", {
      class: install ? "primary" : "danger",
      text: install ? "Back up and write" : "Back up and remove",
    });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        const backup = await Bridge.hooksApply(install, preview.fingerprint);
        clear(body);
        body.append(h("div", {
          class: "notice ok",
          text: `Done. Previous settings saved as ${backup}. Open a new Claude Code session to pick the hooks up.`,
        }));
        window.setTimeout(() => void rebuild(), 2600);
      } catch (err) {
        confirm.disabled = false;
        body.append(h("div", { class: "notice err", text: `Could not write: ${String(err)}` }));
      }
    });
    body.append(h("div", { class: "row" }, confirm, h("button", {
      text: "Cancel",
      onclick: () => { clear(body); draw(); },
    })));
  }

  draw();
  return section;
}

// ── Claude API section ────────────────────────────────────────────────────────

const MODELS: [string, string][] = [
  ["claude-opus-5", "Claude Opus 5"],
  ["claude-sonnet-5", "Claude Sonnet 5"],
  ["claude-haiku-4-5", "Claude Haiku 4.5"],
];

function apiSection(hasKey: boolean, keyName = "anthropic-api-key", providerName = "Claude"): HTMLElement {
  const dot = statusDot(hasKey);
  const state = h("span", { class: "hint", text: hasKey ? "Key saved in the Windows Credential Manager." : "No API key saved for this provider." });

  const field = h("input", {
    type: "password",
    placeholder: hasKey ? "••••••••••••  (stored)" : "Paste API key",
    style: "flex:1 1 auto;min-width:0",
    autocomplete: "off",
    spellcheck: "false",
  }) as HTMLInputElement;

  const saveBtn = h("button", { class: "primary", text: "Save key" });
  const clearBtn = h("button", { class: "danger", text: "Remove" });
  const feedback = h("div", {});

  async function refresh() {
    const present = (await Bridge.secretPresent(keyName)) ?? false;
    dot.style.background = present ? "#22c55e" : "#f4505e";
    state.textContent = present
      ? "Key saved in the Windows Credential Manager."
      : "No API key saved for this provider.";
    field.placeholder = present ? "••••••••••••  (stored)" : "Paste API key";
    clearBtn.style.display = present ? "" : "none";
  }

  saveBtn.addEventListener("click", async () => {
    const value = field.value.trim();
    if (!value) return;
    clear(feedback);
    try {
      await Bridge.secretSet(keyName, value);
      field.value = "";
      feedback.append(h("div", { class: "notice ok", text: "Saved in Windows Credential Manager." }));
      await refresh();
    } catch (err) {
      feedback.append(h("div", { class: "notice err", text: `Could not save: ${String(err)}` }));
    }
  });

  clearBtn.addEventListener("click", async () => {
    clear(feedback);
    try {
      await Bridge.secretClear(keyName);
      feedback.append(h("div", { class: "notice ok", text: "Key removed." }));
      await refresh();
    } catch (err) {
      feedback.append(h("div", { class: "notice err", text: `Could not remove: ${String(err)}` }));
    }
  });

  const model = h("select", {}) as HTMLSelectElement;
  for (const [id, label] of MODELS) model.append(h("option", { value: id, text: label }));
  if (!MODELS.some(([id]) => id === settings.model)) {
    model.append(h("option", { value: settings.model, text: settings.model }));
  }
  model.value = settings.model;
  model.addEventListener("change", () => {
    settings.model = model.value;
    void save();
  });

  clearBtn.style.display = hasKey ? "" : "none";

  return h(
    "section",
    {},
    h("h2", {}, dot, h("span", { text: providerName })),
    state,
    h("div", { class: "row" }, h("label", { text: "API key" }), field, saveBtn, clearBtn),
    ...(keyName === "anthropic-api-key" ? [h("div", { class: "row" }, h("label", { text: "Model" }), model)] : []),
    feedback,
  );
}

// ── Integrations section ──────────────────────────────────────────────────────

function chatSection(): HTMLElement {
  const voiceFeedback=h("div",{class:"hint"});
  void onEvent<{stage?:string;error?:string}>("voice-output",event=>{voiceFeedback.textContent=event.error?`Speech: ${event.error}`:({preparing:"Preparing natural voice…",speaking:"Playing voice sample…",finished:"Voice playback completed."} as Record<string,string>)[event.stage??""]??"";});
  const voice = h("select", {}) as HTMLSelectElement;
  for (const [value,text] of [["en-IN-NeerjaNeural","Natural · Indian English"],["en-US-JennyNeural","Natural · American English"],["en-GB-SoniaNeural","Natural · British English"],["windows","Windows voice · offline"]]) voice.append(h("option",{value,text}));
  voice.value=settings.speechVoice;
  voice.addEventListener("change",()=>{settings.speechVoice=voice.value;void save();});
  const toggle = (key: "computerControl" | "speakReplies" | "fullAccess", label: string) => {
    const input = h("input", { type: "checkbox" }) as HTMLInputElement;
    input.checked = settings[key];
    input.dataset.setting=key;
    input.addEventListener("change", () => {
      settings[key] = input.checked;
      if(key === "fullAccess" && input.checked) settings.computerControl=true;
      if(key === "computerControl" && !input.checked) settings.fullAccess=false;
      document.querySelectorAll<HTMLInputElement>('input[data-setting]').forEach(control=>{
        const setting=control.dataset.setting as "computerControl" | "speakReplies" | "fullAccess";
        control.checked=settings[setting];
      });
      void save();
    });
    return h("label", { class: "row", style: "gap:10px;cursor:pointer" }, input, h("span", { text: label }));
  };
  const provider = h("select", {}) as HTMLSelectElement;
  for (const [value, text] of [["codex", "Codex — existing login"], ["gemini", "Gemini API"], ["claude", "Claude API"]]) {
    provider.append(h("option", { value, text }));
  }
  provider.value = settings.chatProvider;
  provider.addEventListener("change", () => {
    settings.chatProvider = provider.value as Settings["chatProvider"];
    void save();
  });
  const field = (key: "codexPath" | "codexModel" | "geminiModel", placeholder: string) => {
    const input = h("input", { type: "text", value: settings[key], placeholder, style: "flex:1;min-width:0", spellcheck: "false" }) as HTMLInputElement;
    input.addEventListener("change", () => { settings[key] = input.value.trim(); void save(); });
    return input;
  };
  return h("section", {}, h("h2", { text: "Chat" }),
      toggle("speakReplies", "Speak replies aloud"),
      h("div",{class:"row"},h("label",{text:"Voice"}),voice),
      h("div",{class:"hint",text:"Natural voices send reply text to Microsoft's online speech service. Whisper microphone transcription runs locally on E:."}),
      toggle("computerControl", "Enable PC control in Codex and Gemini chat"),
      toggle("fullAccess", "Full access — perform requested PC actions without step approvals"),
      h("div", {class:"hint",text:"Access changes apply to the next chat task. A running task keeps its launch permissions until it ends. Windows security prompts still belong to Windows."}),
      h("button", {class:"btn",text:"Test voice",onclick:()=>{voiceFeedback.textContent="Preparing voice…";void Bridge.speak("Hi! Karbs is ready to talk with you.").catch(err=>{voiceFeedback.textContent=String(err);});}}),
      voiceFeedback,
    h("div", { class: "row" }, h("label", { text: "Provider" }), provider),
      h("div", { class: "hint", text: "Choose Codex or Gemini in chat. Both support desktop tools with PC control on, and skip step approvals in Full access. Codex uses your existing sign-in; Gemini uses the API key saved below. Changing provider or model starts a new conversation." }),
    h("div", { class: "row" }, h("label", { text: "Codex app" }), field("codexPath", "Auto-detect codex.exe")),
    h("div", { class: "row" }, h("label", { text: "Codex model" }), field("codexModel", "Codex default")),
    h("div", { class: "row" }, h("label", { text: "Gemini model" }), field("geminiModel", "gemini-3.8-flash")),
      h("div", { class: "hint", text: "Gemini chat needs an API key from Google AI Studio, saved below. App sign-in is separate. Selected attachments are sent with your question. Codex supports text, images, PDF pages and sampled GIF frames. PDF/GIF attachments must be under 8 MB." }));
}

interface IntegrationDef {
  id: string;
  name: string;
  color: string;
  /** Credential Manager keys, in the order they are shown. */
  fields: { key: string; label: string; placeholder: string; secret: boolean }[];
}

const INTEGRATIONS: IntegrationDef[] = [
  { id: "integration_stripe", name: "Stripe", color: "#0570DE",
    fields: [{ key: "stripe-api-key", label: "Secret key", placeholder: "sk_live_…", secret: true }] },
  { id: "integration_github", name: "GitHub", color: "#F4505E",
    fields: [{ key: "github-token", label: "Token", placeholder: "ghp_…", secret: true }] },
  { id: "integration_vercel", name: "Vercel", color: "#7C5CFF",
    fields: [{ key: "vercel-token", label: "Token", placeholder: "…", secret: true }] },
  { id: "integration_n8n", name: "n8n", color: "#F29B38",
    fields: [
      { key: "n8n-url", label: "Instance URL", placeholder: "https://n8n.example.com", secret: false },
      { key: "n8n-api-key", label: "API key", placeholder: "…", secret: true },
    ] },
  { id: "integration_resend", name: "Resend", color: "#22C55E",
    fields: [{ key: "resend-api-key", label: "API key", placeholder: "re_…", secret: true }] },
  { id: "integration_notion", name: "Notion", color: "#8C8C8C",
    fields: [{ key: "notion-api-key", label: "Integration token", placeholder: "ntn_…", secret: true }] },
  { id: "integration_calcom", name: "Cal.com", color: "#C9956A",
    fields: [{ key: "calcom-api-key", label: "API key", placeholder: "cal_…", secret: true }] },
];

const MAX_ACTIVE = 4;

function integrationsSection(present: Record<string, boolean>): HTMLElement {
  const note = h("div", { class: "hint" });
  const list = h("div", { style: "display:flex;flex-direction:column;gap:14px" });

  function updateNote() {
    const used = settings.activeIntegrations.length;
    note.textContent = `Pick up to ${MAX_ACTIVE} pills to show next to Karbs — ${used}/${MAX_ACTIVE} in use. Keys are stored in the Windows Credential Manager, never on disk.`;
  }

  for (const def of INTEGRATIONS) {
    const active = settings.activeIntegrations.includes(def.id);
    const sw = h("button", { class: active ? "switch on" : "switch" });
    sw.addEventListener("click", () => {
      const on = settings.activeIntegrations.includes(def.id);
      if (on) {
        settings.activeIntegrations = settings.activeIntegrations.filter((x) => x !== def.id);
      } else {
        if (settings.activeIntegrations.length >= MAX_ACTIVE) return;
        settings.activeIntegrations = [...settings.activeIntegrations, def.id];
      }
      sw.classList.toggle("on", !on);
      updateNote();
      void save();
    });

    const rows = h("div", { style: "display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-width:0" });
    for (const field of def.fields) {
      const input = h("input", {
        type: field.secret ? "password" : "text",
        placeholder: present[field.key] ? "••••••••  (stored)" : field.placeholder,
        autocomplete: "off",
        spellcheck: "false",
        style: "flex:1 1 auto;min-width:0",
      }) as HTMLInputElement;
      const saveBtn = h("button", { text: "Save" });
      const dotEl = statusDot(present[field.key] ?? false);
      saveBtn.addEventListener("click", async () => {
        const value = input.value.trim();
        try {
          await Bridge.secretSet(field.key, value);
          present[field.key] = value.length > 0;
          input.value = "";
          input.placeholder = value ? "••••••••  (stored)" : field.placeholder;
          dotEl.style.background = value ? "#22c55e" : "#f4505e";
        } catch {
          dotEl.style.background = "#f5a524";
        }
      });
      rows.append(
        h("div", { class: "row" },
          h("label", { style: "min-width:104px", text: field.label }),
          input, saveBtn, dotEl,
        ),
      );
    }

    list.append(
      h("div", { style: "display:flex;gap:12px;align-items:flex-start" },
        h("div", { style: "display:flex;align-items:center;gap:8px;min-width:132px;padding-top:4px" },
          sw,
          h("i", { class: "dot", style: `background:${def.color}` }),
          h("span", { style: "font-size:12.5px", text: def.name }),
        ),
        rows,
      ),
    );
  }

  updateNote();
  return h("section", {}, h("h2", {}, h("span", { text: "Integrations" })), note, list);
}

// ── General section ───────────────────────────────────────────────────────────

function generalSection(): HTMLElement {
  const volume = h("input", {
    type: "range", min: "0", max: "0.2", step: "0.005",
    value: String(settings.soundVolume),
  }) as HTMLInputElement;
  volume.addEventListener("input", () => {
    settings.soundVolume = Number(volume.value);
    void save();
  });

  const autoClose = h("input", {
    type: "number", min: "5", max: "120", step: "1",
    value: String(Math.round(settings.autoCloseInterval)),
    style: "width:72px",
  }) as HTMLInputElement;
  autoClose.addEventListener("change", () => {
    settings.autoCloseInterval = Math.max(5, Math.min(120, Number(autoClose.value) || 15));
    autoClose.value = String(settings.autoCloseInterval);
    void save();
  });

  const screen = h("select", {}) as HTMLSelectElement;
  screen.append(
    h("option", { value: "primary", text: "Main display" }),
    h("option", { value: "cursor", text: "Display under the cursor" }),
  );
  screen.value = settings.screen;
  screen.addEventListener("change", () => {
    settings.screen = screen.value as Settings["screen"];
    void save();
  });

  return h(
    "section",
    {},
    h("h2", {}, h("span", { text: "General" })),
    h("div", { class: "row" },
      h("label", { text: "Sound" }),
      toggle(settings.soundEnabled, (v) => { settings.soundEnabled = v; void save(); }),
      volume,
    ),
    h("div", { class: "row" },
      h("label", { text: "Auto-close" }),
      autoClose,
      h("span", { class: "hint", text: "seconds after you leave the island" }),
    ),
    h("div", { class: "row" },
      h("label", { text: "Island lives on" }),
      screen,
    ),
    h("div", { class: "row" },
      h("label", { text: "Launch at startup" }),
      toggle(settings.autostart, (v) => { settings.autostart = v; void save(); }),
    ),
  );
}


function runtimeSection():HTMLElement{
 const status=h('p',{class:'hint','data-update-status':'',text:'Meet Karbs, your personal desktop assistant. Connect Codex or Gemini, then start with a small task.'});
 const make=(text:string,voice:boolean)=>{const b=h('button',{text});b.onclick=async()=>{b.setAttribute('disabled','');status.textContent=voice?'Downloading voice and file components. This includes an English speech model and can take several minutes.':'Setting up desktop components…';try{status.textContent=await invoke<string>('setup_runtime',{voice});}catch(e){status.textContent=String(e);}finally{b.removeAttribute('disabled');}};return b;};
 const check=h('button',{text:'Check for updates'}),install=h('button',{text:'Install update and restart',style:'display:none'});
 check.onclick=async()=>{check.setAttribute('disabled','');try{const r=await invoke<{current?:boolean,version?:string}>('check_update');status.textContent=r.current?'Karbs is up to date.':('Version '+r.version+' is available.');install.style.display=r.current?'none':'';}catch{status.textContent='Could not check releases. Check your connection or visit GitHub releases.';}finally{check.removeAttribute('disabled');}};
 install.onclick=async()=>{install.setAttribute('disabled','');status.textContent='Downloading and verifying the signed update…';try{await invoke('install_update');}catch(e){status.textContent=String(e);install.removeAttribute('disabled');}};
 return h('section',{},h('h2',{text:'Welcome to Karbs'}),status,make('Set up desktop components',false),make('Set up voice and PDF/GIF support',true),check,install,h('a',{href:'https://karbs.antideploy.app/privacy/',target:'_blank',rel:'noopener',text:'Privacy policy'}));
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main() {
  const boot = await Bridge.boot();
  void onEvent<{version:string}>('update-available',r=>{const status=document.querySelector('[data-update-status]');if(status)status.textContent='Karbs '+r.version+' is available. Use Check for updates to install it.';});
  if (boot) {
    settings = { ...settings, ...boot.settings };
    version = boot.version;
  }
  const status = (await Bridge.hooksStatus()) ?? {
    installed: false, settingsPath: "", hookPath: "", hookReady: false,
  };

  const hasKey = (await Bridge.secretPresent("anthropic-api-key")) ?? false;

  const keys = [
    "stripe-api-key", "github-token", "vercel-token",
    "n8n-url", "n8n-api-key", "resend-api-key", "notion-api-key", "calcom-api-key",
  ];
  const present: Record<string, boolean> = {};
  for (const k of keys) present[k] = (await Bridge.secretPresent(k)) ?? false;

  clear(root);
  root.append(
    h("h1", {}, h("span", { text: "Karbs" }), h("span", { class: "version", text: version })),
    runtimeSection(),
    claudeSection(status),
    h("section", {},
      h("h2", { text: "Codex & Gemini" }),
      h("div", { class: "hint", text: "Choose a signed-in Codex CLI executable or add your Gemini API key below. Use PC control for built-in desktop tasks." }),
      h("div", { class: "hint", text: "In Codex, review the project hooks with /hooks after reconnecting. Choose the built-in chat provider below." })),
    chatSection(),
    apiSection((await Bridge.secretPresent("gemini-api-key")) ?? false, "gemini-api-key", "Gemini API key"),
    apiSection(hasKey),
    integrationsSection(present),
    generalSection(),
    h("div", {
      class: "hint",
      text: "Read the privacy policy for AI-provider requests, optional online speech, component downloads and release checks.",
    }),
  );

  void onEvent<Settings>("settings-changed", (s) => {
    settings = { ...settings, ...s };
  });
}

void main();
