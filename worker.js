import { pipeline, env } from './lib/transformers.web.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('./lib/ort-wasm-simd-threaded.mjs', import.meta.url).href,
  wasm: new URL('./lib/ort-wasm-simd-threaded.wasm', import.meta.url).href,
};

let asr = null, loadedId = null;

async function load(id) {
  if (asr && loadedId === id) return;
  asr = null;
  const files = {};
  asr = await pipeline('automatic-speech-recognition', id, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (p) => {
      if (p.status === 'progress' && p.file) {
        files[p.file] = { loaded: p.loaded, total: p.total };
        let l = 0, t = 0;
        for (const f of Object.values(files)) { l += f.loaded || 0; t += f.total || 0; }
        postMessage({ type: 'progress', pct: t ? (l / t) * 100 : 0 });
      }
    },
  });
  loadedId = id;
}

onmessage = async (e) => {
  const { type, model, audio, language } = e.data;
  try {
    if (type === 'transcribe') {
      postMessage({ type: 'status', text: 'Carregando modelo…' });
      await load(model);
      postMessage({ type: 'ready' });
      postMessage({ type: 'status', text: 'Transcrevendo…' });
      const opts = { chunk_length_s: 30, stride_length_s: 5, task: 'transcribe', return_timestamps: false };
      if (language) opts.language = language;
      const r = await asr(audio, opts);
      postMessage({ type: 'result', text: (r.text || '').trim() });
    }
  } catch (err) {
    postMessage({ type: 'error', text: String(err && err.message || err) });
  }
};
