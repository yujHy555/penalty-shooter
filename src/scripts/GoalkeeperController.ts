import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { IScript, visibleAsNumber } from "babylonjs-editor-tools";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
export default class GoalkeeperController implements IScript {
    @visibleAsNumber("Speed Level 1", { min: 1, max: 20 })
    private _speedLvl1: number = 2.0;

    @visibleAsNumber("Speed Level 2", { min: 1, max: 20 })
    private _speedLvl2: number = 4.0;

    @visibleAsNumber("Speed Level 3", { min: 1, max: 20 })
    private _speedLvl3: number = 7.0;

    private _startPosition!: Vector3;
    private _targetX: number = 0;
    private _targetY: number = 0.8; // default, will be overwritten dynamically
    
    // Will be injected via page.tsx or editor
    public ball: Mesh | null = null;
    
    public constructor(public mesh: Mesh) {}

    public onStart(): void {
        this._startPosition = this.mesh.position.clone();
        (window as any).goalkeeperController = this;
        (window as any).resetGoalkeeper = () => this.reset();
    }

    public reset(): void {
        if (this._startPosition) {
            this.mesh.position.copyFrom(this._startPosition);
            this.mesh.position.y = 0.8 * this.mesh.scaling.y;
        }
        this._predicted = false;
        this._wrongWay = false;
        this._velocityY = 0;
        this._targetX = 0;
        this._targetY = 0.8 * this.mesh.scaling.y;
        this._isDustPlaying = false;
        if ((window as any).gkState) (window as any).gkState.isJumping = false;
    }

    private _predicted: boolean = false;
    private _lastBounceTime: number = 0;
    private _wrongWay: boolean = false;
    private _randomOffsetX: number = 0;
    private _randomOffsetY: number = 0;

    private _velocityY: number = 0;
    private _dustTriggered: boolean = false;
    private _dustFrame: number = 0;
    private _dustTimer: number = 0;
    private _isDustPlaying: boolean = false;
    private _maxJumpHeight: number = 0;


