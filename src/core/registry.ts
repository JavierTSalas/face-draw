// Auto-discovers effects. Drop a folder with an index.ts that default-exports
// defineEffect({...}) into src/effects/ or src/games/ and it shows up.
import type { EffectDefinition } from './effect';

const modules = import.meta.glob<EffectDefinition>(['../effects/*/index.ts', '../games/*/index.ts'], {
  eager: true,
  import: 'default',
});

function validate(path: string, def: EffectDefinition | undefined): def is EffectDefinition {
  if (!def || typeof def.create !== 'function' || !def.id) {
    console.warn(`[registry] ${path} must default-export defineEffect({ id, name, icon, create })`);
    return false;
  }
  return true;
}

export const EFFECTS: EffectDefinition[] = Object.entries(modules)
  .filter(([path, def]) => validate(path, def))
  .map(([, def]) => def)
  .sort((a, b) => {
    const ka = a.kind === 'game' ? 1 : 0;
    const kb = b.kind === 'game' ? 1 : 0;
    return ka - kb || (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name);
  });

const seen = new Set<string>();
for (const e of EFFECTS) {
  if (seen.has(e.id)) console.warn(`[registry] duplicate effect id "${e.id}"`);
  seen.add(e.id);
}

export function findEffect(id: string | null | undefined) {
  return EFFECTS.find((e) => e.id === id);
}
