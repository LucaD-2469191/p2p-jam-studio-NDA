let userId = null;
let ws = null;
const peers = new Map();

const noteFrequencies = {
  'C2': 65.41, 'D2': 73.42, 'E2': 82.41, 'G2': 98.00, 'A2': 110.00, 'C3': 130.81,
  'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'G4': 392.00, 'A4': 440.00, 'C5': 523.25
};
const bassNotes = ['C2', 'D2', 'E2', 'G2', 'A2', 'C3'];
const leadNotes = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5'];

const tracks = [
  { id: 'kick', name: 'Kick', type: 'drum', muted: false, volume: 0.9, steps: Array(16).fill(false) },
  { id: 'snare', name: 'Snare', type: 'drum', muted: false, volume: 0.7, steps: Array(16).fill(false) },
  { id: 'hihat', name: 'Hi-Hat', type: 'drum', muted: false, volume: 0.5, steps: Array(16).fill(false) },
  { id: 'bass', name: 'Bass', type: 'synth', muted: false, volume: 0.6, steps: Array(16).fill(false), notes: Array(16).fill('A2') },
  { id: 'lead', name: 'Lead Arp', type: 'lead', muted: false, volume: 0.5, steps: Array(16).fill(false), notes: Array(16).fill('C4') }
];

let isPlaying = false;
let bpm = 120;
let swing = 0;
let currentStep = 0;
let stepTimeoutId = null;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const streamDestination = audioCtx.createMediaStreamDestination();
const masterFilter = audioCtx.createBiquadFilter();
masterFilter.type = 'lowpass';
masterFilter.frequency.value = 20000;
masterFilter.Q.value = 2.5;
masterFilter.connect(audioCtx.destination);
masterFilter.connect(streamDestination);

function triggerSound(track, stepIndex = 0, customFreq = null) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (track && track.muted) return;

  const now = audioCtx.currentTime;
  const vol = track ? track.volume : 0.6;
  const id = track ? track.id : 'solo';

  if (id === 'kick') {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(gain); gain.connect(masterFilter);
    osc.start(now); osc.stop(now + 0.3);
  } 
  else if (id === 'snare' || id === 'hihat') {
    const dur = id === 'snare' ? 0.15 : 0.05;
    const bufferSize = audioCtx.sampleRate * dur;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = id === 'snare' ? 'bandpass' : 'highpass';
    filter.frequency.value = id === 'snare' ? 1800 : 7500;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol * (id === 'snare' ? 0.8 : 0.6), now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + dur);

    noise.connect(filter); filter.connect(gain); gain.connect(masterFilter);
    noise.start(now);
  } 
  else {
    const preset = document.getElementById('waveformSelect').value;
    const freq = customFreq || (track && track.notes ? noteFrequencies[track.notes[stepIndex]] : 220);
    const decay = id === 'bass' ? 0.30 : 0.25;

    if (preset === 'supersaw' && id !== 'bass') {
      [-14, 0, 14].forEach(detuneVal => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime(detuneVal, now);

        gain.gain.setValueAtTime(vol * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

        osc.connect(gain);
        gain.connect(masterFilter);
        osc.start(now);
        osc.stop(now + decay);
      });
    } 
    else if (preset === 'acid303') {
      const osc = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.Q.value = 14;
      filter.frequency.setValueAtTime(freq * 6, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 1.2, now + decay);

      gain.gain.setValueAtTime(vol * 0.55, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterFilter);
      osc.start(now);
      osc.stop(now + decay);
    } 
    else if (preset === 'fmbell' && id !== 'bass') {
      const carrier = audioCtx.createOscillator();
      const modulator = audioCtx.createOscillator();
      const modGain = audioCtx.createGain();
      const mainGain = audioCtx.createGain();

      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(freq, now);

      modulator.type = 'sine';
      modulator.frequency.setValueAtTime(freq * 2.5, now);

      modGain.gain.setValueAtTime(freq * 3, now);
      modGain.gain.exponentialRampToValueAtTime(1, now + 0.12);

      mainGain.gain.setValueAtTime(vol * 0.5, now);
      mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      modulator.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(mainGain);
      mainGain.connect(masterFilter);

      carrier.start(now);
      modulator.start(now);
      carrier.stop(now + 0.35);
      modulator.stop(now + 0.35);
    } 
    else if (preset === 'reese' || id === 'bass') {
      [-10, 10].forEach(detuneVal => {
        const osc = audioCtx.createOscillator();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime(detuneVal, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, now);

        gain.gain.setValueAtTime(vol * 0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterFilter);
        osc.start(now);
        osc.stop(now + 0.32);
      });
    } 
    else {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = preset;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(vol * 0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
      osc.connect(gain);
      gain.connect(masterFilter);
      osc.start(now);
      osc.stop(now + decay);
    }
  }
}

