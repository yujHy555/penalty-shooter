"use client";

import React, { useEffect, useState, useRef } from "react";

export type KickPhase = "MENU" | "IDLE" | "DIRECTION" | "POWER" | "HEIGHT" | "CURVE" | "KICKED" | "ENDGAME" | "LEVEL_COMPLETE" | "LEVEL_FAILED";

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
  isLoading?: boolean;
  onAdvanceLevel?: () => void;
  onRetryLevel?: () => void;
}

export function GameUI({ onKickParamsUpdate, onKickExecute, phase, setPhase, level, score, shots = [null, null, null, null, null], isLoading = false, onAdvanceLevel, onRetryLevel }: GameUIProps) {
  const [direction, setDirection] = useState(0);
  const [power, setPower] = useState(0);
  const [height, setHeight] = useState(0);
  const [curve, setCurve] = useState(0);
  const [outcomeText, setOutcomeText] = useState<string | null>(null);
  const [uiConfig, setUiConfig] = useState<Record<string, any>>({
    levelScale: 1.0, levelOpacity: 1.0, levelTop: 16, levelLeft: 16,
    scoreScale: 1.0, scoreOpacity: 1.0, scoreTop: 16, scoreRight: 16,
    sbScale: 1.0, sbOpacity: 1.0, sbTop: 80, sbRight: 16,
    centerScale: 0.5, centerOpacity: 1.0, centerTop: 208,
    outcomeScale: 1.7, outcomeOpacity: 1.0, outcomeTop: 120,
    dirScale: 1.0, dirOpacity: 1.0, dirBottom: 303,
    gaugeScale: 1.3, gaugeX: 0,
    pwrScale: 1.0, pwrX: 0, pwrY: 0,
    hgtScale: 1.0, hgtX: 0, hgtY: 0,
    crvScale: 1.0, crvX: 0, crvY: 24,
    dirSpeed: 2.6,
    pwrSpeed: 5.5,
    hgtSpeed: 5.5,
    crvSpeed: 5.5,
    preloaderSpinnerScale: 1.0, preloaderSpinnerTop: 0,
    preloaderTitleScale: 1.0, preloaderTitleTop: 0,
    preloaderSubScale: 1.0, preloaderSubTop: 0,
  });

  const [uiScale, setUiScale] = useState(1.0);
  const [scaleX, setScaleX] = useState(1.0);
  const [scaleY, setScaleY] = useState(1.0);
  const [sceneScale, setSceneScale] = useState(1.0);
  const [windowSize, setWindowSize] = useState({ w: 1920, h: 1080 });

  useEffect(() => {
    const handleResize = () => {
      const sx = window.innerWidth / 1920;
      const sy = window.innerHeight / 1080;
      setScaleX(sx);
      setScaleY(sy);
      setUiScale(Math.min(sx, sy));
      setSceneScale(Math.min(window.innerWidth, window.innerHeight) / 1080);
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    };
    handleResize();
    window.addEventListener('resize', handleResize);

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
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
    };
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
        let currentDirSpeed = uiConfig.dirSpeed || 2.6;
        if (level === 1 && uiConfig.dirSpeedLvl1 !== undefined) currentDirSpeed = uiConfig.dirSpeedLvl1;
        if (level === 2 && uiConfig.dirSpeedLvl2 !== undefined) currentDirSpeed = uiConfig.dirSpeedLvl2;
        if (level === 3 && uiConfig.dirSpeedLvl3 !== undefined) currentDirSpeed = uiConfig.dirSpeedLvl3;
        const val = pingPong01(time * currentDirSpeed + 0.5) * 2 - 1;
        setDirection(val);
        directionRef.current = val;
        onKickParamsUpdate({ direction: val });
      } else if (phaseRef.current === "POWER") {
        const val = pingPong01(time * uiConfig.pwrSpeed);
        setPower(val);
        powerRef.current = val;
        onKickParamsUpdate({ power: val });
      } else if (phaseRef.current === "HEIGHT") {
        let speedMult = 1.0;
        const pwr = powerRef.current;
        if (level === 1) speedMult = 1.0 + (pwr * (uiConfig.hgtPwrMultLvl1 || 0.0));
        else if (level === 2) speedMult = 1.0 + (pwr * (uiConfig.hgtPwrMultLvl2 || 0.5));
        else if (level === 3) speedMult = 1.0 + (pwr * (uiConfig.hgtPwrMultLvl3 || 1.0));

        const val = pingPong01(time * (uiConfig.hgtSpeed * speedMult));
        setHeight(val);
        heightRef.current = val;
        onKickParamsUpdate({ height: val });
      } else if (phaseRef.current === "CURVE") {
        const val = pingPong01(time * uiConfig.crvSpeed + 0.5) * 2 - 1;
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
    if (phase === "ENDGAME" || phase === "MENU") return;

    switch (phase) {
      case "IDLE":
        phaseRef.current = "DIRECTION";
        (window as any).aimDirection = 0;
        setPhase("DIRECTION");
        break;
      case "DIRECTION":
        phaseRef.current = "POWER";
        (window as any).arrowJiggleStart = performance.now();
        let currentDirSpeed = uiConfig.dirSpeed || 2.6;
        if (level === 1 && uiConfig.dirSpeedLvl1 !== undefined) currentDirSpeed = uiConfig.dirSpeedLvl1;
        if (level === 2 && uiConfig.dirSpeedLvl2 !== undefined) currentDirSpeed = uiConfig.dirSpeedLvl2;
        if (level === 3 && uiConfig.dirSpeedLvl3 !== undefined) currentDirSpeed = uiConfig.dirSpeedLvl3;
        (window as any).arrowJiggleSpeedFactor = currentDirSpeed;
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

  const cx = 100, cy = 100, r = 65;
  const powerBlocksCount = Math.ceil(power * 10);
  const heightBlocksCount = Math.ceil(height * 10);
  
  const powerArcs = Array.from({ length: 10 }).map((_, i) => {
    const startAngle = 105 + i * 15;
    const endAngle = startAngle + 12;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = (cx + r * Math.cos(startRad)).toFixed(3);
    const y1 = (cy + r * Math.sin(startRad)).toFixed(3);
    const x2 = (cx + r * Math.cos(endRad)).toFixed(3);
    const y2 = (cy + r * Math.sin(endRad)).toFixed(3);
    return { path: `M ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2}`, active: i < powerBlocksCount };
  });

  const heightArcs = Array.from({ length: 10 }).map((_, i) => {
    const startAngle = 75 - i * 15;
    const endAngle = startAngle - 12;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = (cx + r * Math.cos(startRad)).toFixed(3);
    const y1 = (cy + r * Math.sin(startRad)).toFixed(3);
    const x2 = (cx + r * Math.cos(endRad)).toFixed(3);
    const y2 = (cy + r * Math.sin(endRad)).toFixed(3);
    return { path: `M ${x1},${y1} A ${r},${r} 0 0,0 ${x2},${y2}`, active: i < heightBlocksCount };
  });

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black backdrop-blur-xl overflow-hidden px-4">
          <div className="relative flex items-center justify-center w-24 h-24 md:w-32 md:h-32 mb-4 md:mb-8 shrink-0 transition-transform"
               style={{ transform: `translateY(${uiConfig.preloaderSpinnerTop || 0}px) scale(${uiConfig.preloaderSpinnerScale || 1})` }}>
            {/* Outer spinning glow */}
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 border-r-purple-500 border-b-transparent border-l-transparent animate-spin shadow-[0_0_30px_rgba(59,130,246,0.8)]"></div>
            {/* Inner pulse */}
            <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full animate-pulse shadow-[0_0_40px_rgba(168,85,247,0.8)]"></div>
          </div>
          <h1 className="py-2 leading-relaxed text-2xl md:text-4xl text-center font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)] animate-pulse tracking-widest shrink-0 transition-transform"
              style={{ transform: `translateY(${uiConfig.preloaderTitleTop || 0}px) scale(${uiConfig.preloaderTitleScale || 1})` }}>
            LOADING ASSETS...
          </h1>
          <p className="text-sm md:text-base text-gray-400 mt-2 md:mt-4 font-bold tracking-wider animate-pulse text-center shrink-0 transition-transform"
             style={{ transform: `translateY(${uiConfig.preloaderSubTop || 0}px) scale(${uiConfig.preloaderSubScale || 1})` }}>
            PREPARING STADIUM
          </p>
        </div>
      )}
      
      {phase !== "MENU" && (
        <>
          <div 
            className={`absolute inset-0 z-10 select-none cursor-pointer flex flex-col justify-between transition-opacity duration-1000 ${isLoading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            onPointerDown={handleScreenClick}
          >
      <div className="flex flex-col h-full w-full justify-between">
        
        {/* Level Badge */}
        <div className="absolute pointer-events-none" 
             style={{ opacity: uiConfig.levelOpacity, transform: `scale(${uiConfig.levelScale * sceneScale})`, transformOrigin: 'top left', top: `${uiConfig.levelTop * sceneScale}px`, left: `${uiConfig.levelLeft * sceneScale}px`, transition: 'all 0.2s' }}>
          <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl p-1 shadow-lg shadow-orange-500/30">
            <div className="bg-black text-white px-4 py-2 rounded-xl font-bold text-xl uppercase tracking-widest border border-white/10">
              Level {level}
            </div>
          </div>
        </div>
        
        {/* Scoreboard (Shots) */}
        <div className="absolute pointer-events-none flex items-center space-x-2 bg-black/50 p-3 rounded-2xl border border-white/10 backdrop-blur-sm" 
             style={{ opacity: uiConfig.sbOpacity, transform: `scale(${uiConfig.sbScale * sceneScale})`, transformOrigin: 'top right', top: `${uiConfig.sbTop * sceneScale}px`, right: `${uiConfig.sbRight * sceneScale}px`, transition: 'all 0.2s' }}>
          <div className="flex space-x-2">
            {shots?.map((shot, idx) => (
              <div 
                key={idx} 
                className={`w-8 h-8 rounded-md flex items-center justify-center font-bold text-lg shadow-inner ${
                  shot === "GOAL!" ? "bg-green-500 text-white shadow-green-500/50" : 
                  (shot === "MISS!" || shot === "SAVE!") ? "bg-red-500 text-white shadow-red-500/50" : 
                  "bg-white/10 text-white/40"
                }`}
              >
                {shot === "GOAL!" && "⚽"}
                {(shot === "MISS!" || shot === "SAVE!") && "❌"}
                {!shot && (idx + 1)}
              </div>
            ))}
          </div>
          <div className="text-white font-black text-xl">
            {shots?.filter(s => s === "GOAL!").length} / 5
          </div>
        </div>

        {/* Center Instructions (Tap to start / Tap to lock) */}
        {(() => {
          let scale = uiConfig.centerScale;
          let top = uiConfig.centerTop;
          let left = 0;
          let color = "#ffffff";
          let bgColor = "#000000";
          let bgOpacity = 0.3;
          let text = "";

          if (phase === "IDLE") {
            scale = uiConfig.startTextScale ?? uiConfig.centerScale;
            top = uiConfig.startTextTop ?? uiConfig.centerTop;
            left = uiConfig.startTextLeft ?? 0;
            color = uiConfig.startTextColor ?? "#ffffff";
            bgColor = uiConfig.startTextBgColor ?? "#000000";
            bgOpacity = uiConfig.startTextBgOpacity ?? 0.3;
            text = "TAP TO START";
          } else if (phase === "DIRECTION") {
            scale = uiConfig.dirTextScale ?? uiConfig.centerScale;
            top = uiConfig.dirTextTop ?? uiConfig.centerTop;
            left = uiConfig.dirTextLeft ?? 0;
            color = uiConfig.dirTextColor ?? "#ffffff";
            bgColor = uiConfig.dirTextBgColor ?? "#000000";
            bgOpacity = uiConfig.dirTextBgOpacity ?? 0.3;
            text = "TAP TO LOCK DIRECTION";
          } else if (phase === "POWER") {
            scale = uiConfig.powerTextScale ?? uiConfig.centerScale;
            top = uiConfig.powerTextTop ?? uiConfig.centerTop;
            left = uiConfig.powerTextLeft ?? 0;
            color = uiConfig.powerTextColor ?? "#ffffff";
            bgColor = uiConfig.powerTextBgColor ?? "#000000";
            bgOpacity = uiConfig.powerTextBgOpacity ?? 0.3;
            text = "TAP TO LOCK POWER";
          } else if (phase === "HEIGHT") {
            scale = uiConfig.heightTextScale ?? uiConfig.centerScale;
            top = uiConfig.heightTextTop ?? uiConfig.centerTop;
            left = uiConfig.heightTextLeft ?? 0;
            color = uiConfig.heightTextColor ?? "#ffffff";
            bgColor = uiConfig.heightTextBgColor ?? "#000000";
            bgOpacity = uiConfig.heightTextBgOpacity ?? 0.3;
            text = "TAP TO LOCK HEIGHT";
          } else if (phase === "CURVE") {
            scale = uiConfig.curveTextScale ?? uiConfig.centerScale;
            top = uiConfig.curveTextTop ?? uiConfig.centerTop;
            left = uiConfig.curveTextLeft ?? 0;
            color = uiConfig.curveTextColor ?? "#ffffff";
            bgColor = uiConfig.curveTextBgColor ?? "#000000";
            bgOpacity = uiConfig.curveTextBgOpacity ?? 0.3;
            text = "TAP TO LOCK CURVE";
          }

          if (!text) return null;

          const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
          };

          return (
            <div className="flex justify-center pointer-events-none absolute w-full left-0" style={{ top: `${windowSize.h / 2 - (540 - top) * sceneScale}px`, marginLeft: `${left * sceneScale}px`, opacity: uiConfig.centerOpacity, transition: 'all 0.2s' }}>
              <div style={{ transform: `scale(${scale * sceneScale})`, transformOrigin: 'top center' }}>
                {phase === "IDLE" ? (
                  <h1 className="text-6xl font-black drop-shadow-2xl animate-pulse whitespace-nowrap" style={{ color: color }}>
                    {text}
                  </h1>
                ) : (
                  <h2 className="text-2xl font-bold drop-shadow-lg px-6 py-2 rounded-full backdrop-blur-sm whitespace-nowrap" style={{ color: color, backgroundColor: `rgba(${hexToRgb(bgColor)}, ${bgOpacity})` }}>
                    {text}
                  </h2>
                )}
              </div>
            </div>
          );
        })()}
        {outcomeText && (
          <div className="flex justify-center pointer-events-none absolute w-full left-0"
               style={{ top: `${windowSize.h / 2 - (540 - uiConfig.outcomeTop) * sceneScale}px`, opacity: uiConfig.outcomeOpacity, transition: 'all 0.2s' }}>
            <div style={{ transform: `scale(${uiConfig.outcomeScale * sceneScale})`, transformOrigin: 'top center' }}>
              <h1 className={`text-8xl font-black drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] ${outcomeText === "GOAL!" ? "text-green-400" : outcomeText === "SAVE!" ? "text-red-400" : "text-yellow-400"} animate-pop-fade`}>
                {outcomeText}
              </h1>
            </div>
          </div>
        )}
        {phase === "ENDGAME" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md z-50 pointer-events-auto" style={{ backgroundColor: `rgba(0,0,0,${uiConfig.endBgOpacity ?? 0.8})` }}>
            <div className="flex flex-col items-center justify-center w-full" style={{ transform: `scale(${sceneScale})` }}>
              <div style={{ transform: `scale(${uiConfig.endTitleScale ?? 1.0}) translateY(${uiConfig.endTitleY ?? 0}px)` }}>
                <h1 className="text-8xl font-black drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] mb-4 animate-in zoom-in fade-in duration-500 whitespace-nowrap"
                    style={{ color: uiConfig.endTitleColor }}>
                  {score >= 9 ? "YOU WIN!" : "GAME OVER"}
                </h1>
              </div>
              <div style={{ transform: `scale(${uiConfig.endSubScale ?? 1.0}) translateY(${uiConfig.endSubY ?? 0}px)` }}>
                <h2 className="text-3xl font-bold mb-8 animate-in slide-in-from-bottom-5 fade-in duration-500 delay-150 fill-mode-both whitespace-nowrap"
                    style={{ color: uiConfig.endSubColor }}>
                  Final Score: <span className="text-blue-400">{score}</span> / 15
                </h2>
              </div>
              <div style={{ transform: `scale(${uiConfig.endBtnScale ?? 1.0}) translateY(${uiConfig.endBtnY ?? 0}px)` }}>
                <button 
                  className="px-8 py-4 rounded-full font-black text-2xl shadow-[0_0_20px_rgba(34,197,94,0.5)] hover:scale-105 active:scale-95 transition-all animate-in slide-in-from-bottom-10 fade-in duration-500 delay-300 fill-mode-both whitespace-nowrap"
                  style={{ backgroundColor: uiConfig.endBtnBgColor, color: uiConfig.endBtnColor, backgroundImage: 'none' }}
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
            </div>
          </div>
        )}
        {phase === "LEVEL_COMPLETE" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md z-50 pointer-events-auto" style={{ backgroundColor: `rgba(0,0,0,${uiConfig.compBgOpacity ?? 0.6})` }}>
            <div className="flex flex-col items-center justify-center w-full" style={{ transform: `scale(${sceneScale})` }}>
              <div style={{ transform: `scale(${uiConfig.compTitleScale ?? 1.0}) translateY(${uiConfig.compTitleY ?? 0}px)` }}>
                <h1 className="text-7xl font-black drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] mb-2 animate-in slide-in-from-bottom-10 fade-in duration-500 py-2 leading-relaxed whitespace-nowrap"
                    style={{ color: uiConfig.compTitleColor, WebkitTextFillColor: uiConfig.compTitleColor, backgroundImage: 'none' }}>
                  CONGRATS
                </h1>
              </div>
              <div style={{ transform: `scale(${uiConfig.compSubScale ?? 1.0}) translateY(${uiConfig.compSubY ?? 0}px)` }}>
                <h2 className="text-4xl font-bold mb-8 animate-in slide-in-from-bottom-10 fade-in duration-500 delay-100 fill-mode-both whitespace-nowrap"
                    style={{ color: uiConfig.compSubColor }}>
                  STAGE COMPLETE
                </h2>
              </div>
              <div className="flex space-x-4 mb-12" style={{ transform: `scale(${uiConfig.compIconScale ?? 1.0}) translateY(${uiConfig.compIconY ?? 0}px)` }}>
                {[0,1,2,3,4].map((i) => {
                   const goals = shots.filter(s => s === "GOAL!").length;
                   const isGold = i < goals;
                   return (
                     <div key={i} 
                          className={`animate-in fade-in duration-700 ${isGold ? "zoom-in spin-in-12" : "zoom-in-90"}`}
                          style={{ 
                            animationDelay: `${300 + i * 150}ms`,
                            animationFillMode: "both",
                            animationTimingFunction: isGold ? "cubic-bezier(0.175, 0.885, 0.32, 1.275)" : "ease-out"
                          }}>
                       <svg className={`w-24 h-24 ${isGold ? "drop-shadow-[0_0_15px_rgba(250,204,21,0.6)]" : "drop-shadow-[0_0_5px_rgba(0,0,0,0.5)] text-gray-600/50"}`} 
                            style={isGold ? { color: uiConfig.compIconColor } : {}}
                            viewBox="0 0 24 24" fill="currentColor">
                         <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                       </svg>
                     </div>
                   );
                })}
              </div>
              <div style={{ transform: `scale(${uiConfig.compBtnScale ?? 1.0}) translateY(${uiConfig.compBtnY ?? 0}px)` }}>
                <button 
                  className="px-8 py-4 rounded-full font-black text-2xl shadow-[0_0_20px_rgba(250,204,21,0.4)] hover:scale-105 active:scale-95 transition-all animate-in slide-in-from-bottom-10 fade-in duration-500 delay-500 fill-mode-both whitespace-nowrap"
                  style={{ backgroundColor: uiConfig.compBtnBgColor, color: uiConfig.compBtnColor, backgroundImage: 'none', animationFillMode: "both" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onAdvanceLevel) onAdvanceLevel();
                  }}
                >
                  CONTINUE
                </button>
              </div>
            </div>
          </div>
        )}
        {phase === "LEVEL_FAILED" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-md z-50 pointer-events-auto" style={{ backgroundColor: `rgba(0,0,0,${uiConfig.failBgOpacity ?? 0.8})` }}>
            <div className="flex flex-col items-center justify-center w-full" style={{ transform: `scale(${sceneScale})` }}>
              <div style={{ transform: `scale(${uiConfig.failTitleScale ?? 1.0}) translateY(${uiConfig.failTitleY ?? 0}px)` }}>
                <h1 className="text-7xl font-black drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] mb-2 animate-in zoom-in fade-in duration-500 py-2 leading-relaxed whitespace-nowrap"
                    style={{ color: uiConfig.failTitleColor, WebkitTextFillColor: uiConfig.failTitleColor, backgroundImage: 'none' }}>
                  UNLUCKY
                </h1>
              </div>
              <div style={{ transform: `scale(${uiConfig.failSubScale ?? 1.0}) translateY(${uiConfig.failSubY ?? 0}px)` }}>
                <h2 className="text-4xl font-bold mb-12 animate-in zoom-in fade-in duration-500 delay-100 whitespace-nowrap" 
                    style={{ animationFillMode: "both", color: uiConfig.failSubColor }}>
                  BETTER LUCK NEXT TIME
                </h2>
              </div>
              <div style={{ transform: `scale(${uiConfig.failBtnScale ?? 1.0}) translateY(${uiConfig.failBtnY ?? 0}px)` }}>
                <button 
                  className="px-8 py-4 rounded-full font-black text-2xl shadow-[0_0_20px_rgba(34,197,94,0.5)] hover:scale-105 active:scale-95 transition-all animate-in slide-in-from-bottom-10 fade-in duration-500 delay-300 whitespace-nowrap"
                  style={{ backgroundColor: uiConfig.failBtnBgColor, color: uiConfig.failBtnColor, backgroundImage: 'none', animationFillMode: "both" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onRetryLevel) onRetryLevel();
                  }}
                >
                  TRY AGAIN
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Gauges Area */}
      {/* Retro Gauges Area */}
      <div className={`absolute pointer-events-none transition-all duration-300 ${["ENDGAME", "LEVEL_COMPLETE", "LEVEL_FAILED", "IDLE", "KICKED"].includes(phase) ? "opacity-0 scale-90" : "opacity-100 scale-100"}`}
           style={{ 
             bottom: `${windowSize.h / 2 - (540 - uiConfig.dirBottom) * sceneScale}px`, 
             left: `${windowSize.w / 2 + uiConfig.gaugeX * sceneScale}px`, 
             transform: `translateX(-50%) scale(${uiConfig.gaugeScale * sceneScale})`, 
             transformOrigin: 'bottom center' 
           }}>
        
        <svg width="312" height="312" viewBox="0 0 200 200" className="drop-shadow-[0_0_10px_rgba(0,0,0,0.6)]">
          <defs>
            {/* The signature retro gradient from the image: Green -> Orange -> Red */}
            <linearGradient id="gaugeGradient" x1="0" y1="163" x2="0" y2="37" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#22c55e" />   {/* Green */}
              <stop offset="40%" stopColor="#facc15" />  {/* Yellow/Orange */}
              <stop offset="70%" stopColor="#ef4444" />  {/* Red */}
            </linearGradient>
          </defs>

          {/* ALL GAUGES are permanently visible during setup to act as a unified HUD */}
          <g style={{ opacity: 1.0, transition: 'opacity 0.2s' }}>
            
            {/* POWER GAUGE (Left Arc) */}
            <g style={{ transform: `translate(${uiConfig.pwrX}px, ${uiConfig.pwrY}px) scale(${uiConfig.pwrScale})`, transformOrigin: '100px 100px', transition: 'transform 0.1s' }}>
              {powerArcs.map((arc, i) => (
                <path key={`pbg-${i}`} d={arc.path} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="14" strokeLinecap="butt" />
              ))}
              {powerArcs.map((arc, i) => arc.active && (
                <path key={`pfg-${i}`} d={arc.path} fill="none" stroke="url(#gaugeGradient)" strokeWidth="14" strokeLinecap="butt" />
              ))}
            </g>

            {/* HEIGHT GAUGE (Right Arc) */}
            <g style={{ transform: `translate(${uiConfig.hgtX}px, ${uiConfig.hgtY}px) scale(${uiConfig.hgtScale})`, transformOrigin: '100px 100px', transition: 'transform 0.1s' }}>
              {heightArcs.map((arc, i) => (
                <path key={`hbg-${i}`} d={arc.path} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="14" strokeLinecap="butt" />
              ))}
              {heightArcs.map((arc, i) => arc.active && (
                <path key={`hfg-${i}`} d={arc.path} fill="none" stroke="url(#gaugeGradient)" strokeWidth="14" strokeLinecap="butt" />
              ))}
            </g>

            {/* CURVE GAUGE (Bottom Track) */}
            <g style={{ transform: `translate(${uiConfig.crvX}px, ${uiConfig.crvY}px) scale(${uiConfig.crvScale})`, transformOrigin: '100px 100px', transition: 'transform 0.1s' }}>
              {/* Main curved track */}
              <path d="M 60,140 A 56,56 0 0,0 140,140" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="8" strokeLinecap="round" />
              {/* Center tick */}
              <line x1="100" y1="156" x2="100" y2="164" stroke="rgba(255,255,255,0.4)" strokeWidth="3" />
              
              {/* Active Sweeping Needle */}
              {/* Angle: 135 deg to 45 deg mapped from curve (-1 to 1) */}
              <line 
                x1={100 + 46 * Math.cos((90 + (curve * -45)) * (Math.PI / 180))} 
                y1={100 + 46 * Math.sin((90 + (curve * -45)) * (Math.PI / 180))} 
                x2={100 + 66 * Math.cos((90 + (curve * -45)) * (Math.PI / 180))} 
                y2={100 + 66 * Math.sin((90 + (curve * -45)) * (Math.PI / 180))} 
                stroke="white" strokeWidth="4" strokeLinecap="round" className="drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]"
              />
            </g>

          </g>
        </svg>
      </div>
      </div>
      <audio id="swishAudio" src="/sound_effects/net_swish_impact_01.mp3" preload="auto" />
      <audio id="boingAudio" src="/sound_effects/boing_impact_01.mp3" preload="auto" />
        </>
      )}
    </>
  );
}
