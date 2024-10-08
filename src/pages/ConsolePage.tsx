/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Edit, Zap, ArrowUp, ArrowDown, ChevronDown, ChevronUp, AlertCircle, Loader, RefreshCw } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';
import { Map } from '../components/Map';

import './ConsolePage.scss';
import { isJsxOpeningLikeElement } from 'typescript';

// Remove this line
// import fxisLogo from '../FXISLOGO.png';

// Add this import at the top of the file
import { RingLoader } from 'react-spinners';

import { v4 as uuidv4 } from 'uuid'; // Add this import at the top of the file

/**
 * Type for result from get_weather() function call
 */
interface Coordinates {
  lat: number;
  lng: number;
  location?: string;
  temperature?: {
    value: number;
    units: string;
  };
  wind_speed?: {
    value: number;
    units: string;
  };
}

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

const formatText = (text: string) => {
  if (!text) return '';
  return text
    .replace(/\\n/g, '\n')  // Replace \n with actual newlines
    .replace(/\n\n/g, '<br/><br/>')  // Replace double newlines with double line breaks
    .replace(/\n/g, '<br/>')  // Replace single newlines with line breaks
    .replace(/\s-\s/g, '<br/>- ')  // Replace " - " with a line break and bullet point
    .trim();  // Trim any leading or trailing whitespace
};

