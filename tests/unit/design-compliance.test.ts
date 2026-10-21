import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Mechanical subset of design.md §9 review gates, applied to our source.
const ROOT = join(import.meta.dirname, '..', '..');
const design = readFileSync(join(ROOT, 'design.md'), 'utf8');

const legalClasses = new Set<string>();
for (const match of design.matchAll(/#### Legal class set[^\n]*\n\n([^\n]+)/g)) {
  for (const cls of match[1]!.matchAll(/`(lp-[a-z0-9_-]+)`/g)) legalClasses.add(cls[1]!);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const uiFiles = walk(join(ROOT, 'src')).filter((f) => /\.(tsx|css)$/.test(f));
const read = (f: string) => readFileSync(f, 'utf8');

describe('Lepidus design compliance (src/)', () => {
  it('parsed the legal class inventory from design.md', () => {
    expect(legalClasses.size).toBeGreaterThan(250);
    expect(legalClasses.has('lp-button--primary')).toBe(true);
  });

  it('uses only documented lp-* classes', () => {
    const used = new Map<string, string>();
    for (const file of uiFiles) {
      for (const m of read(file).matchAll(/\blp-[a-z0-9_-]+/g)) {
        // Template-literal prefixes such as `lp-badge--${x}` are checked via their rendered output in UI tests.
        if (m[0].endsWith('-')) continue;
        used.set(m[0], relative(ROOT, file));
      }
    }
    const illegal = [...used.entries()].filter(([cls]) => !legalClasses.has(cls));
    expect(illegal).toEqual([]);
    expect(used.size).toBeGreaterThan(30);
  });

  it('has no raw hex colours outside a var(--token, #hex) fallback', () => {
    const offenders: string[] = [];
    for (const file of uiFiles) {
      read(file)
        .split('\n')
        .forEach((line, i) => {
          const stripped = line.replace(/var\(--[a-z0-9-]+,\s*#[0-9a-fA-F]{3,8}\)/g, '');
          if (/#[0-9a-fA-F]{3,8}\b/.test(stripped)) offenders.push(`${relative(ROOT, file)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('page CSS never targets .lp-* selectors and uses only existing tokens', () => {
    const css = uiFiles
      .filter((f) => f.endsWith('.css'))
      .map(read)
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\.lp-/);
    const tokens = new Set([...design.matchAll(/^\| `(--[a-zA-Z0-9-]+)`/gm)].map((m) => m[1]));
    const usedTokens = [...css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)].map((m) => m[1]!);
    expect(usedTokens.filter((t) => !tokens.has(t))).toEqual([]);
  });

  it('no native <select>; root layout sets data-theme and links lepidus.css + lepidus.js', () => {
    for (const file of uiFiles) expect(read(file)).not.toMatch(/<select\b/);
    const layout = read(join(ROOT, 'src', 'app', 'layout.tsx'));
    expect(layout).toContain('data-theme="light"');
    expect(layout).toContain('https://lepide-design-system.vercel.app/v1/lepidus.css');
    expect(layout).toContain('https://lepide-design-system.vercel.app/v1/lepidus.js');
  });
});
