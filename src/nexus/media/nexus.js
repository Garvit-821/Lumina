(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // State
  let activeModel = '';
  let availableModels = [];
  let contextChips = [];
  let isStreaming = false;
  let activeMessageId = null;

  // Elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const chipsList = document.getElementById('chipsList');
  const contextHubChipsList = document.getElementById('contextHubChipsList');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const btnSendChat = document.getElementById('btnSendChat');
  const btnClearChat = document.getElementById('btnClearChat');
  const chatModelBadge = document.getElementById('chatModelBadge');
  const btnOpenPrism = document.getElementById('btnOpenPrism');
  const btnSettings = document.getElementById('btnSettings');
  const btnIndexWorkspace = document.getElementById('btnIndexWorkspace');
  const statChunks = document.getElementById('statChunks');
  const statFiles = document.getElementById('statFiles');

  // Telemetry Elements
  const telCpu = document.getElementById('telCpu');
  const telRam = document.getElementById('telRam');
  const telGpu = document.getElementById('telGpu');
  const telTier = document.getElementById('telTier');
  const recModel = document.getElementById('recModel');
  const recReason = document.getElementById('recReason');
  const btnRunCalibration = document.getElementById('btnRunCalibration');
  const btnRunBenchmark = document.getElementById('btnRunBenchmark');
  const benchmarkGauge = document.getElementById('benchmarkGauge');
  const gaugeTps = document.getElementById('gaugeTps');
  const gaugeDetails = document.getElementById('gaugeDetails');
  const modelDropdown = document.getElementById('modelDropdown');
  const pullModelInput = document.getElementById('pullModelInput');
  const btnPullModel = document.getElementById('btnPullModel');
  const pullProgressText = document.getElementById('pullProgressText');

  // Loop Elements
  const loopTestCommand = document.getElementById('loopTestCommand');
  const btnStartLoop = document.getElementById('btnStartLoop');
  const btnStopLoop = document.getElementById('btnStopLoop');
  const loopTimeline = document.getElementById('loopTimeline');

  // Toast
  const toastEl = document.getElementById('luminaToast');

  // --- TAB NAVIGATION ---
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      tabButtons.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(targetTab)?.classList.add('active');
    });
  });

  // --- QUICK PROMPTS ---
  document.querySelectorAll('.quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt && chatInput) {
        chatInput.value = prompt;
        sendMessage();
      }
    });
  });

  // --- CHAT SEND & KEY LISTENERS ---
  btnSendChat?.addEventListener('click', sendMessage);
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  btnClearChat?.addEventListener('click', () => {
    chatMessages.innerHTML = '';
    vscode.postMessage({ type: 'chat_clear' });
  });

  btnOpenPrism?.addEventListener('click', () => {
    vscode.postMessage({ type: 'open_prism' });
  });

  btnSettings?.addEventListener('click', () => {
    vscode.postMessage({ type: 'open_settings' });
  });

  btnIndexWorkspace?.addEventListener('click', () => {
    vscode.postMessage({ type: 'index_workspace' });
  });

  btnRunCalibration?.addEventListener('click', () => {
    vscode.postMessage({ type: 'request_calibration' });
  });

  btnRunBenchmark?.addEventListener('click', () => {
    benchmarkGauge.style.display = 'block';
    gaugeTps.innerHTML = 'Testing...';
    gaugeDetails.innerText = 'Warming up Ollama engine...';
    vscode.postMessage({ type: 'request_benchmark', model: activeModel });
  });

  modelDropdown?.addEventListener('change', (e) => {
    const selected = e.target.value;
    if (selected) {
      vscode.postMessage({ type: 'select_model', model: selected });
    }
  });

  btnPullModel?.addEventListener('click', () => {
    const modelToPull = pullModelInput.value.trim();
    if (modelToPull) {
      vscode.postMessage({ type: 'pull_model', model: modelToPull });
      pullModelInput.value = '';
    }
  });

  btnStartLoop?.addEventListener('click', () => {
    const cmd = loopTestCommand.value.trim() || 'npm test';
    loopTimeline.innerHTML = '';
    btnStartLoop.disabled = true;
    btnStopLoop.disabled = false;
    vscode.postMessage({ type: 'start_autonomous_loop', testCommand: cmd });
  });

  btnStopLoop?.addEventListener('click', () => {
    btnStartLoop.disabled = false;
    btnStopLoop.disabled = true;
    vscode.postMessage({ type: 'stop_autonomous_loop' });
  });

  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isStreaming) return;

    chatInput.value = '';
    vscode.postMessage({ type: 'chat_send', text });
  }

  // --- TOAST HELPER ---
  function showToast(text, severity = 'info') {
    if (!toastEl) return;
    toastEl.innerText = text;
    toastEl.className = `lumina-toast show ${severity}`;
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, 3000);
  }

  // --- RENDER CONTEXT CHIPS ---
  function renderChips() {
    chipsList.innerHTML = '';
    contextHubChipsList.innerHTML = '';

    if (contextChips.length === 0) {
      chipsList.innerHTML = '<span style="color: var(--text-muted);">No active file</span>';
      contextHubChipsList.innerHTML = '<p class="section-desc">Open files in editor to auto-tag context chips.</p>';
      return;
    }

    contextChips.forEach((chip) => {
      // Top bar chip
      const chipEl = document.createElement('div');
      chipEl.className = `chip-item ${chip.active ? 'active' : ''}`;
      chipEl.innerHTML = `<span>${escapeHtml(chip.label)}</span>`;
      chipEl.addEventListener('click', () => {
        vscode.postMessage({ type: 'toggle_context_chip', chipId: chip.id });
      });
      chipsList.appendChild(chipEl);

      // Hub list item
      const hubEl = document.createElement('div');
      hubEl.className = `chip-item ${chip.active ? 'active' : ''}`;
      hubEl.style.display = 'flex';
      hubEl.style.justifyContent = 'space-between';
      hubEl.style.marginBottom = '6px';
      hubEl.innerHTML = `
        <span>📄 ${escapeHtml(chip.relativePath)}</span>
        <span class="chip-close" data-id="${chip.id}">✕</span>
      `;
      hubEl.querySelector('.chip-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'remove_context_chip', chipId: chip.id });
      });
      hubEl.addEventListener('click', () => {
        vscode.postMessage({ type: 'toggle_context_chip', chipId: chip.id });
      });
      contextHubChipsList.appendChild(hubEl);
    });
  }

  // --- RENDER MESSAGE ---
  function renderMessage(msg) {
    let msgEl = document.getElementById(msg.id);
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.id = msg.id;
      msgEl.className = `message-bubble ${msg.role}`;
      chatMessages.appendChild(msgEl);
    }

    const header = msg.role === 'user' ? 'YOU' : 'LUMINA AGENT';
    const parsedHtml = formatMarkdown(msg.content);

    let diffHtml = '';
    if (msg.diffSuggestion) {
      const sug = msg.diffSuggestion;
      diffHtml = `
        <div class="diff-box">
          <div class="diff-box-title">⚡ Proposed Code Modification (${sug.hunks.length} hunks)</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">${escapeHtml(sug.filePath.split('/').pop())}</div>
          <div class="diff-box-actions">
            <button class="action-btn primary small btn-accept-all" data-id="${sug.id}">Accept All</button>
            <button class="action-btn secondary small btn-view-diff" data-id="${sug.id}">Compare Diff</button>
            <button class="action-btn secondary small btn-reject" data-id="${sug.id}">Reject</button>
          </div>
        </div>
      `;
    }

    msgEl.innerHTML = `
      <div class="message-header">${header}</div>
      <div class="message-body">${parsedHtml}</div>
      ${diffHtml}
    `;

    // Attach diff actions
    msgEl.querySelectorAll('.btn-accept-all').forEach((btn) => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'accept_diff', suggestionId: btn.getAttribute('data-id') });
      });
    });

    msgEl.querySelectorAll('.btn-view-diff').forEach((btn) => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'open_diff_view', suggestionId: btn.getAttribute('data-id') });
      });
    });

    msgEl.querySelectorAll('.btn-reject').forEach((btn) => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'reject_diff', suggestionId: btn.getAttribute('data-id') });
      });
    });

    // Attach Code Block buttons
    msgEl.querySelectorAll('.btn-copy-code').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = decodeURIComponent(btn.getAttribute('data-code') || '');
        navigator.clipboard.writeText(code);
        btn.innerText = 'Copied!';
        setTimeout(() => (btn.innerText = 'Copy'), 2000);
      });
    });

    msgEl.querySelectorAll('.btn-apply-editor').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = decodeURIComponent(btn.getAttribute('data-code') || '');
        vscode.postMessage({ type: 'apply_to_editor', code });
      });
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // --- MARKDOWN FORMATTER ---
  function formatMarkdown(text) {
    if (!text) return '';

    // Closed Code blocks with syntax container & action buttons
    let formatted = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      const cleanLang = lang || 'code';
      const encoded = encodeURIComponent(code);
      return `
        <div class="code-container">
          <div class="code-header">
            <span>${cleanLang}</span>
            <div class="code-actions">
              <button class="code-btn btn-copy-code" data-code="${encoded}">Copy</button>
              <button class="code-btn btn-apply-editor" data-code="${encoded}">Apply to Editor</button>
            </div>
          </div>
          <pre class="code-block"><code>${escapeHtml(code)}</code></pre>
        </div>
      `;
    });

    // Unclosed streaming code block at the end
    formatted = formatted.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*)$/g, (_match, lang, code) => {
      const cleanLang = lang || 'code';
      const encoded = encodeURIComponent(code);
      return `
        <div class="code-container">
          <div class="code-header">
            <span>${cleanLang} (Streaming...)</span>
            <div class="code-actions">
              <button class="code-btn btn-copy-code" data-code="${encoded}">Copy</button>
            </div>
          </div>
          <pre class="code-block"><code>${escapeHtml(code)}</code></pre>
        </div>
      `;
    });

    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 3px; font-family: var(--font-mono); font-size: 11px;">$1</code>');

    // Bold & Italics
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Linebreaks
    formatted = formatted.replace(/\n/g, '<br/>');

    return formatted;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- RECEIVE MESSAGES FROM EXTENSION ---
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'models_list':
        availableModels = msg.models || [];
        activeModel = msg.activeModel || '';
        chatModelBadge.innerText = `Model: ${activeModel || 'Offline'}`;
        modelDropdown.innerHTML = '';
        if (availableModels.length === 0) {
          modelDropdown.innerHTML = '<option value="">No local models (pull below)</option>';
        } else {
          availableModels.forEach((m) => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.innerText = `${m.name} (${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)`;
            if (m.name === activeModel) opt.selected = true;
            modelDropdown.appendChild(opt);
          });
        }
        break;

      case 'context_chips_updated':
        contextChips = msg.chips || [];
        renderChips();
        break;

      case 'rag_status':
        statChunks.innerText = msg.totalChunks || 0;
        statFiles.innerText = msg.indexedFiles || 0;
        break;

      case 'calibration_data':
        const t = msg.telemetry;
        const r = msg.recommendation;
        telCpu.innerText = `${t.cpuModel} (${t.cpuCores} cores)`;
        telRam.innerText = `${t.totalRamGB} GB (Free: ${t.freeRamGB} GB)`;
        telGpu.innerText = `${t.gpuName} (${t.vramGB} GB VRAM)`;
        telTier.innerText = r.tierName.split(' ')[0] + ' Profile';
        recModel.innerText = r.recommendedModel;
        recReason.innerText = r.reason;
        break;

      case 'benchmark_progress':
        gaugeDetails.innerText = msg.status;
        break;

      case 'benchmark_result':
        const res = msg.result;
        benchmarkGauge.style.display = 'block';
        gaugeTps.innerHTML = `${res.tokensPerSecond} <span class="unit">tokens/sec</span>`;
        gaugeDetails.innerText = `Model: ${res.model} | Latency: ${res.timeToFirstTokenMs}ms | Generated: ${res.completionTokens} tokens`;
        break;

      case 'pull_progress':
        pullProgressText.innerText = `${msg.status} ${msg.completed && msg.total ? `(${Math.round((msg.completed / msg.total) * 100)}%)` : ''}`;
        break;

      case 'chat_message':
        renderMessage(msg.message);
        break;

      case 'chat_stream_chunk':
        isStreaming = true;
        activeMessageId = msg.messageId;
        const target = document.getElementById(msg.messageId);
        if (target) {
          const bodyEl = target.querySelector('.message-body');
          if (bodyEl) {
            bodyEl.innerHTML = formatMarkdown((bodyEl.getAttribute('data-raw') || '') + msg.chunk);
            bodyEl.setAttribute('data-raw', (bodyEl.getAttribute('data-raw') || '') + msg.chunk);
          }
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        break;

      case 'chat_stream_end':
        isStreaming = false;
        if (msg.messageId) {
          const finishedEl = document.getElementById(msg.messageId);
          if (finishedEl && msg.diffSuggestion) {
            renderMessage({
              id: msg.messageId,
              role: 'assistant',
              content: finishedEl.querySelector('.message-body')?.getAttribute('data-raw') || '',
              diffSuggestion: msg.diffSuggestion,
            });
          }
        }
        break;

      case 'autonomous_step':
        const step = msg.step;
        const stepEl = document.createElement('div');
        stepEl.className = `timeline-step ${step.status}`;
        stepEl.innerHTML = `
          <strong>Step ${step.stepIndex} [${step.action.toUpperCase()}]:</strong>
          <div>${escapeHtml(step.description)}</div>
          ${step.output ? `<pre style="font-size: 10px; background: rgba(0,0,0,0.4); padding: 4px; border-radius: 4px; margin-top: 4px;">${escapeHtml(step.output.slice(-300))}</pre>` : ''}
        `;
        loopTimeline.appendChild(stepEl);
        break;

      case 'autonomous_finished':
        btnStartLoop.disabled = false;
        btnStopLoop.disabled = true;
        showToast(msg.summary, msg.success ? 'info' : 'warning');
        break;

      case 'diff_updated':
        const sug = msg.suggestion;
        if (sug) {
          const diffBoxes = document.querySelectorAll('.diff-box');
          diffBoxes.forEach((box) => {
            const acceptBtn = box.querySelector(`.btn-accept-all[data-id="${sug.id}"]`);
            if (acceptBtn) {
              if (sug.status === 'applied') {
                acceptBtn.innerText = '✅ Applied';
                acceptBtn.setAttribute('disabled', 'true');
                acceptBtn.classList.remove('primary');
                acceptBtn.classList.add('secondary');
              } else if (sug.status === 'rejected') {
                acceptBtn.innerText = '❌ Rejected';
                acceptBtn.setAttribute('disabled', 'true');
              } else if (sug.status === 'partial') {
                acceptBtn.innerText = '⚡ Partially Merged';
              }
            }
          });
        }
        break;

      case 'toast':
        showToast(msg.text, msg.severity);
        break;
    }
  });
})();
