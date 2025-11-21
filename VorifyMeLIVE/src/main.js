import './style.css'

// ============================================
// CONFIGURATION - Edit these values
// ============================================
const CONFIG = {
  // Backend server URL - Change this to your backend endpoint
  BACKEND_URL: import.meta.env.VITE_AUDIO_SERVER,
  
  // Audio chunk duration in milliseconds (lower = more frequent sends, higher = less data usage)
  CHUNK_DURATION: 3000, // 3 second chunks
  
  // Audio quality settings (lower = smaller file size)
  AUDIO_BITRATE: 128000, // 128 kbps - reduce to 64000 for lighter data usage
  
  // Theme colors - Customize your purple shades
  PRIMARY_PURPLE: '#9333ea', // Main purple
  DARK_PURPLE: '#6b21a8', // Darker purple for hover states
  ACCENT_PURPLE: '#a855f7', // Lighter accent purple
}

// ============================================
// STATE MANAGEMENT
// ============================================
let mediaRecorder = null
let audioChunks = []
let isRecording = false
let stream = null
let sendQueue = [] // Queue for audio chunks to be sent
let isSendCooldown = false // Flag to manage the sending cooldown

// ============================================
// UI RENDERING
// ============================================
document.querySelector('#app').innerHTML = `
  <div class="min-h-screen bg-black flex flex-col items-center justify-center p-8">
    <!-- Header -->
    <div class="text-center mb-12">
      <h1 class="text-5xl font-bold text-white mb-4">
        VoifyMELIVE 
      </h1>
           <p class="text-gray-400 text-lg">
        Easily detect Real or AI generated voice
      </p>
      <p class="text-gray-400 text-lg">
        Click the microphone to start recording
      </p>
    </div>

    <!-- Microphone Button -->
    <div class="relative mb-8">
      <!-- Pulsing ring effect when recording -->
      <div id="pulseRing" class="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300"></div>
      
      <!-- Main button -->
      <button 
        id="micButton"
        class="relative z-10 w-32 h-32 rounded-full bg-gradient-to-br from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 transition-all duration-300 shadow-2xl hover:shadow-purple-500/50 flex items-center justify-center group"
        aria-label="Record audio"
      >
        <!-- Microphone Icon -->
        <svg id="micIcon" class="w-16 h-16 text-white transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        
        <!-- Stop Icon (hidden by default) -->
        <svg id="stopIcon" class="w-16 h-16 text-white hidden" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      </button>
    </div>

    <!-- Status indicator -->
    <div id="status" class="text-center mb-8 h-8">
      <p class="text-gray-500 text-sm">Ready to record</p>
    </div>

    <!-- Recording timer -->
    <div id="timer" class="text-4xl font-mono text-purple-400 mb-8 opacity-0 transition-opacity duration-300">
      00:00
    </div>

    <!-- Audio visualizer bars -->
    <div id="visualizer" class="flex gap-1 h-20 items-end mb-8 opacity-0 transition-opacity duration-300">
      ${Array(20).fill(0).map(() => `
        <div class="w-2 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t transition-all duration-150" style="height: 4px;"></div>
      `).join('')}
    </div>

    <!-- Info card -->
    <div class="max-w-md bg-gray-900 rounded-lg p-6 border border-gray-800">
      <h3 class="text-white font-semibold mb-2 flex items-center gap-2">
        <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        How it works
      </h3>
      <ul class="text-gray-400 text-sm space-y-2">
        <li>• Click the microphone to start recording</li>
        <li>• Audio is streamed to the server in real-time</li>
        <li>• Click again to stop recording</li>
        <li>• Optimized for minimal data usage</li>
      </ul>
    </div>
  </div>
`

// ============================================
// AUDIO RECORDING LOGIC
// ============================================
const micButton = document.getElementById('micButton')
const micIcon = document.getElementById('micIcon')
const stopIcon = document.getElementById('stopIcon')
const status = document.getElementById('status')
const timer = document.getElementById('timer')
const pulseRing = document.getElementById('pulseRing')
const visualizer = document.getElementById('visualizer')
const bars = visualizer.querySelectorAll('div')

let startTime = 0
let timerInterval = null

// Start/Stop recording on button click
micButton.addEventListener('click', async () => {
  if (!isRecording) {
    await startRecording()
  } else {
    stopRecording()
  }
})

// ============================================
// RECORDING FUNCTIONS
// ============================================
// Replace your startRecording and stopRecording with this logic

let recordingInterval = null;

