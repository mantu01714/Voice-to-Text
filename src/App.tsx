import React, { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import './App.css';

class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;

  async startRecording(onDataAvailable: (chunk: Blob) => void): Promise<void> {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      let options: MediaRecorderOptions;
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      } else {
        options = {};
      }
      
      this.mediaRecorder = new MediaRecorder(this.audioStream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          onDataAvailable(event.data);
        }
      };

      this.mediaRecorder.start(100);
    } catch (error) {
      console.error('Microphone error:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Microphone permission denied. Please allow microphone access.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone.');
        } else {
          throw new Error(`Microphone access failed: ${error.message}`);
        }
      } else {
        throw new Error('Failed to access microphone. Please check permissions.');
      }
    }
  }

  stopRecording(): void {
    this.mediaRecorder?.stop();
    this.audioStream?.getTracks().forEach(track => track.stop());
    this.mediaRecorder = null;
    this.audioStream = null;
  }
}

class DeepgramService {
  private ws: WebSocket | null = null;
  private readonly apiKey: string;
  public isConnected = false;
  private speechRecognition: any = null;
  private isListening = false;
  private audioChunks: Blob[] = [];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async connect(onTranscript: (text: string, isFinal: boolean) => void): Promise<void> {
    if (!this.apiKey || this.apiKey.length < 20) {
      throw new Error('Invalid Deepgram API key format');
    }

    // Check if running in Tauri environment
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_IPC__;
    
    if (isTauri) {
      // Use proper Deepgram WebSocket as per assignment requirements
      return new Promise((resolve, reject) => {
        const wsUrl = `wss://api.deepgram.com/v1/listen?encoding=webm&sample_rate=16000&channels=1&interim_results=true`;
        
        this.ws = new WebSocket(wsUrl, ['token', this.apiKey]);
        
        this.ws.onopen = () => {
          console.log('✅ Connected to Deepgram WebSocket');
          this.isConnected = true;
          resolve();
        };
        
        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          reject(new Error('Failed to connect to Deepgram WebSocket'));
        };
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.channel?.alternatives?.[0]) {
              const transcript = data.channel.alternatives[0].transcript;
              const isFinal = data.is_final;
              if (transcript) {
                onTranscript(transcript, isFinal);
              }
            }
          } catch (error) {
            console.error('Error parsing Deepgram response:', error);
          }
        };
        
        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code);
          this.isConnected = false;
        };
      });
    } else {
      // Browser fallback - use Web Speech API
      this.isConnected = true;
      console.log('Browser mode - using Web Speech API fallback');
    }
  }

  sendAudio(audioBlob: Blob): void {
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_IPC__;
    
    if (isTauri && this.ws?.readyState === WebSocket.OPEN) {
      // Stream audio directly to Deepgram WebSocket as per assignment
      this.ws.send(audioBlob);
    }
    
    // Also collect for fallback transcription
    this.audioChunks.push(audioBlob);
  }

  collectAudio(audioBlob: Blob): void {
    this.audioChunks.push(audioBlob);
  }

  startRealTimeRecognition(onTranscript: (text: string, isFinal: boolean) => void): void {
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_IPC__;
    
    if (!isTauri) {
      // Use Web Speech API for real-time recognition in browser
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.error('Speech Recognition not supported');
        onTranscript('Speech recognition not supported in this browser. Please use Chrome or Edge.', true);
        return;
      }
      
      if (!this.isListening) {
        console.log('Starting speech recognition...');
        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = true;
        this.speechRecognition.lang = 'en-US';
        this.speechRecognition.maxAlternatives = 1;
        
        // Store all recognized text to avoid losing parts
        let allFinalText = '';
        
        this.speechRecognition.onstart = () => {
          console.log('✅ Speech recognition started successfully');
          allFinalText = ''; // Reset on start
        };
        
        this.speechRecognition.onresult = (event: any) => {
          console.log('📝 Speech result received:', event.results.length);
          
          let interimTranscript = '';
          let currentFinalText = '';
          
          // Process ALL results from the beginning
          for (let i = 0; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            console.log(`Result ${i}: "${transcript}" (final: ${event.results[i].isFinal})`);
            
            if (event.results[i].isFinal) {
              currentFinalText += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }
          
          // Update accumulated final text
          if (currentFinalText.trim() && currentFinalText !== allFinalText) {
            allFinalText = currentFinalText;
            console.log('✅ Final accumulated:', allFinalText.trim());
            onTranscript(allFinalText.trim(), true);
          }
          
          // Show interim results
          if (interimTranscript) {
            console.log('🔄 Interim:', interimTranscript);
            onTranscript(interimTranscript, false);
          }
        };
        
        this.speechRecognition.onerror = (event: any) => {
          console.error('❌ Speech recognition error:', event.error);
          
          if (event.error === 'not-allowed') {
            onTranscript('Microphone permission denied. Please allow microphone access and try again.', true);
          } else if (event.error === 'no-speech') {
            console.log('No speech detected, continuing...');
            // Don't restart on no-speech, let onend handle it
          } else if (event.error === 'audio-capture') {
            console.log('Audio capture issue');
            // Let onend handle restart
          } else {
            console.log(`Other error: ${event.error}`);
            // Let onend handle restart
          }
        };
        
        this.speechRecognition.onend = () => {
          console.log('🔄 Speech recognition ended');
          if (this.isListening) {
            console.log('Scheduling restart...');
            // Add a longer delay to ensure clean restart
            setTimeout(() => {
              if (this.isListening && this.speechRecognition) {
                this.restartRecognition();
              }
            }, 500);
          }
        };
        
        this.isListening = true;
        try {
          this.speechRecognition.start();
        } catch (error) {
          console.error('Failed to start speech recognition:', error);
          onTranscript('Failed to start speech recognition. Please try again.', true);
        }
      }
    }
  }

  private restartRecognition(): void {
    if (this.isListening && this.speechRecognition) {
      try {
        // Check if recognition is already running
        if (this.speechRecognition.readyState === 'inactive') {
          console.log('🔄 Restarting recognition...');
          this.speechRecognition.start();
        } else {
          console.log('Recognition already active, skipping restart');
        }
      } catch (error) {
        console.log('Restart failed:', error);
        // Only retry if it's not already started
        if (error instanceof Error && error.name !== 'InvalidStateError') {
          setTimeout(() => this.restartRecognition(), 500);
        }
      }
    }
  }

  stopRealTimeRecognition(): void {
    if (this.speechRecognition && this.isListening) {
      this.isListening = false;
      try {
        this.speechRecognition.stop();
      } catch (error) {
        console.log('Recognition stop error:', error);
      }
      this.speechRecognition = null;
    }
  }

  async transcribeAudio(onTranscript: (text: string, isFinal: boolean) => void): Promise<void> {
    if (this.audioChunks.length === 0) return;

    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_IPC__;

    try {
      if (isTauri) {
        // Use Tauri backend for real Deepgram API call
        const combinedBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const arrayBuffer = await combinedBlob.arrayBuffer();
        const audioData = Array.from(new Uint8Array(arrayBuffer));
        
        const transcript = await invoke('transcribe_audio', {
          apiKey: this.apiKey,
          audioData: audioData
        }) as string;
        
        if (transcript && transcript.trim()) {
          onTranscript(transcript, true);
        }
      } else {
        // Browser mode - real-time recognition already handled during recording
        console.log('Browser mode transcription completed');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    } finally {
      this.audioChunks = [];
    }
  }

  disconnect(): void {
    this.stopRealTimeRecognition();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
  }
}

