# Voice-to-Text Desktop App

A desktop application built with Tauri + React that converts speech to text using Deepgram's real-time API.

## Features

- **Push-to-Talk**: Hold button or use keyboard shortcut to record
- **Real-time Transcription**: Live speech-to-text conversion via Deepgram
- **Text Management**: Copy to clipboard or insert into active text fields
- **Error Handling**: Graceful handling of microphone and network issues
- **Minimal UI**: Clean, functionality-focused interface

## Prerequisites

- Node.js (v16 or higher)
- Rust (latest stable)
- Deepgram API key ([Get one here](https://deepgram.com/))

## Setup Instructions

1. **Clone and Install Dependencies**
   ```bash
   cd voice-to-text-app
   npm install
   ```

2. **Install Tauri CLI**
   ```bash
   npm install -g @tauri-apps/cli
   ```

3. **Get Deepgram API Key**
   - Sign up at [Deepgram](https://deepgram.com/)
   - Create a new project and get your API key
   - Enter the API key in the app when prompted

4. **Run Development Server**
   ```bash
   npm run tauri dev
   ```

5. **Build for Production**
   ```bash
   npm run tauri build
   ```

## Usage

1. **Enter API Key**: Paste your Deepgram API key in the input field
2. **Record Audio**: Hold the "Hold to Record" button and speak
3. **View Transcription**: See live transcription appear in the text area
4. **Use Text**: Copy to clipboard or insert into any text field

## Architecture

- **Frontend**: React + TypeScript for UI
- **Backend**: Rust (Tauri) for system integration
- **Audio**: Web Audio API for microphone access
- **Transcription**: Deepgram WebSocket API for real-time speech-to-text
- **System Integration**: Clipboard access and text insertion via Tauri commands

## Key Components

- `AudioCapture`: Handles microphone input and audio streaming
- `DeepgramService`: Manages WebSocket connection to Deepgram API
- `App.tsx`: Main React component with UI and state management
- `main.rs`: Tauri backend with clipboard and text insertion commands

## Troubleshooting

**Microphone Permission Denied**
- Check browser/system microphone permissions
- Restart the application and allow microphone access

**Network Connection Issues**
- Verify internet connection
- Check Deepgram API key validity
- Ensure firewall allows WebSocket connections

**Text Insertion Not Working**
- Make sure target application has focus
- Try copying text and manually pasting instead

## Development Notes

- Audio is captured in WebM format with Opus codec
- Sample rate is set to 16kHz for optimal Deepgram performance
- Interim results provide live feedback during recording
- Final results are accumulated for complete transcription

## License

This project is for educational/assignment purposes.