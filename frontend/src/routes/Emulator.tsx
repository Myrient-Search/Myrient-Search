import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { Play } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

export default function Emulator({ appName }: { appName: string }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>("Initializing...");
  const [progress, setProgress] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const emulatorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = game ? `${game.game_name} - ${appName}` : appName;
  }, [game, appName]);

  useEffect(() => {
    // 1. Fetch game details
    fetch(`/api/games/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch game details");
        return res.json();
      })
      .then((data) => {
        setGame(data);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  // Teardown emulator on unmount
  useEffect(() => {
    return () => {
      try {
        if (typeof window !== "undefined" && window.EJS_core) {
          // Because EmulatorJS attaches WebAssembly and AudioContexts directly to the global window object,
          // it cannot be cleanly destroyed within a React SPA without leaking memory or audio.
          // Forcing a reload obliterates the WASM layer when navigating away.
          window.location.reload();
        }
      } catch (err) {
        console.error("Error tearing down emulator:", err);
      }
    };
  }, []);

  const startGame = async () => {
    if (!game) return;
    setIsPlaying(true);
    setLoadingStep("Fetching emulator config...");

    try {
      // 2. Fetch emulator config
      const configRes = await fetch(
        `/api/emulator/config?category=${encodeURIComponent(game.platform)}`,
      );
      if (!configRes.ok) {
        throw new Error("Emulator not supported for this platform.");
      }
      const { config } = await configRes.json();

      setLoadingStep("Downloading ROM...");

      // 3. Download ROM
      const response = await fetch(
        `/api/proxy-download?url=${encodeURIComponent(game.download_url)}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to read response stream.");

      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        if (total > 0) {
          const percent = Math.round((loaded / total) * 100);
          setProgress(percent);
          setLoadingStep(`Downloading... ${percent}%`);
        } else {
          setLoadingStep(
            `Downloading... ${Math.round(loaded / 1024 / 1024)}MB`,
          );
        }
      }

      const blob = new Blob(chunks);
      let romUrl = "";

      const isCompressed = /\.(zip|7z)$/i.test(game.filename || "");
      if (isCompressed && config.unpackRoms) {
        setLoadingStep("Extracting ROM...");
        const zip = await JSZip.loadAsync(blob);
        const files = Object.keys(zip.files);
        const romFilename = files.find((f) => !zip.files[f].dir);

        if (!romFilename) {
          throw new Error("No ROM file found in archive.");
        }

        const romData = await zip.files[romFilename].async("blob");
        romUrl = URL.createObjectURL(romData);
      } else {
        romUrl = URL.createObjectURL(blob);
      }

      setLoadingStep("Initializing Emulator...");

      // 4. Set up EmulatorJS
      window.EJS_player = "#game-container";
      window.EJS_core = config.core;
      window.EJS_gameUrl = romUrl;
      window.EJS_pathtodata = "/api/emulator/emulatorjs/";
      window.EJS_startOnLoaded = true;
      window.EJS_gameID = 1;
      window.EJS_gameName = game.game_name;
      window.EJS_backgroundBlur = true;
      window.EJS_defaultOptions = {
        "save-state-slot": 1,
        "save-state-location": "local",
      };

      if (config.bios && config.bios.files) {
        const files: any = Object.values(config.bios.files);
        if (files.length > 0) {
          window.EJS_biosUrl =
            "/api/emulator/proxy-bios?url=" +
            encodeURIComponent(files[0].url as string);
        }
      }

      window.EJS_onLoadError = (err) => {
        console.error("Emulator Load Error:", err);
        setError("Emulator failed to load: " + err);
      };

      // 5. Inject EmulatorJS Load Script
      const script = document.createElement("script");
      script.src = "/api/emulator/emulatorjs/loader.js";
      script.async = true;
      script.onerror = () => setError("Failed to load EmulatorJS script.");
      document.body.appendChild(script);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground">
        <Header appName={appName} />
        <main className="flex flex-1 flex-col items-center justify-center p-4 gap-6">
          <div className="border-4 border-black bg-[#ff5e5e] p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center">
            <h1 className="text-4xl font-bold uppercase text-black mb-4">
              Error Playing Game
            </h1>
            <p className="text-xl text-black font-semibold mb-6">{error}</p>
            <Button
              onClick={() => navigate("/")}
              className="px-6 py-6 border-4 border-black bg-zinc-800 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:translate-x-1 hover:shadow-none transition-all uppercase font-bold flex items-center justify-center gap-2 mx-auto"
            >
              Go to Home
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground">
        <Header appName={appName} />
        <main className="flex flex-1 items-center justify-center p-4">
          <p className="text-white text-xl animate-pulse font-bold uppercase">
            Loading Game Data...
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground selection:bg-main selection:text-main-foreground">
      <Header appName={appName} />

      <main className="flex flex-1 flex-col items-center p-2 pt-16 md:p-4 md:pt-20 max-w-7xl mx-auto w-full min-h-0">
        <div className="flex-grow flex flex-col items-center w-full min-h-0">
          <div className="w-full max-w-4xl mb-3 text-center shrink-0">
            <h1 className="text-3xl md:text-4xl font-black uppercase text-white mb-2 drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]">
              {game.game_name}
            </h1>
            <h2 className="text-sm md:text-base font-bold uppercase text-[#FFD700] inline-block bg-black px-3 py-0.5 border-2 border-[#FFD700] shadow-[3px_3px_0px_0px_rgba(255,215,0,0.5)]">
              {game.platform}
            </h2>
          </div>

          <div className="w-full max-w-4xl border-4 border-black bg-black overflow-hidden relative z-0 mb-4">
            <div className="relative w-full aspect-[4/3] max-h-[60vh] mx-auto bg-black flex items-center justify-center">
              {!isPlaying && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black p-4">
                  <Button
                    onClick={startGame}
                    className="flex items-center gap-3 bg-[#4ade80] text-black font-black text-2xl md:text-3xl uppercase px-8 md:px-12 py-8 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:bg-[#22c55e] hover:translate-y-1 hover:translate-x-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-2 active:translate-x-2 active:shadow-none transition-all"
                  >
                    <Play className="h-8 w-8 md:h-10 md:w-10 fill-black" />
                    Play Now
                  </Button>
                </div>
              )}

              {isPlaying && (
                <div
                  id="game-container"
                  ref={emulatorContainerRef}
                  className="w-full h-full text-white relative"
                >
                  {/* Fallback loading overlay while JS initializes */}
                  <div
                    className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center pointer-events-none"
                    style={{ zIndex: 1 }}
                  >
                    <div className="font-black text-2xl uppercase text-[#FFD700] mb-4 animate-pulse">
                      {loadingStep}
                    </div>
                    {progress > 0 && (
                      <div className="w-64 h-6 bg-white border-2 border-black p-0.5">
                        <div
                          className="h-full bg-[#a855f7] border-r-2 border-black transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-full max-w-4xl mt-2 text-center shrink-0 opacity-50">
            <p className="text-[10px] md:text-xs text-zinc-500 font-medium">
              This emulator loads games directly from Myrient. Learn more on the
              About page.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// Window type definitions for EmulatorJS
declare global {
  interface Window {
    EJS_player: string;
    EJS_core: string;
    EJS_gameUrl: string;
    EJS_pathtodata: string;
    EJS_startOnLoaded: boolean;
    EJS_gameID: number;
    EJS_gameName: string;
    EJS_backgroundBlur: boolean;
    EJS_defaultOptions: any;
    EJS_biosUrl?: string;
    EJS_onLoadError?: (error: any) => void;
    EJS_emulator?: any;
    EJS_terminate?: () => void;
  }
}
