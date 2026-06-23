import React from "react";

interface MainMenuProps {
  onPlay: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onPlay }) => {
  return (
    <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden pointer-events-auto">
      {/* Background Image */}
      <div className="absolute inset-0 bg-black pointer-events-none" />
      <img 
        src="/main_menu/main_menu_background_01.png" 
        alt="Main Menu Background" 
        className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
        draggable="false"
      />
      
      {/* Overlay to ensure button pops (optional, but good for contrast) */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />

      {/* Play Button Container */}
      <div className="relative z-10 flex flex-col items-center justify-end h-full pb-16 md:pb-32 w-full">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className="group hover:scale-105 active:scale-95 transition-transform cursor-pointer drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] focus:outline-none"
        >
          <img 
            src="/main_menu/main_menu_play_game_button_01.png" 
            alt="New Game" 
            className="w-64 md:w-80 h-auto object-contain pointer-events-none"
            draggable="false"
          />
        </button>
      </div>
    </div>
  );
};
