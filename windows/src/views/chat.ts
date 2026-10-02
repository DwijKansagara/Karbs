// Chat view — DOM port of PromptView / ChatBubble / TypingDotsView from
// IslandViewContent.swift.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { Bridge, onEvent, type ChatContext } from "../core/bridge";
import { Sound } from "../core/sound";
import { State, type ChatMessage } from "../core/state";
import type { ViewHost } from "./views";

let nextId = 1;

function bubble(message: ChatMessage): HTMLElement {
  if (message.role === "user") {
    return h(
      "div",
      { class: "chat-row user" },
      h("div", { class: "bubble", text: message.content }),
    );
  }
  return h("div", { class: "chat-row" }, h("div", { class: "reply", text: message.content }));
}

function typingDots(): HTMLElement {
  return h(
    "div",
    { class: "chat-row" },
    h("div", { class: "typing" }, h("i"), h("i"), h("i")),
  );
}

/** The coloured chip showing what the question is about (a dropped file). */
function contextChip(label: string): HTMLElement {
  const chip = h("div", { class: "chip" }, h("i", { class: "chip-dot" }), h("span", { text: label }));
  requestAnimationFrame(() => chip.classList.add("settled"));
  return chip;
}

export function buildPrompt(onHeightChange: () => void): ViewHost {
  const chipRow = h("div", { class: "chip-row" });
  const log = h("div", { class: "chat-log" });
  const input = h("input", {
    type: "text",
    class: "chat-input",
    placeholder: "Ask me anything…",
    spellcheck: "false",
  }) as HTMLInputElement;
  const send = h("button", { class: "send-btn", title: "Send" }, svg(ICONS.arrowUp, 11));
  const microphone = h("button", { class: "send-btn voice-btn", title: "Dictate a command" },svg(ICONS.microphone,14));
  const stopVoice = h("button", { class: "send-btn", title: "Stop speaking", text: "◼" });
  const bar = h("div", { class: "chat-bar" }, microphone, input, stopVoice, send);
  const voiceStatus=h("div",{class:"voice-status",text:"Click the microphone, then speak after Listening appears."});
  const access=h("button",{class:"access-mode",title:"Change access for the next chat task"});
  let accessSave: Promise<unknown> = Promise.resolve();
  const providerSelect=h("select",{class:"chat-provider",title:"Choose chat provider"}) as HTMLSelectElement;
  for(const [value,label] of [["codex","Codex"],["gemini","Gemini"],["claude","Claude"]]) providerSelect.append(h("option",{value,text:label}));
  providerSelect.addEventListener("change",()=>{
    State.settings.chatProvider=providerSelect.value as typeof State.settings.chatProvider;
    State.chatHistory=[];
    accessSave=(async()=>{await Bridge.saveSettings(State.settings);await Bridge.chatReset();})();
    void accessSave.catch(err=>{voiceStatus.textContent=String(err);});
    State.notify();
  });
  access.addEventListener("click",()=>{
    State.settings.fullAccess=!State.settings.fullAccess;
    if(State.settings.fullAccess) State.settings.computerControl=true;
    accessSave=Bridge.saveSettings(State.settings);
    void accessSave.catch(err=>{voiceStatus.textContent=`Could not save access: ${String(err)}`;});
    State.notify();
  });

  const el = h(
    "div",
    { class: "view" },
    h("div", { class: "card wash chat-card" }, h("div", { class: "chat-body" }, h("div",{class:"chat-controls"},providerSelect,access), chipRow, log, voiceStatus, bar)),
  );
  (el.querySelector(".card") as HTMLElement).style.setProperty("--wash", "rgba(99,102,241,0.5)");

  let sending = false;
  let listening = false;
  void onEvent<{stage?:string;error?:string}>("voice-input",event=>{
    voiceStatus.textContent=({loading:"Loading Whisper…",listening:"Listening… speak now",transcribing:"Transcribing your words…"} as Record<string,string>)[event.stage??""]??"";
  });
  void onEvent<{stage?:string;error?:string}>("voice-output",event=>{
    voiceStatus.textContent=event.error?`Speech: ${event.error}`:({preparing:"Preparing natural voice…",speaking:"Speaking… ◼ stops playback",finished:""} as Record<string,string>)[event.stage??""]??"";
  });
  microphone.addEventListener("click", async () => {
    if (listening || sending) return;
    listening=true; microphone.textContent="●"; microphone.title="Listening…";microphone.classList.add("listening");microphone.disabled=true;voiceStatus.textContent="Loading Whisper…";
    void Bridge.stopSpeech();
    try { const text=await Bridge.voiceListen(); if(text){input.value=text;voiceStatus.textContent="Review your words, then Send.";} }
    catch(err){voiceStatus.textContent=String(err).replace(/^Error:\s*/,"");}
    finally {listening=false;clear(microphone);microphone.append(svg(ICONS.microphone,14));microphone.title="Dictate a command";microphone.classList.remove("listening");microphone.disabled=sending;input.focus();}
  });
  stopVoice.addEventListener("click",()=>{void Bridge.stopSpeech();voiceStatus.textContent="Speech stopped.";});
  let renderedCount = -1;

  async function submit() {
    const query = input.value.trim();
    if (!query || sending) return;
    input.value = "";
    sending = true;
    Sound.play("send");

    State.chatHistory.push({ id: nextId++, role: "user", content: query });
    const history = State.chatHistory;
    State.stateOverride = "thinking";
    State.notify();
    onHeightChange();

    const file = State.droppedFile;
    const context: ChatContext | null =
      State.chatHistory.length === 1 && file ? { kind: "file", name: file.name, path: file.path } : null;

    try {
      await accessSave;
      const reply = await Bridge.chatSend(query, context);
      if (State.chatHistory !== history) return;
      State.chatHistory.push({ id: nextId++, role: "assistant", content: reply.text });
      if(State.settings.speakReplies) void Bridge.speak(reply.text).catch(err=>{voiceStatus.textContent=`Speech: ${String(err)}`;});
      State.stateOverride = null;
      Sound.play("finish");
    } catch (err) {
      if (State.chatHistory !== history) return;
      State.stateOverride = null;
      State.noteMessage = String(err).replace(/^Error:\s*/, "");
      State.view = "note";
      Sound.play("error");
    } finally {
      sending = false;
      State.stateOverride = null;
      State.notify();
      onHeightChange();
      input.focus();
    }
  }

  send.addEventListener("click", () => void submit());
  input.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      e.preventDefault();
      void submit();
    }
    e.stopPropagation(); // Escape closes the island, not the chat
  });

  return {
    el,
    sync() {
      const file = State.droppedFile;
      const wantChip = file?.name ?? "";
      if (chipRow.dataset.label !== wantChip) {
        chipRow.dataset.label = wantChip;
        clear(chipRow);
        if (wantChip) chipRow.append(contextChip(wantChip));
      }

      const thinking = State.stateOverride === "thinking";
      const count = State.chatHistory.length + (thinking ? 0.5 : 0);
      if (count !== renderedCount) {
        renderedCount = count;
        clear(log);
        for (const m of State.chatHistory) log.append(bubble(m));
        if (thinking) log.append(typingDots());
        log.scrollTop = log.scrollHeight;
      }

      const provider = { codex: "Codex", gemini: "Gemini", claude: "Claude" }[State.settings.chatProvider] ?? "Codex";
      access.textContent=State.settings.fullAccess?"Full access · next task: restore approvals":"Reviewed actions · next task: Full access";
      access.disabled=State.settings.chatProvider==="claude";
      if(access.disabled)access.textContent="PC control is off · enable it in Settings";
      access.classList.toggle("full",State.settings.fullAccess);
      providerSelect.value=State.settings.chatProvider;
      providerSelect.disabled=sending||listening;
      input.placeholder = State.chatHistory.length === 0 ? `Ask ${provider} anything…` : `Continue with ${provider}…`;
      input.disabled = sending;
      microphone.disabled = sending || listening;
      stopVoice.style.display=State.settings.speakReplies ? "" : "none";
    },
    focus() {
      input.focus();
      input.select();
    },
  };
}