function scheduleNextStep() {
  if (!isPlaying) return;
  document.querySelectorAll('.step.playing').forEach(el => el.classList.remove('playing'));

  tracks.forEach((track, tIdx) => {
    const stepEl = document.querySelector(`.step[data-track="${tIdx}"][data-step="${currentStep}"]`);
    if (stepEl) stepEl.classList.add('playing');
    if (track.steps[currentStep]) triggerSound(track, currentStep);
  });

  const baseStepMs = (60 / bpm / 4) * 1000;
  const swingOffset = (currentStep % 2 === 0) ? baseStepMs * (swing / 100) : -baseStepMs * (swing / 100);
  currentStep = (currentStep + 1) % 16;
  stepTimeoutId = setTimeout(scheduleNextStep, Math.max(30, baseStepMs + swingOffset));
}

function startSequencer(startStep = 0) {
  stopSequencer();
  isPlaying = true;
  currentStep = startStep;
  document.getElementById('playBtn').textContent = '⏹ Stop';
  scheduleNextStep();
}

function stopSequencer() {
  isPlaying = false;
  clearTimeout(stepTimeoutId);
  document.getElementById('playBtn').textContent = '▶ Start';
  document.querySelectorAll('.step.playing').forEach(el => el.classList.remove('playing'));
}

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

document.getElementById('joinBtn').onclick = () => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const room = document.getElementById('roomInput').value.trim();
  if (!room) {
    console.warn('[Join] Geen room naam ingevuld');
    return;
  }
  userId = document.getElementById('userInput').value.trim();
  if (!userId) {
    userId = 'user-' + Math.random().toString(36).substring(2, 7)
    console.log(`[Join] Geen gebruikersnaam ingegeven, is nu ${userId}`)
  }

  document.getElementById('roomInput').disabled = true;
  document.getElementById('userInput').disabled = true;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  console.log(`[WS] Verbinden met signaling server op ${wsUrl}...`)
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log(`[WS] Verbonden! Join bericht sturen voor room "${room}" als ${userId}`)
    ws.send(JSON.stringify({ type: 'join', room, userId}));
    document.getElementById('statusText').textContent = `Verbonden als ${userId} in kamer "${room}"`;
    document.getElementById('joinBtn').disabled = true;
    ['playBtn', 'bpmInput', 'syncClockBtn', 'clearAllBtn', 'swingSlider', 'filterSlider'].forEach(id => {
      document.getElementById(id).disabled = false;
    });
  };
  ws.onerror = (err) => {
    console.error('[WS] WebSocket fout opgetreden')
  };
  ws.onclose = () => {
    console.warn('[WS] Verbinding met signaling server verbroken.');
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    console.log(`[WS <-] Bericht ontvangen (${msg.type})`, msg);

    if(msg.type === 'existing-users') {
      console.log(`[Signaling] Bestaande gebruikers: ${msg.users.length}`, msg.users);
      for (const targetId of msg.users) {
        console.log(`[WebRTC ->] Start verbinding met ${targetId}`);
        const pc = createPeerConnection(targetId, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`[Signaling ->] Offer versturen naar ${targetId}`);
        ws.send(JSON.stringify({ type: 'offer', targetId, sdp: offer}));
      }
    }
    else if (msg.type === 'offer') {
      console.log(`[Signaling <-] Offer ontvangen van ${msg.senderId}. Answer aanmaken...`);
    }
    else if (msg.type === 'answer') {
      console.log(`[Signaling <-] Answer ontvangen van ${msg.senderId}`);
    }
    else if (msg.type === 'ice-candidate') {
      console.log(`[ICE <-] Candidate ontvangen van ${msg.senderId}`);
    }
    else if (msg.type === 'user-left') {
      console.log(`[Signaling] Gebruiker ${msg.userId} heeft de room verlaten.`);
    }
  };
  // TODO: Open WebSocket verbinding, stuur join-bericht ({ type: 'join', room, userId }),
  // enable de UI knoppen en verwerk signaling berichten ('existing-users', 'offer', 'answer', 'ice-candidate', 'user-left').
};

