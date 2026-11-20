// Every tutorial lesson must be solvable: its goal is met by at least one legal move,
// and the goal move leaves a sensible position (the last lesson must be checkmate).
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { LESSONS, lessonGame } from '../public/tutorial.js';

let n = 0;
for (const lesson of LESSONS) {
  const g = lessonGame(Game, lesson);
  assert.equal(g.turn, 'white', `${lesson.id}: White to move`);
  assert.ok(lesson.it && lesson.en, `${lesson.id}: both languages`);
  if (!lesson.goal) continue;
  const ok = g.legal().filter((m) => lesson.goal(m));
  assert.ok(ok.length > 0, `${lesson.id}: goal reachable`);
  const m = ok[0];
  g.move(m.from, m.to, m.promotion || null);
  if (lesson.id === 'mate') assert.equal(g.status, 'checkmate', 'mate lesson ends in checkmate');
  else assert.equal(g.status, 'playing', `${lesson.id}: game goes on`);
  n++;
}
console.log(`tutorial tests: ${n} lessons solvable`);