export function ConsolePage() {
  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  const apiKey = LOCAL_RELAY_SERVER_URL
    ? ''
    : localStorage.getItem('tmp::voice_api_key') ||
      prompt('OpenAI API Key') ||
      '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(false);  // Changed from true to false
  const [isRecording, setIsRecording] = useState(false);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
  const [coords, setCoords] = useState<Coordinates | null>({
    lat: 37.775593,
    lng: -122.418137,
  });
  const [marker, setMarker] = useState<Coordinates | null>(null);

  const [showEvents, setShowEvents] = useState(false);
  // const [showEventsPopup, setShowEventsPopup] = useState(false);

  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

  // Add this new state
  const [isActive, setIsActive] = useState(false);

  const [iframeKey, setIframeKey] = useState(0);

  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string>('');

  // Function to generate a new session ID
  const generateSessionId = () => {
    return uuidv4();
  };

  // Add this function to handle manual refresh
  const handleRefresh = () => {
    setIframeKey(prevKey => prevKey + 1);
  };

  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  /**
   * When you click the API key
   */
  const resetAPIKey = useCallback(() => {
    const apiKey = prompt('OpenAI API Key');
    if (apiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', apiKey);
      window.location.reload();
    }
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setIsConnected(false);  // Reset connection status
    setRealtimeEvents([]);
    setItems([]);

    // Generate a new session ID when connecting
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);

    try {
      // Connect to microphone
      await wavRecorder.begin();

      // Connect to audio output
      await wavStreamPlayer.connect();

      // Connect to realtime API
      await client.connect();
      console.log('Connected to Realtime API');
      setIsConnected(true);  // Set to true when connected

      // Wait a bit to ensure the connection is established
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (client.isConnected()) {
        console.log('Sending initial message');
        await client.sendUserMessageContent([
          {
            type: `input_text`,
            text: `Hello!`,
          },
        ]);

        if (client.getTurnDetectionType() === 'server_vad') {
          await wavRecorder.record((data) => {
            if (client.isConnected()) {
              client.appendInputAudio(data.mono);
            }
          });
        }
      } else {
        console.error('Failed to connect to Realtime API');
        setIsConnected(false);
      }
    } catch (error) {
      console.error('Error connecting:', error);
      setIsConnected(false);
    }
  }, []);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);  // Set to false when disconnecting
    setRealtimeEvents([]);
    setItems([]);
    setMemoryKv({});
    setCoords({
      lat: 37.775593,
      lng: -122.418137,
    });
    setMarker(null);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * In push-to-talk mode, start recording
   * .appendInputAudio() for each sample
   */
  const startRecording = async () => {
    setIsRecording(true);
    setIsWaitingForResponse(false);  // Reset this when starting to record
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    
    if (client.isConnected()) {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    } else {
      console.warn('Client is not connected. Unable to start recording.');
    }
  };

  /**
   * In push-to-talk mode, stop recording
   */
  const stopRecording = async () => {
    setIsRecording(false);
    setIsWaitingForResponse(true);  // Set this to true when stopping recording
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    
    await wavRecorder.pause();
    if (client.isConnected()) {
      client.createResponse();
    } else {
      console.warn('Client is not connected. Unable to create response.');
    }
  };

  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    setCanPushToTalk(value === 'none');
  };

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    let isLoaded = true;

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#009900',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, []);

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set instructions
    client.updateSession({ instructions: instructions });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    // Add tools
    client.addTool(
      {
        name: 'set_memory',
        description: 'Add quick notes requested by the user',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'A short heading for the notes value. Always use uppercase  underscores, no other characters.',
            },
            value: {
              type: 'string',
              description: 'This is the note description that has been requested by the user to be saved. Maximum 30 words. Summarize as required. If no description is provided, then keep this empty',
            },
          },
          required: ['key', 'value'],
        },
      },
      async ({ key, value }: { [key: string]: any }) => {
        setMemoryKv((memoryKv) => {
          const newKv = { ...memoryKv };
          newKv[key] = value;
          return newKv;
        });
        return { ok: true };
      }
    );
    client.addTool(
      {
        name: 'get_weather',
        description:
          'Retrieves the weather for a given lat, lng coordinate pair. Specify a label for the location.',
        parameters: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude',
            },
            lng: {
              type: 'number',
              description: 'Longitude',
            },
            location: {
              type: 'string',
              description: 'Name of the location',
            },
          },
          required: ['lat', 'lng', 'location'],
        },
      },
      async ({ lat, lng, location }: { [key: string]: any }) => {
        setMarker({ lat, lng, location });
        setCoords({ lat, lng, location });
        const result = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m`
        );
        const json = await result.json();
        const temperature = {
          value: json.current.temperature_2m as number,
          units: json.current_units.temperature_2m as string,
        };
        const wind_speed = {
          value: json.current.wind_speed_10m as number,
          units: json.current_units.wind_speed_10m as string,
        };
        setMarker({ lat, lng, location, temperature, wind_speed });
        return json;
      }
    );

    // Comment out the tool_database_query
    /*
    client.addTool(
      {
        name: 'tool_database_query',
        description:
          'Execute an API call based on a user question if the question relates to data / database / aws / azure / customer profiling. The question is converted into a MySQL query and passed as a parameter. Another parameter is the cloud database provider, either Azure or AWS.',
        parameters: {
          type: 'object',
          properties: {
            sqlquery: {
              type: 'string',
              description: 'MySQL SQL query string based on the user question',
            },
            cloudVar: {
              type: 'string',
              description: "Either 'aws' or 'azure' based on the user's question",
            },
          },
          required: ['sqlquery', 'cloudVar'],
        },
      },
      async ({ sqlquery, cloudVar }: { [key: string]: any }) => {
        // Properly encode the query parameters
        const encodedSqlQuery = encodeURIComponent(sqlquery);
        const encodedCloudVar = encodeURIComponent(cloudVar);

        const url = `https://azure-aws-mysql-flowise.onrender.com/sqlquery/?sqlquery=${encodedSqlQuery}&cloud=${encodedCloudVar}`;

        const options = {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        };

        try {
          const response = await fetch(url, options);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const text = await response.text();
          console.log('API Response:', text); // Log the response for debugging
          return text;
        } catch (error) {
          console.error('Error in tool_database_query:', error);
          return `An error occurred while querying the database: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    );
    */
    

    client.addTool(
      {
        name: 'tool_multitask_api',
        description:
          'This tool sends the user input to an API endpoint that performs multiple tasks: updating a tracker, querying a database (AWS/Azure), or generating a chart. The API can return a .txt file, a normal response, or a chart (GIF/PNG).',
        parameters: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The user input or question to send to the API',
            },
          },
          required: ['question'],
        },
      },
      async ({ question }: { [key: string]: any }) => {
        const url = "https://flowise2-4vzn.onrender.com/api/v1/prediction/1bca2aa1-cadf-4916-9ab4-d4d92d2590bc";

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            question,
            overrideConfig: {
              sessionId: sessionId
            }
          })
        };

        try {
          const response = await fetch(url, options);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const contentType = response.headers.get("Content-Type");
          console.log('Response Content-Type:', contentType);

          if (contentType && contentType.includes("application/json")) {
            const jsonResponse = await response.json();
            console.log('JSON Response:', JSON.stringify(jsonResponse, null, 2));
            
            if (jsonResponse.artifacts && jsonResponse.artifacts.length > 0) {
              const imageArtifact = jsonResponse.artifacts.find((artifact: any) => artifact.type === 'png' || artifact.type === 'gif');
              if (imageArtifact) {
                console.log('Image artifact found:', imageArtifact);
                let imageUrl: string;
                if (imageArtifact.data.startsWith('FILE-STORAGE::')) {
                  const fileName = imageArtifact.data.replace('FILE-STORAGE::', '');
                  imageUrl = `https://flowise2-4vzn.onrender.com/api/v1/get-upload-file?chatflowId=1bca2aa1-cadf-4916-9ab4-d4d92d2590bc&chatId=${jsonResponse.chatId}&fileName=${fileName}`;
                } else {
                  imageUrl = `data:image/${imageArtifact.type};base64,${imageArtifact.data}`;
                }
                console.log('Setting image URL:', imageUrl);
                setCharts(prevCharts => {
                  const newCharts = [...prevCharts, { url: imageUrl, timestamp: Date.now() }];
                  setCurrentChartIndex(newCharts.length - 1);
                  return newCharts;
                });
                return jsonResponse.text || "Image generated successfully. It will be displayed in the chart area.";
              }
            }
            
            return jsonResponse.text || JSON.stringify(jsonResponse);
          } else if (contentType && (contentType.includes("text/plain") || contentType.includes("application/octet-stream"))) {
            const textResponse = await response.text();
            console.log('Text Response:', textResponse);
            return textResponse;
          } else if (contentType && contentType.includes("image/")) {
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);
            console.log('Image blob URL:', imageUrl);
            setImageUrl(imageUrl);
            return "Image blob received. It will be displayed in the chart area.";
          } else {
            console.log('Unknown response type:', contentType);
            return 'Unknown response type';
          }
        } catch (error) {
          console.error('Error in tool_multitask_api:', error);
          return `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    );

    // handle realtime events from client + server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
    client.on('error', (event: any) => {
      console.error('RealtimeClient error:', event);
      setIsConnected(false);
    });
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      console.log('Conversation updated:', item, delta);
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
        // Set isActive to true when there's voice activity
        setIsActive((prevIsActive) => true);
        // Reset isActive after 2 seconds of inactivity
        setTimeout(() => setIsActive((prevIsActive) => false), 2000);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
      setIsWaitingForResponse(false);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, [sessionId]); // Add sessionId to the dependency array

  useEffect(() => {
    changeTurnEndType('server_vad');
  }, []);

  // Add this useEffect for cleanup
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  // Add this useRef for the conversation container
  const conversationRef = useRef<HTMLDivElement>(null);

  // Add this useEffect for auto-scrolling
  useEffect(() => {
    if (conversationRef.current) {
      const scrollElement = conversationRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [items]);

  // Add this to your state declarations
  const [charts, setCharts] = useState<{ url: string; timestamp: number }[]>([]);

  // Add these functions for chart navigation
  const [currentChartIndex, setCurrentChartIndex] = useState(0);

  const showPreviousChart = () => {
    setCurrentChartIndex(prevIndex => Math.max(0, prevIndex - 1));
  };

  const showNextChart = () => {
    setCurrentChartIndex(prevIndex => Math.min(charts.length - 1, prevIndex + 1));
  };

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      <div className="content-top">
        <div className="content-title">
          <img src={`${process.env.PUBLIC_URL}/FXISLOGO.png`} alt="FXIS Logo" className="fxis-logo" />
          <span>Realtime Analytics Assistant</span>
        </div>
        {isConnected && (
          <div className="voice-activity-indicator">
            <RingLoader color="#ffffff" size={40} />
            <span className="activity-text">Listening</span>
          </div>
        )}
        <div className="content-controls">
          <Toggle
            defaultValue={true}
            labels={['MANUAL', 'VAD']}
            values={['none', 'server_vad']}
            onChange={(_, value) => changeTurnEndType(value)}
          />
          <Button
            label={isConnected ? 'DISCONNECT' : 'CONNECT'}
            iconPosition={isConnected ? 'end' : 'start'}
            icon={isConnected ? X : Zap}
            buttonStyle={isConnected ? 'regular' : 'action'}
            onClick={isConnected ? disconnectConversation : connectConversation}
          />
          {!LOCAL_RELAY_SERVER_URL && (
            <Button
              icon={Edit}
              iconPosition="end"
              buttonStyle="flush"
              className="api-key-button"
              onClick={() => resetAPIKey()}
              label={`API KEY: ${apiKey.slice(0, 3)}...`}  // Add this line
            />
          )}
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>
      <div className="content-main">
        <div className="content-logs">
          <div className="content-block conversation">
            <div className="content-block-title">CONVERSATION</div>
            <div className="content-block-body" ref={conversationRef}>
              {!items.length && `awaiting connection...`}
              {items.map((conversationItem, i) => (
                <div className="conversation-item" key={conversationItem.id}>
                  <span className={`speaker ${conversationItem.role || ''}`}>
                    {(conversationItem.role || conversationItem.type).replaceAll('_', ' ')}:
                  </span>
                  <span className="speaker-content">
                    {conversationItem.type === 'function_call_output' && (
                      <span dangerouslySetInnerHTML={{
                        __html: formatText(conversationItem.formatted.output || '')
                      }} />
                    )}
                    {conversationItem.formatted.tool && (
                      <span>
                        {conversationItem.formatted.tool.name}(
                        {JSON.stringify(conversationItem.formatted.tool.arguments)})
                      </span>
                    )}
                    {conversationItem.role === 'user' && (
                      <span dangerouslySetInnerHTML={{
                        __html: formatText(
                          conversationItem.formatted.transcript ||
                          (conversationItem.formatted.audio?.length
                            ? '(awaiting transcript)'
                            : conversationItem.formatted.text ||
                              '(item sent)')
                        )
                      }} />
                    )}
                    {conversationItem.role === 'assistant' && (
                      <span dangerouslySetInnerHTML={{
                        __html: formatText(
                          conversationItem.formatted.transcript ||
                          conversationItem.formatted.text ||
                          '(truncated)'
                        )
                      }} />
                    )}
                  </span>
                </div>
              ))}
              {isWaitingForResponse && (
                <div className="waiting-for-response">Waiting for assistant response...</div>
              )}
            </div>
          </div>
          <div className="content-bottom">
            <div className="content-block events">
              <div className="content-block-title">EVENTS</div>
              <div className="content-block-body" ref={eventsScrollRef}>
                {!realtimeEvents.length && `awaiting connection...`}
                {realtimeEvents.map((realtimeEvent, i) => (
                  <div className="event" key={realtimeEvent.event.event_id}>
                    <span className="event-timestamp">
                      {formatTime(realtimeEvent.time)}
                    </span>
                    <span className={`event-source ${realtimeEvent.source}`}>
                      {realtimeEvent.source === 'client' ? <ArrowUp /> : <ArrowDown />}
                      {realtimeEvent.source}
                    </span>
                    <span className="event-type">
                      {realtimeEvent.event.type}
                      {realtimeEvent.count && ` (${realtimeEvent.count})`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="content-block visualization">
              <div className="content-block-title">VOICE ACTIVITY</div>
              <div className="visualization-content">
                <div className="visualization-entry client">
                  <span>User</span>
                  <canvas ref={clientCanvasRef} />
                </div>
                <div className="visualization-entry server">
                  <span>Assistant</span>
                  <canvas ref={serverCanvasRef} />
                </div>
              </div>
            </div>
          </div>
          <div className="content-actions">
            <div className="spacer" />
            {isConnected && canPushToTalk && (
              <Button
                label={isRecording ? 'RELEASE TO SEND' : 'PUSH TO TALK'}
                buttonStyle={isRecording ? 'alert' : 'regular'}
                disabled={!isConnected || !canPushToTalk}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
              />
            )}
            <div className="spacer" />
          </div>
        </div>
        <div className="content-right">
          <div className="content-top-row">
            <div className="content-block chart-display">
              <div className="content-block-title">
                CHART DISPLAY
                <div className="chart-navigation">
                  <button onClick={showPreviousChart} disabled={currentChartIndex === 0}>
                    <ChevronUp size={16} />
                  </button>
                  <button onClick={showNextChart} disabled={currentChartIndex === charts.length - 1}>
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
              <div className="content-block-body">
                {charts.length > 0 ? (
                  <div className="chart-scroll-container">
                    {charts.map((chart, index) => (
                      <div key={chart.timestamp} className={`chart-item ${index === currentChartIndex ? 'active' : ''}`}>
                        <img 
                          src={chart.url} 
                          alt={`Generated Chart ${index + 1}`} 
                          style={{ maxWidth: '100%', height: 'auto' }}
                          onError={(e) => console.error('Image load error:', e)}
                        />
                        <div className="chart-timestamp">
                          {new Date(chart.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="chart-placeholder">No charts generated yet</div>
                )}
              </div>
            </div>
            <div className="content-block kv">
              <div className="content-block-title">QUICK NOTES</div>
              <div className="content-block-body content-kv">
                {Object.entries(memoryKv).map(([key, value], index) => (
                  <div key={index}>
                    <li>{`${key}: ${value}`}</li>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="content-block google-sheets">
            <div className="content-block-title">
              GOOGLE SHEETS
              <button className="refresh-button" onClick={handleRefresh}>
                <RefreshCw size={16} />
              </button>
            </div>
            <div className="content-block-body">
              <iframe
                key={iframeKey}
                src="https://docs.google.com/spreadsheets/d/e/2PACX-1vQktRJ81_MoWeeiemwz724h6Zo8p8Lgx3rrBgAQUFf1m9FHaFLEtZVQR1Nth9TjoIKmVO5lVfwM1ma2/pubhtml?widget=true&rm=minimal"
                width="100%"
                height="420"
                frameBorder="0"
              ></iframe>
            </div>
          </div>
        </div>
      </div>
      <footer className="content-footer">
        <span>Amar Harolikar | Applied Gen AI for Data Science, Analytics and Business</span>
      </footer>
    </div>
  );
}

function setIsActive(arg0: (prevIsActive: any) => boolean) {
  throw new Error('Function not implemented.');
}