function createPeerConnection(targetId, isInitiator) {
  // TODO: Maak RTCPeerConnection(rtcConfig) aan, voeg streamDestination.stream tracks toe,
  // handel inkomende audio af via pc.ontrack, stuur ICE candidates door via WebSocket
  // en zet DataChannels op voor state- en klok-synchronisatie.
}

function setupDataChannel(dc, peerId) {
  // TODO: Luister naar dc.onmessage om inkomende acties van peers te verwerken
  // (STEP_TOGGLE, NOTE_CHANGE, CLEAR_TRACK, SET_TRACK, CLEAR_ALL, SWING, FILTER, TRANSPORT, BPM, CLOCK_PING, CLOCK_PONG).
}

function broadcastReliable(payloadObj) {
  // TODO: Verstuur payloadObj als JSON naar alle open reliable DataChannels in 'peers'.
}

function broadcastFast(payloadObj) {
  // TODO: Verstuur payloadObj als JSON naar alle open fast/unreliable DataChannels in 'peers'.
}

const gridEl = document.getElementById('sequencerGrid');
tracks.forEach((track, tIdx) => {
  const row = document.createElement('div');
  row.className = 'track';

  const controls = document.createElement('div');
  controls.className = 'track-controls';
  controls.innerHTML = `
    <div class="track-header">
      <strong style="font-size:13px">${track.name}</strong>
      <div>
        <button class="small" id="mute-${tIdx}">M</button>
        <button class="small" id="rand-${tIdx}">🎲</button>
        <button class="small" id="clr-${tIdx}">✕</button>
      </div>
    </div>
    <input type="range" min="0" max="1" step="0.05" value="${track.volume}" id="vol-${tIdx}">
  `;
  row.appendChild(controls);

  const stepsContainer = document.createElement('div');
  stepsContainer.className = 'steps';

  track.steps.forEach((_, sIdx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'step-wrapper';

    const stepEl = document.createElement('div');
    stepEl.className = `step ${track.type}`;
    stepEl.dataset.track = tIdx;
    stepEl.dataset.step = sIdx;
    stepEl.onclick = () => {
      const newState = !tracks[tIdx].steps[sIdx];
      updateStepUI(tIdx, sIdx, newState);
      broadcastReliable({ type: 'STEP_TOGGLE', tIdx, sIdx, active: newState });
    };
    wrapper.appendChild(stepEl);

    if (track.notes) {
      const noteSelect = document.createElement('select');
      noteSelect.className = 'note-select';
      noteSelect.dataset.track = tIdx;
      noteSelect.dataset.step = sIdx;
      (track.id === 'bass' ? bassNotes : leadNotes).forEach(n => {
        const opt = document.createElement('option');
        opt.value = n; opt.textContent = n;
        if (n === track.notes[sIdx]) opt.selected = true;
        noteSelect.appendChild(opt);
      });
      noteSelect.onchange = (e) => {
        tracks[tIdx].notes[sIdx] = e.target.value;
        broadcastReliable({ type: 'NOTE_CHANGE', tIdx, sIdx, note: e.target.value });
      };
      wrapper.appendChild(noteSelect);
    }
    stepsContainer.appendChild(wrapper);
  });

  row.appendChild(stepsContainer);
  gridEl.appendChild(row);

  document.getElementById(`mute-${tIdx}`).onclick = (e) => {
    track.muted = !track.muted;
    e.target.classList.toggle('muted-active', track.muted);
  };
  document.getElementById(`vol-${tIdx}`).oninput = (e) => { track.volume = parseFloat(e.target.value); };
  document.getElementById(`clr-${tIdx}`).onclick = () => {
    for (let s = 0; s < 16; s++) updateStepUI(tIdx, s, false);
    broadcastReliable({ type: 'CLEAR_TRACK', tIdx });
  };
  document.getElementById(`rand-${tIdx}`).onclick = () => {
    const newSteps = Array.from({ length: 16 }, () => Math.random() < 0.3);
    newSteps.forEach((active, s) => updateStepUI(tIdx, s, active));
    broadcastReliable({ type: 'SET_TRACK', tIdx, steps: newSteps });
  };
});

