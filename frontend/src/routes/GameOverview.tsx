import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Bot, Calendar, HardDrive, Star, Users, X, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export interface Game {
    id: string;
    game_name: string;
    videogame: string;
    rating: number;
    developer: string;
    publisher: string;
    release_date: string;
    region: string;
    genre: string;
    gameplay_modes: string;
    filename: string;
    size: string;
    upload_date: string;
    description: string;
    images: string[] | null;
    videos: string[] | null;
}

export default function GameOverview({ appName }: { appName: string }) {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [game, setGame] = useState<Game | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [lightboxDirection, setLightboxDirection] = useState(0);

    const openLightbox = (index: number) => {
        setLightboxDirection(0);
        setLightboxIndex(index);
    };
    const closeLightbox = () => setLightboxIndex(null);
    const nextImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (game?.images && lightboxIndex !== null) {
            setLightboxDirection(1);
            setLightboxIndex((lightboxIndex + 1) % game.images.length);
        }
    };
    const prevImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (game?.images && lightboxIndex !== null) {
            setLightboxDirection(-1);
            setLightboxIndex((lightboxIndex - 1 + game.images.length) % game.images.length);
        }
    };

    useEffect(() => {
        fetch(`/api/games/${id}`)
            .then((res) => {
                if (!res.ok) throw new Error("Game not found");
                return res.json();
            })
            .then((data) => {
                setGame(data);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setLoading(false);
            });
    }, [id]);

    if (loading) {
        return (
            <div className="flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground">
                <Header appName={appName} />
                <main className="flex flex-1 items-center justify-center p-4">
                    <p className="text-white text-xl animate-pulse">Loading...</p>
                </main>
                <Footer />
            </div>
        );
    }

    if (error || !game) {
        return (
            <div className="flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground">
                <Header appName={appName} />
                <main className="flex flex-1 flex-col items-center justify-center p-4 gap-6">
                    <div className="border-4 border-black bg-[#ff5e5e] p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center">
                        <h1 className="text-4xl font-bold uppercase text-black mb-4">Error</h1>
                        <p className="text-xl text-black font-semibold mb-6">{error || "Game not found"}</p>
                        <Button
                            onClick={() => navigate("/")}
                            className="border-4 border-black bg-zinc-800 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:translate-x-1 hover:shadow-none transition-all uppercase font-bold"
                        >
                            <ArrowLeft className="mr-2" /> Back to Search
                        </Button>
                    </div>
                </main>
                <Footer />
            </div>
        );
    }

    const year = game.release_date ? new Date(game.release_date).getFullYear() : "N/A";
    const coverImage = game.images && game.images.length > 0 ? game.images[0] : "https://placehold.co/400x600?text=No+Image";

    return (
        <div className="relative flex min-h-screen w-full flex-col bg-zinc-900 font-base text-foreground selection:bg-main selection:text-main-foreground">
            <Header appName={appName} />

            <main className="flex flex-1 flex-col items-center p-4 pb-32 pt-16 md:p-8 md:pt-24 max-w-7xl mx-auto w-full">

                {/* Back Button */}
                <div className="w-full flex justify-start mb-8">
                    <Button
                        variant="neutral"
                        onClick={() => navigate(-1)}
                        className="border-4 border-black bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:translate-x-1 hover:shadow-none transition-all uppercase font-bold"
                    >
                        <ArrowLeft className="mr-2 size-5" /> Back
                    </Button>
                </div>

                <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* Left Column: Cover Art */}
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5 }}
                        className="lg:col-span-4 flex flex-col items-center gap-6"
                    >
                        <div
                            className="relative w-full aspect-[2/3] max-w-md mx-auto rounded-md border-4 border-black bg-zinc-800 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] overflow-hidden cursor-zoom-in group"
                            onClick={() => {
                                if (game.images && game.images.length > 0) openLightbox(0);
                            }}
                        >
                            <img
                                src={coverImage}
                                alt={game.game_name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                        </div>

                        {/* Quick Stats Badges */}
                        <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-md">
                            {game.region && (
                                <span className="border-2 border-black bg-[#ff5e5e] px-3 py-1 text-black font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                    {game.region}
                                </span>
                            )}
                            {game.videogame && (
                                <span className="border-2 border-black bg-white px-3 py-1 text-black font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                    {game.videogame}
                                </span>
                            )}
                            {game.size && (
                                <span className="flex items-center gap-1 border-2 border-black bg-[#b19cd9] px-3 py-1 text-black font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                    <HardDrive className="size-4" /> {game.size}
                                </span>
                            )}
                        </div>

                        {/* Action Button */}
                        <Button className="w-full max-w-md mt-2 border-4 border-black bg-[#FFD700] text-black text-xl py-6 hover:bg-[#ffc800] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:translate-x-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-bold uppercase tracking-widest">
                            Download
                        </Button>

                        {/* Meta details sidebar */}
                        <div className="w-full max-w-md flex flex-col gap-6 mt-4">
                            <div className="border-4 border-black bg-blue-400 p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-sm">
                                <h3 className="text-xl font-black uppercase text-black mb-3 border-b-4 border-black pb-2">Genres</h3>
                                <div className="flex flex-wrap gap-2">
                                    {game.genre?.split(",").map(g => (
                                        <span key={g} className="bg-white border-2 border-black text-black text-xs font-bold px-2 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                            {g.trim()}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="border-4 border-black bg-emerald-400 p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-sm">
                                <h3 className="text-xl font-black uppercase text-black mb-3 border-b-4 border-black pb-2">Modes</h3>
                                <p className="font-bold text-black text-sm uppercase">
                                    {game.gameplay_modes || "N/A"}
                                </p>
                            </div>

                            <div className="border-4 border-black bg-[#ff5e5e] p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-sm">
                                <h3 className="text-xl font-black uppercase text-black mb-3 border-b-4 border-black pb-2">Filename</h3>
                                <p className="font-bold text-black text-xs break-all bg-white/50 p-2 border-2 border-black">
                                    {game.filename || "N/A"}
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right Column: Details */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="lg:col-span-8 flex flex-col gap-8 w-full"
                    >
                        {/* Title Block */}
                        <div className="border-4 border-black bg-white p-6 md:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-sm relative overflow-hidden">
                            {/* Decorative dots pattern in background */}
                            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)', backgroundSize: '16px 16px' }}></div>

                            <h1 className="text-4xl md:text-5xl lg:text-7xl font-bold uppercase text-black leading-none mb-4 break-words drop-shadow-sm z-10 relative">
                                {game.game_name}
                            </h1>

                            <div className="flex flex-wrap gap-x-6 gap-y-3 mt-6 z-10 relative">
                                <div className="flex items-center gap-2 text-zinc-800 font-bold uppercase text-sm md:text-base bg-[#FFD700]/30 px-2 py-1 border-2 border-transparent">
                                    <Users className="size-5" />
                                    <span>{game.developer}</span>
                                </div>
                                <div className="flex items-center gap-2 text-zinc-800 font-bold uppercase text-sm md:text-base bg-[#b19cd9]/30 px-2 py-1 border-2 border-transparent">
                                    <Calendar className="size-5" />
                                    <span>{year}</span>
                                </div>
                                <div className="flex items-center gap-1 text-zinc-800 font-bold uppercase text-sm md:text-base bg-emerald-300/30 px-2 py-1 border-2 border-transparent">
                                    <span className="mr-1 shadow-none">{game.rating}</span>
                                    <div className="flex flex-row items-center gap-0.5">
                                        {[...Array(5)].map((_, i) => {
                                            const fillPercentage = Math.max(0, Math.min(100, (game.rating - i) * 100));
                                            return (
                                                <div key={i} className="relative w-4 h-4">
                                                    <Star className="absolute top-0 left-0 w-4 h-4 fill-transparent text-black" />
                                                    <Star
                                                        className="absolute top-0 left-0 w-4 h-4 fill-black text-black"
                                                        style={{ clipPath: `inset(0 ${100 - fillPercentage}% 0 0)` }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Description Block */}
                        <div className="w-full">
                            {/* Main Description */}
                            <div className="border-4 border-black bg-zinc-800 p-6 md:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-sm">
                                <h2 className="text-2xl font-bold uppercase text-[#FFD700] mb-4 flex items-center gap-3">
                                    <span className="w-6 h-6 bg-[#FFD700] inline-block"></span> About the game
                                </h2>
                                <p className="text-white text-lg leading-relaxed font-medium">
                                    {game.description || "No description available."}
                                </p>
                            </div>
                        </div>

                        {/* Additional Images Gallery (if any) */}
                        {game.images && game.images.length > 1 && (
                            <div className="w-full mt-4">
                                <h2 className="text-3xl font-bold uppercase text-white mb-6">Gallery</h2>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                    {game.images.slice(1).map((img, i) => (
                                        <div
                                            key={i}
                                            className="aspect-video w-full rounded-sm border-4 border-black bg-zinc-800 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden cursor-zoom-in group"
                                            onClick={() => openLightbox(i + 1)}
                                        >
                                            <img
                                                src={img}
                                                alt={`${game.game_name} screenshot ${i + 1}`}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                loading="lazy"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>
            </main>

            {/* Lightbox */}
            <AnimatePresence>
                {lightboxIndex !== null && game.images && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
                        <button
                            onClick={closeLightbox}
                            className="absolute top-4 right-4 text-white hover:text-[#ff5e5e] z-50 p-2 transition-colors"
                        >
                            <X className="size-8" />
                        </button>

                        <button
                            onClick={prevImage}
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-[#FFD700] z-50 p-2 transition-colors"
                        >
                            <ChevronLeft className="size-12" />
                        </button>

                        <div
                            className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center cursor-default overflow-hidden"
                            onClick={closeLightbox}
                        >
                            <AnimatePresence mode="popLayout" custom={lightboxDirection}>
                                <motion.img
                                    key={lightboxIndex}
                                    custom={lightboxDirection}
                                    variants={{
                                        enter: (d: number) => ({ x: d > 0 ? 800 : d < 0 ? -800 : 0, opacity: 0, scale: 0.95 }),
                                        center: { x: 0, opacity: 1, scale: 1 },
                                        exit: (d: number) => ({ x: d < 0 ? 800 : d > 0 ? -800 : 0, opacity: 0, scale: 0.95 })
                                    }}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    src={game.images[lightboxIndex]}
                                    alt={`${game.game_name} gallery image`}
                                    className="max-w-full max-h-full object-contain border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] bg-zinc-900 cursor-auto"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </AnimatePresence>
                        </div>

                        <button
                            onClick={nextImage}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-[#FFD700] z-50 p-2 transition-colors"
                        >
                            <ChevronRight className="size-12" />
                        </button>
                    </div>
                )}
            </AnimatePresence>

            <Button
                variant="default"
                size="icon"
                className="fixed right-4 bottom-4 z-50 h-12 w-12 rounded-full border-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none bg-[#FFD700] text-black"
            >
                <Bot className="size-6" />
            </Button>
        </div>
    );
}
