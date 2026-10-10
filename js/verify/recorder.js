// Camera access and on-device video recording (MediaRecorder). Video only, no audio, nothing uploaded.

export const cameraSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
export const recorderSupported = () => typeof MediaRecorder !== 'undefined';

export function pickMime() {
  if (!recorderSupported()) return null;
  const options = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of options) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return '';
}

export async function openCamera(facingMode = 'user') {
  if (!cameraSupported()) throw new Error('Camera isn’t available in this browser. Open the app over https (or from your Home Screen).');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
    });
  } catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw new Error('Camera permission was denied. You can allow it in your browser/iPhone settings, or use another counting method.');
    if (e && e.name === 'NotFoundError') throw new Error('No camera was found on this device.');
    throw new Error('Couldn’t start the camera: ' + ((e && e.message) || e));
  }
}

export function stopStream(stream) {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
}

export class Recorder {
  constructor(stream) {
    this.stream = stream;
    this.chunks = [];
    this.rec = null;
    this.mime = pickMime();
  }
  start() {
    if (!recorderSupported()) return false;
    this.chunks = [];
    try {
      this.rec = this.mime ? new MediaRecorder(this.stream, { mimeType: this.mime, videoBitsPerSecond: 700000 }) : new MediaRecorder(this.stream);
    } catch {
      this.rec = new MediaRecorder(this.stream);
    }
    this.rec.ondataavailable = (e) => e.data && e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
    this.startedAt = Date.now();
    return true;
  }
  get recording() {
    return !!this.rec && this.rec.state === 'recording';
  }
  stop() {
    return new Promise((resolve) => {
      if (!this.rec || this.rec.state === 'inactive') return resolve(null);
      this.rec.onstop = () => {
        const type = (this.rec.mimeType || this.mime || 'video/webm').split(';')[0];
        resolve(this.chunks.length ? new Blob(this.chunks, { type }) : null);
      };
      try {
        this.rec.stop();
      } catch {
        resolve(null);
      }
    });
  }
}
