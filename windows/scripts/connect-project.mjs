import { readFile, writeFile, mkdir, copyFile, rename, access } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export const events = {
  codex: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
    'PermissionRequest', 'Stop', 'Interrupt', 'SubagentStart', 'SubagentStop'],
  gemini: ['SessionStart', 'SessionEnd', 'BeforeAgent', 'AfterAgent', 'BeforeTool', 'AfterTool', 'Notification'],
};
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');
const owns = (handler, relay, provider) => typeof handler?.command === 'string' &&
  [`"${relay.replaceAll('\\', '/')}" --provider ${provider} `,
   `${relay.replaceAll('\\', '/')} --provider ${provider} `].some(prefix => handler.command.replaceAll('\\', '/').toLowerCase().startsWith(prefix.toLowerCase()));

export function mergeHooks(existing, provider, relay, remove = false) {
  if (!isObject(existing)) throw new Error('Settings must be a JSON object.');
  if (!(provider in events)) throw new Error('Unknown provider.');
  const result = structuredClone(existing);
  if (result.hooks !== undefined && !isObject(result.hooks)) throw new Error('Existing hooks must be an object.');
  const hooks = result.hooks ?? {};
  // Remove only our handlers, including within groups shared with other tools.
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) throw new Error(`hooks.${event} must be an array.`);
    hooks[event] = groups.flatMap(group => {
      if (!isObject(group) || !Array.isArray(group.hooks)) throw new Error(`Invalid hook group in ${event}.`);
      const kept = group.hooks.filter(handler => !owns(handler, relay, provider));
      return kept.length ? [{ ...group, hooks: kept }] : [];
    });
    if (!hooks[event].length) delete hooks[event];
  }
  if (!remove) {
    for (const event of events[provider]) {
      const normalized = relay.replaceAll('\\', '/');
      // A quoted executable alone is a string expression in PowerShell. Our
      // installed E-drive path has no spaces and runs directly in both shells.
      const executable = provider === 'codex' && /^[A-Za-z]:\/[A-Za-z0-9._/-]+$/.test(normalized) ? normalized : `"${normalized}"`;
      const handler = { type: 'command', command: `${executable} --provider ${provider} ${event}`,
        timeout: provider === 'gemini' ? 3000 : event === 'PermissionRequest' ? 120 : ['SessionEnd','Interrupt'].includes(event) ? 3 : 5 };
      if (provider === 'gemini') handler.name = `coucou-personal-${event}`;
      (hooks[event] ??= []).push({ ...(provider === 'gemini' && /Tool$/.test(event) ? { matcher: '.*' } : {}), hooks: [handler] });
    }
  }
  if (Object.keys(hooks).length) result.hooks = hooks;
  else delete result.hooks;
  return result;
}

async function readSettings(file) {
  let bytes;
  try { bytes = await readFile(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; bytes = Buffer.alloc(0); }
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  return { bytes, value: text.trim() ? JSON.parse(text) : {} };
}

export async function prepare(project, relay, remove = false, providers = Object.keys(events)) {
  project = resolve(project); relay = resolve(relay);
  await access(project);
  if (!remove) await access(relay);
  const files = [];
  for (const provider of providers) {
    const file = join(project, `.${provider}`, provider === 'codex' ? 'hooks.json' : 'settings.json');
    const { bytes, value } = await readSettings(file);
    const next = mergeHooks(value, provider, relay, remove);
    files.push({ provider, file, fingerprint: fingerprint(bytes) });
    console.log(`${remove ? 'Remove' : 'Connect'} ${provider}: ${file}`);
    // Print only our own definitions; unrelated settings may contain API keys.
    for (const event of events[provider]) {
      for (const group of next.hooks?.[event] ?? []) {
        for (const handler of group.hooks) if (owns(handler, relay, provider)) console.log(`  + ${event}: ${handler.command} (timeout ${handler.timeout})`);
      }
    }
  }
  return { version: 1, project, relay, remove, files };
}

export async function apply(plan) {
  if (plan.version !== 1) throw new Error('Unsupported plan.');
  // Validate BOTH files before making any changes.
  const prepared = [];
  for (const entry of plan.files) {
    const expected = join(plan.project, `.${entry.provider}`, entry.provider === 'codex' ? 'hooks.json' : 'settings.json');
    if (resolve(entry.file) !== resolve(expected)) throw new Error('Plan path mismatch.');
    const { bytes, value } = await readSettings(entry.file);
    if (fingerprint(bytes) !== entry.fingerprint) throw new Error(`${entry.file} changed after preview. Preview again.`);
    const next = mergeHooks(value, entry.provider, plan.relay, plan.remove);
    // An already connected project keeps its original bytes and trust identity.
    if (JSON.stringify(value) !== JSON.stringify(next)) prepared.push({ ...entry, bytes, next });
  }
  const backups = [];
  for (const entry of prepared) {
    await mkdir(dirname(entry.file), { recursive: true });
    const current = await readSettings(entry.file);
    if (fingerprint(current.bytes) !== entry.fingerprint) throw new Error(`${entry.file} changed before writing.`);
    if (entry.bytes.length) {
      const backup = `${entry.file}.bak-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
      await copyFile(entry.file, backup);
      backups.push(backup);
    }
    const temp = `${entry.file}.coucou-${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(entry.next, null, 2) + '\n', { flag: 'wx' });
    await rename(temp, entry.file);
    console.log(`Updated ${entry.file}`);
  }
  return backups;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [mode, first, second, third] = process.argv.slice(2);
    if (mode === '--preview') {
      const flags = process.argv.slice(5);
      const plan = await prepare(first, second, flags.includes('--remove'), flags.includes('--codex-only') ? ['codex'] : Object.keys(events));
      const planPath = process.env.COUCOU_PLAN_PATH || join(tmpdir(), 'karbs-connection-plan.json');
      await writeFile(planPath, JSON.stringify(plan, null, 2));
      console.log(`Plan: ${planPath}`);
    } else if (mode === '--apply') {
      const backups = await apply(JSON.parse(await readFile(first, 'utf8')));
      for (const backup of backups) console.log(`Backup: ${backup}`);
    } else throw new Error('Usage: --preview <project> <relay> [--remove] OR --apply <plan>');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
