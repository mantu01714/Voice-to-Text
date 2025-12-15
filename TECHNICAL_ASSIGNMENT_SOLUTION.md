# Voice-to-Text Desktop App - Technical Assignment Solution

--------------------------------------------------
## 1. PROJECT OVERVIEW
--------------------------------------------------

### Goal
Build a desktop application that converts speech to text in real-time using voice input. The app captures audio from the microphone, processes it through Deepgram's speech recognition API, and provides the transcribed text for immediate use.

### How It Works (User Perspective)
1. User opens the desktop app
2. Clicks and holds a "Record" button (or uses keyboard shortcut)
3. Speaks into the microphone while holding the button
4. Sees live transcription appearing on screen
5. Releases button to stop recording
6. Can copy the final text or insert it into any active text field

### Design Philosophy
UI is minimal and functionality-focused. No fancy animations or complex layouts - just a clean interface that prioritizes the core workflow of voice-to-text conversion.

--------------------------------------------------
## 2. TECH STACK (MANDATORY)
--------------------------------------------------

- **Tauri** (Rust backend) - Cross-platform desktop framework
- **Frontend**: React (with Vite) - Modern UI framework with fast development
- **Deepgram API** - Real-time speech-to-text service
- **Web Audio API** - Browser audio capture and processing
- **WebSocket streaming** - Real-time audio data transmission
- **TypeScript** - Type-safe JavaScript for better development experience

--------------------------------------------------
## 3. HIGH-LEVEL ARCHITECTURE
--------------------------------------------------

### Separation of Concerns

**UI Layer (React)**
- Handles user interactions (buttons, keyboard shortcuts)
- Displays transcription results
- Manages application state

**Audio Capture Module**
- Interfaces with Web Audio API
- Processes microphone input
- Converts audio to appropriate format for streaming

**Transcription Service (Deepgram)**
- Establishes WebSocket connection
- Streams audio chunks in real-time
- Processes interim and final transcription results

**Tauri Bridge (Rust ↔ Frontend)**
- Handles system-level operations
- Manages clipboard access
- Provides secure API key storage

### Data Flow Diagram Explanation
```
Voice Input → Microphone → Web Audio API → Audio Chunks → 
WebSocket → Deepgram API → Transcription Results → 
React UI → Display/Copy/Insert
```

### Why This Architecture Is Clean and Maintainable
- **Single Responsibility**: Each module has one clear purpose
- **Loose Coupling**: Components communicate through well-defined interfaces
- **Testability**: Each layer can be tested independently
- **Scalability**: Easy to add new features or swap components

--------------------------------------------------
## 4. CORE FEATURES (MUST MATCH REQUIREMENTS)
--------------------------------------------------

### 1. Push-to-Talk
**Implementation:**
- React button with onMouseDown/onMouseUp events
- Global keyboard shortcut (Space key) using Tauri's global shortcut API
- State management to track recording status
- Visual feedback during recording (button color change)

### 2. Microphone Access
**Implementation:**
- Request permissions using navigator.mediaDevices.getUserMedia()
- Handle permission denied gracefully with user-friendly error messages
- Detect when no microphone is available
- Provide retry mechanism for permission requests

### 3. Real-Time Transcription
**Implementation:**
- Establish WebSocket connection to Deepgram's streaming API
- Stream audio chunks (typically 100-250ms intervals)
- Handle both interim results (live preview) and final results
- Manage connection lifecycle (connect/disconnect/reconnect)

### 4. Display & Insert Text
**Implementation:**
- Live text preview in main UI area
- Copy to clipboard using Tauri's clipboard API
- Basic text insertion using Tauri commands to simulate keyboard input
- Clear distinction between interim and final text

### 5. Recording Controls
**Implementation:**
- Start/Stop button with clear visual states
- Recording indicator (red dot or pulsing animation)
- Disable other controls during recording
- Audio level visualization (optional but helpful)

### 6. Error Handling
**Implementation:**
- **No mic permission**: Show permission request dialog with instructions
- **Network failure**: Display connection status and retry options
- **Invalid API key**: Clear error message with configuration guidance
- **Audio device errors**: Fallback to default device or show device selection

--------------------------------------------------
## 5. IMPLEMENTATION STEPS
--------------------------------------------------

### Step 1: Initialize Tauri + React Project
```bash
npm create tauri-app@latest voice-to-text-app
cd voice-to-text-app
npm install
```

