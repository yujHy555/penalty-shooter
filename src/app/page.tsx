"use client";

import { useEffect, useRef, useState } from "react";
import GUI from "lil-gui";

import { Scene } from "@babylonjs/core/scene";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SceneLoaderFlags } from "@babylonjs/core/Loading/sceneLoaderFlags";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

import HavokPhysics from "@babylonjs/havok";

import "@babylonjs/core/Loading/loadingScreen";
import "@babylonjs/core/Loading/Plugins/babylonFileLoader";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

import "@babylonjs/core/Cameras/universalCamera";

import "@babylonjs/core/Meshes/groundMesh";

import "@babylonjs/core/Lights/directionalLight";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { TrailMesh } from "@babylonjs/core/Meshes/trailMesh";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/core/XR/features/WebXRDepthSensing";

import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";

import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";

import "@babylonjs/core/Physics";

import "@babylonjs/materials/sky";

import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { loadScene } from "babylonjs-editor-tools";

import { GameUI, KickPhase, KickParams } from "./components/GameUI";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics/v2";

/**
 * We import the map of all scripts attached to objects in the editor.
 */
import GameManager from "../scripts/GameManager";
import BallController from "../scripts/BallController";
import GoalkeeperController from "../scripts/GoalkeeperController";
import { createNetMaterial } from "../scripts/NetShaderMaterial";
import { Sound } from "@babylonjs/core/Audio/sound";

// Global reference to the ball mesh so the UI can communicate with it
let ballMeshRef: any = null;
let gameManagerRef: any = null;