const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [apiKey] = useState(import.meta.env.VITE_DEEPGRAM_API_KEY || '');

  const audioCapture = useRef(new AudioCapture());
  const deepgramService = useRef<DeepgramService | null>(null);

  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    console.log(`📝 Transcript received: "${text}" (final: ${isFinal})`);
    
    if (isFinal) {
      setFinalText(prev => {
        const trimmedText = text.trim();
        if (trimmedText) {
          // For final text, replace the entire content to avoid accumulation issues
          console.log(`✅ Final text set to: "${trimmedText}"`);
          return trimmedText;
        }
        return prev;
      });
      setInterimText('');
    } else {
      console.log(`🔄 Interim text: "${text}"`);
      setInterimText(text);
    }
  }, []);

  // Initialize Deepgram service
  useEffect(() => {
    const initializeService = async () => {
      if (!apiKey.trim()) {
        setError('Deepgram API key not configured. Please set VITE_DEEPGRAM_API_KEY in .env file');
        return;
      }
      
      try {
        deepgramService.current = new DeepgramService(apiKey);
        setIsInitialized(true);
        console.log('Service ready');
      } catch (error) {
        console.error('Service initialization error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Service initialization failed';
        setError(errorMessage);
      }
    };
    
    initializeService();
  }, [apiKey]);

  // Keyboard shortcut handling (Space key)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isRecording && isInitialized) {
        event.preventDefault();
        startRecording();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && isRecording) {
        event.preventDefault();
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRecording, isInitialized]);

  const startRecording = async () => {
    if (!isInitialized || !deepgramService.current) {
      setError('Service not ready. Please wait or refresh the page.');
      return;
    }
    
    try {
      setError('');
      setIsRecording(true);
      
      // Connect to Deepgram WebSocket with transcript handler
      await deepgramService.current.connect(handleTranscript);
      
      // Start real-time speech recognition for browser fallback
      deepgramService.current?.startRealTimeRecognition(handleTranscript);
      
      // Start audio recording and stream to Deepgram
      await audioCapture.current.startRecording((chunk) => {
        deepgramService.current?.sendAudio(chunk);
      });
    } catch (error) {
      console.error('Recording error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to start recording: ${errorMessage}`);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    audioCapture.current.stopRecording();
    
    // Stop real-time recognition
    deepgramService.current?.stopRealTimeRecognition();
    
    // Process collected audio with Deepgram (Tauri mode only)
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_IPC__;
    
    if (deepgramService.current && isTauri) {
      try {
        setInterimText('Processing with Deepgram AI...');
        await deepgramService.current.transcribeAudio(handleTranscript);
        setInterimText('');
      } catch (error) {
        console.error('Transcription error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Transcription failed';
        setError(`Deepgram transcription failed: ${errorMessage}`);
        setInterimText('');
      }
    }
    
    // Clear interim text after a short delay in browser mode
    if (!isTauri) {
      setTimeout(() => {
        setInterimText('');
      }, 500);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(finalText.trim());
      setSuccessMessage('Text copied to clipboard!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = finalText.trim();
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setSuccessMessage('Text copied to clipboard!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (fallbackError) {
        setError('Failed to copy text. Please copy manually.');
      }
    }
  };

  const insertText = async () => {
    try {
      await copyToClipboard();
      setSuccessMessage('Text copied! Press Ctrl+V to paste in any application.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      setError('Text insertion not available in browser. Use copy instead.');
    }
  };

  const clearText = () => {
    setFinalText('');
    setInterimText('');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Voice to Text</h1>
      </header>

      <main className="app-main">
        <div className="card">
          <div className="recording-section">
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              disabled={!isInitialized}
              className={`record-button ${isRecording ? 'recording' : ''} ${!isInitialized ? 'loading' : ''}`}
            >
              {!isInitialized ? '⏳ Initializing...' : isRecording ? '🔴 Recording...' : '🎤 Hold to Record (or press Space)'}
            </button>
            {isRecording && (
              <div className="recording-indicator">
                <div className="recording-dot"></div>
                <span>Listening... (Release Space or mouse to stop)</span>
              </div>
            )}
            {!isRecording && isInitialized && (
              <div className="keyboard-hint">
                💡 Tip: Hold Space key or mouse button to record
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="transcription-section">
            <div className="text-display">
              {!finalText && !interimText ? (
                <div className="empty-state">
                  <div className="empty-state-icon">💬</div>
                  <div>Your transcription will appear here</div>
                </div>
              ) : (
                <>
                  <div className="final-text">{finalText}</div>
                  <div className="interim-text">{interimText}</div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="controls-section">
            <button onClick={copyToClipboard} disabled={!finalText.trim()}>
              📋 Copy
            </button>
            <button onClick={insertText} disabled={!finalText.trim()}>
              📝 Insert
            </button>
            <button onClick={clearText} disabled={!finalText.trim()}>
              🗑️ Clear
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}
        
        {successMessage && (
          <div className="success-message">
            ✓ {successMessage}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;