    public onUpdate(): void {
        if (!this.ball) {
            this.ball = this.mesh.getScene().getMeshByName("ball") as Mesh;
        }
        if (!this.ball) return;
        
        const gameManager = (window as any).gameManager;
        let speed = this._speedLvl1;
        
        if (gameManager) {
            if (gameManager.phase !== "KICKED") {
                // Return to center and ground when not kicked
                this._targetX = 0;
                this._targetY = 0.8 * this.mesh.scaling.y;
                this._predicted = false;
                if ((window as any).gkState) (window as any).gkState.isJumping = false;
            } else {
                if (gameManager.level === 1) speed = this._speedLvl1;
                else if (gameManager.level === 2) speed = this._speedLvl2;
                else speed = this._speedLvl3;
                
                // Predictive AI: Calculate where the ball will cross the goalkeeper plane (Z = 9.5)
                if (this.ball.physicsBody) {
                    const vel = this.ball.physicsBody.getLinearVelocity();
                    if (vel.z > 0.2) { // Allow predicting slow balls (e.g. < 50% power)
                        const timeToReachGoal = (9.5 - this.ball.position.z) / vel.z;
                        if (timeToReachGoal > 0) {
                            const aiSettings = (window as any).aiSettings;
                            const lvl = gameManager.level;
                            const wrongDiveProb = aiSettings ? aiSettings[`wrongDiveProbLvl${lvl}`] : 0;
                            const errorMarginX = aiSettings ? aiSettings[`predictionErrorLvl${lvl}`] : 0.5;
                            const errorMarginY = errorMarginX / 2.0;

                            let exactX = this.ball.position.x + (vel.x * timeToReachGoal);
                            
                            // Adjust for continuous curve acceleration!
                            const bc = (window as any).ballController;
                            if (bc && bc._curveForce !== 0) {
                                const gs = (window as any).gameSettings;
                                const curveMult = gs && gs.curveForceMultiplier !== undefined ? gs.curveForceMultiplier : 12.0;
                                const mass = this.ball.physicsBody?.getMassProperties().mass || 3.1;
                                const ax = (bc._curveForce * curveMult) / mass;
                                // Multiply by a dampening factor so the GK doesn't wildly over-predict due to the 1.5s fadeOut in BallController
                                exactX += 0.5 * (ax * 0.35) * timeToReachGoal * timeToReachGoal;
                            }
                            
                            // To keep the 'wrong way' decision consistent, only roll it once!
                            if (!this._predicted) {
                                this._wrongWay = Math.random() < wrongDiveProb;
                                this._randomOffsetX = (Math.random() - 0.5) * errorMarginX;
                                this._randomOffsetY = (Math.random() - 0.5) * errorMarginY;
                            }

                            if (this._wrongWay) {
                                exactX = -exactX;
                                if (!this._predicted) exactX += (Math.random() - 0.5) * 2.0;
                            }
                            
                            this._targetX = exactX + this._randomOffsetX;

                            // Predict Y height based on physics gravity
                            const gravityY = this.mesh.getScene().getPhysicsEngine()?.gravity.y || -14.0;
                            const exactY = this.ball.position.y + (vel.y * timeToReachGoal) + (0.5 * gravityY * timeToReachGoal * timeToReachGoal);
                            
                            const animSettings = (window as any).animSettings;
                            const maxJumpHeight = animSettings && animSettings.maxJumpHeight ? animSettings.maxJumpHeight : 1.5;
                            const groundY = 0.8 * this.mesh.scaling.y;
                            this._targetY = exactY + this._randomOffsetY;
                            this._targetY = Math.max(groundY, Math.min(maxJumpHeight, this._targetY)); // clamp target

                            // Calculate initial velocity ONLY ONCE to form a perfect parabolic jump arc
                            if (!this._predicted) {
                                const heightDiff = this._targetY - this.mesh.position.y;
                                if (heightDiff > 0.1 && timeToReachGoal > 0.1) {
                                    const jumpArcGravity = animSettings && animSettings.jumpArcGravity ? animSettings.jumpArcGravity : Math.abs(gravityY);
                                    this._velocityY = (heightDiff + 0.5 * jumpArcGravity * timeToReachGoal * timeToReachGoal) / timeToReachGoal;
                                } else {
                                    this._velocityY = 0;
                                }

                                this._predicted = true;
                                this._dustTriggered = false; // Reset so it fires when landing
                                this._maxJumpHeight = this.mesh.position.y; // Start tracking jump height
                                if ((window as any).gkState) {
                                    (window as any).gkState.isJumping = true;
                                    (window as any).gkState.isDivingLeft = this._targetX > 0;
                                }
                            }
                        }
                    }
                }
            }
        }

        this._targetX = Math.max(-4.0, Math.min(4.0, this._targetX));

        const currentX = this.mesh.position.x;
        const diffX = this._targetX - currentX;
        
        const dt = this.mesh.getScene().getEngine().getDeltaTime() / 1000;
        let moved = false;

        const animSettings = (window as any).animSettings;
        const jumpMultiplier = animSettings && animSettings.jumpSpeedMultiplier ? animSettings.jumpSpeedMultiplier : 1.0;
        const finalSpeed = speed * jumpMultiplier;

        // X-axis is a linear dash
        if (Math.abs(diffX) > 0.05) {
            const moveAmtX = Math.sign(diffX) * Math.min(finalSpeed * dt, Math.abs(diffX));
            this.mesh.position.x += moveAmtX;
            moved = true;
        }
        
        // Y-axis uses true kinematic physics (gravity) for a natural up-and-down arc
        const groundY = 0.8 * this.mesh.scaling.y;
        if (this._predicted) {
            const jumpArcGravity = animSettings && animSettings.jumpArcGravity ? animSettings.jumpArcGravity : Math.abs(this.mesh.getScene().getPhysicsEngine()?.gravity.y || -14.0);
            this._velocityY -= jumpArcGravity * dt;
            this.mesh.position.y += this._velocityY * dt;
            
            if (this.mesh.position.y > this._maxJumpHeight) {
                this._maxJumpHeight = this.mesh.position.y;
            }
            
            if (this.mesh.position.y <= groundY) {
                if (!this._dustTriggered) {
                    const threshold = animSettings?.landingJumpThreshold ?? 1.1; // Default to 1.1
                    const jumpHeight = this._maxJumpHeight - groundY;
                    if (jumpHeight >= threshold) {
                        this._triggerLandingDust();
                    }
                    this._dustTriggered = true;
                }
                this.mesh.position.y = groundY;
                this._velocityY = 0;
            }
            moved = true;
            
            // Revert to idle animation just before landing, or when finished sliding on the ground
            const isNearGround = this.mesh.position.y < (groundY + 0.3);
            const isFalling = this._velocityY < 0;
            const hasReachedX = Math.abs(diffX) <= 0.05;

            if ((isNearGround && isFalling) || (this.mesh.position.y <= groundY && hasReachedX)) {
                if ((window as any).gkState) (window as any).gkState.isJumping = false;
            }
        } else {
            // Return to ground smoothly when game resets
            if (this.mesh.position.y > groundY) {
                this.mesh.position.y -= finalSpeed * dt;
                if (this.mesh.position.y < groundY) this.mesh.position.y = groundY;
                moved = true;
            }
        }
        
        // Handle landing dust PNG sequence animation
        if (this._isDustPlaying) {
            const animSettings = (window as any).animSettings;
            const playbackRate = animSettings?.landingPlaybackRate ?? 1.0;
            // Base framerate: 30fps (approx 0.033s per frame)
            this._dustTimer += dt * playbackRate;
            
            if (this._dustTimer >= 0.033) {
                this._dustTimer = 0;
                this._dustFrame++;
                
                const landingDustPlane = (window as any).landingDustPlane;
                const landingDustTextures = (window as any).landingDustTextures;
                
                if (landingDustPlane && landingDustTextures && this._dustFrame < landingDustTextures.length) {
                    const tex = landingDustTextures[this._dustFrame];
                    if (tex && tex.isReady()) {
                        if (landingDustPlane.material) {
                            landingDustPlane.material.diffuseTexture = tex;
                            landingDustPlane.material.emissiveTexture = tex;
                        }
                    } else {
                        // Wait for texture to load, don't skip the frame
                        this._dustFrame--;
                    }
                } else {
                    // End of animation
                    this._isDustPlaying = false;
                    if (landingDustPlane) {
                        landingDustPlane.isVisible = false;
                    }
                }
            }
        }
        
        if (moved) {
            this.mesh.computeWorldMatrix(true);
            const gkBody = (window as any).gkBodyRef;
            if (gkBody && gkBody.physicsBody) {
                gkBody.computeWorldMatrix(true);
                gkBody.physicsBody.setTargetTransform(gkBody.getAbsolutePosition(), gkBody.absoluteRotationQuaternion);
            }
        }

    }

