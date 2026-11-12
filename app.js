const $ = (id) => document.getElementById(id);
const rec = $('rec'), timer = $('timer'), statusEl = $('status'), bar = $('bar'), fill = $('fill'), out = $('out');

// --- estado de rede
const net = $('net');
function updNet() { net.textContent = navigator.onLine ? 'online' : 'offline'; net.className = 'pill' + (navigator.onLine ? '' : ' ok'); }
addEventListener('online', updNet); addEventListener('offline', updNet); updNet();

// --- service worker + armazenamento persistente
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// --- worker
const worker = new Worker('worker.js', { type: 'module' });
let busy = false;
function setStatus(t) { statusEl.textContent = t; }
function setBusy(b) { busy = b; rec.disabled = b; $('pick').disabled = b; $('model').disabled = b; if (!b) bar.style.display = 'none'; }
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'status') setStatus(m.text);
  else if (m.type === 'progress') { bar.style.display = 'block'; fill.style.width = m.pct.toFixed(0) + '%'; setStatus('Baixando modelo… ' + m.pct.toFixed(0) + '%'); }
  else if (m.type === 'ready') bar.style.display = 'none';
  else if (m.type === 'result') {
    out.value = (out.value ? out.value.trimEnd() + '\n\n' : '') + m.text;
    setStatus('Pronto. Texto adicionado abaixo.'); setBusy(false);
  } else if (m.type === 'error') {
    const offlineHint = navigator.onLine ? '' : ' (o modelo ainda não foi baixado: conecte-se à internet uma vez)';
    setStatus('Erro: ' + m.text + offlineHint); setBusy(false);
  }
};
worker.onerror = (e) => { setStatus('Erro no worker: ' + (e.message || '')); setBusy(false); };

// --- decodificação para 16 kHz mono
async function toFloat32(blob) {
  const buf = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const ab = await new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej));
  ctx.close && ctx.close();
  const len = Math.ceil(ab.duration * 16000);
  const off = new OfflineAudioContext(1, len, 16000);
  const src = off.createBufferSource();
  src.buffer = ab; src.connect(off.destination); src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

async function run(blob) {
  setBusy(true); setStatus('Preparando áudio…');
  try {
    const audio = await toFloat32(blob);
    worker.postMessage({ type: 'transcribe', model: $('model').value, language: $('lang').value, audio });
  } catch (err) { setStatus('Não consegui ler esse áudio: ' + err.message); setBusy(false); }
}

// --- gravação
let mr = null, chunks = [], t0 = 0, tick = null, stream = null, wake = null;
function fmt(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
rec.onclick = async () => {
  if (mr && mr.state === 'recording') { mr.stop(); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch { setStatus('Permissão do microfone negada.'); return; }
  chunks = [];
  mr = new MediaRecorder(stream);
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mr.onstop = () => {
    clearInterval(tick); timer.textContent = '';
    rec.classList.remove('on'); rec.textContent = '● Gravar';
    stream.getTracks().forEach((t) => t.stop());
    wake && wake.release && wake.release().catch(() => {}); wake = null;
    run(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
  };
  mr.start(1000);
  try { wake = await navigator.wakeLock.request('screen'); } catch {}
  t0 = Date.now(); rec.classList.add('on'); rec.textContent = '■ Parar e transcrever';
  tick = setInterval(() => { timer.textContent = fmt((Date.now() - t0) / 1000); }, 250);
  setStatus('Gravando…');
};

// --- arquivo
$('pick').onclick = () => $('file').click();
$('file').onchange = (e) => { const f = e.target.files[0]; if (f) run(f); e.target.value = ''; };

// --- ações no texto
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(out.value); setStatus('Copiado.'); } catch { out.select(); document.execCommand('copy'); } };
$('share').onclick = async () => { if (navigator.share) { try { await navigator.share({ text: out.value }); } catch {} } else setStatus('Compartilhamento não suportado neste navegador.'); };
$('save').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out.value], { type: 'text/plain;charset=utf-8' }));
  a.download = 'transcricao-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.txt';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$('clear').onclick = () => { out.value = ''; };
