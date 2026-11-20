// Player-to-player chat for network games: short texts (≤512 chars) with emoji, and
// reactions that play an animation on both screens. Anti-spam: per-minute limits on messages
// and reactions, a minimum gap between reactions and a cap on emoji per message. The same
// limits are applied to what we receive, so a modified client cannot flood the opponent.
// Received text is always rendered as plain text (textContent), never as HTML.

export const LIMITS = {
  maxLength: 512,
  messagesPerMinute: 10,
  reactionsPerMinute: 6,
  reactionGapMs: 2500,
  emojiPerMessage: 8,
};
export const REACTIONS = { clap: '👏', fire: '🔥', wow: '😮', laugh: '😂', gg: '🤝', boom: '💥' };
const PICKER = ['😀', '😄', '😉', '😎', '🤔', '😅', '😬', '😱', '🙃', '😏', '👍', '👎', '🙏', '💪', '♟️', '🖖', '⭐', '🚀', '❤️', '🎉'];

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

export function countEmoji(text) {
  if (!segmenter) return [...text].filter((c) => EMOJI_RE.test(c)).length;
  let n = 0;
  for (const { segment } of segmenter.segment(text)) if (EMOJI_RE.test(segment)) n++;
  return n;
}

// Remove control characters (keeps newlines out too: chat lines are single-line), trim, cap length.
export function cleanText(text) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.maxLength);
}

// Sliding one-minute window.
export class RateWindow {
  constructor(perMinute, minGapMs = 0) { this.per = perMinute; this.gap = minGapMs; this.times = []; }
  prune(now) { this.times = this.times.filter((t) => now - t < 60000); }
  // ms to wait before the next send is allowed (0 = allowed now)
  wait(now = Date.now()) {
    this.prune(now);
    const last = this.times[this.times.length - 1];
    const gapWait = last != null && this.gap ? Math.max(0, this.gap - (now - last)) : 0;
    const fullWait = this.times.length >= this.per ? 60000 - (now - this.times[0]) : 0;
    return Math.max(gapWait, fullWait);
  }
  take(now = Date.now()) { if (this.wait(now) > 0) return false; this.times.push(now); return true; }
}

