import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { IScript } from "babylonjs-editor-tools";

export default class BallController implements IScript {
    private _startPosition!: Vector3;
    private _startRotation!: Quaternion;
    private _isKicked: boolean = false;
    private _timeSinceKick: number = 0;
    public hasHitGK: boolean = false;
    public hasHitEnvironment: boolean = false;
    public hasHitNet: boolean = false;
    public lastBoingTime: number = 0;
    
    public constructor(public mesh: Mesh) {}

    public onStart(): void {
        this._startPosition = this.mesh.position.clone();
        this._startRotation = this.mesh.rotationQuaternion ? this.mesh.rotationQuaternion.clone() : this.mesh.rotation.toQuaternion();
        (window as any).ballController = this;
    }

    private _outcomeRealized: boolean = false;
    private _outcomeDelay: number = 0;
    private _curveForce: number = 0;
    
    public setCurve(c: number): void {
        this._curveForce = c;
    }

    public onUpdate(): void {
        const gameManager = (window as any).gameManager;
        
        if (gameManager && gameManager.phase === "KICKED") {
            if (!this._isKicked) {
                this._isKicked = true;
                this._timeSinceKick = 0;
                this._outcomeRealized = false;
                this._outcomeDelay = 0;
                this.hasHitGK = false;
                this.hasHitEnvironment = false;
                this.hasHitNet = false;
                if ((window as any).setOutcomeText) (window as any).setOutcomeText(null);
            }
            
            const dt = this.mesh.getScene().getEngine().getDeltaTime() / 1000;
            this._timeSinceKick += dt;
            
            if (!this._outcomeRealized) {
                let outcome = null;
                
                // Apply curve force (Magnus effect)
                if (this.mesh.physicsBody && this._curveForce !== 0) {
                    const gameSettings = (window as any).gameSettings;
                    const curveMultiplier = gameSettings && gameSettings.curveForceMultiplier !== undefined ? gameSettings.curveForceMultiplier : 12.0;
                    
                    // Only apply curve if the ball is actually in the air (y > 0.2)
                    // Fade out the curve force after 1.5 seconds so it doesn't spin erratically forever
                    const heightFactor = this.mesh.position.y > 0.2 ? 1.0 : 0.0;
                    const fadeOut = Math.max(0, 1.0 - (this._timeSinceKick / 1.5));
                    
                    if (heightFactor > 0 && fadeOut > 0) {
                        const force = new Vector3(this._curveForce * curveMultiplier * fadeOut, 0, 0);
                        this.mesh.physicsBody.applyForce(force, this.mesh.getAbsolutePosition());
                    }
                }

                if (this.mesh.position.z > 10.0) {
                    // Passed goal line. Must be moving forwards to count as a goal (prevents outer net hits from behind counting)
                    if (this.mesh.position.x > -3.66 && this.mesh.position.x < 3.66 && this.mesh.position.y < 2.44) {
                        const isMovingForwards = this.mesh.physicsBody && this.mesh.physicsBody.getLinearVelocity().z > 0;
                        if (isMovingForwards) {
                            outcome = "GOAL!";
                        } else {
                            outcome = "MISS!";
                        }
                    } else {
                        outcome = "MISS!";
                    }
                } else if (this.hasHitGK && this.mesh.physicsBody && this.mesh.physicsBody.getLinearVelocity().z < 0) {
                    outcome = "SAVE!";
                } else if (this.hasHitEnvironment && this.mesh.physicsBody && this.mesh.physicsBody.getLinearVelocity().z < 0) {
                    outcome = "MISS!";
                } else if (this._timeSinceKick > 1.0) {
                    const vel = this.mesh.physicsBody?.getLinearVelocity().length() || 0;
                    if (vel < 0.3) {
                        // Ball nearly completely stopped
                        outcome = this.hasHitGK ? "SAVE!" : "MISS!";
                    } else if (this._timeSinceKick > 5.0) {
                        outcome = this.hasHitGK ? "SAVE!" : "MISS!";
                    }
                }

                if (outcome) {
                    this.triggerOutcome(outcome);
                }
            } else {
                this._outcomeDelay += dt;
                if (this._outcomeDelay > 2.0) {
                    this.resetBall();
                }
            }
        }
    }

    public triggerOutcome(outcome: string): void {
        if (!this._outcomeRealized) {
            this._outcomeRealized = true;
            const gameManager = (window as any).gameManager;
            if (gameManager) {
                gameManager.registerShot(outcome);
            }
            if ((window as any).setOutcomeText) (window as any).setOutcomeText(outcome);
            if (outcome === "GOAL!" && (window as any).shakeCamera) {
                (window as any).shakeCamera();
            }
        }
    }

    public resetBall(): void {
        this._isKicked = false;
        this.hasHitGK = false;
        this.hasHitEnvironment = false;
        
        // Reset physics
        if (this.mesh.physicsBody) {
            this.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
            this.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
        }
        
        // Reset Trail
        if ((window as any).resetTrail) {
            (window as any).resetTrail();
        }

        if (this.mesh.physicsBody) {
            this.mesh.physicsBody.disablePreStep = false;
            this.mesh.position.copyFrom(this._startPosition);
            if (this.mesh.rotationQuaternion) {
                this.mesh.rotationQuaternion.copyFrom(this._startRotation);
            }
            // Havok handles setTargetTransform to teleport the body
            this.mesh.physicsBody.setTargetTransform(this._startPosition, this._startRotation);
        } else {
            this.mesh.position.copyFrom(this._startPosition);
        }
        
        if ((window as any).setOutcomeText) {
            (window as any).setOutcomeText(null);
        }
        
        const gameManager = (window as any).gameManager;
        if (gameManager) {
            gameManager.resetRound();
        }
    }
}
