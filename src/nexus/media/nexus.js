/**
 * Browser script for the Nexus sidebar webview, loaded by the HTML that NexusViewProvider builds. It talks
 * to the extension only through postMessage (WebviewMessage out, ExtensionMessage in; see src/types.ts).
 * Wrapped in an IIFE so nothing leaks into the page's globals. The selected tab is kept in vscode.setState.
 */
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // --- STATE ---
  let activeModel = '';
  /** Ollama reachability: null until the first models_list reports it (the pill shows "Connecting"). */
  let isOnline = null;
  let contextChips = [];
  /** True while an assistant reply is streaming; turns the Send button into Stop and blocks new sends. */
  let isStreaming = false;
  /** Raw markdown per message id, so streaming chunks never round-trip through the DOM. */
  const rawById = new Map();
  /** Diff suggestion per message id, kept so re-renders don't drop it. */
  const diffById = new Map();
  let toastTimer = null;

  const $ = (id) => document.getElementById(id);

  // --- ELEMENTS ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const chipsList = $('chipsList');
  const contextHubChipsList = $('contextHubChipsList');
  const chipCount = $('chipCount');
  const chatMessages = $('chatMessages');
  const welcomeCard = $('welcomeCard');
  const chatInput = $('chatInput');
  const btnSendChat = $('btnSendChat');
  const btnClearChat = $('btnClearChat');
  const chatModelBadge = $('chatModelBadge');
  const chatModelName = $('chatModelName');
  const statusPill = $('statusPill');
  const statusText = $('statusText');
  const btnIndexWorkspace = $('btnIndexWorkspace');
  const statChunks = $('statChunks');
  const statFiles = $('statFiles');

  const telCpu = $('telCpu');
  const telRam = $('telRam');
  const telGpu = $('telGpu');
  const telTier = $('telTier');
  const recModel = $('recModel');
  const recReason = $('recReason');
  const btnRunCalibration = $('btnRunCalibration');
  const btnRunBenchmark = $('btnRunBenchmark');
  const benchmarkGauge = $('benchmarkGauge');
  const gaugeTps = $('gaugeTps');
  const gaugeDetails = $('gaugeDetails');
  const modelDropdown = $('modelDropdown');
  const pullModelInput = $('pullModelInput');
  const btnPullModel = $('btnPullModel');
  const pullProgress = $('pullProgress');
  const pullProgressBar = $('pullProgressBar');
  const pullProgressText = $('pullProgressText');

  const loopTestCommand = $('loopTestCommand');
  const btnStartLoop = $('btnStartLoop');
  const btnStopLoop = $('btnStopLoop');
  const loopTimeline = $('loopTimeline');
  const toastEl = $('luminaToast');

  /** Posts a WebviewMessage to the extension, where NexusViewProvider.handleWebviewMessage handles it. */
  const send = (message) => vscode.postMessage(message);

  // --- TABS ---
  function switchTab(tabId) {
    tabButtons.forEach((b) => {
      const isActive = b.getAttribute('data-tab') === tabId;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
    });
    tabContents.forEach((c) => c.classList.toggle('active', c.id === tabId));
    vscode.setState({ ...(vscode.getState() || {}), tab: tabId });
    if (tabId === 'tab-chat') chatInput?.focus();
  }

  tabButtons.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab'))));
  const savedState = vscode.getState() || {};
  if (savedState.tab) switchTab(savedState.tab);

  // --- BUTTON LOADING HELPER ---
  function setLoading(btn, loading) {
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    btn.disabled = loading;
  }

  // --- CHAT INPUT ---
  function autosize() {
    chatInput.style.height = 'auto';
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 180)}px`;
    updateSendState();
  }

  const SEND_ICON = btnSendChat.innerHTML;
  const STOP_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';

  /**
   * Makes the send button match the current state: Stop while a reply streams, otherwise Send, disabled
   * when the box is empty. Call it after changing isStreaming or the input text.
   */
  function updateSendState() {
    btnSendChat.classList.toggle('stop', isStreaming);
    btnSendChat.innerHTML = isStreaming ? STOP_ICON : SEND_ICON;
    btnSendChat.title = isStreaming ? 'Stop generating (Esc)' : 'Send (Enter)';
    btnSendChat.setAttribute('aria-label', isStreaming ? 'Stop generating' : 'Send message');
    btnSendChat.disabled = !isStreaming && !chatInput.value.trim();
  }

  /** Asks the extension to abort the reply in progress; does nothing when no reply is streaming. */
  function stopGenerating() {
    if (isStreaming) send({ type: 'chat_stop' });
  }

  chatInput?.addEventListener('input', autosize);
  // Enter sends and Shift+Enter adds a new line; an Enter that confirms an IME composition is left alone.
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
  btnSendChat?.addEventListener('click', () => (isStreaming ? stopGenerating() : sendMessage()));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stopGenerating();
  });

  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isStreaming) return;
    chatInput.value = '';
    autosize();
    send({ type: 'chat_send', text });
  }

  document.querySelectorAll('.quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt) {
        chatInput.value = prompt;
        sendMessage();
      }
    });
  });

  btnClearChat?.addEventListener('click', () => {
    chatMessages.querySelectorAll('.message').forEach((el) => el.remove());
    rawById.clear();
    diffById.clear();
    welcomeCard.hidden = false;
    send({ type: 'chat_clear' });
  });

  chatModelBadge?.addEventListener('click', () => switchTab('tab-hardware'));
  $('btnOpenPrism')?.addEventListener('click', () => send({ type: 'open_prism' }));
  $('btnSettings')?.addEventListener('click', () => send({ type: 'open_settings' }));

  // --- CONTEXT / RAG ---
  btnIndexWorkspace?.addEventListener('click', () => {
    setLoading(btnIndexWorkspace, true);
    send({ type: 'index_workspace' });
  });

  // --- HARDWARE / MODELS ---
  btnRunCalibration?.addEventListener('click', () => {
    setLoading(btnRunCalibration, true);
    send({ type: 'request_calibration' });
  });

  btnRunBenchmark?.addEventListener('click', () => {
    setLoading(btnRunBenchmark, true);
    benchmarkGauge.hidden = false;
    gaugeTps.textContent = '…';
    gaugeDetails.textContent = 'Warming up the model…';
    send({ type: 'request_benchmark', model: activeModel });
  });

  modelDropdown?.addEventListener('change', (e) => {
    const selected = e.target.value;
    if (selected) send({ type: 'select_model', model: selected });
  });

  function pullModel() {
    const model = pullModelInput.value.trim();
    if (!model) return;
    setLoading(btnPullModel, true);
    pullProgress.hidden = false;
    pullProgressBar.style.width = '0%';
    send({ type: 'pull_model', model });
    pullModelInput.value = '';
  }

  btnPullModel?.addEventListener('click', pullModel);
  pullModelInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pullModel();
  });

  // --- AUTONOMOUS LOOP ---
  btnStartLoop?.addEventListener('click', () => {
    const testCommand = loopTestCommand.value.trim() || 'npm test';
    loopTimeline.innerHTML = '';
    btnStartLoop.disabled = true;
    btnStopLoop.disabled = false;
    send({ type: 'start_autonomous_loop', testCommand });
  });

  btnStopLoop?.addEventListener('click', () => {
    btnStartLoop.disabled = false;
    btnStopLoop.disabled = true;
    send({ type: 'stop_autonomous_loop' });
  });

  // --- TOAST ---
  function showToast(text, severity = 'info') {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.className = `lumina-toast show ${severity}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), severity === 'error' ? 6000 : 3200);
  }

  toastEl?.addEventListener('click', () => toastEl.classList.remove('show'));

  // --- STATUS ---
  function renderStatus() {
    const state = isOnline === null ? 'connecting' : isOnline ? 'online' : 'offline';
    statusPill.dataset.state = state;
    statusText.textContent = state === 'online' ? 'Ollama' : state === 'offline' ? 'Offline' : 'Connecting';
    statusPill.title =
      state === 'offline' ? 'Ollama is not reachable. Start it with `ollama serve`.' : 'Ollama connection status';
    chatModelName.textContent = activeModel || (isOnline === false ? 'Ollama offline' : 'No model');
    chatModelBadge.classList.toggle('offline', isOnline === false || !activeModel);
  }

  // --- CONTEXT CHIPS ---
  function renderChips() {
    chipsList.innerHTML = '';
    contextHubChipsList.innerHTML = '';
    chipCount.textContent = String(contextChips.length);

    if (contextChips.length === 0) {
      contextHubChipsList.innerHTML =
        '<div class="empty-state">Open a file in the editor and it will show up here as context.</div>';
      return;
    }

    contextChips.forEach((chip) => {
      const toggle = () => send({ type: 'toggle_context_chip', chipId: chip.id });

      const chipEl = document.createElement('button');
      chipEl.className = `chip-item ${chip.active ? 'active' : ''}`;
      chipEl.title = `${chip.active ? 'Included' : 'Excluded'}: ${chip.relativePath || chip.label}`;
      chipEl.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>${escapeHtml(chip.label)}</span>`;
      chipEl.addEventListener('click', toggle);
      chipsList.appendChild(chipEl);

      const hubEl = document.createElement('div');
      hubEl.className = `hub-chip ${chip.active ? 'active' : ''}`;
      hubEl.title = chip.active ? 'Click to exclude from context' : 'Click to include in context';
      hubEl.innerHTML = `
        <span class="toggle" aria-hidden="true"></span>
        <span class="hub-path">${escapeHtml(chip.relativePath || chip.label)}</span>
        <button class="chip-close" title="Remove" aria-label="Remove ${escapeHtml(chip.label)}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;
      hubEl.querySelector('.chip-close').addEventListener('click', (e) => {
        e.stopPropagation();
        send({ type: 'remove_context_chip', chipId: chip.id });
      });
      hubEl.addEventListener('click', toggle);
      contextHubChipsList.appendChild(hubEl);
    });
  }

  // --- MESSAGES ---
  function isNearBottom() {
    return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 80;
  }

  function scrollToBottom(force) {
    if (force || isNearBottom()) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function ensureMessageEl(id, role) {
    let el = document.getElementById(id);
    if (!el) {
      welcomeCard.hidden = true;
      el = document.createElement('div');
      el.id = id;
      el.className = `message ${role}`;
      el.innerHTML = `
        <div class="message-header">
          <span class="avatar">${role === 'user' ? 'Y' : '✦'}</span>
          <span>${role === 'user' ? 'You' : 'Lumina'}</span>
        </div>
        <div class="message-body"></div>
        <div class="message-extra"></div>`;
      chatMessages.appendChild(el);
    }
    return el;
  }

  function renderBody(el, raw) {
    const body = el.querySelector('.message-body');
    body.innerHTML = raw ? formatMarkdown(raw) : '<div class="typing"><span></span><span></span><span></span></div>';
  }

  function renderDiff(el, sug) {
    const extra = el.querySelector('.message-extra');
    if (!sug) {
      extra.innerHTML = '';
      return;
    }
    const fileName = (sug.filePath || '').split(/[\\/]/).pop();
    extra.innerHTML = `
      <div class="diff-box" data-suggestion="${escapeHtml(sug.id)}">
        <div class="diff-box-title">Proposed change · ${sug.hunks.length} ${sug.hunks.length === 1 ? 'hunk' : 'hunks'}</div>
        <div class="diff-box-file">${escapeHtml(fileName)}</div>
        <div class="diff-box-actions">
          <button class="action-btn primary small btn-accept-all">Accept all</button>
          <button class="action-btn secondary small btn-view-diff">Review diff</button>
          <button class="action-btn ghost small btn-reject">Reject</button>
        </div>
      </div>`;
    extra.querySelector('.btn-accept-all').addEventListener('click', () => send({ type: 'accept_diff', suggestionId: sug.id }));
    extra.querySelector('.btn-view-diff').addEventListener('click', () => send({ type: 'open_diff_view', suggestionId: sug.id }));
    extra.querySelector('.btn-reject').addEventListener('click', () => send({ type: 'reject_diff', suggestionId: sug.id }));
  }

  function renderMessage(msg) {
    const el = ensureMessageEl(msg.id, msg.role);
    rawById.set(msg.id, msg.content || '');
    renderBody(el, msg.content || '');
    if (msg.diffSuggestion) diffById.set(msg.id, msg.diffSuggestion);
    renderDiff(el, diffById.get(msg.id));
    scrollToBottom(msg.role === 'user');
  }

  // Code-block buttons use one delegated listener instead of one per render.
  chatMessages.addEventListener('click', (e) => {
    const btn = e.target.closest('.code-btn');
    if (!btn) return;
    const code = btn.closest('.code-container')?.querySelector('code')?.textContent || '';
    if (btn.classList.contains('btn-copy-code')) {
      navigator.clipboard.writeText(code);
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    } else if (btn.classList.contains('btn-apply-editor')) {
      send({ type: 'apply_to_editor', code });
    }
  });

  // --- MARKDOWN ---
  // Escapes everything first, then adds a small, safe subset of markdown.
  function formatMarkdown(text) {
    const blocks = [];
    const stash = (html) => `\u0000${blocks.push(html) - 1}\u0000`;

    const codeBlock = (lang, code, streaming) => `
      <div class="code-container">
        <div class="code-header">
          <span>${escapeHtml(lang || 'code')}${streaming ? ' · writing…' : ''}</span>
          <div class="code-actions">
            <button class="code-btn btn-copy-code">Copy</button>
            ${streaming ? '' : '<button class="code-btn btn-apply-editor">Insert</button>'}
          </div>
        </div>
        <pre class="code-block"><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>
      </div>`;

    let src = text.replace(/```([\w+-]*)[^\n]*\n([\s\S]*?)```/g, (_m, lang, code) => stash(codeBlock(lang, code, false)));
    src = src.replace(/```([\w+-]*)[^\n]*\n([\s\S]*)$/, (_m, lang, code) => stash(codeBlock(lang, code, true)));
    src = src.replace(/`([^`\n]+)`/g, (_m, code) => stash(`<code class="inline">${escapeHtml(code)}</code>`));

    src = escapeHtml(src)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    const out = [];
    let list = null;
    let para = [];
    const flushPara = () => {
      if (para.length) out.push(`<p>${para.join('<br/>')}</p>`);
      para = [];
    };
    const flushList = () => {
      if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.tag}>`);
      list = null;
    };

    for (const line of src.split('\n')) {
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      const bullet = line.match(/^\s*[-*]\s+(.*)$/);
      const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      const isBlock = /^\u0000\d+\u0000$/.test(line.trim());

      if (heading) {
        flushPara(); flushList();
        out.push(`<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`);
      } else if (bullet || numbered) {
        flushPara();
        const tag = bullet ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push((bullet || numbered)[1]);
      } else if (isBlock) {
        flushPara(); flushList();
        out.push(line.trim());
      } else if (!line.trim()) {
        flushPara(); flushList();
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara(); flushList();

    return out.join('').replace(/\u0000(\d+)\u0000/g, (_m, i) => blocks[Number(i)]);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- TIMELINE ---
  function renderStep(step) {
    loopTimeline.querySelector('.empty-state')?.remove();
    const id = `step-${step.stepIndex}`;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('li');
      el.id = id;
      loopTimeline.appendChild(el);
    }
    el.className = `timeline-step ${step.status || ''}`;
    el.innerHTML = `
      <span class="step-dot"></span>
      <div class="step-head">
        <span class="step-action">${escapeHtml(step.action)}</span>
        <span class="step-desc">${escapeHtml(step.description)}</span>
      </div>
      ${step.output ? `<pre class="step-output">${escapeHtml(step.output.slice(-600))}</pre>` : ''}`;
    el.scrollIntoView({ block: 'nearest' });
  }

  // --- MESSAGES FROM EXTENSION ---
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'models_list': {
        const models = msg.models || [];
        activeModel = msg.activeModel || '';
        if (typeof msg.isOnline === 'boolean') isOnline = msg.isOnline;
        renderStatus();
        modelDropdown.innerHTML = '';
        if (models.length === 0) {
          modelDropdown.innerHTML = '<option value="">No local models — pull one below</option>';
        } else {
          models.forEach((m) => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = `${m.name} · ${(m.size / 1024 ** 3).toFixed(1)} GB`;
            opt.selected = m.name === activeModel;
            modelDropdown.appendChild(opt);
          });
        }
        break;
      }

      case 'context_chips_updated':
        contextChips = msg.chips || [];
        renderChips();
        break;

      case 'rag_status':
        statChunks.textContent = Number(msg.totalChunks || 0).toLocaleString();
        statFiles.textContent = Number(msg.indexedFiles || 0).toLocaleString();
        if (!msg.indexing) setLoading(btnIndexWorkspace, false);
        break;

      case 'calibration_data': {
        const t = msg.telemetry;
        const r = msg.recommendation;
        telCpu.textContent = `${t.cpuModel} · ${t.cpuCores} cores`;
        telCpu.title = telCpu.textContent;
        telRam.textContent = `${t.totalRamGB} GB · ${t.freeRamGB} GB free`;
        telGpu.textContent = t.vramGB ? `${t.gpuName} · ${t.vramGB} GB` : t.gpuName;
        telGpu.title = telGpu.textContent;
        telTier.textContent = r.tierName.split(' ')[0];
        recModel.textContent = r.recommendedModel;
        recReason.textContent = r.reason;
        setLoading(btnRunCalibration, false);
        break;
      }

      case 'benchmark_progress':
        gaugeDetails.textContent = msg.status;
        break;

      case 'benchmark_result': {
        const res = msg.result;
        benchmarkGauge.hidden = false;
        gaugeTps.innerHTML = `${escapeHtml(res.tokensPerSecond)} <span class="unit">tok/s</span>`;
        gaugeDetails.textContent = `${res.model} · ${res.timeToFirstTokenMs} ms to first token · ${res.completionTokens} tokens`;
        setLoading(btnRunBenchmark, false);
        break;
      }

      case 'pull_progress': {
        const pct = msg.completed && msg.total ? Math.round((msg.completed / msg.total) * 100) : null;
        pullProgress.hidden = false;
        if (pct !== null) pullProgressBar.style.width = `${pct}%`;
        pullProgressText.textContent = `${msg.status}${pct !== null ? ` · ${pct}%` : ''}`;
        if (msg.status === 'success') {
          pullProgressBar.style.width = '100%';
          setLoading(btnPullModel, false);
        }
        break;
      }

      case 'chat_history':
        chatMessages.querySelectorAll('.message').forEach((el) => el.remove());
        rawById.clear();
        diffById.clear();
        (msg.messages || []).forEach((m) => renderMessage(m));
        welcomeCard.hidden = (msg.messages || []).length > 0;
        scrollToBottom(true);
        break;

      case 'chat_message':
        renderMessage(msg.message);
        if (msg.message.role === 'assistant' && !msg.message.content) {
          isStreaming = true;
          document.getElementById(msg.message.id)?.classList.add('streaming');
          updateSendState();
        }
        break;

      case 'chat_stream_chunk': {
        isStreaming = true;
        updateSendState();
        const el = ensureMessageEl(msg.messageId, 'assistant');
        el.classList.add('streaming');
        const raw = (rawById.get(msg.messageId) || '') + msg.chunk;
        rawById.set(msg.messageId, raw);
        const stick = isNearBottom();
        renderBody(el, raw);
        if (stick) scrollToBottom(true);
        break;
      }

      case 'chat_stream_end': {
        isStreaming = false;
        updateSendState();
        const el = msg.messageId && document.getElementById(msg.messageId);
        if (el) {
          el.classList.remove('streaming');
          renderBody(el, rawById.get(msg.messageId) || '_No response._');
          if (msg.diffSuggestion) {
            diffById.set(msg.messageId, msg.diffSuggestion);
            renderDiff(el, msg.diffSuggestion);
          }
          scrollToBottom();
        }
        break;
      }

      case 'autonomous_step':
        renderStep(msg.step);
        break;

      case 'autonomous_finished':
        btnStartLoop.disabled = false;
        btnStopLoop.disabled = true;
        showToast(msg.summary, msg.success ? 'info' : 'warning');
        break;

      case 'diff_updated': {
        const sug = msg.suggestion;
        const box = sug && document.querySelector(`.diff-box[data-suggestion="${CSS.escape(sug.id)}"]`);
        if (!box) break;
        const acceptBtn = box.querySelector('.btn-accept-all');
        const labels = { applied: 'Applied', rejected: 'Rejected', partial: 'Partially applied' };
        if (labels[sug.status]) {
          acceptBtn.textContent = labels[sug.status];
          acceptBtn.className = 'action-btn secondary small btn-accept-all';
          if (sug.status !== 'partial') {
            box.querySelectorAll('button:not(.btn-view-diff)').forEach((b) => (b.disabled = true));
          }
        }
        break;
      }

      case 'toast':
        showToast(msg.text, msg.severity);
        if (msg.severity === 'error' || /^Indexed /.test(msg.text)) setLoading(btnIndexWorkspace, false);
        if (msg.severity !== 'info') {
          [btnRunBenchmark, btnRunCalibration, btnPullModel].forEach((b) => setLoading(b, false));
        }
        if (/downloaded and activated/.test(msg.text)) {
          setLoading(btnPullModel, false);
          pullProgress.hidden = true;
          pullProgressText.textContent = '';
        }
        break;
    }
  });

  renderStatus();
  autosize();
})();
