"use client";

import React, { useEffect, useState, useRef } from "react";

export type KickPhase = "IDLE" | "DIRECTION" | "POWER" | "HEIGHT" | "CURVE" | "KICKED" | "ENDGAME";

export interface KickParams {
  direction: number; // -1 to 1 (left to right)
  power: number;     // 0 to 1
  height: number;    // 0 to 1
  curve: number;     // -1 to 1
}

interface GameUIProps {
  onKickParamsUpdate: (params: Partial<KickParams>) => void;
  onKickExecute: (params: KickParams) => void;
  phase: KickPhase;
  setPhase: (phase: KickPhase) => void;
  level: number;
  score: number;
  shots?: (string | null)[];
}

export function GameUI({ onKickParamsUpdate, onKickExecute, phase, setPhase, level, score, shots = [null, null, null, null, null] }: GameUIProps) {
  const [direction, setDirection] = useState(0);
  const [power, setPower] = useState(0);
  const [height, setHeight] = useState(0);
  const [curve, setCurve] = useState(0);
  const [outcomeText, setOutcomeText] = useState<string | null>(null);
  const [uiConfig, setUiConfig] = useState({
    levelScale: 1.0, levelOpacity: 1.0, levelTop: 16, levelLeft: 16,
    scoreScale: 1.0, scoreOpacity: 1.0, scoreTop: 16, scoreRight: 16,
    sbScale: 1.0, sbOpacity: 1.0, sbTop: 80, sbLeft: 16,
    centerScale: 0.5, centerOpacity: 1.0, centerTop: 269,
    outcomeScale: 1.0, outcomeOpacity: 1.0, outcomeTop: 64,
    dirScale: 1.0, dirOpacity: 1.0, dirBottom: 339,
    pwrScale: 1.0, pwrOpacity: 1.0, pwrBottom: 239,
    hgtScale: 1.0, hgtOpacity: 1.0, hgtBottom: 139,
    crvScale: 1.0, crvOpacity: 1.0, crvBottom: 39,
  });

  useEffect(() => {
    (window as any).setOutcomeText = setOutcomeText;
    
    // Poll the global UI settings from lil-gui
    const interval = setInterval(() => {
      const globUi = (window as any).uiSettings;
      if (globUi) {
        setUiConfig(prev => {
          let changed = false;
          for (const key in globUi) {
            if ((prev as any)[key] !== globUi[key]) {
              changed = true;
              break;
            }
          }
          if (changed) {
            return { ...globUi };
          }
          return prev;
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const directionRef = useRef(0);
  const powerRef = useRef(0);
  const heightRef = useRef(0);
  const curveRef = useRef(0);
  const phaseRef = useRef(phase);

  // Sync phase to ref for instant access inside animation loop
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Animation loops for gauges
  useEffect(() => {
    phaseRef.current = phase;
    if (phase === "IDLE") {
      setDirection(0);
      setPower(0);
      setHeight(0);
      setCurve(0);
      directionRef.current = 0;
      powerRef.current = 0;
      heightRef.current = 0;
      curveRef.current = 0;
    }
    if (phase === "KICKED" || phase === "IDLE") return;

    let animationFrame: number;
    let lastTimestamp = performance.now();
    let time = 0;

    const pingPong01 = (t: number) => {
      const mod = t % 2;
      return mod < 1 ? mod : 2 - mod;
    };

    let currentPhase = phaseRef.current;

    const animate = (now: number) => {
      // Calculate delta time to ensure consistent speed regardless of frame rate
      const dt = now - lastTimestamp;
      lastTimestamp = now;
      time += dt * 0.0003; 

      if (phaseRef.current !== currentPhase) {
        time = 0;
        currentPhase = phaseRef.current;
      }
      
      if (phaseRef.current === "DIRECTION") {
        const val = pingPong01(time * 2 + 0.5) * 2 - 1;
        setDirection(val);
        directionRef.current = val;
        onKickParamsUpdate({ direction: val });
      } else if (phaseRef.current === "POWER") {
        const val = pingPong01(time * 3);
        setPower(val);
        powerRef.current = val;
        onKickParamsUpdate({ power: val });
      } else if (phaseRef.current === "HEIGHT") {
        const val = pingPong01(time * 3.5);
        setHeight(val);
        heightRef.current = val;
        onKickParamsUpdate({ height: val });
      } else if (phaseRef.current === "CURVE") {
        const val = pingPong01(time * 4 + 0.5) * 2 - 1;
        setCurve(val);
        curveRef.current = val;
        onKickParamsUpdate({ curve: val });
      }
      
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [phase, onKickParamsUpdate]);

  const handleScreenClick = () => {
    if (phase === "ENDGAME") return;

    switch (phase) {
      case "IDLE":
        phaseRef.current = "DIRECTION";
        (window as any).aimDirection = 0;
        setPhase("DIRECTION");
        break;
      case "DIRECTION":
        phaseRef.current = "POWER";
        setPhase("POWER");
        break;
      case "POWER":
        phaseRef.current = "HEIGHT";
        setPhase("HEIGHT");
        break;
      case "HEIGHT":
        phaseRef.current = "CURVE";
        setPhase("CURVE");
        break;
      case "CURVE":
        phaseRef.current = "KICKED";
        setPhase("KICKED");
        onKickExecute({
          direction: directionRef.current,
          power: powerRef.current,
          height: heightRef.current,
          curve: curveRef.current,
        });

        try {
          const vol = (window as any).audioSettings?.kickVolume ?? 1.0;
          if (vol > 0) {
            const kickSound = new Audio("/sound_effects/kick_01.mp3");
            kickSound.volume = vol;
            kickSound.play();
          }
        } catch(e) {}
        break;
      case "KICKED":
        // Wait for next round to reset to IDLE (handled by GameManager)
        break;
    }
  };

  return (
    <div 
      className="absolute inset-0 z-10 select-none cursor-pointer flex flex-col justify-between p-4"
      onClick={handleScreenClick}
    >
      <div className="flex flex-col h-full w-full justify-between">
        {/* HUD Header */}
        <div className="flex justify-between items-start pt-4 px-4 pointer-events-none">
          <div className="absolute bg-black/50 text-white px-4 py-2 rounded-xl font-bold text-xl uppercase tracking-widest backdrop-blur-md shadow-lg border border-white/10"
               style={{ opacity: uiConfig.levelOpacity, transform: `scale(${uiConfig.levelScale})`, transformOrigin: 'top left', top: `${uiConfig.levelTop}px`, left: `${uiConfig.levelLeft}px`, transition: 'all 0.2s' }}>
            Level {level}
          </div>
          <div className="absolute bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-xl font-bold text-2xl shadow-lg shadow-blue-500/20 border border-white/20"
               style={{ opacity: uiConfig.scoreOpacity, transform: `scale(${uiConfig.scoreScale})`, transformOrigin: 'top right', top: `${uiConfig.scoreTop}px`, right: `${uiConfig.scoreRight}px`, transition: 'all 0.2s' }}>
            Score: {score}
          </div>
        </div>

        {/* Scoreboard */}
        <div className="absolute pointer-events-none flex items-center space-x-4 bg-black/50 p-3 rounded-2xl border border-white/10 backdrop-blur-sm" style={{ opacity: uiConfig.sbOpacity, transform: `scale(${uiConfig.sbScale})`, transformOrigin: 'top left', top: `${uiConfig.sbTop}px`, left: `${uiConfig.sbLeft}px`, transition: 'all 0.2s' }}>
          <div className="flex space-x-2">
            {shots?.map((shot, idx) => (
              <div 
                key={idx} 
                className={`w-8 h-8 rounded-md flex items-center justify-center font-bold text-lg shadow-inner ${
                  shot === "GOAL!" ? "bg-green-500 text-white shadow-green-500/50" : 
                  (shot === "MISS!" || shot === "SAVE!") ? "bg-red-500 text-white shadow-red-500/50" : 
                  "bg-white/10"
                }`}
              >
                {shot === "GOAL!" && "⚽"}
                {(shot === "MISS!" || shot === "SAVE!") && "❌"}
              </div>
            ))}
          </div>
          <div className="text-white font-black text-xl">
            {shots?.filter(s => s === "GOAL!").length} / 3
          </div>
        </div>

        {/* Center Instruction */}
        <div className="flex justify-center pointer-events-none absolute w-full left-0" style={{ opacity: uiConfig.centerOpacity, transform: `scale(${uiConfig.centerScale})`, transformOrigin: 'center center', top: `${uiConfig.centerTop}px`, transition: 'all 0.2s' }}>
          {phase === "IDLE" && (
          <h1 className="text-4xl md:text-6xl text-white font-black drop-shadow-2xl animate-pulse">
            TAP TO START
          </h1>
        )}
        {phase !== "IDLE" && phase !== "KICKED" && phase !== "ENDGAME" && (
          <h2 className="text-2xl text-white font-bold drop-shadow-lg bg-black/30 px-6 py-2 rounded-full backdrop-blur-sm">
            TAP TO LOCK {phase}
          </h2>
        )}
        </div>
        {outcomeText && phase !== "ENDGAME" && (
          <div className="absolute w-full left-0 pointer-events-none flex justify-center z-50"
               style={{ opacity: uiConfig.outcomeOpacity, transform: `scale(${uiConfig.outcomeScale})`, transformOrigin: 'center center', top: `${uiConfig.outcomeTop}px`, transition: 'all 0.2s' }}>
            <h1 className={`text-6xl md:text-8xl font-black drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] ${outcomeText === "GOAL!" ? "text-green-400" : outcomeText === "SAVE!" ? "text-red-400" : "text-yellow-400"} animate-pop-fade`}>
              {outcomeText}
            </h1>
          </div>
        )}
        {phase === "ENDGAME" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md z-50 pointer-events-auto">
            <h1 className="text-6xl md:text-8xl font-black text-white drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] mb-4">
              {score >= 10 ? "YOU WIN!" : "GAME OVER"}
            </h1>
            <h2 className="text-3xl text-white font-bold mb-8">
              Final Score: <span className="text-blue-400">{score}</span> / 15
            </h2>
            <button 
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full text-white font-black text-2xl shadow-[0_0_20px_rgba(34,197,94,0.5)] hover:scale-105 active:scale-95 transition-all"
              onClick={(e) => {
                e.stopPropagation();
                if ((window as any).gameManager) {
                  (window as any).gameManager.resetGame();
                }
              }}
            >
              PLAY AGAIN
            </button>
          </div>
        )}
      </div>

      {/* Gauges Area */}
      <div className={`absolute w-full pointer-events-none ${phase === "ENDGAME" ? "hidden" : ""}`}>
        {/* Direction Gauge (Arrow visualization) */}
        <div className={`absolute left-1/2 -translate-x-1/2 w-full max-w-md bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl h-20 flex items-center justify-center transition-all duration-300 ${(phase === "IDLE" || phase === "DIRECTION") ? "scale-105 pointer-events-auto" : "scale-95 pointer-events-none"}`}
             style={{ opacity: (phase === "IDLE" || phase === "DIRECTION") ? uiConfig.dirOpacity : 0, transform: `translateX(-50%) scale(${uiConfig.dirScale})`, transformOrigin: 'bottom center', bottom: `${uiConfig.dirBottom}px`, transition: 'all 0.2s' }}>
          <div className="w-full h-2 bg-white/20 rounded-full relative overflow-hidden">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/50 -translate-x-1/2"></div>
            <div 
              className="absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 rounded-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)]"
              style={{ left: `${((direction + 1) / 2) * 100}%`, transition: phase !== "DIRECTION" ? "none" : "none" }}
            />
          </div>
          <span className="absolute -top-4 text-white text-xs font-bold tracking-widest text-white/70">DIRECTION</span>
        </div>

        {/* Power Gauge */}
        <div className={`absolute left-1/2 -translate-x-1/2 w-full max-w-md bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl h-20 flex items-center transition-all duration-300 ${phase === "POWER" ? "scale-105 pointer-events-auto" : "scale-95 pointer-events-none"}`}
             style={{ opacity: phase === "POWER" ? uiConfig.pwrOpacity : 0, transform: `translateX(-50%) scale(${uiConfig.pwrScale})`, transformOrigin: 'bottom center', bottom: `${uiConfig.pwrBottom}px`, transition: 'all 0.2s' }}>
          <span className="absolute -top-4 text-white text-xs font-bold tracking-widest text-white/70">POWER</span>
          <div className="w-full h-4 bg-white/20 rounded-full overflow-hidden border border-white/10 shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
              style={{ width: `${power * 100}%` }}
            />
          </div>
        </div>

        {/* Height Gauge */}
        <div className={`absolute left-1/2 -translate-x-1/2 w-full max-w-md bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl h-20 flex items-center transition-all duration-300 ${phase === "HEIGHT" ? "scale-105 pointer-events-auto" : "scale-95 pointer-events-none"}`}
             style={{ opacity: phase === "HEIGHT" ? uiConfig.hgtOpacity : 0, transform: `translateX(-50%) scale(${uiConfig.hgtScale})`, transformOrigin: 'bottom center', bottom: `${uiConfig.hgtBottom}px`, transition: 'all 0.2s' }}>
          <span className="absolute -top-4 text-white text-xs font-bold tracking-widest text-white/70">HEIGHT</span>
          <div className="w-full h-4 bg-white/20 rounded-full overflow-hidden border border-white/10 shadow-inner">
            <div 
              className="h-full bg-gradient-to-t from-blue-400 to-indigo-600 rounded-full"
              style={{ width: `${height * 100}%` }}
            />
          </div>
        </div>

        {/* Curve Gauge */}
        <div className={`absolute left-1/2 -translate-x-1/2 w-full max-w-md bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl h-20 flex items-center justify-center transition-all duration-300 ${phase === "CURVE" ? "scale-105 pointer-events-auto" : "scale-95 pointer-events-none"}`}
             style={{ opacity: phase === "CURVE" ? uiConfig.crvOpacity : 0, transform: `translateX(-50%) scale(${uiConfig.crvScale})`, transformOrigin: 'bottom center', bottom: `${uiConfig.crvBottom}px`, transition: 'all 0.2s' }}>
          <span className="absolute -top-4 text-white text-xs font-bold tracking-widest text-white/70">CURVE</span>
          <div className="w-full h-2 bg-white/20 rounded-full relative overflow-hidden">
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/50 -translate-x-1/2"></div>
            <div 
              className="absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 rounded-full bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.8)]"
              style={{ left: `${((curve + 1) / 2) * 100}%` }}
            />
          </div>
        </div>
      </div>
      <audio id="swishAudio" src="/sound_effects/net_swish_impact_01.mp3" preload="auto" />
      <audio id="boingAudio" src="/sound_effects/boing_impact_01.mp3" preload="auto" />
    </div>
  );
}