async function startRecording() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 22050 // Lower sample rate = Faster processing!
      } 
    })

    isRecording = true
    updateUIForRecording(true)
    startTimer()
    startVisualizer(stream)
    status.innerHTML = '<p class="text-purple-400 text-sm font-semibold">● Recording...</p>'

    // FUNCTION TO RECORD ONE CHUNK
    const recordChunk = () => {
      if (!isRecording) return;

      // Create a new recorder for every chunk to ensure valid Headers
      const options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 }; // Lower bitrate for speed
      const tempRecorder = new MediaRecorder(stream, options);
      const chunks = [];

      tempRecorder.ondataavailable = e => chunks.push(e.data);
      
      tempRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
        // Send immediately
        if(blob.size > 0) sendAudioChunk(blob);
      };

      tempRecorder.start();

      // Stop this specific recorder after 3 seconds
      setTimeout(() => {
        if (tempRecorder.state === "recording") {
            tempRecorder.stop();
        }
      }, CONFIG.CHUNK_DURATION);
    };

    // Start the loop
    recordChunk(); // Record first chunk
    recordingInterval = setInterval(recordChunk, CONFIG.CHUNK_DURATION); // Repeat

  } catch (error) {
    console.error('Error:', error)
  }
}

function stopRecording() {
  isRecording = false
  clearInterval(recordingInterval) // Stop the loop
  
  // Stop all tracks
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
  }

  updateUIForRecording(false)
  stopTimer()
  stopVisualizer()
  status.innerHTML = '<p class="text-gray-500 text-sm">Ready to record</p>'
}

// ============================================
// SEND AUDIO TO BACKEND
// ============================================

// Processes the queue of audio chunks to be sent
function processSendQueue() {
  if (isSendCooldown || sendQueue.length === 0) {
    return; // Do nothing if on cooldown or if the queue is empty
  }

  isSendCooldown = true;
  const chunkToSend = sendQueue.shift(); // Get the oldest chunk

  console.log('Sending a 3-second chunk to the backend...');
  sendAudioChunk(chunkToSend);

  console.log('Waiting for 3 seconds before the next send...');
  setTimeout(() => {
    console.log('Cooldown finished. Ready to send next chunk.');
    isSendCooldown = false;
    processSendQueue(); // Attempt to process the next item in the queue
  }, 3000);
}

async function sendAudioChunk(audioBlob) {
  try {
    const formData = new FormData()
    formData.append('audio', audioBlob, `chunk_${Date.now()}.webm`)
    
    // Send to backend - Edit the URL in CONFIG above
    const response = await fetch(CONFIG.BACKEND_URL, {
      method: 'POST',
      body: formData,
      // Add any additional headers you need
      headers: {
        // 'Authorization': 'Bearer YOUR_TOKEN', // Uncomment if needed
      }
    })

    if (!response.ok) {
      console.error('Failed to send audio chunk:', response.statusText)
      return;
    }

    const result = await response.json();
    console.log('Received classification:', result.classification);
    displayClassification(result.classification);

  } catch (error) {
    console.error('Error sending audio chunk:', error)
    // Handle error (show notification, retry, etc.)
  }
}

// ============================================
// UI UPDATE FUNCTIONS
// ============================================
function displayClassification(classification) {
  const statusElement = document.getElementById('status');
  let colorClass = 'text-gray-500';
  if (classification === 'Human') {
    colorClass = 'text-green-400';
  } else if (classification === 'AI') {
    colorClass = 'text-red-400';
  }
  statusElement.innerHTML = `<p class="text-lg font-semibold ${colorClass}">${classification}</p>`;
}

function updateUIForRecording(recording) {
  if (recording) {
    micIcon.classList.add('hidden')
    stopIcon.classList.remove('hidden')
    pulseRing.classList.remove('opacity-0')
    pulseRing.classList.add('opacity-100', 'animate-ping', 'bg-purple-500')
    timer.classList.remove('opacity-0')
    visualizer.classList.remove('opacity-0')
  } else {
    micIcon.classList.remove('hidden')
    stopIcon.classList.add('hidden')
    pulseRing.classList.add('opacity-0')
    pulseRing.classList.remove('opacity-100', 'animate-ping')
    timer.classList.add('opacity-0')
    visualizer.classList.add('opacity-0')
  }
}

function startTimer() {
  startTime = Date.now()
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0')
    const seconds = (elapsed % 60).toString().padStart(2, '0')
    timer.textContent = `${minutes}:${seconds}`
  }, 1000)
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
  timer.textContent = '00:00'
}

// ============================================
// AUDIO VISUALIZER
// ============================================
let animationFrame = null

function startVisualizer(stream) {
  const audioContext = new AudioContext()
  const analyser = audioContext.createAnalyser()
  const microphone = audioContext.createMediaStreamSource(stream)
  
  analyser.fftSize = 64
  microphone.connect(analyser)
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount)
  
  function animate() {
    analyser.getByteFrequencyData(dataArray)
    
    // Update bar heights based on audio levels
    bars.forEach((bar, index) => {
      const value = dataArray[index * 2] || 0
      const height = Math.max(4, (value / 255) * 80)
      bar.style.height = `${height}px`
    })
    
    animationFrame = requestAnimationFrame(animate)
  }
  
  animate()
}

function stopVisualizer() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
  
  // Reset bars
  bars.forEach(bar => {
    bar.style.height = '4px'
  })
}