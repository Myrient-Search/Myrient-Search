import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface EmulatorsProps {
  appName: string;
}

interface Emulator {
  logo: string;
  url: string;
  description: string;
  platforms: string[];
}

interface ConsoleData {
  icon: string;
  emulators: Record<string, Emulator>;
}

type EmulatorsData = Record<string, ConsoleData>;

export default function Emulators({ appName }: EmulatorsProps) {
  const [data, setData] = useState<EmulatorsData | null>(null);
  const [selectedConsole, setSelectedConsole] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/emulators")
      .then((res) => res.json())
      .then((data) => setData(data))
      .catch((err) => console.error(err));
  }, []);

  const handleConsoleClick = (consoleName: string) => {
    setSelectedConsole(consoleName);
  };

  const closeModal = () => {
    setSelectedConsole(null);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground selection:bg-main selection:text-main-foreground">
      <Header appName={appName} />

      <main className="flex flex-1 flex-col items-center p-4 pt-24 pb-20">
        <h1 className="mb-12 text-2xl font-bold text-white uppercase text-center md:text-4xl shadow-retro">
          Console Library
        </h1>

        {/* Console Grid */}
        <div className="grid w-full max-w-6xl grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {data &&
            Object.entries(data).map(([consoleName, consoleData]) => (
              <motion.div
                key={consoleName}
                onClick={() => handleConsoleClick(consoleName)}
                className="group cursor-pointer flex flex-col items-center gap-4 rounded-md border-4 border-black bg-zinc-800 p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none hover:bg-zinc-700"
              >
                <div className="flex h-20 w-20 items-center justify-center p-2">
                  <img
                    src={`/api/proxy-assets?url=${encodeURIComponent(consoleData.icon)}`}
                    alt={consoleName}
                    className="max-h-full max-w-full object-contain transition-transform group-hover:scale-110"
                  />
                </div>
                <h2 className="text-center text-xs font-bold text-white uppercase md:text-sm">
                  {consoleName}
                </h2>
              </motion.div>
            ))}
        </div>
      </main>

      {/* Modal Overlay */}
      <AnimatePresence>
        {selectedConsole && data && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-black/50"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="relative z-10 flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border-4 border-black bg-zinc-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b-4 border-zinc-700 bg-zinc-800 p-6">
                <div className="flex items-center gap-4">
                  <img
                    src={`/api/proxy-assets?url=${encodeURIComponent(data[selectedConsole].icon)}`}
                    alt={selectedConsole}
                    className="h-12 w-12 object-contain"
                  />
                  <h2 className="text-xl font-bold text-[#FFD700] uppercase md:text-3xl">
                    {selectedConsole}
                  </h2>
                </div>
                <Button
                  onClick={closeModal}
                  size="icon"
                  className="h-10 w-10 bg-red-500 text-white border-2 border-black hover:bg-red-600"
                >
                  <X className="size-6" />
                </Button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 bg-zinc-900">
                <div className="grid gap-6 md:grid-cols-2">
                  {Object.entries(data[selectedConsole].emulators).map(
                    ([emuName, emu]) => (
                      <div
                        key={emuName}
                        className="flex flex-col justify-between rounded-md border-2 border-zinc-700 bg-zinc-800 p-4 transition-colors hover:border-[#FFD700]"
                      >
                        <div className="mb-4 flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-white mb-2">
                              {emuName}
                            </h3>
                            <div className="flex flex-wrap gap-1">
                              {emu.platforms.map((p) => (
                                <span
                                  key={p}
                                  className="rounded bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400 border border-zinc-700"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="h-28 w-28 rounded bg-zinc-900 border border-zinc-700 p-2 shrink-0 flex items-center justify-center">
                            <img
                              src={`/api/proxy-assets?url=${encodeURIComponent(emu.logo)}`}
                              alt={emuName}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        </div>

                        <p className="mb-4 text-xs text-zinc-300 leading-relaxed">
                          {emu.description}
                        </p>

                        <div className="mt-auto flex justify-end">
                          <a
                            href={emu.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full"
                          >
                            <Button className="w-full bg-[#FFD700] text-black border-2 border-black hover:bg-[#FFD700] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                              Download <ExternalLink className="ml-2 size-4" />
                            </Button>
                          </a>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
