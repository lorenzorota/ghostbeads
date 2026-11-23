'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createPlaybackController} = require('../site/js/playback/controller.js');

function fakeClock() {
  let time = 0, counter = 0;
  const scheduled = new Map();
  const cleared = new Map();
  return {
    now: () => time,
    setTimer(fn, duration) {
      const id = ++counter;
      scheduled.set(id, {due: time + duration, fn});
      return id;
    },
    clearTimer(id) {
      const entry = scheduled.get(id);
      if (entry) cleared.set(id, entry.fn);
      scheduled.delete(id);
    },
    advance(ms) {
      const end = time + ms;
      while (true) {
        let nextId = null, nextDue = Infinity;
        for (const [id, item] of scheduled) {
          if (item.due <= end && item.due < nextDue) {
            nextDue = item.due;
            nextId = id;
          }
        }
        if (nextId === null) break;
        time = nextDue;
        const item = scheduled.get(nextId);
        scheduled.delete(nextId);
        item.fn();
      }
      time = end;
    },
    fireCleared(id) { cleared.get(id)?.(); },
    clearedIds: () => Array.from(cleared.keys()),
    count: () => scheduled.size
  };
}
function setup() {
  const clock = fakeClock();
  const player = createPlaybackController({
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer
  });
  return {clock, player};
}

test('lifecycle and tokens invalidate replaced sessions', () => {
  const {clock, player} = setup();
  assert.equal(player.phase, 'idle');
  const first = player.begin();
  assert.equal(player.phase, 'playing');
  let count = 0;
  player.schedule('sequence', () => count++, 100);
  player.stop();
  assert.equal(player.phase, 'cancelled');
  assert.equal(player.isCurrent(first), false);
  const next = player.begin();
  assert.ok(next > first);
  clock.advance(100);
  assert.equal(count, 0);
  player.schedule('sequence', () => count++, 30);
  clock.advance(30);
  assert.equal(count, 1);
  player.complete();
  assert.equal(player.phase, 'completed');
  assert.equal(player.isCurrent(next), false);
});

test('pause preserves exact remaining time for bead animation', () => {
  const {clock, player} = setup();
  player.begin();
  const ran = [];
  player.schedule('sequence', () => ran.push(clock.now()), 500);
  clock.advance(175);
  assert.equal(player.pause(), true);
  assert.equal(player.pausedAt, 175);
  clock.advance(2000);
  assert.deepEqual(ran, []);
  assert.equal(player.resume(), 2000);
  clock.advance(324);
  assert.deepEqual(ran, []);
  clock.advance(1);
  assert.deepEqual(ran, [2500]);
});

test('speech watchdog and movement timers pause and resume independently', () => {
  const {clock, player} = setup();
  player.begin();
  const events = [];
  player.schedule('speech', () => events.push('speech'), 600);
  player.schedule('sequence', () => events.push('move'), 100);
  clock.advance(50);
  player.pause();
  clock.advance(5000);
  assert.deepEqual(events, []);
  player.resume();
  clock.advance(50);
  assert.deepEqual(events, ['move']);
  clock.advance(500);
  assert.deepEqual(events, ['move', 'speech']);
});

test('seeking while paused starts a clean paused session with no leaked timers', () => {
  const {clock, player} = setup();
  const played = [];
  const oldToken = player.begin();
  player.schedule('sequence', () => played.push('old step'), 100);
  clock.advance(40);
  player.pause();
  player.stop();
  const newToken = player.begin({paused:true});
  player.schedule('sequence', () => played.push('selected step'), 200);
  clock.advance(1000);
  assert.deepEqual(played, []);
  assert.equal(player.isCurrent(oldToken), false);
  assert.equal(player.isCurrent(newToken), true);
  player.resume();
  clock.advance(200);
  assert.deepEqual(played, ['selected step']);
});

test('cancelled speech watchdog cannot finish an old utterance', () => {
  const {clock, player} = setup();
  player.begin();
  const events = [];
  player.schedule('speech', () => events.push('expired'), 700);
  clock.advance(300);
  player.cancel('speech');
  clock.advance(10000);
  assert.deepEqual(events, []);
  assert.equal(player.hasPending('speech'), false);
});

test('stale callbacks already queued by browser are rejected after seek', () => {
  const {clock, player} = setup();
  const events = [];
  player.begin();
  player.schedule('sequence', () => events.push('old'), 100);
  player.stop();
  player.begin();
  player.schedule('sequence', () => events.push('new'), 50);
  for (const id of clock.clearedIds()) clock.fireCleared(id);
  assert.deepEqual(events, []);
  clock.advance(50);
  assert.deepEqual(events, ['new']);
});

test('old callbacks from before a pause cannot fire after resume', () => {
  const {clock, player} = setup();
  const events = [];
  player.begin();
  player.schedule('sequence', () => events.push('moved'), 100);
  clock.advance(20);
  player.pause();
  const stale = clock.clearedIds();
  clock.advance(1000);
  player.resume();
  for (const id of stale) clock.fireCleared(id);
  assert.deepEqual(events, []);
  clock.advance(80);
  assert.deepEqual(events, ['moved']);
});

test('scheduling while paused replaces pending actions, without advancing', () => {
  const {clock, player} = setup();
  player.begin({paused:true});
  let value = 0;
  player.schedule('sequence', () => value = 1, 50);
  player.schedule('sequence', () => value = 2, 75);
  clock.advance(1000);
  assert.equal(value, 0);
  player.resume();
  clock.advance(75);
  assert.equal(value, 2);
  assert.equal(clock.count(), 0);
});

test('test-voice watchdog works without an active exercise', () => {
  const {clock, player} = setup();
  assert.equal(player.phase, 'idle');
  let called = false;
  player.schedule('speech', () => called = true, 100);
  clock.advance(100);
  assert.equal(called, true);
});

test('invalid timer input is rejected', () => {
  const {player} = setup();
  assert.throws(() => player.schedule('', () => {}, 100), TypeError);
  assert.throws(() => player.schedule('sequence', null, 100), TypeError);
  assert.throws(() => player.schedule('sequence', () => {}, Infinity), TypeError);
});

test('browser initializes playback before UI and caches it offline', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'site/sw.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'site/js/app/main.js'), 'utf8');
  const tag = '<script src="./js/playback/controller.js"></script>';
  assert.ok(index.includes(tag));
  assert.ok(index.indexOf(tag) < index.indexOf('<script src="./js/app/main.js"></script>'));
  assert.ok(main.includes('window.GhostBeadsPlayback.createPlaybackController()'));
  assert.ok(sw.includes("'./js/playback/controller.js'"));
  assert.equal(main.includes('state.sessionId'), false);
  assert.equal(main.includes('state.timerDue'), false);
});

test('browser script global export works without module bundling', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const script = fs.readFileSync(require.resolve('../site/js/playback/controller.js'), 'utf8');
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(script, context);
  assert.equal(typeof context.GhostBeadsPlayback.createPlaybackController, 'function');
});
