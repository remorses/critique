const REVIEW_MODE_CSS = `
.line { position: relative; }
.line.critique-review-actionable:hover {
  background: rgba(78, 115, 178, 0.1);
}
.line.critique-review-line-active {
  background: rgba(78, 115, 178, 0.18);
}
.line.critique-review-actionable {
  padding-left: 36px;
}
.line.critique-review-actionable-split {
  padding-left: 0;
}
.line .critique-review-add {
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  border-radius: 0;
  border: 1px solid rgba(143, 174, 232, 0.92);
  background: rgba(26, 90, 212, 0.96);
  color: #f7fbff;
  font-weight: 700;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  z-index: 4;
  box-shadow: none;
  transition: opacity 120ms ease, transform 120ms ease, border-color 120ms ease;
}
.line:hover .critique-review-add,
.line .critique-review-add:focus-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(-50%) scale(1.03);
  border-color: rgba(219, 236, 255, 1);
  box-shadow: none;
}
.line.critique-review-line-active .critique-review-add {
  opacity: 0 !important;
  pointer-events: none !important;
}
.line.critique-review-actionable-split .critique-review-add {
  left: calc(50% + 10px);
}
.critique-review-thread,
.critique-review-composer {
  margin: 8px 0 10px 0;
  margin-left: 0;
  border: 1px solid rgba(127, 140, 170, 0.45);
  border-radius: 0;
  background: rgba(16, 22, 35, 0.96);
  backdrop-filter: none;
  padding: 10px;
  white-space: normal;
  box-shadow: none;
}
.critique-review-thread.critique-review-thread-split {
  width: calc(50% - 8px);
  margin-left: calc(50% + 8px);
}
.critique-review-composer textarea,
.critique-review-reply textarea {
  width: 100%;
  min-height: 84px;
  max-height: 200px;
  resize: vertical;
  border-radius: 0;
  border: 1px solid rgba(127, 140, 170, 0.55);
  background: rgba(11, 16, 27, 0.95);
  color: #e5ecff;
  padding: 8px;
  font: inherit;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.critique-review-composer textarea:focus,
.critique-review-reply textarea:focus {
  border-color: rgba(139, 170, 226, 0.9);
  box-shadow: 0 0 0 2px rgba(84, 132, 224, 0.24);
}
.critique-review-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 8px;
}
.critique-review-actions button,
.critique-review-thread button,
#critique-review-submit {
  border: 1px solid rgba(126, 145, 185, 0.62);
  border-radius: 0;
  background: rgba(22, 30, 47, 0.96);
  color: #edf3ff;
  padding: 6px 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: none;
  transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease;
}
.critique-review-actions button:hover,
.critique-review-thread button:hover,
#critique-review-submit:hover {
  border-color: rgba(188, 204, 238, 0.9);
  transform: translateY(-1px);
  box-shadow: none;
}
.critique-review-actions button.danger,
.critique-review-thread button.danger {
  border-color: rgba(220, 118, 130, 0.62);
  color: #ffdbe0;
  background: rgba(83, 30, 35, 0.76);
}
.critique-review-actions button.danger:hover,
.critique-review-thread button.danger:hover {
  border-color: rgba(238, 142, 156, 0.86);
  background: rgba(96, 36, 42, 0.9);
}
#critique-review-submit {
  background: rgba(31, 105, 58, 0.97);
  border-color: rgba(120, 216, 154, 0.9);
  color: #f4fff7;
  font-weight: 700;
}
.critique-review-thread button[disabled],
#critique-review-submit[disabled],
.critique-review-actions button[disabled] {
  cursor: not-allowed;
  opacity: 0.5;
}
#critique-review-submit[disabled] {
  background: rgba(34, 42, 55, 0.94);
  border-color: rgba(133, 149, 178, 0.56);
  color: rgba(232, 241, 255, 0.82);
}
.critique-review-comment {
  border: 1px solid rgba(127, 140, 170, 0.35);
  border-radius: 0;
  padding: 9px;
  margin-top: 6px;
  background: rgba(14, 20, 31, 0.96);
}
.critique-review-comment.queued {
  border-left: 3px dashed rgba(214, 167, 70, 0.85);
}
.critique-review-comment.reply {
  margin-left: 12px;
  border-left: 3px solid rgba(114, 140, 193, 0.66);
}
.critique-review-comment.sent {
  opacity: 0.72;
  filter: saturate(0.82);
}
.critique-review-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  margin-bottom: 6px;
}
.critique-review-badge {
  border-radius: 0;
  padding: 1px 6px;
  border: 1px solid rgba(127, 140, 170, 0.5);
}
.critique-review-badge.sent {
  background: rgba(55, 118, 83, 0.48);
  border-color: rgba(92, 170, 121, 0.72);
  color: #ecfff2;
}
.critique-review-badge.queued {
  background: rgba(154, 111, 25, 0.5);
  border-color: rgba(214, 167, 70, 0.72);
  color: #fff6de;
}
.critique-review-badge.failed {
  background: rgba(149, 48, 48, 0.4);
}
#critique-review-bar {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 9px 11px;
  border-radius: 0;
  border: 1px solid rgba(127, 140, 170, 0.58);
  background: rgba(13, 18, 29, 0.96);
  backdrop-filter: none;
  color: #e5ecff;
  font-size: 13px;
  box-shadow: none;
}
#critique-review-count {
  color: rgba(214, 226, 247, 0.92);
  font-weight: 600;
}
#critique-review-toast-stack {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.critique-review-toast {
  position: relative;
  overflow: hidden;
  border-radius: 0;
  border: 1px solid rgba(127, 140, 170, 0.66);
  padding: 10px 12px;
  color: #e9f0ff;
  font-size: 13px;
  font-weight: 600;
  box-shadow: none;
  backdrop-filter: none;
  animation: critique-toast-in 160ms ease;
}
.critique-review-toast::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: rgba(255, 255, 255, 0.7);
}
.critique-review-replying-to {
  margin-bottom: 8px;
  font-size: 12px;
  color: rgba(196, 212, 241, 0.92);
}
.critique-review-toast.success {
  background: rgba(27, 72, 45, 0.92);
  border-color: rgba(95, 197, 130, 0.82);
}
.critique-review-toast.error {
  background: rgba(83, 30, 35, 0.95);
  border-color: rgba(220, 118, 130, 0.84);
}
@keyframes critique-toast-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
#critique-review-banner {
  position: fixed;
  left: 50%;
  top: 12px;
  transform: translateX(-50%);
  z-index: 9999;
  max-width: calc(100vw - 24px);
  border: 1px solid rgba(172, 85, 85, 0.8);
  background: rgba(62, 22, 22, 0.95);
  color: #ffe7e7;
  border-radius: 0;
  padding: 8px 10px;
  font-size: 13px;
}
`

