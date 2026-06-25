import React from "react";

interface MainMenuProps {
  onPlay: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onPlay }) => {
  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black overflow-hidden pointer-events-auto">
      {/* 16:9 Container that scales to fit the screen perfectly */}
      <div 
        className="relative flex items-center justify-center"
        style={{ 
          width: '100%', 
          height: '100%', 
          maxHeight: '100vh', 
          maxWidth: 'calc(100vh * 16 / 9)', 
          aspectRatio: '16/9' 
        }}
      >
        {/* Background Image */}
        <img 
          src="/main_menu/main_menu_background_01.png" 
          alt="Main Menu Background" 
          className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
          draggable="false"
        />
        
        {/* Overlay to ensure button pops */}
        <div className="absolute inset-0 bg-black/10 pointer-events-none" />

        {/* Play Button Container - Positioned absolutely relative to the 16:9 frame */}
        <div className="absolute z-10 bottom-[12%] left-1/2 -translate-x-1/2 flex justify-center w-full">
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
              className="w-[28%] min-w-[150px] max-w-[300px] h-auto object-contain pointer-events-none"
              draggable="false"
            />
          </button>
        </div>
      </div>
    </div>
  );
};
