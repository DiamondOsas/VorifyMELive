import './style.css'

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  BACKEND_URL: import.meta.env.VITE_AUDIO_SERVER,
  CHUNK_DURATION: 3000, // 3 seconds
  AUDIO_BITRATE: 64000, // 64 kbps
};

// ============================================
// APPLICATION STATE
// ============================================
const appState = {
  isRecording: false,
  stream: null,
  recordingInterval: null,
  timerInterval: null,
  startTime: 0,
  animationFrame: null,
};

// ============================================
// UI ELEMENTS
// ============================================
const app = document.querySelector('#app');
app.innerHTML = `
  <div class="min-h-screen bg-black flex flex-col items-center justify-center p-8">
    <!-- Header -->
    <div class="text-center mb-12">
      <h1 class="text-5xl font-bold text-white mb-4">
        VoifyMELIVE 
      </h1>
      <p class="text-gray-400 text-lg">
        Easily detect Real or AI Generated Voice
      </p>
      <p class="text-gray-400 text-lg">
        Click the Microphone to Start Recording
      </p>
    </div>

    <!-- Microphone Button -->
    <div class="relative mb-8">
      <div id="pulseRing" class="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300"></div>
      <button 
        id="micButton"
        class="relative z-10 w-32 h-32 rounded-full bg-gradient-to-br from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 transition-all duration-300 shadow-2xl hover:shadow-purple-500/50 flex items-center justify-center group"
        aria-label="Record audio"
      >
        <svg id="micIcon" class="w-16 h-16 text-white transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        <svg id="stopIcon" class="w-16 h-16 text-white hidden" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      </button>
    </div>

    <!-- Status & Timer -->
    <div id="status" class="text-center mb-4 h-8">
      <p class="text-gray-500 text-sm">Ready to record</p>
    </div>
    <div id="timer" class="text-4xl font-mono text-purple-400 mb-8 opacity-0 transition-opacity duration-300">
      00:00
    </div>

    <!-- Visualizer -->
    <div id="visualizer" class="flex gap-1 h-20 items-end mb-8 opacity-0 transition-opacity duration-300">
      ${Array(15).fill(0).map(() => `
        <div class="w-2 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t transition-all duration-150" style="height: 4px;"></div>
      `).join('')}
    </div>

    <!-- Info Card -->
    <div class="max-w-md bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h3 class="text-white font-semibold mb-2 flex items-center gap-2">
        <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        How it works
      </h3>
      <ul class="text-gray-400 text-sm space-y-2">
        <li>• Click the microphone to start recording.</li>
        <li>• Audio is streamed to the server in real-time.</li>
        <li>• Click again to stop.</li>
      </ul>
    </div>
  </div>
`;

const micButton = document.getElementById('micButton');
const status = document.getElementById('status');
const timer = document.getElementById('timer');
const visualizer = document.getElementById('visualizer');

// ============================================
// EVENT LISTENERS
// ============================================
micButton.addEventListener('click', () => {
  if (!appState.isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});

// ============================================
// RECORDING LOGIC
// ============================================
async function startRecording() {
  console.log("Attempting to start recording...");
  try {
    appState.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 22050,
      }
    });

    appState.isRecording = true;
    updateUIForRecording(true);
    startTimer();
    startVisualizer(appState.stream);
    status.innerHTML = '<p class="text-purple-400 text-sm font-semibold">● Recording...</p>';
    console.log("Recording started successfully.");

    // Start the recording loop
    recordChunk(); // Record the first chunk immediately
    appState.recordingInterval = setInterval(recordChunk, CONFIG.CHUNK_DURATION);

  } catch (error) {
    console.error('Failed to start recording:', error);
    status.innerHTML = `<p class="text-red-500 text-sm">Error: ${error.message}</p>`;
  }
}

function stopRecording() {
  console.log("Stopping recording...");
  appState.isRecording = false;
  clearInterval(appState.recordingInterval);

  if (appState.stream) {
    appState.stream.getTracks().forEach(track => track.stop());
  }

  updateUIForRecording(false);
  stopTimer();
  stopVisualizer();
  status.innerHTML = '<p class="text-gray-500 text-sm">Ready to record</p>';
  console.log('Recording stopped.');
}

function recordChunk() {
  if (!appState.isRecording) return;

  const options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: CONFIG.AUDIO_BITRATE };
  const tempRecorder = new MediaRecorder(appState.stream, options);
  const chunks = [];

  tempRecorder.ondataavailable = e => chunks.push(e.data);
  
  tempRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
    if (blob.size > 0) {
      console.log(`Chunk recorded, size: ${blob.size} bytes. Sending to server...`);
      sendAudioChunk(blob);
    } else {
      console.log("Chunk recorded, but it was empty. Skipping send.");
    }
  };

  tempRecorder.start();
  console.log(`Started recording a new ${CONFIG.CHUNK_DURATION / 1000}-second chunk.`);

  setTimeout(() => {
    if (tempRecorder.state === "recording") {
      tempRecorder.stop();
    }
  }, CONFIG.CHUNK_DURATION);
}

// ============================================
// NETWORK & API CALLS
// ============================================
async function sendAudioChunk(audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, `chunk_${Date.now()}.webm`);
  
  try {
    const response = await fetch(CONFIG.BACKEND_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Server response:', result);
    displayClassification(result.classification);

  } catch (error) {
    console.error('Error sending audio chunk:', error);
    status.innerHTML = `<p class="text-red-500 text-sm">Failed to send data.</p>`;
  }
}

// ============================================
// UI & VISUALS
// ============================================
function displayClassification(classification) {
  let colorClass = 'text-gray-500';
  if (classification === 'HUMAN') {
    colorClass = 'text-green-400';
  } else if (classification === 'AI') {
    colorClass = 'text-red-400';
  }
  status.innerHTML = `<p class="text-lg font-semibold ${colorClass}">${classification}</p>`;
}

function updateUIForRecording(recording) {
  const micIcon = document.getElementById('micIcon');
  const stopIcon = document.getElementById('stopIcon');
  const pulseRing = document.getElementById('pulseRing');

  micIcon.classList.toggle('hidden', recording);
  stopIcon.classList.toggle('hidden', !recording);
  
  pulseRing.classList.toggle('opacity-0', !recording);
  pulseRing.classList.toggle('opacity-100', recording);
  pulseRing.classList.toggle('animate-ping', recording);
  pulseRing.classList.toggle('bg-purple-500', recording);

  timer.classList.toggle('opacity-0', !recording);
  visualizer.classList.toggle('opacity-0', !recording);
}

function startTimer() {
  appState.startTime = Date.now();
  appState.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - appState.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timer.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(appState.timerInterval);
  appState.timerInterval = null;
  timer.textContent = '00:00';
}

function startVisualizer(stream) {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const microphone = audioContext.createMediaStreamSource(stream);
  
  analyser.fftSize = 64;
  microphone.connect(analyser);
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  const bars = visualizer.querySelectorAll('div');
  
  function animate() {
    analyser.getByteFrequencyData(dataArray);
    
    bars.forEach((bar, index) => {
      const value = dataArray[index * 2] || 0;
      const height = Math.max(4, (value / 150) * 100);
      bar.style.height = `${height}px`;
    });
    
    appState.animationFrame = requestAnimationFrame(animate);
  }
  
  animate();
}

function stopVisualizer() {
  if (appState.animationFrame) {
    cancelAnimationFrame(appState.animationFrame);
    appState.animationFrame = null;
  }
  
  const bars = visualizer.querySelectorAll('div');
  bars.forEach(bar => {
    bar.style.height = '4px';
  });
}
