import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { AlertTriangle, Loader2, Play, RefreshCw, Users } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  formatBytes,
  formatDuration,
  useGameDownload,
} from "@/hooks/useGameDownload";

export default function Emulator({ appName }: { appName: string }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<
    "idle" | "config" | "downloading" | "extracting" | "booting"
  >("idle");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const emulatorContainerRef = useRef<HTMLDivElement>(null);

  const downloadCtl = useGameDownload({
    gameId: game?.id,
    filename: game?.filename,
    magnet: game?.magnet,
    soId: game?.so_id,
  });

  useEffect(() => {
    document.title = game ? `${game.game_name} - ${appName}` : appName;
  }, [game, appName]);

  useEffect(() => {
    fetch(`/api/games/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch game details");
        return res.json();
      })
      .then((data) => {
        setGame(data);
        if (data?.id && data?.magnet) {
          fetch(`/api/games/${data.id}/warm`, { method: "POST" }).catch(() => {});
        }
      })
      .catch((err) => setError(err.message));
  }, [id]);

  // EmulatorJS attaches WASM + AudioContexts to window globals, so a clean
  // SPA teardown isn't possible — force a reload on unmount.
  useEffect(() => {
    return () => {
      try {
        if (typeof window !== "undefined" && window.EJS_core) {
          window.location.reload();
        }
      } catch (err) {
        console.error("Error tearing down emulator:", err);
      }
    };
  }, []);

  useEffect(() => {
    if (downloadCtl.state.status !== "done" || !downloadCtl.state.blob) return;
    if (stage !== "downloading") return;

    (async () => {
      try {
        const configRes = await fetch(
          `/api/emulator/config?category=${encodeURIComponent(game.platform)}`,
        );
        if (!configRes.ok) {
          throw new Error("Emulator not supported for this platform.");
        }
        const { config } = await configRes.json();

        setStage("extracting");
        let romUrl = "";
        const blob = downloadCtl.state.blob!;
        const isCompressed = /\.(zip|7z)$/i.test(game.filename || "");
        if (isCompressed && config.unpackRoms) {
          const zip = await JSZip.loadAsync(blob);
          const files = Object.keys(zip.files);
          const romFilename = files.find((f) => !zip.files[f].dir);
          if (!romFilename) throw new Error("No ROM file found in archive.");
          const romData = await zip.files[romFilename].async("blob");
          romUrl = URL.createObjectURL(romData);
        } else {
          romUrl = URL.createObjectURL(blob);
        }

        setStage("booting");

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

        const script = document.createElement("script");
        script.src = "/api/emulator/emulatorjs/loader.js";
        script.async = true;
        script.onerror = () => setError("Failed to load EmulatorJS script.");
        document.body.appendChild(script);
      } catch (err: any) {
        console.error(err);
        setError(err.message);
      }
    })();
  }, [downloadCtl.state.status, downloadCtl.state.blob, game, stage]);

  useEffect(() => {
    if (downloadCtl.state.status === "error") {
      setError(downloadCtl.state.error || "Download failed");
    }
  }, [downloadCtl.state.status, downloadCtl.state.error]);

  const startGame = async () => {
    if (!game) return;
    setIsPlaying(true);
    setStage("config");
    setStage("downloading");
    downloadCtl.start();
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

  const dl = downloadCtl.state;
  const headline =
    stage === "extracting"
      ? "Extracting ROM…"
      : stage === "booting"
        ? "Initializing emulator…"
        : stage === "downloading"
          ? dl.status === "connecting"
            ? "Connecting to swarm…"
            : dl.status === "metadata"
              ? "Got metadata, preparing…"
              : dl.status === "stuck"
                ? "Slow / stuck — see status below"
                : dl.status === "downloading"
                  ? "Downloading ROM…"
                  : "Working…"
          : "Initializing…";

  const pct = Math.round(dl.progress * 100);

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
                  <div
                    className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center pointer-events-none p-4"
                    style={{ zIndex: 1 }}
                  >
                    <div className="font-black text-xl md:text-2xl uppercase text-[#FFD700] mb-3 flex items-center gap-2">
                      {dl.status === "stuck" ? (
                        <AlertTriangle className="size-5 md:size-6 animate-pulse text-orange-400" />
                      ) : (
                        <Loader2 className="size-5 md:size-6 animate-spin" />
                      )}
                      {headline}
                    </div>

                    <div className="w-72 max-w-full">
                      <div className="flex justify-between text-[10px] font-bold uppercase text-zinc-400 mb-1.5">
                        <span>{pct}%</span>
                        <span>
                          {formatBytes(dl.downloaded)} /{" "}
                          {dl.totalSize ? formatBytes(dl.totalSize) : "?"}
                        </span>
                      </div>
                      <div className="h-4 w-full bg-white border-2 border-black p-0.5">
                        <div
                          className={`h-full transition-all duration-300 ${
                            dl.status === "stuck"
                              ? "bg-orange-400"
                              : "bg-[#a855f7]"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] uppercase font-bold">
                        <div className="border-2 border-black bg-zinc-800 px-1 py-1">
                          <div className="text-zinc-500">Speed</div>
                          <div className="text-white font-mono">
                            {dl.downloadSpeed > 0
                              ? `${formatBytes(dl.downloadSpeed)}/s`
                              : "—"}
                          </div>
                        </div>
                        <div className="border-2 border-black bg-zinc-800 px-1 py-1 flex flex-col items-center">
                          <div className="text-zinc-500 flex items-center gap-1">
                            <Users className="size-3" /> Peers
                          </div>
                          <div className="text-white font-mono">
                            {dl.numPeers ||
                              (dl.transport === "backend" ? "?" : 0)}
                          </div>
                        </div>
                        <div className="border-2 border-black bg-zinc-800 px-1 py-1">
                          <div className="text-zinc-500">ETA</div>
                          <div className="text-white font-mono">
                            {formatDuration(dl.eta)}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`mt-2 border-2 border-black p-2 text-[11px] text-center ${
                          dl.status === "stuck"
                            ? "bg-orange-500/20 text-orange-200"
                            : "bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {dl.message || "Working…"}
                      </div>
                      {dl.transport === "p2p" && dl.suggestFallback && (
                        <div className="mt-2 border-2 border-orange-500 bg-orange-500/10 p-2 text-[11px] text-orange-100 text-center space-y-2 pointer-events-auto">
                          <p className="font-bold flex items-center justify-center gap-1.5">
                            <AlertTriangle className="size-3.5" /> Browser Mode
                            is struggling
                          </p>
                          <p>
                            No real progress in 30s. Most ROM swarms have very
                            few WebRTC peers — Normal Mode usually fixes it.
                          </p>
                          <button
                            onClick={() => downloadCtl.switchToNormal()}
                            className="inline-flex items-center gap-1.5 border-2 border-black bg-orange-400 hover:bg-orange-500 text-black px-2 py-1 text-[10px] font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
                          >
                            <RefreshCw className="size-3" /> Switch to Normal Mode
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-full max-w-4xl mt-2 text-center shrink-0 opacity-50">
            <p className="text-[10px] md:text-xs text-zinc-500 font-medium">
              This emulator streams games out of Minerva's BitTorrent swarms.
              Learn more on the About page.
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
