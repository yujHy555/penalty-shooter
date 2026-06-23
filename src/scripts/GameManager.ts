import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { IScript } from "babylonjs-editor-tools";

export default class GameManager implements IScript {
    public level: number = 1;
    public score: number = 0; // Total goals across all levels
    public phase: string = "IDLE";
    
    // Track 5 shots for the current level
    public shots: ("GOAL!" | "MISS!" | "SAVE!" | null)[] = [null, null, null, null, null];
    public currentShotIndex: number = 0;
    
    // Callback to React UI
    public onStateChange: (phase: string, level: number, score: number, shots: (string | null)[]) => void = () => {};
    public onOutcome: (text: string | null) => void = () => {};

    public constructor(public mesh: Mesh) {}

    public onStart(): void {
        // Set global reference for page.tsx to hook into
        (window as any).gameManager = this;
        this.notifyState();
    }

    public onUpdate(): void {}

    public setPhase(newPhase: string) {
        this.phase = newPhase;
        if (newPhase === "IDLE") {
            try { if ((window as any).resetBall) (window as any).resetBall(); } catch(e) { alert("resetBall error: " + e); }
            try { if ((window as any).resetGoalkeeper) (window as any).resetGoalkeeper(); } catch(e) { alert("resetGoalkeeper error: " + e); }
            try { if ((window as any).resetTrail) (window as any).resetTrail(); } catch(e) { alert("resetTrail error: " + e); }
        }
        this.notifyState();
    }

    public registerShot(outcome: "GOAL!" | "MISS!" | "SAVE!") {
        if (this.currentShotIndex < 5) {
            this.shots[this.currentShotIndex] = outcome;
            this.currentShotIndex++;
            
            if (outcome === "GOAL!") {
                this.score++;
                if ((window as any).triggerCrowdJump) {
                    (window as any).triggerCrowdJump();
                }
                if (this.level === 3 && this.shots.filter(s => s === "GOAL!").length === 3) {
                    if ((window as any).triggerConfetti) {
                        (window as any).triggerConfetti();
                    }
                }
            }
        }
        this.notifyState();
    }

    public resetRound() {
        if (this.currentShotIndex >= 5) {
            let goalsThisRound = 0;
            for (const shot of this.shots) {
                if (shot === "GOAL!") goalsThisRound++;
            }
            
            if (goalsThisRound >= 3) {
                if (this.level < 3) {
                    this.setPhase("LEVEL_COMPLETE");
                } else {
                    // Finished level 3, game over!
                    this.setPhase("ENDGAME");
                }
            } else {
                // Failed to score 3 goals!
                this.score -= goalsThisRound; // Remove the goals they scored this round
                if ((window as any).setOutcomeText) {
                    (window as any).setOutcomeText(null);
                }
                this.setPhase("LEVEL_FAILED");
            }
        } else {
            // Not end of round yet, just move to next shot
            this.setPhase("IDLE");
        }
    }

    public advanceLevel() {
        if (this.level < 3) {
            this.level++;
        }
        this.shots = [null, null, null, null, null];
        this.currentShotIndex = 0;
        this.setPhase("IDLE");
        if ((window as any).updateLawn) (window as any).updateLawn();
        if ((window as any).updateGkScale) (window as any).updateGkScale();
        if ((window as any).updateCrowd) (window as any).updateCrowd();
        if ((window as any).updateClouds) (window as any).updateClouds();
    }

    public retryLevel() {
        // Score was already decremented in resetRound, just reset board
        this.shots = [null, null, null, null, null];
        this.currentShotIndex = 0;
        this.setPhase("IDLE");
    }

    public resetGame() {
        this.level = 1;
        this.score = 0;
        this.shots = [null, null, null, null, null];
        this.currentShotIndex = 0;
        this.setPhase("IDLE");
        if ((window as any).updateLawn) (window as any).updateLawn();
        if ((window as any).updateGkScale) (window as any).updateGkScale();
        if ((window as any).updateCrowd) (window as any).updateCrowd();
        if ((window as any).updateClouds) (window as any).updateClouds();
    }

    private notifyState() {
        if (this.onStateChange) {
            this.onStateChange(this.phase, this.level, this.score, this.shots);
        }
    }
}
