import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, StopCircle, VolumeX, Volume2, Loader, Clock, MessageCircle, KeyRound } from 'lucide-react';
import { RingLoader } from 'react-spinners';
import ReactMarkdown from 'react-markdown';
import { CapabilityCard } from '../components/CapabilityCard';
import './ConsolePage.scss';

interface IconButtonProps {
  onClick: () => void;
  disabled: boolean;
  icon: React.ElementType;
  size?: string;
  className?: string;
}

const IconButton: React.FC<IconButtonProps> = ({ onClick, disabled, icon: Icon, size = 'h-12 w-12', className = '' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`rounded-full transition-all duration-300 flex items-center justify-center ${size} ${className} ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-110'
    }`}
  >
    <Icon className="text-white" size={24} />
  </button>
);

interface InputProps {
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

const Input: React.FC<InputProps> = ({ type, placeholder, value, onChange, className }) => (
  <div className="relative">
    <KeyRound className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={`border rounded-full px-10 py-2 w-full ${className} focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300`}
    />
  </div>
);

interface ListeningPopupProps {
  onStop: () => void;
}

const ListeningPopup: React.FC<ListeningPopupProps> = ({ onStop }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-filter backdrop-blur-sm">
    <div className="bg-white p-16 rounded-lg shadow-xl flex flex-col items-center animate-fade-in" style={{ minWidth: '400px', minHeight: '400px' }}>
      <RingLoader color="#4A90E2" size={240} />
      <p className="mt-8 text-2xl font-semibold text-gray-800">Listening...</p>
      <IconButton onClick={onStop} disabled={false} icon={StopCircle} className="mt-8 bg-red-500 hover:bg-red-600" size="h-24 w-24" />
    </div>
  </div>
);

interface Message {
  role: 'user' | 'assistant';
  content: string;
  transcriptionTime?: number;
  chatTime?: number;
  audioTime?: number;
  audioUrl?: string;
}

export function SimpleVoiceBotPage() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('tmp::voice_api_key') || '');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState<Message[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioRef = useRef(new Audio());

  useEffect(() => {
    const currentAudioRef = audioRef.current;
    currentAudioRef.onended = () => setIsPlaying(false);
    return () => {
      currentAudioRef.pause();
      currentAudioRef.src = '';
    };
  }, []);

  const resetAPIKey = useCallback(() => {
    const newApiKey = prompt('Enter your OpenAI API key');
    if (newApiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', newApiKey);
      setApiKey(newApiKey);
    }
  }, []);

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = processAudio;

      mediaRecorder.current.start();
      setIsListening(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopListening = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
      setIsListening(false);
    }
  };

  const processAudio = async () => {
    setIsProcessing(true);
    const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');

    try {
      // Transcribe audio
      const transcriptionStartTime = Date.now();
      const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!transcriptionResponse.ok) {
        throw new Error(`HTTP error! status: ${transcriptionResponse.status}`);
      }

      const transcriptionData = await transcriptionResponse.json();
      const transcription = transcriptionData.text;
      const transcriptionTime = Date.now() - transcriptionStartTime;

      // Add user message to conversation
      setConversation(prev => [...prev, { 
        role: 'user', 
        content: transcription,
        transcriptionTime: transcriptionTime
      }]);

      // Generate chat response
      const chatStartTime = Date.now();
      const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: transcription }],
        }),
      });

      if (!chatResponse.ok) {
        throw new Error(`HTTP error! status: ${chatResponse.status}`);
      }

      const chatData = await chatResponse.json();
      const assistantMessage = chatData.choices[0].message.content;
      const chatTime = Date.now() - chatStartTime;

      // Generate speech from assistant's response
      const audioStartTime = Date.now();
      const speechResponse = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: assistantMessage,
          voice: 'alloy',
        }),
      });

      if (!speechResponse.ok) {
        throw new Error(`HTTP error! status: ${speechResponse.status}`);
      }

      const audioBlob = await speechResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioTime = Date.now() - audioStartTime;

      // Modify the assistant message addition to include auto-play
      setConversation(prev => {
        const newMessage: Message = { 
          role: 'assistant', 
          content: assistantMessage,
          audioUrl: audioUrl,
          chatTime: chatTime,
          audioTime: audioTime
        };
        
        const newConversation = [...prev, newMessage];
        
        // Schedule the audio playback after the state update
        setTimeout(() => playAudio(audioUrl), 0);
        
        return newConversation;
      });

      setIsProcessing(false);
    } catch (error) {
      console.error('Error processing audio:', error);
      setIsProcessing(false);
    }
  };

  const playAudio = useCallback((audioUrl: string) => {
    const audio = audioRef.current;
    
    // Stop any currently playing audio
    audio.pause();
    audio.currentTime = 0;

    // Set the new audio source
    audio.src = audioUrl;

    // Play the new audio
    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
        })
        .catch((error) => {
          console.error("Error playing audio:", error);
          setIsPlaying(false);
        });
    }
  }, []);

  const stopAudio = () => {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) {
      return `${ms.toFixed(0)} ms`;
    } else {
      return `${(ms / 1000).toFixed(2)} s`;
    }
  };

  const capabilities = [
    { title: "MySQL DW" },
    { title: "Text-to-SQL" },
    { title: "Analyze Data" },
    { title: "Python Charts" },
    { title: "Yahoo Finance" },
    { title: "Update Trackers" },
    { title: "Slide Deck" },
    { title: "Email Reports" },
  ];

  return (
    <div data-component="SimpleVoiceBotPage" className="flex flex-col h-screen bg-gray-900 text-white">
      <div className="header-section flex-shrink-0 bg-gray-800 p-4">
        <div className="capabilities-section flex flex-wrap justify-center gap-2 mb-4">
          {capabilities.map((capability, index) => (
            <CapabilityCard key={index} title={capability.title} />
          ))}
        </div>
        <div className="main-header flex items-center justify-center">
          <div className="content-title flex items-center space-x-4">
            <img src={`${process.env.PUBLIC_URL}/FXISLOGO.png`} alt="FXIS Logo" className="fxis-logo h-10" />
            <span className="text-2xl font-bold">Voice Analytics Assistant</span>
          </div>
        </div>
      </div>
      <div className="content-main flex-grow overflow-hidden p-4">
        <div className="flex flex-col h-full space-y-4">
          {/* Voice Bot Controls */}
          <div className="flex space-x-4">
            <div className="w-1/3 flex flex-col space-y-4 bg-gray-800 rounded-lg p-4">
              <Input
                type="password"
                placeholder="Enter your OpenAI API key"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  localStorage.setItem('tmp::voice_api_key', e.target.value);
                }}
                className="bg-gray-700 text-white placeholder-gray-500 border-gray-600"
              />
              <button 
                onClick={resetAPIKey} 
                className="text-blue-400 hover:text-blue-300 transition-colors duration-200"
              >
                Reset API Key
              </button>
              <div className="flex justify-center items-center space-x-4">
                <IconButton
                  onClick={startListening}
                  disabled={!apiKey || isProcessing || isListening}
                  icon={Mic}
                  size="h-32 w-32"
                  className="bg-blue-500 hover:bg-blue-600 shadow-lg"
                />
                <IconButton
                  onClick={stopAudio}
                  disabled={!isPlaying}
                  icon={VolumeX}
                  size="h-16 w-16"
                  className="bg-red-500 hover:bg-red-600 shadow-lg"
                />
              </div>
            </div>
            {/* Processing Indicator - Moved above the conversation box */}
            <div className="w-2/3 flex items-center justify-center">
              {isProcessing && (
                <div className="text-center text-gray-300 flex items-center justify-center bg-gray-800 rounded-lg p-4 shadow-lg">
                  <Loader className="animate-spin mr-2 h-5 w-5" />
                  Processing your request...
                </div>
              )}
            </div>
          </div>

          {/* Listening Popup - Moved above the conversation box */}
          {isListening && (
            <div className="w-full flex justify-center mb-4">
              <div className="bg-gray-800 p-4 rounded-lg shadow-xl flex items-center space-x-4">
                <RingLoader color="#4A90E2" size={40} />
                <p className="text-lg font-semibold text-white">Listening...</p>
                <IconButton onClick={stopListening} disabled={false} icon={StopCircle} className="bg-red-500 hover:bg-red-600" size="h-10 w-10" />
              </div>
            </div>
          )}

          {/* Conversation Box */}
          <div className="flex-grow flex flex-col bg-gray-800 rounded-lg overflow-hidden border-2 border-blue-500 shadow-lg max-w-4xl mx-auto w-full">
            <div className="p-2 border-b-2 border-blue-500 bg-blue-600">
              <h3 className="text-lg font-semibold text-white">Conversation Box</h3>
            </div>
            <div className="flex-grow overflow-y-auto p-4 space-y-2">
              {conversation.map((message, index) => (
                <div key={index} className="p-2 rounded bg-gray-700">
                  <span className={`font-bold ${message.role === 'user' ? 'text-blue-400' : 'text-purple-400'}`}>
                    {message.role === 'user' ? 'User: ' : 'Assistant: '}
                  </span>
                  <span className="text-white">{message.content}</span>
                  {message.role === 'assistant' && isPlaying && message === conversation[conversation.length - 1] && (
                    <span className="ml-2 text-green-400">
                      <Volume2 className="inline-block w-4 h-4 mr-1" />
                      Playing
                    </span>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {message.transcriptionTime && (
                      <span className="mr-2">
                        Transcription: {formatTime(message.transcriptionTime)}
                      </span>
                    )}
                    {message.chatTime && (
                      <span className="mr-2">
                        Chat: {formatTime(message.chatTime)}
                      </span>
                    )}
                    {message.audioTime && (
                      <span>
                        Audio: {formatTime(message.audioTime)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}