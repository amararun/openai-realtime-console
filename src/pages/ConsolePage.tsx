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

import { X, Edit, Zap, ArrowUp, ArrowDown, ChevronDown, ChevronUp, AlertCircle, Loader, RefreshCw, Maximize2 } from 'react-feather';
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

// Update these imports
import ReactMarkdown from 'react-markdown';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';

// Register the TypeScript language
SyntaxHighlighter.registerLanguage('typescript', typescript);

// Add this function to replace formatText
const sanitizeHtml = (html: string) => {
  return html.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
import { CapabilityCard } from '../components/CapabilityCard';

import React from 'react';

export function ConsolePage() {
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const openAgentModal = () => {
    setIsAgentModalOpen(true);
  };
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

  // Add these state variables inside the ConsolePage component
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalChartUrl, setModalChartUrl] = useState('');

  // Add this function inside the ConsolePage component
  const openModal = (chartUrl: string) => {
    setModalChartUrl(chartUrl);
    setIsModalOpen(true);
  };

  // Function to generate a new session ID
  const generateSessionId = () => {
    return uuidv4();
  };

  // Add these new state variables
  const [sheetType, setSheetType] = useState<'google' | 'excel' | 'docs'>('excel');
  const [excelSheetUrl] = useState('https://harolikar-my.sharepoint.com/personal/amar_harolikar_com/_layouts/15/Doc.aspx?sourcedoc={371a2aba-3da4-4966-8d5a-e02eb2038845}&action=embedview&wdAllowInteractivity=False&wdHideGridlines=True&wdHideHeaders=True&wdDownloadButton=True&wdInConfigurator=True&wdInConfigurator=True');

  // Add this new constant for the Google Docs URL
  const googleDocsUrl = "https://docs.google.com/document/d/e/2PACX-1vQ2z_n6-egJOrvFLMXsIBWvhxoPg01fS2XMchIJ-993uqD9YbaNbw9H1ZTD09CzeZ-VetsRNML2p3qF/pub?embedded=true";

  // Add this new constant for the Google Docs editable URL
  const googleDocsEditableUrl = "https://docs.google.com/document/d/1v8BQURR8F6yoVlxGMmjPE9hEJAsLyx7cjtjiNLiXkhk/edit?usp=sharing";

  // Update the handleRefresh function
  const handleRefresh = useCallback(() => {
    setIsSheetLoading(true);
    const timestamp = new Date().getTime();
    const newUrl = sheetType === 'google'
      ? `https://docs.google.com/spreadsheets/d/e/2PACX-1vT-ASVIfFJ4HdqIjq-2fSar4taGxlUutrZCeH1dFgfT6o-baBFQHLtJcGwgretrT2NmqtbQe7FbmxiS/pubhtml?widget=true&headers=false&rand=${timestamp}`
      : sheetType === 'excel'
        ? `${excelSheetUrl}&rand=${timestamp}`
        : `${googleDocsUrl}&rand=${timestamp}`;

    console.log('Refreshing sheet with new URL:', newUrl);

    if (iframeRef.current) {
      iframeRef.current.src = newUrl;
    }

    setSheetUrl(newUrl);
    setIframeKey(prevKey => prevKey + 1);

    setTimeout(() => {
      setIsSheetLoading(false);
    }, 2000);
  }, [sheetType, excelSheetUrl, googleDocsUrl]);

  // Update the handleSheetTypeChange function
  const handleSheetTypeChange = (type: 'google' | 'excel' | 'docs') => {
    setSheetType(type);
    setSheetUrl(type === 'google'
      ? `https://docs.google.com/spreadsheets/d/e/2PACX-1vT-ASVIfFJ4HdqIjq-2fSar4taGxlUutrZCeH1dFgfT6o-baBFQHLtJcGwgretrT2NmqtbQe7FbmxiS/pubhtml?widget=true&headers=false`
      : type === 'excel'
        ? excelSheetUrl
        : googleDocsUrl
    );
    setIframeKey(prevKey => prevKey + 1);
  };

  // Add this state variable at the top of your component
  const [sheetUrl, setSheetUrl] = useState(excelSheetUrl);

  const [isSheetLoading, setIsSheetLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeContainerRef = useRef<HTMLDivElement>(null);

  const handleIframeLoad = useCallback(() => {
    console.log('Iframe loaded via onLoad event');
    setIsSheetLoading(false);
  }, []);

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
    // client.addTool(
    //   {
    //     name: 'set_memory',
    //     description: 'Add quick notes requested by the user',
    //     parameters: {
    //       type: 'object',
    //       properties: {
    //         key: {
    //           type: 'string',
    //           description:
    //             'A short heading for the notes value. Always use uppercase  underscores, no other characters.',
    //         },
    //         value: {
    //           type: 'string',
    //           description: 'This is the note description that has been requested by the user to be saved. Maximum 30 words. Summarize as required. If no description is provided, then keep this empty',
    //         },
    //       },
    //       required: ['key', 'value'],
    //     },
    //   },
    //   async ({ key, value }: { [key: string]: any }) => {
    //     setMemoryKv((memoryKv) => {
    //       const newKv = { ...memoryKv };
    //       newKv[key] = value;
    //       return newKv;
    //     });
    //     return { ok: true };
    //   }
    // );
    // client.addTool(
    //   {
    //     name: 'get_weather',
    //     description:
    //       'Retrieves the weather for a given lat, lng coordinate pair. Specify a label for the location.',
    //     parameters: {
    //       type: 'object',
    //       properties: {
    //         lat: {
    //           type: 'number',
    //           description: 'Latitude',
    //         },
    //         lng: {
    //           type: 'number',
    //           description: 'Longitude',
    //         },
    //         location: {
    //           type: 'string',
    //           description: 'Name of the location',
    //         },
    //       },
    //       required: ['lat', 'lng', 'location'],
    //     },
    //   },
    //   async ({ lat, lng, location }: { [key: string]: any }) => {
    //     setMarker({ lat, lng, location });
    //     setCoords({ lat, lng, location });
    //     const result = await fetch(
    //       `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m`
    //     );
    //     const json = await result.json();
    //     const temperature = {
    //       value: json.current.temperature_2m as number,
    //       units: json.current_units.temperature_2m as string,
    //     };
    //     const wind_speed = {
    //       value: json.current.wind_speed_10m as number,
    //       units: json.current_units.wind_speed_10m as string,
    //     };
    //     setMarker({ lat, lng, location, temperature, wind_speed });
    //     return json;
    //   }
    // );


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
          'This tool sends the user input to an API endpoint that performs multiple tasks: updating a tracker, generating and email report and deck formats. Based on user request this tool can also connect to AWS and Azure data warehouses to run queries and transform data So if user refers to database or AWS then use that. This tool can also generate a chart or do  statistical analysis. This tool can also pull financial data from Yahoo Finance including stock prices, market capitalization, profit and loss, income statement, balance sheet, cash flows and quarterly statement. Further more, use this if user asks for any data or information to be updated into doc, document for file in which case send the info to be added to the docs. This tool can also do web scraping, so if user shares a URL and asks for it to be scraped then use this tool. The tool API can return a .txt file, a normal response, or a chart (GIF/PNG).',
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
        const url = "https://flowise.tigzig.com/api/v1/prediction/36ed6454-2b9d-4ed1-91aa-72d15caa8ee5";

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
                if (typeof imageArtifact.data === 'string' && imageArtifact.data.startsWith('https://flowise.tigzig.com/api/v1/get-upload-file')) {
                  imageUrl = imageArtifact.data;
                } else if (imageArtifact.data.startsWith('FILE-STORAGE::')) {
                  const fileName = imageArtifact.data.replace('FILE-STORAGE::', '');
                  imageUrl = `https://flowise.tigzig.com/api/v1/get-upload-file?chatflowId=36ed6454-2b9d-4ed1-91aa-72d15caa8ee5&chatId=${jsonResponse.chatId}&fileName=${fileName}`;
                } else {
                  imageUrl = `data:image/${imageArtifact.type};base64,${imageArtifact.data}`;
                }
                console.log('Setting image URL:', imageUrl);
                const newChart = { url: imageUrl, timestamp: Date.now() };
                addChart(newChart);
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
            const newChart = { url: imageUrl, timestamp: Date.now() };
            addChart(newChart);
            return "Image received. It will be displayed in the chart area.";
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
  // State variable for current chart index
  const [currentChartIndex, setCurrentChartIndex] = useState(0);

  const showPreviousChart = () => {
    setCurrentChartIndex(prevIndex => {
      const newIndex = Math.max(0, prevIndex - 1);
      console.log('Previous chart:', newIndex);
      return newIndex;
    });
  };

  const showNextChart = () => {
    setCurrentChartIndex(prevIndex => {
      const newIndex = Math.min(charts.length - 1, prevIndex + 1);
      console.log('Next chart:', newIndex);
      return newIndex;
    });
  };

  // Update the setCharts function to append new charts instead of replacing
  const addChart = (newChart: { url: string; timestamp: number }) => {
    setCharts(prevCharts => {
      const newCharts = [...prevCharts, newChart];
      setCurrentChartIndex(newCharts.length - 1);
      return newCharts;
    });
  };

  // Add these state variables inside the ConsolePage component
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);

  // Add this function inside the ConsolePage component
  const openSheetModal = () => {
    setIsSheetModalOpen(true);
  };

  const [isConversationModalOpen, setIsConversationModalOpen] = useState(false);

  const openConversationModal = () => {
    setIsConversationModalOpen(true);
  };

  const capabilities = [
    { title: "Text-to-SQL" },
    { title: "AWS MySQL" },
    { title: "Python" },
    { title: "Statistics" },
    { title: "Analytics" },
    { title: "Charts" },
    { title: "Automation" },
    { title: "Web Scraping" }
    // { title: "Yahoo Fin." }
  ];

  // Update the Google Sheets section
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(true);

  // Add this function to toggle sheet collapse
  const toggleSheetCollapse = () => {
    setIsSheetCollapsed(!isSheetCollapsed);
    const chartDisplay = document.querySelector('.chart-display');
    if (chartDisplay) {
      chartDisplay.classList.toggle('sheets-expanded', !isSheetCollapsed);
    }
  };

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      <div className="header-section">
        <div className="capabilities-section">
          {capabilities.map((capability, index) => (
            <CapabilityCard key={index} title={capability.title} />
          ))}
        </div>
        <div className="main-header">
          <div className="content-title">
            <img src={`${process.env.PUBLIC_URL}/FXISLOGO.png`} alt="FXIS Logo" className="fxis-logo" />
            <span>REX: Realtime Analytics Agent System</span>
          </div>
          <div className="header-controls">
            <button
              style={{
                padding: '6px 12px',
                backgroundColor: '#1e40af',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '18px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              }}
              onClick={openAgentModal}
            >
              <Zap size={14} /> AGENT
            </button>
          </div>
          <div className="content-controls">
            {isConnected && canPushToTalk && (
              <Button
                label="Talk"
                buttonStyle={isRecording ? 'alert' : 'regular'}
                disabled={!isConnected || !canPushToTalk}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
              />
            )}
            <div className="spinner-container">
              {isConnected && (
                <div className="spinner">
                  <RingLoader color="#ffffff" size={25} />
                </div>
              )}
            </div>
            <Toggle
              defaultValue={true}
              labels={['MANUAL', 'RT']}
              values={['none', 'server_vad']}
              onChange={(_, value) => changeTurnEndType(value)}
            />
            <Button
              label={isConnected ? 'DISCONNECT' : 'CONNECT'}
              iconPosition={isConnected ? 'end' : 'start'}
              // icon={isConnected ? X : Zap}
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
                label={`API KEY: ${apiKey.slice(0, 3)}...`}
              />
            )}
            <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>
      </div>
      <div className="content-main">
        <div className="content-logs">
          <div className="content-block conversation">
            <div className="content-block-title">
              CONVERSATION
              <button className="expand-conversation" onClick={openConversationModal}>
                <Maximize2 size={16} />
              </button>
            </div>
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
                        __html: sanitizeHtml(conversationItem.formatted.output || '')
                      }} />
                    )}
                    {conversationItem.formatted.tool && (
                      <span>
                        {conversationItem.formatted.tool.name}(
                        {JSON.stringify(conversationItem.formatted.tool.arguments)})
                      </span>
                    )}
                    {conversationItem.role === 'user' && (
                      <span>
                        {conversationItem.formatted.transcript ||
                          (conversationItem.formatted.audio?.length
                            ? '(awaiting transcript)'
                            : conversationItem.formatted.text ||
                            '(item sent)')}
                      </span>
                    )}
                    {conversationItem.role === 'assistant' && (
                      <ReactMarkdown
                        components={{
                          code: ({ node, inline, className, children, ...props }: any) => {
                            const match = /language-(\w+)/.exec(className || '')
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={oneDark as any}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            )
                          }
                        }}
                      >
                        {conversationItem.formatted.transcript ||
                          conversationItem.formatted.text ||
                          '(truncated)'}
                      </ReactMarkdown>
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
            <div className="content-block agent">
              <div className="content-block-title">AGENT</div>
              <div className="agent-content">
                <button className="agent-button" onClick={openAgentModal}>
                  <Zap size={24} />
                </button>
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
                <div className="chart-scroll-container">
                  {charts.length > 0 ? (
                    charts.map((chart, index) => (
                      <div key={chart.timestamp} className={`chart-item ${index === currentChartIndex ? 'active' : ''}`} style={{ display: index === currentChartIndex ? 'flex' : 'none' }}>
                        <img src={chart.url} alt={`Generated Chart ${index + 1}`} />
                        <div className="chart-timestamp">{new Date(chart.timestamp).toLocaleTimeString()}</div>
                        <button className="expand-chart" onClick={() => openModal(chart.url)}>
                          <Maximize2 size={16} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="chart-item active">
                      <img src={`${process.env.PUBLIC_URL}/chart_line_dummy.png`} alt="Placeholder Chart" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className={`content-block google-sheets ${isSheetCollapsed ? 'collapsed' : ''}`}>
            <div className="content-block-title" onClick={toggleSheetCollapse}>
              SHEETS & DOCS
              <div className="sheet-controls">
                <div className="sheet-type-toggle">
                  <button
                    className={sheetType === 'google' ? 'active' : ''}
                    onClick={(e) => { e.stopPropagation(); handleSheetTypeChange('google'); }}
                  >
                    Google
                  </button>
                  <button
                    className={sheetType === 'excel' ? 'active' : ''}
                    onClick={(e) => { e.stopPropagation(); handleSheetTypeChange('excel'); }}
                  >
                    Excel
                  </button>
                  <button
                    className={sheetType === 'docs' ? 'active' : ''}
                    onClick={(e) => { e.stopPropagation(); handleSheetTypeChange('docs'); }}
                  >
                    Docs
                  </button>
                </div>
                <button className="refresh-button" onClick={(e) => { e.stopPropagation(); handleRefresh(); }} disabled={isSheetLoading}>
                  {isSheetLoading ? <Loader size={16} /> : <RefreshCw size={16} />}
                </button>
                <button className="expand-sheet" onClick={(e) => { e.stopPropagation(); openSheetModal(); }}>
                  <Maximize2 size={16} />
                </button>
                <button className="toggle-collapse" onClick={(e) => { e.stopPropagation(); toggleSheetCollapse(); }}>
                  {isSheetCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>
            <div className="content-block-body">
              <div className="iframe-container" ref={iframeContainerRef}>
                {isSheetLoading && <div className="loading-overlay">Refreshing...</div>}
                <iframe
                  ref={iframeRef}
                  key={iframeKey}
                  src={sheetUrl}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  onLoad={handleIframeLoad}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <footer className="content-footer">
        <span>Amar Harolikar | Applied Gen AI for Data Science, Analytics and Business</span>
      </footer>
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={modalChartUrl} alt="Expanded Chart" />
            <button className="close-modal" onClick={() => setIsModalOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {isSheetModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSheetModalOpen(false)}>
          <div className="modal-content sheet-modal" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={sheetType === 'google'
                ? "https://docs.google.com/spreadsheets/d/1LPV1pZb4Bc3TMVAYqqH8MCNU55Ew8oB1K8MZMu2cfp0/edit?usp=sharing"
                : sheetType === 'excel'
                  ? excelSheetUrl
                  : googleDocsEditableUrl}
              width="100%"
              height="100%"
              frameBorder="0"
              allowFullScreen={true}
            ></iframe>
            <button className="close-modal" onClick={() => setIsSheetModalOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {isConversationModalOpen && (
        <div className="modal-overlay" onClick={() => setIsConversationModalOpen(false)}>
          <div className="modal-content conversation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="conversation-content">
              {items.map((conversationItem, i) => (
                <div className="conversation-item" key={conversationItem.id}>
                  <span className={`speaker ${conversationItem.role || ''}`}>
                    {(conversationItem.role || conversationItem.type).replaceAll('_', ' ')}:
                  </span>
                  <span className="speaker-content">
                    {conversationItem.type === 'function_call_output' && (
                      <span dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(conversationItem.formatted.output || '')
                      }} />
                    )}
                    {conversationItem.formatted.tool && (
                      <span>
                        {conversationItem.formatted.tool.name}(
                        {JSON.stringify(conversationItem.formatted.tool.arguments)})
                      </span>
                    )}
                    {conversationItem.role === 'user' && (
                      <span>
                        {conversationItem.formatted.transcript ||
                          (conversationItem.formatted.audio?.length
                            ? '(awaiting transcript)'
                            : conversationItem.formatted.text ||
                            '(item sent)')}
                      </span>
                    )}
                    {conversationItem.role === 'assistant' && (
                      <ReactMarkdown
                        components={{
                          code: ({ node, inline, className, children, ...props }: any) => {
                            const match = /language-(\w+)/.exec(className || '')
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={oneDark as any}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            )
                          }
                        }}
                      >
                        {conversationItem.formatted.transcript ||
                          conversationItem.formatted.text ||
                          '(truncated)'}
                      </ReactMarkdown>
                    )}
                  </span>
                </div>
              ))}
              {isWaitingForResponse && (
                <div className="waiting-for-response">Waiting for assistant response...</div>
              )}
            </div>
            <button className="close-modal" onClick={() => setIsConversationModalOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {isAgentModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAgentModalOpen(false)}>
          <div className="modal-content agent-modal" onClick={(e) => e.stopPropagation()}>
            <iframe
              src="https://flowise.tigzig.com/chatbot/a5cde057-9994-4383-8c3b-32ac46d9bacf"
              width="100%"
              height="100%"
              frameBorder="0"
              allowFullScreen={true}
            ></iframe>
            <div className="agent-modal-actions">
              <button className="close-modal" onClick={() => setIsAgentModalOpen(false)}>Close</button>
              <a
                href="https://flowise.tigzig.com/chatbot/a5cde057-9994-4383-8c3b-32ac46d9bacf"
                target="_blank"
                rel="noopener noreferrer"
                className="full-page-link"
              >
                Full Page
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function setIsActive(arg0: (prevIsActive: any) => boolean) {
  throw new Error('Function not implemented.');
}