### Step 2: Configure Permissions
Add to `src-tauri/tauri.conf.json`:
```json
{
  "tauri": {
    "allowlist": {
      "clipboard": {
        "all": true
      },
      "globalShortcut": {
        "all": true
      }
    }
  }
}
```

### Step 3: Audio Capture Logic
- Implement MediaRecorder with Web Audio API
- Set up audio processing pipeline
- Handle browser compatibility issues

### Step 4: Deepgram WebSocket Integration
- Establish secure WebSocket connection
- Implement audio streaming protocol
- Handle connection management and reconnection

### Step 5: UI Wiring
- Create React components for recording controls
- Implement state management for transcription
- Add keyboard shortcut handling

### Step 6: Cleanup & Stopping Streams
- Properly close WebSocket connections
- Stop audio streams and release microphone
- Clean up event listeners and timers

--------------------------------------------------
## 6. KEY CODE SNIPPETS
--------------------------------------------------

### Microphone Audio Capture
```typescript
class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;

  async startRecording(onDataAvailable: (chunk: Blob) => void) {
    this.audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    this.mediaRecorder = new MediaRecorder(this.audioStream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        onDataAvailable(event.data);
      }
    };

    this.mediaRecorder.start(100); // 100ms chunks
  }

  stopRecording() {
    this.mediaRecorder?.stop();
    this.audioStream?.getTracks().forEach(track => track.stop());
  }
}
```

### Streaming Audio to Deepgram
```typescript
class DeepgramService {
  private ws: WebSocket | null = null;
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  connect(onTranscript: (text: string, isFinal: boolean) => void) {
    const wsUrl = `wss://api.deepgram.com/v1/listen?encoding=webm&sample_rate=16000&channels=1`;
    
    this.ws = new WebSocket(wsUrl, ['token', this.apiKey]);
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.channel?.alternatives?.[0]) {
        const transcript = data.channel.alternatives[0].transcript;
        const isFinal = data.is_final;
        onTranscript(transcript, isFinal);
      }
    };
  }

  sendAudio(audioBlob: Blob) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioBlob);
    }
  }

  disconnect() {
    this.ws?.close();
  }
}
```

### Handling Transcription Events
```typescript
const useTranscription = () => {
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');

  const handleTranscript = (text: string, isFinal: boolean) => {
    if (isFinal) {
      setFinalText(prev => prev + text + ' ');
      setInterimText('');
    } else {
      setInterimText(text);
    }
  };

  return { interimText, finalText, handleTranscript };
};
```

### React UI Button Logic
```typescript
const RecordButton: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const audioCapture = useRef(new AudioCapture());
  const deepgram = useRef(new DeepgramService(API_KEY));

  const startRecording = async () => {
    setIsRecording(true);
    deepgram.current.connect(handleTranscript);
    
    await audioCapture.current.startRecording((chunk) => {
      deepgram.current.sendAudio(chunk);
    });
  };

  const stopRecording = () => {
    setIsRecording(false);
    audioCapture.current.stopRecording();
    deepgram.current.disconnect();
  };

  return (
    <button
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      className={`record-btn ${isRecording ? 'recording' : ''}`}
    >
      {isRecording ? 'Recording...' : 'Hold to Record'}
    </button>
  );
};
```

### Tauri Command Usage
```rust
// src-tauri/src/main.rs
use tauri::Manager;

#[tauri::command]
async fn copy_to_clipboard(text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    
    tauri::AppHandle::clipboard_manager()
        .write_text(text)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn insert_text(text: String) -> Result<(), String> {
    // Simulate Ctrl+V to paste text
    use enigo::{Enigo, KeyboardControllable};
    let mut enigo = Enigo::new();
    
    // Copy text to clipboard first
    copy_to_clipboard(text).await?;
    
    // Simulate paste
    enigo.key_sequence_parse("{+CTRL}v{-CTRL}");
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![copy_to_clipboard, insert_text])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```typescript
// Frontend usage
import { invoke } from '@tauri-apps/api/tauri';

const copyText = async (text: string) => {
  await invoke('copy_to_clipboard', { text });
};

const insertText = async (text: string) => {
  await invoke('insert_text', { text });
};
```

--------------------------------------------------

This solution provides a complete, production-ready approach to building a Voice-to-Text desktop application that matches the requirements while maintaining clean architecture and focusing on core functionality over UI complexity.