export default function Home() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	
	// Game UI State
	const [phase, setPhase] = useState<KickPhase>("IDLE");
	const [level, setLevel] = useState(1);
	const [score, setScore] = useState(0);
	const [shots, setShots] = useState<(string | null)[]>([null, null, null, null, null]);

	useEffect(() => {
		if (!canvasRef.current) {
			return;
		}

		const engine = new Engine(canvasRef.current, true, {
			stencil: true,
			antialias: true,
			audioEngine: true,
			adaptToDeviceRatio: true,
			powerPreference: "high-performance",
		});

		const scene = new Scene(engine);

		handleLoad(engine, scene).then(() => {
			// Hook up game manager state to React state
			if (gameManagerRef) {
				gameManagerRef.onStateChange = (newPhase: string, newLevel: number, newScore: number, newShots: (string | null)[]) => {
					setPhase(newPhase as KickPhase);
					setLevel((prevLevel) => {
						if (prevLevel !== newLevel) {
							// Level changed! Trigger visual updates
							if ((window as any).updateLawn) (window as any).updateLawn();
							if ((window as any).updateSky) (window as any).updateSky();
							if ((window as any).updateBallTexture) (window as any).updateBallTexture();
						}
						return newLevel;
					});
					setScore(newScore);
					setShots([...newShots]); // clone array to trigger re-render
				};
			}
		});

		let listener: () => void;
		window.addEventListener("resize", listener = () => {
			engine.resize();
		});

		return () => {
			if ((window as any).debugGUI) {
				(window as any).debugGUI.destroy();
				(window as any).debugGUI = null;
			}
			scene.dispose();
			engine.dispose();
			window.removeEventListener("resize", listener);
		};
	}, [canvasRef]);

	async function handleLoad(engine: Engine, scene: Scene) {
		// 1. Initialize Physics (Havok)
		const havok = await HavokPhysics();
		// Gravity set to Earth normal (assuming 1 unit = 1 meter)
		scene.enablePhysics(new Vector3(0, -14.0, 0), new HavokPlugin(true, havok));

		// 2. Setup Camera & Light
		const camera = new FreeCamera("camera1", new Vector3(0, 0.5, -4), scene);
		camera.rotation.x = 0.1;
		camera.setTarget(Vector3.Zero());
		camera.attachControl(canvasRef.current, true);

		// Developer GUI
		const gui = new GUI({ title: 'Developer / Debug' });
		(window as any).debugGUI = gui;

		const cameraFolder = gui.addFolder('Camera');
		cameraFolder.add(camera, 'fov', 0.1, 2.0).step(0.01).name('FOV').listen();
		cameraFolder.add(camera.position, 'x').step(0.1).name('Pos X').listen();
		cameraFolder.add(camera.position, 'y').step(0.1).name('Pos Y').listen();
		cameraFolder.add(camera.position, 'z').step(0.1).name('Pos Z').listen();
		// Since FreeCamera uses a target or rotation depending on input, exposing rotation directly
		cameraFolder.add(camera.rotation, 'x').step(0.01).name('Pitch (X)').listen();
		cameraFolder.add(camera.rotation, 'y').step(0.01).name('Yaw (Y)').listen();
		cameraFolder.add(camera.rotation, 'z').step(0.01).name('Roll (Z)').listen();

		(window as any).cameraSettings = { fov: 0.8, posX: 0, posY: 0.5, posZ: -4, pitchX: 0.1, yawY: 0, rollZ: 0, shakeIntensity: 0.05, shakeSpeed: 50, shakeDuration: 0.8 };
		cameraFolder.add((window as any).cameraSettings, 'shakeIntensity', 0.0, 0.5).step(0.01).name('Shake Intensity').listen();
		cameraFolder.add((window as any).cameraSettings, 'shakeSpeed', 1, 100).step(1).name('Shake Speed').listen();
		cameraFolder.add((window as any).cameraSettings, 'shakeDuration', 0.1, 2.0).step(0.1).name('Shake Duration').listen();

		let shakeTime = 0;
		let isShaking = false;
		const baseFov = camera.fov;
		
		(window as any).shakeCamera = () => {
			shakeTime = 0;
			isShaking = true;
		};

		scene.onBeforeRenderObservable.add(() => {
			if (isShaking) {
				const dt = engine.getDeltaTime();
				shakeTime += dt;
				const elapsed = shakeTime / 1000;
				const duration = (window as any).cameraSettings.shakeDuration || 0.5;
				const decay = Math.max(0, 1 - elapsed / duration);
				if (decay <= 0) {
					isShaking = false;
					camera.fov = baseFov;
				} else {
					const intensity = (window as any).cameraSettings.shakeIntensity || 0.05;
					const speed = (window as any).cameraSettings.shakeSpeed || 50;
					camera.fov = baseFov + Math.sin(elapsed * speed) * intensity * decay;
				}
			}
		});

		(window as any).uiSettings = {
			levelScale: 1.0, levelOpacity: 1.0, levelTop: 16, levelLeft: 16,
			scoreScale: 1.0, scoreOpacity: 1.0, scoreTop: 16, scoreRight: 16,
			sbScale: 1.65, sbOpacity: 1.0, sbTop: 80, sbLeft: 16,
			centerScale: 0.5, centerOpacity: 1.0, centerTop: 208,
			outcomeScale: 1.7, outcomeOpacity: 1.0, outcomeTop: 120,
			dirScale: 1.0, dirOpacity: 1.0, dirBottom: -1000,
			pwrScale: 1.0, pwrOpacity: 1.0, pwrBottom: -1000,
			hgtScale: 1.0, hgtOpacity: 1.0, hgtBottom: -1000,
			crvScale: 1.0, crvOpacity: 1.0, crvBottom: -1000,
		};

		(window as any).audioSettings = { kickVolume: 0.6, netSwishVolume: 1.0, boingVolume: 1.0 };
		const audioFolder = gui.addFolder('Audio Settings');
		audioFolder.add((window as any).audioSettings, 'kickVolume', 0.0, 1.0).step(0.1).name('Kick Volume').listen();
		audioFolder.add((window as any).audioSettings, 'netSwishVolume', 0.0, 1.0).step(0.1).name('Net Swish Volume').listen();
		audioFolder.add((window as any).audioSettings, 'boingVolume', 0.0, 1.0).step(0.1).name('Boing Volume').listen();

		const uiFolder = gui.addFolder('UI Elements');
		
		const levelFolder = uiFolder.addFolder('Level Badge');
		levelFolder.add((window as any).uiSettings, 'levelScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		levelFolder.add((window as any).uiSettings, 'levelOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		levelFolder.add((window as any).uiSettings, 'levelTop', -1000, 2000).step(1).name('Y Offset').listen();
		levelFolder.add((window as any).uiSettings, 'levelLeft', -1000, 2000).step(1).name('X Offset').listen();

		const scoreFolder = uiFolder.addFolder('Score Badge');
		scoreFolder.add((window as any).uiSettings, 'scoreScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		scoreFolder.add((window as any).uiSettings, 'scoreOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		scoreFolder.add((window as any).uiSettings, 'scoreTop', -1000, 2000).step(1).name('Y Offset').listen();
		scoreFolder.add((window as any).uiSettings, 'scoreRight', -1000, 2000).step(1).name('X Offset (Right)').listen();

		const sbFolder = uiFolder.addFolder('Scoreboard (Shots)');
		sbFolder.add((window as any).uiSettings, 'sbScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		sbFolder.add((window as any).uiSettings, 'sbOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		sbFolder.add((window as any).uiSettings, 'sbTop', -1000, 2000).step(1).name('Y Offset').listen();
		sbFolder.add((window as any).uiSettings, 'sbLeft', -1000, 2000).step(1).name('X Offset').listen();

		const centerFolder = uiFolder.addFolder('Center Instruction Text');
		centerFolder.add((window as any).uiSettings, 'centerScale', 0.1, 5.0).step(0.05).name('Scale').listen();
		centerFolder.add((window as any).uiSettings, 'centerOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		centerFolder.add((window as any).uiSettings, 'centerTop', -1000, 2000).step(1).name('Y Offset').listen();

		const outcomeFolder = uiFolder.addFolder('Outcome Text');
		outcomeFolder.add((window as any).uiSettings, 'outcomeScale', 0.1, 10.0).step(0.05).name('Scale').listen();
		outcomeFolder.add((window as any).uiSettings, 'outcomeOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		outcomeFolder.add((window as any).uiSettings, 'outcomeTop', -5000, 5000).step(1).name('Y Offset').listen();

		const dirFolder = uiFolder.addFolder('Direction Gauge');
		dirFolder.add((window as any).uiSettings, 'dirScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		dirFolder.add((window as any).uiSettings, 'dirOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		dirFolder.add((window as any).uiSettings, 'dirBottom', -1000, 2000).step(1).name('Y Offset (Bottom)').listen();

		const pwrFolder = uiFolder.addFolder('Power Gauge');
		pwrFolder.add((window as any).uiSettings, 'pwrScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		pwrFolder.add((window as any).uiSettings, 'pwrOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		pwrFolder.add((window as any).uiSettings, 'pwrBottom', -1000, 2000).step(1).name('Y Offset (Bottom)').listen();

		const hgtFolder = uiFolder.addFolder('Height Gauge');
		hgtFolder.add((window as any).uiSettings, 'hgtScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		hgtFolder.add((window as any).uiSettings, 'hgtOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		hgtFolder.add((window as any).uiSettings, 'hgtBottom', -1000, 2000).step(1).name('Y Offset (Bottom)').listen();

		const crvFolder = uiFolder.addFolder('Curve Gauge');
		crvFolder.add((window as any).uiSettings, 'crvScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		crvFolder.add((window as any).uiSettings, 'crvOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		crvFolder.add((window as any).uiSettings, 'crvBottom', -1000, 2000).step(1).name('Y Offset (Bottom)').listen();

		(window as any).gameSettings = { ballMass: 3.1, sceneGravity: -14.0, kickPowerMultiplier: 0.9, kickHeightMultiplier: 1.0, curveForceMultiplier: 8.0, netBulgeMultiplier: 1.2, netImpactRadius: 2.4, rippleAmplitude: 0.4, rippleSpeed: 9.0, signboardBounciness: 0.6, signboardFriction: 0.5 };
		const gameFolder = gui.addFolder('Game Physics & Rules');
		gameFolder.add((window as any).gameSettings, 'ballMass', 0.1, 5.0).step(0.1).name('Ball Mass').onChange((v: number) => {
			if ((window as any).ballMeshRef && (window as any).ballMeshRef.physicsBody) {
				(window as any).ballMeshRef.physicsBody.setMassProperties({ mass: v });
			}
		});
		gameFolder.add((window as any).gameSettings, 'sceneGravity', -30.0, 0.0).step(1.0).name('World Gravity').onChange((v: number) => {
			scene.getPhysicsEngine()?.setGravity(new Vector3(0, v, 0));
		});
		gameFolder.add((window as any).gameSettings, 'kickPowerMultiplier', 0.1, 3.0).step(0.1).name('Kick Power').listen();
		gameFolder.add((window as any).gameSettings, 'kickHeightMultiplier', 0.1, 3.0).step(0.1).name('Kick Height').listen();
		gameFolder.add((window as any).gameSettings, 'curveForceMultiplier', 0.0, 30.0).step(1.0).name('Curve Force').listen();
		gameFolder.add((window as any).gameSettings, 'netBulgeMultiplier', 0.0, 5.0).step(0.1).name('Net Bulge Multiplier').listen();
		gameFolder.add((window as any).gameSettings, 'netImpactRadius', 0.0, 5.0).step(0.1).name('Net Impact Radius').listen();
		gameFolder.add((window as any).gameSettings, 'rippleAmplitude', 0.0, 2.0).step(0.05).name('Net Ripple Amplitude').listen();
		gameFolder.add((window as any).gameSettings, 'rippleSpeed', 1.0, 50.0).step(1.0).name('Net Ripple Speed').listen();
		
		gameFolder.add((window as any).gameSettings, 'signboardBounciness', 0.0, 1.0).step(0.05).name('Signboard Bounciness').onChange((v: number) => {
			if ((window as any).signboardRef && (window as any).signboardRef.physicsBody) {
				(window as any).signboardRef.physicsBody.dispose();
				new PhysicsAggregate((window as any).signboardRef, PhysicsShapeType.BOX, { mass: 0, restitution: v, friction: (window as any).gameSettings.signboardFriction }, scene);
			}
		});
		gameFolder.add((window as any).gameSettings, 'signboardFriction', 0.0, 1.0).step(0.05).name('Signboard Friction').onChange((v: number) => {
			if ((window as any).signboardRef && (window as any).signboardRef.physicsBody) {
				(window as any).signboardRef.physicsBody.dispose();
				new PhysicsAggregate((window as any).signboardRef, PhysicsShapeType.BOX, { mass: 0, restitution: (window as any).gameSettings.signboardBounciness, friction: v }, scene);
			}
		});

		(window as any).animSettings = { 
			idleFPS: 12, 
			jumpSpeedMultiplier: 3.0, 
			jumpArcGravity: 50.0, 
			maxJumpHeight: 1.3,
			gkSize: 1.0
		};
		const animFolder = gui.addFolder('Goalkeeper Tuning');
		animFolder.add((window as any).animSettings, 'idleFPS', 1, 30).step(1).name('Idle Anim FPS').listen();
		animFolder.add((window as any).animSettings, 'jumpSpeedMultiplier', 0.1, 3.0).step(0.1).name('Jump Speed').listen();
		animFolder.add((window as any).animSettings, 'jumpArcGravity', 5.0, 50.0).step(1.0).name('Jump Arc Gravity').listen();
		animFolder.add((window as any).animSettings, 'maxJumpHeight', 1.0, 4.0).step(0.1).name('Max Jump Height').listen();
		
		animFolder.add((window as any).animSettings, 'gkSize', 0.5, 3.0).step(0.05).name('Goalkeeper Size').onChange((v: number) => {
			if ((window as any).gkParentRef && (window as any).gkBodyRef) {
				const parent = (window as any).gkParentRef;
				const body = (window as any).gkBodyRef;
				parent.scaling.setAll(v);
				if (body.physicsBody) {
					body.physicsBody.dispose();
					// Recreate physics shape to match new visual scale propagated from parent
					new PhysicsAggregate(body, PhysicsShapeType.CAPSULE, { mass: 0, restitution: 0.0, friction: 0.8 }, scene);
				}
			}
		}).listen();

		(window as any).aiSettings = {
			wrongDiveProbLvl1: 0.55,
			predictionErrorLvl1: 2.1,
			wrongDiveProbLvl2: 0.45,
			predictionErrorLvl2: 1.2,
			wrongDiveProbLvl3: 0.40,
			predictionErrorLvl3: 0.2,
		};
		const aiFolder = gui.addFolder('Goalkeeper AI Difficulty');
		const lvl1 = aiFolder.addFolder('Level 1');
		lvl1.add((window as any).aiSettings, 'wrongDiveProbLvl1', 0, 1).step(0.05).name('Wrong Way %');
		lvl1.add((window as any).aiSettings, 'predictionErrorLvl1', 0, 5).step(0.1).name('Prediction Error');
		const lvl2 = aiFolder.addFolder('Level 2');
		lvl2.add((window as any).aiSettings, 'wrongDiveProbLvl2', 0, 1).step(0.05).name('Wrong Way %');
		lvl2.add((window as any).aiSettings, 'predictionErrorLvl2', 0, 5).step(0.1).name('Prediction Error');
		const lvl3 = aiFolder.addFolder('Level 3');
		lvl3.add((window as any).aiSettings, 'wrongDiveProbLvl3', 0, 1).step(0.05).name('Wrong Way %');
		lvl3.add((window as any).aiSettings, 'predictionErrorLvl3', 0, 5).step(0.1).name('Prediction Error');



		(window as any).colliderSettings = {
			showColliders: false,
			gkRadius: 0.3,
			netDepth: 0.1,
			postDiameter: 0.12,
			ballDiameter: 0.24,
			fieldThickness: 1.0,
			visualYOffset: -0.12
		};
		const colliderFolder = gui.addFolder('Collider Tuning');
		colliderFolder.add((window as any).colliderSettings, 'showColliders').name('Show Colliders').onChange((v: boolean) => {
			const collMat = scene.getMaterialByName("collMat") as StandardMaterial;
			if (collMat) collMat.alpha = v ? 0.4 : 0;
			const gkBody = scene.getMeshByName("goalkeeperBody");
			if (gkBody) gkBody.visibility = v ? 0.4 : 0;
			
			const postMat = scene.getMaterialByName("postMat") as StandardMaterial;
			if (postMat) postMat.wireframe = v;
			
			const groundMat = scene.getMaterialByName("groundMat") as StandardMaterial;
			if (groundMat) groundMat.wireframe = v;
			
			const ballMat = scene.getMaterialByName("ballMat") as StandardMaterial;
			if (ballMat) ballMat.wireframe = v;
		});

		colliderFolder.add((window as any).colliderSettings, 'ballDiameter', 0.1, 1.0).name('Ball Size').onChange((v: number) => {
			const b = scene.getMeshByName("ball");
			if (b) {
				const scale = v / 0.24;
				b.scaling.setAll(scale);
				if (b.physicsBody) {
					b.physicsBody.dispose();
					new PhysicsAggregate(b, PhysicsShapeType.SPHERE, { mass: 0.8, restitution: 0.3, friction: 0.8 }, scene);
					b.physicsBody.setLinearDamping(0.4);
					b.physicsBody.setAngularDamping(0.8);
					b.physicsBody.setCollisionCallbackEnabled(true);
				}
			}
		});
		colliderFolder.add((window as any).colliderSettings, 'visualYOffset', -0.5, 0.5).step(0.01).name('Visual Y Offset').onChange((v: number) => {
			if ((window as any).visualBallRoot) {
				(window as any).visualBallRoot.position.y = v;
			}
		});

		colliderFolder.add((window as any).colliderSettings, 'postDiameter', 0.05, 0.5).name('Post Size').onChange((v: number) => {
			const scale = v / 0.12;
			["leftPost", "rightPost", "crossBar"].forEach(name => {
				const p = scene.getMeshByName(name);
				if (p) {
					p.scaling.x = scale;
					p.scaling.z = scale;
					if (p.physicsBody) {
						p.physicsBody.dispose();
						new PhysicsAggregate(p, PhysicsShapeType.MESH, { mass: 0, restitution: 0.6, friction: 0.5 }, scene);
					}
				}
			});
		});

		colliderFolder.add((window as any).colliderSettings, 'netDepth', 0.1, 3.0).name('Net Depth').onChange((v: number) => {
			["colBack", "colTop", "colLeft", "colRight"].forEach(name => {
				const c = scene.getMeshByName(name);
				if (c) {
					c.scaling.z = v;
					if (c.physicsBody) {
						c.physicsBody.dispose();
						new PhysicsAggregate(c, PhysicsShapeType.BOX, { mass: 0, restitution: 0.0, friction: 0.8 }, scene);
					}
				}
			});
		});

		colliderFolder.add((window as any).colliderSettings, 'fieldThickness', 0.1, 5.0).name('Field Thickness').onChange((v: number) => {
			const g = scene.getMeshByName("ground");
			if (g) {
				g.scaling.y = v;
				g.position.y = -(v / 2);
				if (g.physicsBody) {
					g.physicsBody.dispose();
					new PhysicsAggregate(g, PhysicsShapeType.BOX, { mass: 0, restitution: 0.5, friction: 0.8 }, scene);
				}
			}
		});

		colliderFolder.add((window as any).colliderSettings, 'gkRadius', 0.1, 1.0).name('GK Capsule Radius').onChange((v: number) => {
			const gk = scene.getMeshByName("goalkeeperBody");
			if (gk) {
				const scale = v / 0.3;
				gk.scaling.x = scale;
				gk.scaling.z = scale;
				if (gk.physicsBody) {
					gk.physicsBody.dispose();
					new PhysicsAggregate(gk, PhysicsShapeType.CAPSULE, { mass: 0, restitution: 0.6, friction: 0.8 }, scene);
					gk.physicsBody.disablePreStep = false;
				}
			}
		});

		// Field Appearance UI
		(window as any).fieldSettings = {
			lvl1Light: "#a3d27f", lvl1Dark: "#b1df90",
			lvl2Light: "#f0a3ff", lvl2Dark: "#f56bff",
			lvl3Light: "#ffb98a", lvl3Dark: "#ffc7a8",
			stripeSize: 2 
		};
		const updateLawn = () => {
			if ((window as any).lawnCtx && (window as any).lawnTex) {
				const ctx = (window as any).lawnCtx;
				const level = (window as any).gameManager?.level || 1;
				
				let lightColor, darkColor;
				if (level === 1) {
					lightColor = (window as any).fieldSettings.lvl1Light;
					darkColor = (window as any).fieldSettings.lvl1Dark;
				} else if (level === 2) {
					lightColor = (window as any).fieldSettings.lvl2Light;
					darkColor = (window as any).fieldSettings.lvl2Dark;
				} else {
					lightColor = (window as any).fieldSettings.lvl3Light;
					darkColor = (window as any).fieldSettings.lvl3Dark;
				}

				ctx.fillStyle = lightColor;
				ctx.fillRect(0, 0, 16, 256);
				ctx.fillStyle = darkColor;
				ctx.fillRect(0, 256, 16, 256);
				(window as any).lawnTex.update();
			}
		};
		(window as any).updateLawn = updateLawn;
		const fieldFolder = gui.addFolder('Field Appearance');
		
		const f1Folder = fieldFolder.addFolder('Level 1 Field');
		f1Folder.addColor((window as any).fieldSettings, 'lvl1Light').name('Light Grass').onChange(updateLawn);
		f1Folder.addColor((window as any).fieldSettings, 'lvl1Dark').name('Dark Grass').onChange(updateLawn);

		const f2Folder = fieldFolder.addFolder('Level 2 Field');
		f2Folder.addColor((window as any).fieldSettings, 'lvl2Light').name('Light Grass').onChange(updateLawn);
		f2Folder.addColor((window as any).fieldSettings, 'lvl2Dark').name('Dark Grass').onChange(updateLawn);

		const f3Folder = fieldFolder.addFolder('Level 3 Field');
		f3Folder.addColor((window as any).fieldSettings, 'lvl3Light').name('Light Grass').onChange(updateLawn);
		f3Folder.addColor((window as any).fieldSettings, 'lvl3Dark').name('Dark Grass').onChange(updateLawn);

		fieldFolder.add((window as any).fieldSettings, 'stripeSize', 0.5, 5, 0.1).name('Stripe Size (m)').onChange((v: number) => {
			if ((window as any).lawnTex) {
				(window as any).lawnTex.vScale = 40 / (v * 2); // 40 is field depth
			}
		});

		// Settings Manager (LocalStorage integration)
		const settingsManager = {
			saveLocal: () => {
				localStorage.setItem('game_debug_settings', JSON.stringify({
					cameraPos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
					cameraRot: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
					uiSettings: (window as any).uiSettings,
					animSettings: (window as any).animSettings,
					gameSettings: (window as any).gameSettings
				}));
				alert('Settings saved to local storage! They will now persist across reloads.');
			},
			clearLocal: () => {
				localStorage.removeItem('game_debug_settings');
				alert('Saved settings cleared. Reloading page to apply hardcoded defaults.');
				window.location.reload();
			},
			printToConsole: () => {
				console.log("Current Settings JSON (Paste this to the developer if you want them hardcoded):");
				console.log(JSON.stringify((window as any).debugGUI.save()));
				alert('Settings printed to browser console!');
			}
		};

		const saveFolder = gui.addFolder('💾 Save / Export');
		saveFolder.add(settingsManager, 'saveLocal').name('Save to LocalStorage');
		saveFolder.add(settingsManager, 'clearLocal').name('Reset to Defaults');
		saveFolder.add(settingsManager, 'printToConsole').name('Print to Console');

		// Load from local storage immediately to override the defaults
		const savedJSON = localStorage.getItem('game_debug_settings');
		if (savedJSON) {
			try {
				const saved = JSON.parse(savedJSON);
				camera.position.set(saved.cameraPos.x, saved.cameraPos.y, saved.cameraPos.z);
				camera.rotation.set(saved.cameraRot.x, saved.cameraRot.y, saved.cameraRot.z);
				Object.assign((window as any).uiSettings, saved.uiSettings);
				Object.assign((window as any).animSettings, saved.animSettings);
				if (saved.gameSettings) Object.assign((window as any).gameSettings, saved.gameSettings);
				
				// Apply physics right away
				scene.getPhysicsEngine()?.setGravity(new Vector3(0, (window as any).gameSettings.sceneGravity, 0));
				scene.getPhysicsEngine()?.setSubTimeStep(1000 / 120); // 120Hz physics to prevent tunneling
			} catch (e) {
				console.error("Failed to parse saved settings", e);
			}
		}

		const light = new HemisphericLight("light1", new Vector3(0, 1, 0), scene);
		light.intensity = 0.7;

		// 3. Programmatic Scene Generation (Placeholders)
		
		// Ground
		const ground = MeshBuilder.CreateBox("ground", { width: 30, height: 1.0, depth: 40 }, scene);
		ground.position.y = -0.5; // Ensure top surface is precisely at y=0
		
		const groundMat = new StandardMaterial("groundMat", scene);
		const lawnTex = new DynamicTexture("lawnTex", {width: 16, height: 512}, scene, false);
		(window as any).lawnTex = lawnTex;
		(window as any).lawnCtx = lawnTex.getContext();
		
		updateLawn(); // Draw initial colors
		
		lawnTex.wrapU = Texture.WRAP_ADDRESSMODE;
		lawnTex.wrapV = Texture.WRAP_ADDRESSMODE;
		lawnTex.vScale = 40 / ((window as any).fieldSettings.stripeSize * 2);
		lawnTex.uScale = 1;
		
		groundMat.diffuseTexture = lawnTex;
		groundMat.emissiveTexture = lawnTex;
		groundMat.disableLighting = true; 
		ground.material = groundMat;
		new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, restitution: 0.5, friction: 0.8 }, scene);

		// Goal Posts (Placeholder)
		const goalWidth = 7.32;
		const goalHeight = 2.44;
		const postMat = new StandardMaterial("postMat", scene);
		postMat.emissiveColor = new Color3(1, 1, 1);
		postMat.disableLighting = true;

		const leftPost = MeshBuilder.CreateCylinder("leftPost", { height: goalHeight, diameter: 0.12 }, scene);
		leftPost.position = new Vector3(-goalWidth / 2, goalHeight / 2, 10);
		leftPost.material = postMat;
		new PhysicsAggregate(leftPost, PhysicsShapeType.MESH, { mass: 0, restitution: 0.6, friction: 0.5 }, scene);

		const rightPost = MeshBuilder.CreateCylinder("rightPost", { height: goalHeight, diameter: 0.12 }, scene);
		rightPost.position = new Vector3(goalWidth / 2, goalHeight / 2, 10);
		rightPost.material = postMat;
		new PhysicsAggregate(rightPost, PhysicsShapeType.MESH, { mass: 0, restitution: 0.6, friction: 0.5 }, scene);

		const crossBar = MeshBuilder.CreateCylinder("crossBar", { height: goalWidth, diameter: 0.12 }, scene);
		crossBar.rotation.z = Math.PI / 2;
		crossBar.position = new Vector3(0, goalHeight, 10);
		crossBar.material = postMat;
		new PhysicsAggregate(crossBar, PhysicsShapeType.MESH, { mass: 0, restitution: 0.6, friction: 0.5 }, scene);

		// Goal Net (Visual)
		const netMat = createNetMaterial("netMat", scene);
		
		// Back
		const netBack = MeshBuilder.CreateGround("netBack", { width: goalWidth, height: goalHeight, subdivisions: 20 }, scene);
		netBack.rotation.x = -Math.PI / 2;
		netBack.position = new Vector3(0, goalHeight / 2, 11);

		// Top
		const netTop = MeshBuilder.CreateGround("netTop", { width: goalWidth, height: 1.0, subdivisions: 20 }, scene);
		netTop.rotation.x = Math.PI; // Face down
		netTop.position = new Vector3(0, goalHeight, 10.5);

		// Left
		const netLeft = MeshBuilder.CreateGround("netLeft", { width: goalHeight, height: 1.0, subdivisions: 20 }, scene);
		netLeft.rotation.z = -Math.PI / 2; // Face right (+X)
		netLeft.position = new Vector3(-goalWidth / 2, goalHeight / 2, 10.5);

		// Right
		const netRight = MeshBuilder.CreateGround("netRight", { width: goalHeight, height: 1.0, subdivisions: 20 }, scene);
		netRight.rotation.z = Math.PI / 2; // Face left (-X)
		netRight.position = new Vector3(goalWidth / 2, goalHeight / 2, 10.5);

		// Merge all net panels into a single connected mesh (multiMultiMaterials = false to preserve continuous UVs)
		const goalNet = Mesh.MergeMeshes([netBack, netTop, netLeft, netRight], true, true, undefined, false, false);
		if (goalNet) {
			goalNet.name = "goalNet";
			goalNet.material = netMat;
		}

		// Physics Collisions (Boxes to stop the ball from passing through)
		// We use extremely thick walls (1.0m+ depth) to prevent any fast-moving balls from tunneling through
		const collisionMat = new StandardMaterial("collMat", scene);
		collisionMat.alpha = 0; // Invisible
		
		const colBack = MeshBuilder.CreateBox("colBack", { width: goalWidth, height: goalHeight, depth: 0.1 }, scene);
		colBack.position = new Vector3(0, goalHeight / 2, 11.0); 
		colBack.material = collisionMat;
		new PhysicsAggregate(colBack, PhysicsShapeType.BOX, { mass: 0, restitution: 0.0, friction: 0.8 }, scene);

		const colTop = MeshBuilder.CreateBox("colTop", { width: goalWidth, height: 0.1, depth: 1.0 }, scene);
		colTop.position = new Vector3(0, goalHeight, 10.5); 
		colTop.material = collisionMat;
		new PhysicsAggregate(colTop, PhysicsShapeType.BOX, { mass: 0, restitution: 0.0, friction: 0.8 }, scene);

		const colLeft = MeshBuilder.CreateBox("colLeft", { width: 0.1, height: goalHeight, depth: 1.0 }, scene);
		colLeft.position = new Vector3(-(goalWidth / 2), goalHeight / 2, 10.5);
		colLeft.material = collisionMat;
		new PhysicsAggregate(colLeft, PhysicsShapeType.BOX, { mass: 0, restitution: 0.0, friction: 0.8 }, scene);

		const colRight = MeshBuilder.CreateBox("colRight", { width: 0.1, height: goalHeight, depth: 1.0 }, scene);
		colRight.position = new Vector3((goalWidth / 2), goalHeight / 2, 10.5);
		colRight.material = collisionMat;
		new PhysicsAggregate(colRight, PhysicsShapeType.BOX, { mass: 0, restitution: 0.0, friction: 0.8 }, scene);

		// Signboard
		const signboardTex = new Texture("/textures/signboard_03.png", scene);
		signboardTex.uScale = 4;
		signboardTex.vScale = 1;

		const signboardMat = new StandardMaterial("signboardMat", scene);
		signboardMat.diffuseTexture = signboardTex;
		signboardMat.emissiveColor = new Color3(0.6, 0.6, 0.6); // slight self-illumination
		signboardMat.disableLighting = false;

		const signboard = MeshBuilder.CreatePlane("signboard", { width: 30, height: 1.5 }, scene);
		signboard.scaling.x = 47.35 / 30;
		signboard.scaling.y = 1.75 / 1.5;
		signboard.position = new Vector3(0, 1.75 / 2, 12.5);
		signboard.material = signboardMat;
		signboard.name = "signboard";
		(window as any).signboardRef = signboard;
		new PhysicsAggregate(signboard, PhysicsShapeType.BOX, { mass: 0, restitution: 0.6, friction: 0.5 }, scene);

		const sbGuiFolder = gui.addFolder('Signboard');
		(window as any).signboardSettings = { width: 47.35, height: 1.75, posZ: 12.5, posY: 0, uScale: 4 };

		sbGuiFolder.add((window as any).signboardSettings, 'width', 10, 100).onChange((v: number) => { 
			signboard.scaling.x = v / 30; 
			if (signboard.physicsBody) {
				signboard.physicsBody.dispose();
				new PhysicsAggregate(signboard, PhysicsShapeType.BOX, { mass: 0, restitution: (window as any).gameSettings.signboardBounciness, friction: (window as any).gameSettings.signboardFriction }, scene);
			}
		});
		sbGuiFolder.add((window as any).signboardSettings, 'height', 0.5, 10).onChange((v: number) => { 
			signboard.scaling.y = v / 1.5; 
			signboard.position.y = (window as any).signboardSettings.posY + (v / 2);
			if (signboard.physicsBody) {
				signboard.physicsBody.dispose();
				new PhysicsAggregate(signboard, PhysicsShapeType.BOX, { mass: 0, restitution: (window as any).gameSettings.signboardBounciness, friction: (window as any).gameSettings.signboardFriction }, scene);
			}
		});
		sbGuiFolder.add((window as any).signboardSettings, 'posZ', 10, 30).onChange((v: number) => { signboard.position.z = v; });
		sbGuiFolder.add((window as any).signboardSettings, 'posY', -2, 10).onChange((v: number) => { 
			signboard.position.y = v + ((window as any).signboardSettings.height / 2); 
			if (signboard.physicsBody) {
				signboard.physicsBody.dispose();
				new PhysicsAggregate(signboard, PhysicsShapeType.BOX, { mass: 0, restitution: (window as any).gameSettings.signboardBounciness, friction: (window as any).gameSettings.signboardFriction }, scene);
			}
		});
		sbGuiFolder.add((window as any).signboardSettings, 'uScale', 1, 20).step(1).onChange((v: number) => { signboardTex.uScale = v; });

		// Goalkeeper Pivot (at feet)
		const goalkeeperParent = new TransformNode("goalkeeperParent", scene);
		goalkeeperParent.position = new Vector3(0, 0, 9.6);
		(window as any).gkParentRef = goalkeeperParent;

		// Goalkeeper Physics Capsule (Invisible, extremely tight bounds to match character)
		const goalkeeperBody = MeshBuilder.CreateCapsule("goalkeeperBody", { height: 1.6, radius: 0.3 }, scene);
		goalkeeperBody.parent = goalkeeperParent;
		goalkeeperBody.position = new Vector3(0, 0.8, 0); // Move up so pivot is at feet
		goalkeeperBody.visibility = 0; // Invisible
		new PhysicsAggregate(goalkeeperBody, PhysicsShapeType.CAPSULE, { mass: 0, restitution: 0.6, friction: 0.8 }, scene);
		if (goalkeeperBody.physicsBody) {
			goalkeeperBody.physicsBody.disablePreStep = false;
		}
		(window as any).gkBodyRef = goalkeeperBody;

		// Goalkeeper Visual Plane (Child of Parent Pivot)
		const goalkeeper = MeshBuilder.CreatePlane("goalkeeper", { width: 1.61, height: 1.61 }, scene);
		goalkeeper.parent = goalkeeperParent;
		// Position at height 0.8 to match physics, push slightly forward on Z
		goalkeeper.position = new Vector3(0, 0.8, -0.2);
		const gkMat = new StandardMaterial("gkMat", scene);
		gkMat.disableLighting = true;
		gkMat.emissiveColor = new Color3(1, 1, 1); // Ensure base emission is white so texture colors show
		gkMat.useAlphaFromDiffuseTexture = true;
		
		// Load the 4 frames of the goalkeeper animation
		const gkTextures = [
			new Texture("/gk_1.png", scene),
			new Texture("/gk_2.png", scene),
			new Texture("/gk_3.png", scene),
			new Texture("/gk_4.png", scene)
		];
		gkTextures.forEach(t => t.hasAlpha = true);

		// Load Dive Textures
		const gkDiveLeft = new Texture("/dive_images/dive_left_1.png", scene);
		gkDiveLeft.hasAlpha = true;
		const gkDiveRight = new Texture("/dive_images/dive_right_1.png", scene);
		gkDiveRight.hasAlpha = true;
		
		// Set initial frame
		gkMat.diffuseTexture = gkTextures[0];
		gkMat.emissiveTexture = gkTextures[0];
		goalkeeper.material = gkMat;

		// Initialize global state for the controller to modify
		(window as any).gkState = { isJumping: false, isDivingLeft: false };

		// Animate the texture based on global FPS setting
		let frameIdx = 0;
		let lastFrameTime = performance.now();
		scene.onBeforeRenderObservable.add(() => {
			const now = performance.now();
			const animSettings = (window as any).animSettings;
			const targetDelay = animSettings && animSettings.idleFPS > 0 ? 1000 / animSettings.idleFPS : 120;
			
			if ((window as any).gkState.isJumping) {
				// Show dive frame
				const diveTex = (window as any).gkState.isDivingLeft ? gkDiveLeft : gkDiveRight;
				if (gkMat.diffuseTexture !== diveTex) {
					gkMat.diffuseTexture = diveTex;
					gkMat.emissiveTexture = diveTex;
				}
			} else {
				// Play idle animation
				if (now - lastFrameTime > targetDelay) {
					frameIdx = (frameIdx + 1) % gkTextures.length;
					gkMat.diffuseTexture = gkTextures[frameIdx];
					gkMat.emissiveTexture = gkTextures[frameIdx];
					lastFrameTime = now;
				}
			}
		});

		// Ball (Invisible Physics Collider)
		const ball = MeshBuilder.CreateSphere("ball", { diameter: 0.24, segments: 16 }, scene);
		ball.position = new Vector3(0, 0.12, -2); // Penalty spot
		ball.isVisible = false; // Hide the collider
		
		new PhysicsAggregate(ball, PhysicsShapeType.SPHERE, { mass: 0.8, restitution: 0.3, friction: 0.8 }, scene);

		// Load custom 3D model and attach it to the collider
		const ballTextures = [
			new Texture("/soccer_ball/ball_tex_level1.png", scene, false, false),
			new Texture("/soccer_ball/ball_tex_level2.png", scene, false, false),
			new Texture("/soccer_ball/ball_tex_level3.png", scene, false, false)
		];
		
		const customBallMat = new StandardMaterial("customBallMat", scene);
		customBallMat.diffuseTexture = ballTextures[0];
		customBallMat.emissiveTexture = ballTextures[0];
		customBallMat.disableLighting = true;

		SceneLoader.ImportMeshAsync("", "/soccer_ball/", "soccer_ball_rm_01.glb", scene).then((ballImport) => {
			const visualRoot = ballImport.meshes[0] as Mesh;
			visualRoot.name = "visualBallRoot";
			visualRoot.parent = ball;
			// Apply default offset to counteract origin at bottom of mesh
			visualRoot.position = new Vector3(0, (window as any).colliderSettings.visualYOffset, 0);
			(window as any).visualBallRoot = visualRoot;
			
			ballImport.meshes.forEach(m => {
				if (m.name !== "__root__") {
					// Override any Blender material with our controlled material
					m.material = customBallMat;
				}
			});

			const updateBallTexture = () => {
				const level = (window as any).gameManager?.level || 1;
				customBallMat.diffuseTexture = ballTextures[level - 1];
				customBallMat.emissiveTexture = ballTextures[level - 1];
			};
			(window as any).updateBallTexture = updateBallTexture;
			updateBallTexture();
		});
		
		if (ball.physicsBody) {
			ball.physicsBody.setLinearDamping(0.4);
			ball.physicsBody.setAngularDamping(0.8);
			ball.physicsBody.setCollisionCallbackEnabled(true);
			
			// Setup particle system for impact
			const particleSystem = new ParticleSystem("impactParticles", 100, scene);
			const pTex = new DynamicTexture("pTex", 64, scene, false);
			const pCtx = pTex.getContext();
			pCtx.clearRect(0, 0, 64, 64);
			pCtx.fillStyle = "white";
			pCtx.beginPath();
			pCtx.arc(32, 32, 32, 0, Math.PI * 2);
			pCtx.fill();
			pTex.update();
			particleSystem.particleTexture = pTex;
			particleSystem.emitter = ball;
			particleSystem.minEmitBox = new Vector3(-0.5, -0.5, -0.5);
			particleSystem.maxEmitBox = new Vector3(0.5, 0.5, 0.5);
			particleSystem.color1 = new Color4(1.0, 0.8, 0.2, 1.0); // Bright gold/yellow
			particleSystem.color2 = new Color4(1.0, 0.4, 0.1, 1.0); // Orange
			particleSystem.colorDead = new Color4(0.2, 0.1, 0.0, 0.0);
			particleSystem.minSize = 0.3;
			particleSystem.maxSize = 1.0;
			particleSystem.minLifeTime = 0.2;
			particleSystem.maxLifeTime = 0.6;
			particleSystem.emitRate = 2000;
			particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
			particleSystem.direction1 = new Vector3(-2, -2, -2);
			particleSystem.direction2 = new Vector3(2, 2, 2);
			particleSystem.minEmitPower = 10;
			particleSystem.maxEmitPower = 30;
			particleSystem.updateSpeed = 0.01;
			particleSystem.targetStopDuration = 0.15; // Only emit for 0.15s per burst
			
			(window as any).impactSystem = particleSystem;

			ball.physicsBody.getCollisionObservable().add((collisionEvent) => {
				const gkBody = (window as any).gkBodyRef;
				const bc = (window as any).ballController;

				// Environment check (Post or Net)
				if (collisionEvent.collidedAgainst && collisionEvent.collidedAgainst.transformNode) {
					const colName = collisionEvent.collidedAgainst.transformNode.name;
					if (["colBack", "colTop", "colLeft", "colRight", "goalNet", "leftPost", "rightPost", "crossBar", "signboard"].includes(colName)) {
						if (bc) bc.hasHitEnvironment = true;
						
						// Post / Signboard Boing logic
						if (["leftPost", "rightPost", "crossBar", "signboard"].includes(colName)) {
							if (bc) {
								const now = performance.now();
								if (now - bc.lastBoingTime > 200) { // 200ms cooldown
									bc.lastBoingTime = now;
									try {
										const boingEl = document.getElementById("boingAudio") as HTMLAudioElement;
										if (boingEl) {
											const vol = (window as any).audioSettings?.boingVolume ?? 1.0;
											if (vol > 0) {
												boingEl.volume = vol;
												boingEl.currentTime = 0;
												boingEl.play().catch(e => console.error("Boing play blocked:", e));
											}
										}
									} catch(e) {}
								}
							}
						}
						
						// Organic net dampening (prevents tunneling through thin cubes and simulates cloth catching the ball)
						if (["colBack", "colTop", "colLeft", "colRight", "goalNet"].includes(colName)) {
							const vel = ball.physicsBody!.getLinearVelocity();
							ball.physicsBody!.setLinearVelocity(vel.scale(0.3));
							
							if (bc && !bc.hasHitNet) {
								bc.hasHitNet = true;
								try {
									const swishEl = document.getElementById("swishAudio") as HTMLAudioElement;
									if (swishEl) {
										const vol = (window as any).audioSettings?.netSwishVolume ?? 1.0;
										if (vol > 0) {
											swishEl.volume = vol;
											swishEl.currentTime = 0;
											swishEl.play().catch(e => console.error("Swish play blocked:", e));
										}
									}
								} catch(e) {}
							}
						}
					}
				}

				// GK check
				if (gkBody && gkBody.physicsBody && collisionEvent.collidedAgainst === gkBody.physicsBody) {
					if (bc) {
						if (!bc.hasHitGK && !bc.hasHitEnvironment) {
							particleSystem.start();
						}
						bc.hasHitGK = true;
					} else {
						particleSystem.start();
					}
				}
			});
		}
		
		ballMeshRef = ball;

		// --- FAKE DROP SHADOWS ---
		const shadowTex = new DynamicTexture("shadowTex", 256, scene, true);
		const sCtx = shadowTex.getContext();
		(window as any).shadowSettings = { opacity: 0.15, softness: 0.16, ballSize: 0.3, gkSize: 1.6 };

		const updateShadowTex = () => {
			const s = (window as any).shadowSettings;
			sCtx.clearRect(0, 0, 256, 256);
			const grad = sCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
			const innerRadiusStop = Math.max(0, Math.min(0.99, 1 - s.softness));
			grad.addColorStop(innerRadiusStop, `rgba(0,0,0,${s.opacity})`);
			grad.addColorStop(1, "rgba(0,0,0,0)");
			sCtx.fillStyle = grad;
			sCtx.fillRect(0, 0, 256, 256);
			shadowTex.update();
		};
		updateShadowTex();

		const shadowFolder = gui.addFolder('Fake Shadows');
		shadowFolder.add((window as any).shadowSettings, 'opacity', 0, 1).step(0.05).onChange(updateShadowTex);
		shadowFolder.add((window as any).shadowSettings, 'softness', 0.01, 1).step(0.05).onChange(updateShadowTex);
		
		const shadowMat = new StandardMaterial("shadowMat", scene);
		shadowMat.diffuseTexture = shadowTex;
		shadowMat.opacityTexture = shadowTex;
		shadowMat.disableLighting = true;
		shadowMat.zOffset = -1; // Prevent z-fighting with ground
		shadowMat.useAlphaFromDiffuseTexture = true;

		const ballShadow = MeshBuilder.CreatePlane("ballShadow", {size: 0.6}, scene);
		ballShadow.rotation.x = Math.PI / 2;
		ballShadow.material = shadowMat;

		const gkShadow = MeshBuilder.CreatePlane("gkShadow", {size: 1.8}, scene);
		gkShadow.rotation.x = Math.PI / 2;
		gkShadow.material = shadowMat;

		shadowFolder.add((window as any).shadowSettings, 'ballSize', 0.1, 3).step(0.1).onChange((v: number) => {
			ballShadow.scaling.x = v / 0.6;
			ballShadow.scaling.y = v / 0.6;
		});
		shadowFolder.add((window as any).shadowSettings, 'gkSize', 0.5, 5).step(0.1).onChange((v: number) => {
			gkShadow.scaling.x = v / 1.8;
			gkShadow.scaling.y = v / 1.8;
		});

		scene.onBeforeRenderObservable.add(() => {
			if (ball) {
				ballShadow.position.x = ball.position.x;
				ballShadow.position.z = ball.position.z;
				ballShadow.position.y = 0.01;
			}
			if (goalkeeperParent) {
				gkShadow.position.x = goalkeeperParent.position.x;
				gkShadow.position.z = goalkeeperParent.position.z;
				gkShadow.position.y = 0.01;
			}
		});
		// -------------------------

		const impactFolder = gui.addFolder('Goalkeeper Impact Effect');
		(window as any).impactSettings = {
			color1: "#ffcc33",
			color2: "#ff661a",
			minSize: 0.3,
			maxSize: 1.0,
			emitRate: 2000,
			minEmitPower: 10,
			maxEmitPower: 47.134
		};
		const updateImpact = () => {
			if ((window as any).impactSystem) {
				const sys = (window as any).impactSystem;
				sys.color1 = Color4.FromHexString((window as any).impactSettings.color1 + "FF");
				sys.color2 = Color4.FromHexString((window as any).impactSettings.color2 + "FF");
				sys.minSize = (window as any).impactSettings.minSize;
				sys.maxSize = (window as any).impactSettings.maxSize;
				sys.emitRate = (window as any).impactSettings.emitRate;
				sys.minEmitPower = (window as any).impactSettings.minEmitPower;
				sys.maxEmitPower = (window as any).impactSettings.maxEmitPower;
			}
		};
		impactFolder.addColor((window as any).impactSettings, 'color1').name('Core Color').onChange(updateImpact);
		impactFolder.addColor((window as any).impactSettings, 'color2').name('Edge Color').onChange(updateImpact);
		impactFolder.add((window as any).impactSettings, 'minSize', 0.1, 5.0).name('Min Size').onChange(updateImpact);
		impactFolder.add((window as any).impactSettings, 'maxSize', 0.1, 5.0).name('Max Size').onChange(updateImpact);
		impactFolder.add((window as any).impactSettings, 'emitRate', 100, 10000).name('Particle Count').onChange(updateImpact);
		impactFolder.add((window as any).impactSettings, 'minEmitPower', 1, 100).name('Min Burst Speed').onChange(updateImpact);
		impactFolder.add((window as any).impactSettings, 'maxEmitPower', 1, 100).name('Max Burst Speed').onChange(updateImpact);

		const skyFolder = gui.addFolder('Environment');
		(window as any).envSettings = { 
			lvl1Sky: "#87ceeb",
			lvl2Sky: "#f4bdff",
			lvl3Sky: "#fed48b"
		};
		const updateSky = () => {
			const level = (window as any).gameManager?.level || 1;
			let colorStr = (window as any).envSettings.lvl1Sky;
			if (level === 2) colorStr = (window as any).envSettings.lvl2Sky;
			if (level === 3) colorStr = (window as any).envSettings.lvl3Sky;
			scene.clearColor = Color4.FromHexString(colorStr + "FF");
		};
		(window as any).updateSky = updateSky;
		updateSky();
		
		const s1Folder = skyFolder.addFolder('Level 1 Sky');
		s1Folder.addColor((window as any).envSettings, 'lvl1Sky').name('Sky Color').onChange(updateSky);
		const s2Folder = skyFolder.addFolder('Level 2 Sky');
		s2Folder.addColor((window as any).envSettings, 'lvl2Sky').name('Sky Color').onChange(updateSky);
		const s3Folder = skyFolder.addFolder('Level 3 Sky');
		s3Folder.addColor((window as any).envSettings, 'lvl3Sky').name('Sky Color').onChange(updateSky);

		// Ball Trail Effect
		(window as any).resetTrail = () => {
			if ((window as any).ballTrail) {
				(window as any).ballTrail.dispose();
			}
			const trail = new TrailMesh("trail", ball, scene, 0.04, 60, true); // Thin, clean line
			const trailMat = new StandardMaterial("trailMat", scene);
			trailMat.emissiveColor = new Color3(1, 1, 1);
			trailMat.disableLighting = true;
			trailMat.alpha = 0; // Hidden by default until kicked
			trail.material = trailMat;
			(window as any).ballTrail = trail;
		};
		(window as any).resetTrail();

		// Direction Arrow
		const arrowParent = new TransformNode("arrowParent", scene);
		arrowParent.position = new Vector3(0, 0.05, -2); // Exactly at the ball

		const arrow = MeshBuilder.CreateGround("arrow", { width: 1, height: 3 }, scene);
		arrow.parent = arrowParent;
		arrow.position = new Vector3(0, 0, 1.5); // Offset so bottom edge sits exactly on the parent's origin
		
		const arrowTex = new DynamicTexture("arrowTex", {width: 256, height: 512}, scene, false);
		arrowTex.hasAlpha = true;
		const ctx = arrowTex.getContext();
		ctx.clearRect(0, 0, 256, 512);
		ctx.fillStyle = "yellow";
		ctx.beginPath();
		ctx.moveTo(128, 40); // Tip
		ctx.lineTo(200, 200); // Right bottom of tip
		ctx.lineTo(150, 200);
		ctx.lineTo(150, 512); // Stem right (goes all the way down)
		ctx.lineTo(106, 512); // Stem left
		ctx.lineTo(106, 200);
		ctx.lineTo(56, 200);  // Left bottom of tip
		ctx.closePath();
		ctx.fill();
		arrowTex.update();
		
		const arrowMat = new StandardMaterial("arrowMat", scene);
		arrowMat.emissiveColor = new Color3(1, 1, 0); // Yellow fallback
		arrowMat.diffuseTexture = arrowTex;
		arrowMat.opacityTexture = arrowTex;
		arrowTex.hasAlpha = true;
		arrowMat.disableLighting = true;
		arrow.material = arrowMat;

		// 4. Attach Logic Scripts manually (since we bypassed the editor loader)
		// NOTE: When you import your .glb, you will delete the MeshBuilder lines above and run SceneLoader.AppendAsync() instead, then find the meshes by name.
		const ballScript = new BallController(ball);
		ballScript.onStart();
		const gkScript = new GoalkeeperController(goalkeeperParent as any);
		gkScript.onStart();
		
		const gmScript = new GameManager(ground);
		gmScript.onStart();
		gmScript.onOutcome = (text: string | null) => {
            if ((window as any).setOutcomeText) {
                (window as any).setOutcomeText(text);
            }
        };
		gameManagerRef = gmScript;

		// Update loop to run script logic
		scene.onBeforeRenderObservable.add(() => {
			ballScript.onUpdate();
			gkScript.onUpdate();
			gmScript.onUpdate();

			// Update arrow visually
			if (gameManagerRef) {
				const phase = gameManagerRef.phase;
				if (phase === "IDLE" || phase === "DIRECTION" || phase === "POWER" || phase === "HEIGHT" || phase === "CURVE") {
					arrow.isVisible = true;
					if (phase !== "IDLE") {
						// (window as any).aimDirection is updated by GameUI without React renders
						const dir = (window as any).aimDirection || 0;
						// Rotate arrow based on direction (e.g. max 45 degrees left/right)
						arrowParent.rotation.y = dir * (Math.PI / 4);
					} else {
						arrowParent.rotation.y = 0;
					}
					arrowParent.position.x = ball.position.x;
					arrowParent.position.z = ball.position.z;
				} else {
					arrow.isVisible = false;
				}
			}
		});

		engine.runRenderLoop(() => {
			scene.render();
		});
	}

	const handleKickExecute = (params: KickParams) => {
		console.log("KICK EXECUTED with params:", params);
		// Apply impulse to the ball
		if (ballMeshRef && ballMeshRef.physicsBody) {
			const gameSettings = (window as any).gameSettings;
			const kickMultiplier = gameSettings ? gameSettings.kickPowerMultiplier : 1.0;
			const heightMultiplier = gameSettings ? gameSettings.kickHeightMultiplier : 1.0;

			// Compute true vector components so the ball travels precisely down the arrow's path
			// Adjusted base power so a zero-power gauge actually results in a weak roller.
			const speed = (4 + (params.power * 28)) * kickMultiplier;
			const angle = params.direction * (Math.PI / 4); // +/- 45 degrees
			const forwardForce = speed * Math.cos(angle);
			const sideForce = speed * Math.sin(angle);
			// Adjusted base height so a zero-height gauge stays low on the ground
			const upForce = (params.height * 10) * heightMultiplier;
			
			const impulse = new Vector3(sideForce, upForce, forwardForce);
			
			// Apply impulse at the center of the ball
			ballMeshRef.physicsBody.applyImpulse(impulse, ballMeshRef.getAbsolutePosition());
			
			// Pass the curve parameter to the controller
			if ((window as any).ballController) {
			    (window as any).ballController.setCurve(params.curve);
			}

			// Activate Trail Effect
			if ((window as any).ballTrail) {
				const trailMat = (window as any).ballTrail.material;
				// Higher power = more opaque and intense trail
				trailMat.alpha = Math.max(0.1, params.power); 
				trailMat.emissiveColor = new Color3(1.0, 1.0 - (params.power * 0.5), 1.0 - params.power); // Turns slightly yellow/orange/red at max power
				(window as any).ballTrail.start(); // reset trail
			}
		}
	};

	const handleSetPhase = (newPhase: KickPhase) => {
		setPhase(newPhase);
		if (gameManagerRef) {
			gameManagerRef.phase = newPhase;
		}
	};

	return (
		<main className="relative flex w-screen h-screen flex-col items-center justify-between bg-black">
			<GameUI 
				onKickParamsUpdate={(params) => {
					if (params.direction !== undefined) {
						(window as any).aimDirection = params.direction;
					}
				}}
				onKickExecute={handleKickExecute}
				phase={phase}
				setPhase={handleSetPhase}
				level={level}
				score={score}
				shots={shots}
			/>
			<canvas
				ref={canvasRef}
				className="w-full h-full outline-none select-none touch-none"
			/>
		</main>
	);
}
