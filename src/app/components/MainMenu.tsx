import React, { useState, useEffect } from "react";

interface MainMenuProps {
  onPlay: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onPlay }) => {
  const [menuConfig, setMenuConfig] = useState<any>({});

  useEffect(() => {
    const checkMenuSettings = () => {
      if (typeof window !== "undefined" && (window as any).menuSettings) {
        setMenuConfig({ ...(window as any).menuSettings });
      }
    };
    checkMenuSettings();
    const interval = setInterval(checkMenuSettings, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black overflow-hidden pointer-events-auto">
      {/* Background Image filling the screen */}
      <img 
        src="/main_menu/main_menu_background_01.png" 
        alt="Main Menu Background" 
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
        style={{
          objectPosition: menuConfig.bgObjectPosition || 'center'
        }}
        draggable="false"
      />
      
      {/* Overlay to ensure button pops */}
      <div 
        className="absolute inset-0 pointer-events-none" 
        style={{ backgroundColor: `rgba(0,0,0,${menuConfig.bgDarken ?? 0.1})` }} 
      />

      {/* Play Button Container - Positioned relative to screen */}
      <div 
        className="absolute z-10 flex justify-center w-full" 
        style={{ bottom: `${menuConfig.playBtnBottom ?? 12}%` }}
      >
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="group hover:scale-105 active:scale-95 transition-transform cursor-pointer drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] focus:outline-none flex justify-center"
        >
          <img 
            src="/main_menu/main_menu_play_game_button_01.png" 
            alt="New Game" 
            className="h-auto object-contain pointer-events-none"
            style={{
              width: `${menuConfig.playBtnWidth ?? 30}vmin`,
              minWidth: `${menuConfig.playBtnMinWidth ?? 150}px`,
              maxWidth: `${menuConfig.playBtnMaxWidth ?? 400}px`
            }}
            draggable="false"
          />
        </button>
      </div>
    </div>
  );
};
