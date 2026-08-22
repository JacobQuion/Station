import { readFileSync } from 'node:fs';
import { parseIcs } from './src/lib/ics';
import { plan, isCommitment, remainingMin } from './src/lib/planner';
import { DEFAULT_SETTINGS } from './src/store/useStation';

const text = readFileSync('demo/station-demo.ics', 'utf8');
const feed = parseIcs(text, 'src_test');
const now = new Date();
console.log('warnings:', feed.warnings);
console.log('courses:', feed.courses.map((c) => `${c.name}(h${c.hue})`).join(', '));
const kinds: Record<string, number> = {};
for (const i of feed.items) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
console.log('items:', feed.items.length, kinds);

const cn = new Map(feed.courses.map((c) => [c.id, c.name]));
console.log('\n--- non-class items ---');
for (const i of feed.items.filter((x) => x.kind !== 'class').sort((a, b) => (a.due ?? a.start!).localeCompare(b.due ?? b.start!)))
  console.log(
    [
      new Date(i.due ?? i.start!).toLocaleString('en-US',{month:'short',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit'}).padEnd(24),
      i.kind.padEnd(10),
      `p${i.priority}`,
      String(i.estimateMin).padStart(3) + 'm',
      i.allDay ? 'ALLDAY' : isCommitment(i) ? 'fixed ' : '      ',
      (cn.get(i.courseId ?? '') ?? '-').padEnd(9),
      i.title,
      i.url ? '(url)' : '',
    ].join(' ')
  );

const result = plan({ items: feed.items, settings: DEFAULT_SETTINGS, now });
console.log('\nblocks:', result.blocks.length, '| late blocks:', result.blocks.filter((b) => b.late).length);
console.log('risks:', result.risks.map((r) => `${feed.items.find((i) => i.id === r.itemId)!.title} [${r.level}${r.shortfallMin ? ' ' + Math.round(r.shortfallMin) + 'm' : ''}]`));
const today = new Date().toISOString().slice(0, 10);
console.log('\n--- today plan ---');
for (const b of result.blocks.filter((b) => new Date(b.start).toDateString() === new Date().toDateString()))
  console.log(new Date(b.start).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}), '-', new Date(b.end).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}), Math.round(b.minutes) + 'm', b.late ? 'LATE' : '', feed.items.find((i) => i.id === b.itemId)!.title);
console.log('\nload:', Object.entries(result.loadByDay).slice(0, 7).map(([k, v]) => `${k.slice(5)}:${Math.round(v)}`).join(' '));
console.log('total work outstanding:', feed.items.reduce((s, i) => s + remainingMin(i), 0), 'min');
