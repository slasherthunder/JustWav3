type TTSProvider = 'browser' | 'elevenlabs';

interface TTSOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
}

let currentProvider: TTSProvider = (localStorage.getItem('tts-provider') as TTSProvider) || 'browser';
let elevenLabsApiKey: string | null = localStorage.getItem('elevenlabs-api-key');

export const setTTSProvider = (provider: TTSProvider) => {
  currentProvider = provider;
  localStorage.setItem('tts-provider', provider);
};

export const getTTSProvider = (): TTSProvider => {
  return currentProvider;
};

export const setElevenLabsApiKey = (apiKey: string | null) => {
  elevenLabsApiKey = apiKey;
  if (apiKey) {
    localStorage.setItem('elevenlabs-api-key', apiKey);
  } else {
    localStorage.removeItem('elevenlabs-api-key');
  }
};

export const getElevenLabsApiKey = (): string | null => {
  return elevenLabsApiKey;
};

export const speakWithBrowser = (text: string, options: TTSOptions = {}): SpeechSynthesisUtterance | null => {
  if (!window.speechSynthesis) {
    console.error('Browser speech synthesis not supported');
    return null;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? 1.0;
  utterance.pitch = options.pitch ?? 1.0;
  utterance.volume = options.volume ?? 1.0;
  utterance.lang = options.lang ?? 'en-US';

  window.speechSynthesis.speak(utterance);
  return utterance;
};

export const speakWithElevenLabs = async (text: string, options: TTSOptions = {}): Promise<HTMLAudioElement | null> => {
  if (!elevenLabsApiKey) {
    console.error('ElevenLabs API key not set');
    return null;
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsApiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    audio.volume = options.volume ?? 1.0;
    audio.play();

    return audio;
  } catch (error) {
    console.error('ElevenLabs TTS error:', error);
    return null;
  }
};

export const speakText = async (text: string, options: TTSOptions = {}): Promise<SpeechSynthesisUtterance | HTMLAudioElement | null> => {
  if (currentProvider === 'elevenlabs' && elevenLabsApiKey) {
    const result = await speakWithElevenLabs(text, options);
    if (result) {
      return result;
    }
    console.warn('ElevenLabs failed, falling back to browser TTS');
  }

  return speakWithBrowser(text, options);
};

export const stopSpeaking = () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  const audioElements = document.querySelectorAll('audio');
  audioElements.forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
};