    private _triggerLandingDust() {
        console.log("GK Impact detected! Triggering landing dust...");
        const landingDustPlane = (window as any).landingDustPlane;
        const landingDustTextures = (window as any).landingDustTextures;
        const animSettings = (window as any).animSettings;

        if (landingDustPlane && landingDustTextures && animSettings) {
            const scale = animSettings.landingScale ?? 1.0;
            landingDustPlane.scaling.setAll(scale);

            const offsetX = animSettings.landingOffsetX ?? 0.0;
            const offsetY = animSettings.landingOffsetY ?? 0.0;
            
            landingDustPlane.position.x = this.mesh.position.x + offsetX;
            landingDustPlane.position.y = (2.5 * scale) + offsetY; // Center is 2.5 * scale above 0
            landingDustPlane.position.z = this.mesh.position.z - 0.5; // Slight forward offset so it doesn't clip into the body

            if (landingDustPlane.material) {
                landingDustPlane.material.alpha = animSettings.landingOpacity ?? 1.0;
                landingDustPlane.material.backFaceCulling = false;
            }

            if (landingDustPlane.material && landingDustTextures && landingDustTextures.length > 0) {
                landingDustPlane.material.diffuseTexture = landingDustTextures[0];
                landingDustPlane.material.emissiveTexture = landingDustTextures[0];
            }

            this._isDustPlaying = true;
            this._dustFrame = 0;
            this._dustTimer = 0;
            landingDustPlane.isVisible = true;

        } else {
            console.warn("Landing dust objects not found!");
        }
    }
}
