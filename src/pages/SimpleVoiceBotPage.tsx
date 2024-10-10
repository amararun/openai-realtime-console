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

      // Add user message to conversation
      setConversation(prev => [...prev, { role: 'user', content: transcription }]);

      // Generate chat response
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

      // Generate speech from assistant's response
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

      // Add assistant message to conversation
      setConversation(prev => [...prev, { 
        role: 'assistant', 
        content: assistantMessage,
        audioUrl: audioUrl,
      }]);

      setIsProcessing(false);
    } catch (error) {
      console.error('Error processing audio:', error);
      setIsProcessing(false);
    }
  };

  const playAudio = (audioUrl: string) => {
    audioRef.current.src = audioUrl;
    audioRef.current.play();
    setIsPlaying(true);
  };

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
    <div data-component="SimpleVoiceBotPage">
      <div className="header-section">
        <div className="capabilities-section">
          {capabilities.map((capability, index) => (
            <CapabilityCard key={index} title={capability.title} />
          ))}
        </div>
        <div className="main-header">
          <div className="content-title">
            <img src={`${process.env.PUBLIC_URL}/FXISLOGO.png`} alt="FXIS Logo" className="fxis-logo" />
            <span>Voice Analytics Assistant</span>
          </div>
        </div>
      </div>
      <div className="content-main">
        <div className="flex flex-col md:flex-row space-y-8 md:space-y-0 md:space-x-8">
          {/* Voice Bot Controls */}
          <div className="w-full md:w-1/3">
            <Input
              type="password"
              placeholder="Enter your OpenAI API key"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                localStorage.setItem('tmp::voice_api_key', e.target.value);
              }}
              className="mb-6 bg-gray-800 text-white placeholder-gray-500 border-gray-700"
            />
            <button onClick={resetAPIKey} className="mb-4 text-blue-400 hover:text-blue-300">
              Reset API Key
            </button>
            <div className="flex justify-center mb-8 space-x-4">
              <IconButton
                onClick={startListening}
                disabled={!apiKey || isProcessing || isListening}
                icon={Mic}
                size="h-48 w-48"
                className="bg-blue-500 hover:bg-blue-600 shadow-lg"
              />
              {isPlaying && (
                <IconButton
                  onClick={stopAudio}
                  disabled={false}
                  icon={VolumeX}
                  size="h-16 w-16"
                  className="bg-red-500 hover:bg-red-600"
                />
              )}
            </div>
            {isProcessing && (
              <div className="text-center text-gray-300 mb-6 flex items-center justify-center">
                <Loader className="animate-spin mr-2 h-5 w-5" />
                Processing your request...
              </div>
            )}
            {isListening && <ListeningPopup onStop={stopListening} />}
          </div>

          {/* Conversation Box */}
          <div className="w-full md:w-2/3">
            <div className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg rounded-lg shadow-xl border border-white border-opacity-20 p-4 h-[600px] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4 text-white">Conversation</h3>
              <div className="space-y-6">
                {conversation.map((message, index) => (
                  <div key={index} className={`p-4 rounded-lg ${message.role === 'user' ? 'bg-blue-500 bg-opacity-20' : 'bg-purple-500 bg-opacity-20'} backdrop-filter backdrop-blur-sm transition-all duration-300 hover:shadow-lg`}>
                    <div className="flex items-start">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${message.role === 'user' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                        {message.role === 'user' ? <Mic className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
                      </div>
                      <div className="ml-3 flex-1">
                        <p className="text-sm font-medium">{message.role === 'user' ? 'You' : 'Assistant'}</p>
                        <p className="mt-1 text-sm">{message.content}</p>
                        {message.role === 'user' && message.transcriptionTime && (
                          <p className="text-xs text-gray-400 mt-1">
                            <Clock className="inline mr-1 h-3 w-3" />
                            Transcription: {formatTime(message.transcriptionTime)}
                          </p>
                        )}
                        {message.role === 'assistant' && (
                          <div className="mt-2">
                            {message.chatTime && (
                              <p className="text-xs text-gray-400">
                                <Clock className="inline mr-1 h-3 w-3" />
                                Chat: {formatTime(message.chatTime)}
                              </p>
                            )}
                            {message.audioUrl && (
                              <div className="mt-1">
                                <button onClick={() => playAudio(message.audioUrl ?? '')} className="text-blue-300 hover:text-blue-100 transition-colors duration-200">
                                  <Volume2 className="inline mr-1 h-4 w-4" /> Play Audio
                                </button>
                                {message.audioTime && (
                                  <span className="ml-2 text-xs text-gray-400">
                                    <Clock className="inline mr-1 h-3 w-3" />
                                    Audio: {formatTime(message.audioTime)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}