export function buildReviewModeScript(): string {
  return `(function() {
  const MODE = 'review';
  const QUEUED = 'queued';
  const SENDING = 'sending';
  const SENT = 'sent';
  const FAILED = 'failed';

  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') !== MODE) return;

  const callbackParam = params.get('review_callback_url') || params.get('callback_url');
  const callbackUrl = normalizeCallbackUrl(callbackParam);
  if (!callbackUrl) {
    showBanner('Review mode disabled: missing or invalid callback URL.');
    return;
  }
  const callbackTemplateResult = normalizeCallbackTemplate(params.get('callback_json_template'));
  if (callbackTemplateResult && callbackTemplateResult.error) {
    showBanner(callbackTemplateResult.error);
    return;
  }
  const callbackTemplate = callbackTemplateResult ? callbackTemplateResult.template : null;

  const content = document.getElementById('content');
  if (!content) return;

  const lines = Array.from(content.querySelectorAll('.line'));
  if (!lines.length) return;

  const commentsById = new Map();
  const commentIdsByLine = new Map();
  const queueIds = [];
  let composerState = null;
  let nextId = 1;
  let submitReviewBusy = false;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }

  applyFileContext(lines);
  mountQueueBar();
  mountLineActions(lines);

  function normalizeCallbackUrl(raw) {
    if (!raw) return null;
    try {
      const url = new URL(raw, window.location.href);
      if (url.protocol === 'https:') return url.toString();
      if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
        return url.toString();
      }
      return null;
    } catch {
      return null;
    }
  }

  function normalizeCallbackTemplate(raw) {
    if (!raw) return null;
    if (!raw.includes('{{text}}')) {
      return { error: 'Review mode disabled: callback_json_template must include {{text}}.' };
    }
    try {
      const probe = renderTemplateBody(raw, 'template-check');
      const parsed = JSON.parse(probe);
      if (!isObjectPayload(parsed)) {
        return { error: 'Review mode disabled: callback_json_template must produce a JSON object.' };
      }
    } catch {
      return { error: 'Review mode disabled: callback_json_template is not valid JSON.' };
    }
    return { template: raw };
  }

  function renderTemplateBody(template, text) {
    const serialized = JSON.stringify(String(text));
    let body = template.replace(/"\{\{text\}\}"/g, serialized);
    body = body.replace(/\{\{text\}\}/g, serialized);
    return body;
  }

  function buildRequestBody(message, defaultPayload) {
    if (!callbackTemplate) return defaultPayload;
    const rendered = renderTemplateBody(callbackTemplate, message);
    const parsed = JSON.parse(rendered);
    if (!isObjectPayload(parsed)) {
      throw new Error('callback_json_template must produce a JSON object');
    }
    return parsed;
  }

  function isObjectPayload(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function showBanner(message) {
    const banner = document.createElement('div');
    banner.id = 'critique-review-banner';
    banner.textContent = message;
    document.body.appendChild(banner);
  }

  function getToastStack() {
    let stack = document.getElementById('critique-review-toast-stack');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.id = 'critique-review-toast-stack';
    document.body.appendChild(stack);
    return stack;
  }

  function showToast(message, tone) {
    const stack = getToastStack();
    const toast = document.createElement('div');
    toast.className = 'critique-review-toast ' + (tone || 'success');
    toast.textContent = message;
    stack.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
      if (stack.childElementCount < 1) {
        stack.remove();
      }
    }, 2200);
  }

  function applyFileContext(allLines) {
    let currentFile = 'unknown';
    const lineCounters = new Map();
    for (const line of allLines) {
      const sectionFile = line.getAttribute('data-file-path');
      if (sectionFile) currentFile = sectionFile;
      if (!line.getAttribute('data-file-path')) {
        line.setAttribute('data-file-path', currentFile);
      }
      const count = (lineCounters.get(currentFile) || 0) + 1;
      lineCounters.set(currentFile, count);
      line.setAttribute('data-file-line', String(count));
    }
  }

  function mountQueueBar() {
    const bar = document.createElement('div');
    bar.id = 'critique-review-bar';
    bar.innerHTML = '<span id="critique-review-count">0 queued</span><button id="critique-review-submit" disabled>Submit Review</button>';
    document.body.appendChild(bar);

    const submitButton = bar.querySelector('#critique-review-submit');
    submitButton.addEventListener('click', async () => {
      if (submitReviewBusy) return;
      const queued = getQueuedComments();
      if (!queued.length) return;
      submitReviewBusy = true;
      updateQueueBar();
      await sendComments(queued, 'review');
      submitReviewBusy = false;
      updateQueueBar();
      rerenderAllThreads();
    });
  }

  function updateQueueBar() {
    const countEl = document.getElementById('critique-review-count');
    const submitEl = document.getElementById('critique-review-submit');
    if (!countEl || !submitEl) return;
    const queuedCount = getQueuedComments().length;
    countEl.textContent = queuedCount + ' queued';
    submitEl.disabled = queuedCount < 1 || submitReviewBusy;
  }

  function getQueuedComments() {
    return queueIds
      .map((id) => commentsById.get(id))
      .filter(Boolean)
      .filter((comment) => comment.status === QUEUED);
  }

  function mountLineActions(allLines) {
    for (const line of allLines) {
      const filePath = line.getAttribute('data-file-path');
      if (!filePath || filePath === 'unknown') continue;
      const lineKind = getActionableLineKind(line);
      if (!lineKind) continue;
      line.classList.add('critique-review-actionable');
      if (lineKind === 'split') {
        line.classList.add('critique-review-actionable-split');
      }
      if (line.querySelector('.critique-review-add')) continue;
      const addButton = document.createElement('button');
      addButton.className = 'critique-review-add';
      addButton.type = 'button';
      addButton.textContent = '+';
      addButton.title = 'Add review comment';
      addButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openComposer(line, {});
      });
      line.appendChild(addButton);
      ensureThreadContainer(line);
    }
  }

  function parseRgb(rgbText) {
    const match = rgbText.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
    };
  }

  function getActionableLineKind(line) {
    if (line.classList.contains('file-section')) return null;

    const text = (line.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!text) return null;
    if (text.includes('→')) return null;
    if (!/^\\d+\\b/.test(text)) return null;

    const spans = Array.from(line.querySelectorAll('span'));
    if (!spans.length) return null;

    let hasGreen = false;
    let hasRed = false;
    for (const span of spans) {
      const bg = parseRgb(window.getComputedStyle(span).backgroundColor || '');
      if (!bg) continue;
      if (bg.g > bg.r + 8 && bg.g > bg.b + 8) {
        hasGreen = true;
      }
      if (bg.r > bg.g + 8 && bg.r > bg.b + 8) {
        hasRed = true;
      }
    }

    return hasGreen && hasRed ? 'split' : hasGreen ? 'add' : null;
  }

  function getLineKey(line) {
    const file = line.getAttribute('data-file-path') || 'unknown';
    const fileLine = String(getLineNumber(line));
    return file + ':' + fileLine;
  }

  function getLineNumber(line) {
    const fromFile = line.getAttribute('data-file-line');
    if (fromFile) return Number(fromFile);
    const fromIndex = line.getAttribute('data-line-index');
    if (fromIndex) return Number(fromIndex);
    return 0;
  }

  function ensureThreadContainer(line) {
    let thread = line.nextElementSibling;
    if (thread && thread.classList.contains('critique-review-thread')) {
      syncThreadLayout(line, thread);
      return thread;
    }
    thread = document.createElement('div');
    thread.className = 'critique-review-thread';
    thread.style.display = 'none';
    syncThreadLayout(line, thread);
    line.insertAdjacentElement('afterend', thread);
    return thread;
  }

  function syncThreadLayout(line, thread) {
    if (line.classList.contains('critique-review-actionable-split')) {
      thread.classList.add('critique-review-thread-split');
    } else {
      thread.classList.remove('critique-review-thread-split');
    }
  }

  function openComposer(line, options) {
    closeComposer();
    const thread = ensureThreadContainer(line);
    thread.style.display = 'block';
    line.classList.add('critique-review-line-active');

    const composer = document.createElement('div');
    composer.className = 'critique-review-composer';
    const initialText = options.initialText || '';
    const replyContext = options.parentId ? buildReplyTarget(options.parentId) : '';
    const replyLabel = replyContext ? '<div class="critique-review-replying-to">Replying to ' + escapeHtml(replyContext) + '</div>' : '';
    composer.innerHTML =
      replyLabel +
      '<textarea placeholder="Add your comment here, be kind">' + escapeHtml(initialText) + '</textarea>' +
      '<div class="critique-review-actions">' +
      '<button type="button" data-action="cancel">Cancel</button>' +
      '<button type="button" data-action="submit">Submit Comment</button>' +
      '<button type="button" data-action="queue">Add to Review</button>' +
      '</div>';

    const textarea = composer.querySelector('textarea');
    const cancelButton = composer.querySelector('[data-action="cancel"]');
    const submitButton = composer.querySelector('[data-action="submit"]');
    const queueButton = composer.querySelector('[data-action="queue"]');

    cancelButton.addEventListener('click', () => closeComposer());
    submitButton.addEventListener('click', async () => {
      const value = (textarea.value || '').trim();
      if (!value) return;
      const comment = upsertComment(line, value, options, SENDING);
      closeComposer();
      rerenderThread(line);
      await sendComments([comment], 'single');
      rerenderThread(line);
      updateQueueBar();
    });
    queueButton.addEventListener('click', () => {
      const value = (textarea.value || '').trim();
      if (!value) return;
      upsertComment(line, value, options, QUEUED);
      closeComposer();
      rerenderThread(line);
      updateQueueBar();
    });

    thread.appendChild(composer);
    textarea.focus();
    composerState = { lineKey: getLineKey(line), composer, line };
  }

  function closeComposer() {
    if (!composerState) return;
    if (composerState.line) {
      composerState.line.classList.remove('critique-review-line-active');
    }
    composerState.composer.remove();
    composerState = null;
  }

  function upsertComment(line, text, options, nextStatus) {
    const file = line.getAttribute('data-file-path') || 'unknown';
    const lineNumber = getLineNumber(line);
    const lineKey = getLineKey(line);
    let comment;
    if (options.editId) {
      comment = commentsById.get(options.editId);
      if (!comment || comment.status === SENT) return comment;
      comment.text = text;
      comment.status = nextStatus;
      comment.parentId = options.parentId || comment.parentId || null;
      comment.file = file;
      comment.line = lineNumber;
      return comment;
    }

    const id = 'c' + String(nextId++);
    comment = {
      id,
      file,
      line: lineNumber,
      text,
      parentId: options.parentId || null,
      status: nextStatus,
      createdAt: Date.now(),
      lineKey,
    };
    commentsById.set(id, comment);
    if (!commentIdsByLine.has(lineKey)) {
      commentIdsByLine.set(lineKey, []);
    }
    commentIdsByLine.get(lineKey).push(id);
    if (nextStatus === QUEUED) {
      queueIds.push(id);
    }
    return comment;
  }

  function rerenderAllThreads() {
    const allLines = Array.from(content.querySelectorAll('.line'));
    for (const line of allLines) {
      rerenderThread(line);
    }
  }

  function rerenderThread(line) {
    const lineKey = getLineKey(line);
    const thread = ensureThreadContainer(line);
    const ids = commentIdsByLine.get(lineKey) || [];
    const comments = ids.map((id) => commentsById.get(id)).filter(Boolean);
    if (!comments.length) {
      thread.style.display = 'none';
      thread.innerHTML = '';
      return;
    }

    thread.style.display = 'block';
    thread.innerHTML = '';
    for (const comment of comments) {
      const node = document.createElement('div');
      node.className = 'critique-review-comment' + (comment.status === SENT ? ' sent' : '') + (comment.status === QUEUED ? ' queued' : '') + (comment.parentId ? ' reply' : '');

      const badgeClass = comment.status === SENT ? 'sent' : comment.status === FAILED ? 'failed' : 'queued';
      const badgeLabel = comment.status === SENT ? 'Submitted' : comment.status === FAILED ? 'Failed' : 'Queued';
      const replyPrefix = comment.parentId ? buildReplyPrefix(comment.parentId) + ' ' : '';

      node.innerHTML =
        '<div class="critique-review-meta">' +
        '<span>' + escapeHtml(comment.file + ':' + comment.line) + '</span>' +
        '<span class="critique-review-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
        '</div>' +
        '<div>' + escapeHtml(replyPrefix + comment.text) + '</div>' +
        '<div class="critique-review-actions"></div>';

      const actions = node.querySelector('.critique-review-actions');
      const replyButton = makeActionButton('Reply', () => openComposer(line, { parentId: comment.id }));
      actions.appendChild(replyButton);

      if (comment.status !== SENT) {
        const editButton = makeActionButton('Edit', () => openComposer(line, { editId: comment.id, initialText: comment.text, parentId: comment.parentId }));
        const deleteButton = makeActionButton('Delete', () => removeComment(comment.id), 'danger');
        actions.appendChild(editButton);
        actions.appendChild(deleteButton);
      }

      if (comment.status === FAILED) {
        const retryButton = makeActionButton('Retry', async () => {
          comment.status = SENDING;
          rerenderThread(line);
          await sendComments([comment], 'single');
          rerenderThread(line);
          updateQueueBar();
        });
        actions.appendChild(retryButton);
      }

      thread.appendChild(node);
    }
  }

  function makeActionButton(label, onClick, tone) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (tone === 'danger') {
      button.classList.add('danger');
    }
    button.addEventListener('click', onClick);
    return button;
  }

  function removeComment(commentId) {
    const comment = commentsById.get(commentId);
    if (!comment || comment.status === SENT) return;
    commentsById.delete(commentId);
    const ids = commentIdsByLine.get(comment.lineKey) || [];
    commentIdsByLine.set(comment.lineKey, ids.filter((id) => id !== commentId));
    const queueIndex = queueIds.indexOf(commentId);
    if (queueIndex >= 0) queueIds.splice(queueIndex, 1);
    rerenderAllThreads();
    updateQueueBar();
  }

  function buildReplyPrefix(parentId) {
    const target = buildReplyTarget(parentId);
    if (!target) return 'In reply to';
    return 'In reply to ' + target + ' -';
  }

  function buildReplyTarget(parentId) {
    const parent = commentsById.get(parentId);
    if (!parent) return '';
    return parent.file + ':' + parent.line;
  }

  function buildMessage(comments) {
    const first = comments[0];
    const singleFile = comments.every((comment) => comment.file === first.file);
    const hunkLabel = singleFile ? first.file : 'selected changes';
    const heading = comments.length === 1
      ? '## Review of ' + hunkLabel
      : '## Review of ' + hunkLabel + ' (' + comments.length + ' comments)';
    const bullets = comments
      .slice()
      .sort((a, b) => {
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        if (a.line !== b.line) return a.line - b.line;
        return a.createdAt - b.createdAt;
      })
      .map((comment) => {
        const replyText = comment.parentId ? buildReplyPrefix(comment.parentId) + ' ' : '';
        return '- \`' + comment.file + ':' + comment.line + '\` ' + replyText + comment.text;
      })
      .join('\\n');
    return heading + '\\n\\n' + bullets;
  }

  async function sendComments(comments, mode) {
    if (!comments.length) return;
    const message = buildMessage(comments);
    const payload = {
      message,
      comments: comments.map((comment) => ({
        file: comment.file,
        line: comment.line,
        comment: comment.text,
        parent_id: comment.parentId || undefined,
      })),
    };
    const requestBody = buildRequestBody(message, payload);
    const isTemplateMode = Boolean(callbackTemplate);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': isTemplateMode ? 'application/json' : 'text/markdown; charset=utf-8',
        },
        body: isTemplateMode ? JSON.stringify(requestBody) : message,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      for (const comment of comments) {
        comment.status = SENT;
        const queueIndex = queueIds.indexOf(comment.id);
        if (queueIndex >= 0) queueIds.splice(queueIndex, 1);
      }
      if (mode === 'review') {
        const label = comments.length === 1 ? '1 comment' : comments.length + ' comments';
        showToast('Review submitted (' + label + ')', 'success');
      } else {
        showToast('Comment submitted', 'success');
      }
    } catch {
      for (const comment of comments) {
        comment.status = FAILED;
        if (mode === 'review' && queueIds.indexOf(comment.id) < 0) {
          queueIds.push(comment.id);
        }
      }
      showToast('Failed to submit review comments. You can retry.', 'error');
    } finally {
      window.clearTimeout(timeout);
    }
  }
})();`
}

export { REVIEW_MODE_CSS }