function updateStepUI(tIdx, sIdx, active) {
  tracks[tIdx].steps[sIdx] = active;
  const el = document.querySelector(`.step[data-track="${tIdx}"][data-step="${sIdx}"]`);
  if (el) el.classList.toggle('active', active);
}

const keysEl = document.getElementById('synthKeys');
['C4', 'D4', 'E4', 'G4', 'A4', 'C5'].forEach(noteName => {
  const key = document.createElement('div');
  key.className = 'key';
  key.textContent = noteName;
  key.onmousedown = () => triggerSound(null, 0, noteFrequencies[noteName]);
  keysEl.appendChild(key);
});

document.getElementById('playBtn').onclick = () => {
  if (!isPlaying) {
    startSequencer(0);
    broadcastReliable({ type: 'TRANSPORT', action: 'START', step: 0, bpm });
  } else {
    stopSequencer();
    broadcastReliable({ type: 'TRANSPORT', action: 'STOP' });
  }
};

document.getElementById('bpmInput').onchange = (e) => {
  bpm = parseInt(e.target.value, 10) || 120;
  broadcastReliable({ type: 'BPM', bpm });
};

document.getElementById('clearAllBtn').onclick = () => {
  tracks.forEach((_, tIdx) => { for (let s = 0; s < 16; s++) updateStepUI(tIdx, s, false); });
  broadcastReliable({ type: 'CLEAR_ALL' });
};

document.getElementById('syncClockBtn').onclick = () => {
  broadcastReliable({ type: 'CLOCK_PING', sentAt: performance.now(), currentStep, bpm, isPlaying });
};

document.getElementById('swingSlider').oninput = (e) => {
  swing = parseInt(e.target.value, 10);
  document.getElementById('swingVal').textContent = `${swing}%`;
  broadcastFast({ type: 'SWING', swing });
};

document.getElementById('filterSlider').oninput = (e) => {
  const freq = parseInt(e.target.value, 10);
  masterFilter.frequency.setValueAtTime(freq, audioCtx.currentTime);
  document.getElementById('filterVal').textContent = `${freq} Hz`;
  broadcastFast({ type: 'FILTER', freq });
};

setInterval(() => {
  document.getElementById('peerCount').textContent = peers.size;
  const tbody = document.getElementById('statsBody');
  tbody.innerHTML = '';
  peers.forEach((peer, id) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${id}</td><td>${peer.reliableDc ? peer.reliableDc.readyState : '-'}</td><td>${peer.fastDc ? peer.fastDc.readyState : '-'}</td><td>${peer.pc ? peer.pc.connectionState : '-'}</td><td>${peer.rtt || '-'}</td>`;
    tbody.appendChild(tr);
  });
}, 1000);