// UI + wire glue. `send(data)` delivers to the opponent; returns handlers for incoming data.
export function createChat({ t, send, onLangChange, themName = () => '' }) {
  const $ = (id) => document.getElementById(id);
  const box = $('chat');
  const log = $('chatLog');
  const input = $('chatInput');
  const badge = $('chatBadge');
  const out = { msg: new RateWindow(LIMITS.messagesPerMinute), react: new RateWindow(LIMITS.reactionsPerMinute, LIMITS.reactionGapMs) };
  // incoming limits get a little slack for clock/latency jitter
  const inn = { msg: new RateWindow(LIMITS.messagesPerMinute + 2), react: new RateWindow(LIMITS.reactionsPerMinute + 2, LIMITS.reactionGapMs / 2) };
  let unread = 0;
  let open = false;

  // --- rendering -------------------------------------------------------------------------
  function addLine(kind, text) {
    const row = document.createElement('div');
    row.className = `cl ${kind}`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = kind === 'me' ? t('chat.me') : kind === 'them' ? (themName() || t('chat.them')) : '';
    const body = document.createElement('span');
    body.className = 'txt';
    body.textContent = text;
    if (kind !== 'sys') row.append(who);
    row.append(body);
    log.append(row);
    while (log.children.length > 80) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    if (kind === 'them' && !open) { unread++; badge.textContent = String(unread); badge.hidden = false; }
  }

  function setOpen(on) {
    open = on;
    box.classList.toggle('open', on);
    document.body.classList.toggle('chat-open', on);
    if (on) { unread = 0; badge.hidden = true; setTimeout(() => input.focus({ preventScroll: true }), 50); }
  }

  function updateMeta() {
    const len = input.value.length;
    $('chatCount').textContent = `${len}/${LIMITS.maxLength}`;
    const em = countEmoji(input.value);
    $('chatCount').classList.toggle('over', em > LIMITS.emojiPerMessage);
    const w = out.msg.wait();
    $('chatSend').disabled = !input.value.trim() || w > 0 || em > LIMITS.emojiPerMessage;
    $('chatLimit').textContent = w > 0 ? t('chat.wait', { s: Math.ceil(w / 1000) }) : em > LIMITS.emojiPerMessage ? t('chat.tooManyEmoji', { n: LIMITS.emojiPerMessage }) : '';
    const rw = out.react.wait();
    for (const b of document.querySelectorAll('#reacts button')) b.disabled = rw > 0;
    $('reacts').dataset.wait = rw > 0 ? t('chat.wait', { s: Math.ceil(rw / 1000) }) : '';
  }
  setInterval(updateMeta, 500);

  // Reaction animation: a big emoji rising from the bottom with a burst of small copies.
  function playReaction(id, mine) {
    const glyph = REACTIONS[id];
    if (!glyph) return;
    const layer = $('reactLayer');
    if (layer.children.length > 40) return;
    const x = 30 + Math.random() * 40;
    const el = document.createElement('div');
    el.className = `react-pop ${mine ? 'mine' : 'theirs'}`;
    el.style.left = `${x}vw`;
    el.textContent = glyph;
    const tag = document.createElement('span');
    tag.className = 'react-tag';
    tag.textContent = mine ? t('chat.me') : (themName() || t('chat.them'));
    el.append(tag);
    layer.append(el);
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div');
      p.className = 'react-spark';
      p.textContent = glyph;
      const a = (i / 8) * Math.PI * 2;
      p.style.left = `${x}vw`;
      p.style.setProperty('--dx', `${Math.cos(a) * (60 + Math.random() * 50)}px`);
      p.style.setProperty('--dy', `${Math.sin(a) * (60 + Math.random() * 50) - 120}px`);
      layer.append(p);
      setTimeout(() => p.remove(), 1400);
    }
    setTimeout(() => el.remove(), 2600);
  }

  // --- sending ------------------------------------------------------------------------------
  function sendText() {
    const text = cleanText(input.value);
    if (!text) return;
    if (countEmoji(text) > LIMITS.emojiPerMessage) return updateMeta();
    if (!out.msg.take()) return updateMeta();
    send({ t: 'chat', text });
    addLine('me', text);
    input.value = '';
    updateMeta();
  }

  function sendReaction(id) {
    if (!REACTIONS[id] || !out.react.take()) return updateMeta();
    send({ t: 'react', r: id });
    playReaction(id, true);
    updateMeta();
  }

  // --- wiring -----------------------------------------------------------------------------
  $('chatToggle').onclick = () => setOpen(!open);
  $('chatSend').onclick = sendText;
  input.addEventListener('input', updateMeta);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // keep game shortcuts (S, Esc) out of the text box
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
  const reacts = $('reacts');
  for (const [id, glyph] of Object.entries(REACTIONS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = glyph;
    b.dataset.r = id;
    b.title = t(`react.${id}`);
    b.setAttribute('aria-label', t(`react.${id}`));
    b.onclick = () => sendReaction(id);
    reacts.append(b);
  }
  const picker = $('emojiPicker');
  for (const e of PICKER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.onclick = () => {
      if (input.value.length + e.length > LIMITS.maxLength) return;
      const s = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? s;
      input.value = input.value.slice(0, s) + e + input.value.slice(en);
      input.focus();
      input.selectionStart = input.selectionEnd = s + e.length;
      updateMeta();
    };
    picker.append(b);
  }
  $('emojiBtn').onclick = () => { picker.hidden = !picker.hidden; };
  onLangChange?.(() => {
    for (const b of reacts.children) { b.title = t(`react.${b.dataset.r}`); b.setAttribute('aria-label', b.title); }
    updateMeta();
  });
  updateMeta();

  return {
    // called when a network game connects / ends
    show(on) {
      box.hidden = !on;
      if (!on) { setOpen(false); }
    },
    system(text) { addLine('sys', text); },
    clear() { log.textContent = ''; unread = 0; badge.hidden = true; },
    // incoming data from the opponent (already checked to come from the connected peer)
    receive(data) {
      if (data.t === 'chat') {
        if (typeof data.text !== 'string' || !inn.msg.take()) return;
        const text = cleanText(data.text);
        if (!text || countEmoji(text) > LIMITS.emojiPerMessage) return;
        addLine('them', text);
      } else if (data.t === 'react') {
        if (!REACTIONS[data.r] || !inn.react.take()) return;
        playReaction(data.r, false);
      }
    },
  };
}
