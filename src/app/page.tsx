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
import { Camera } from "@babylonjs/core/Cameras/camera";

import "@babylonjs/core/Meshes/groundMesh";

import "@babylonjs/core/Lights/directionalLight";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import "@babylonjs/core/Materials/PBR/pbrMaterial";
import "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { VideoTexture } from "@babylonjs/core/Materials/Textures/videoTexture";
import { TrailMesh } from "@babylonjs/core/Meshes/trailMesh";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/core/XR/features/WebXRDepthSensing";

import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";

import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";

import "@babylonjs/core/Physics";

import "@babylonjs/materials/sky";

import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { loadScene } from "babylonjs-editor-tools";

import { GameUI, KickPhase, KickParams } from "./components/GameUI";
import { MainMenu } from "./components/MainMenu";
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
	const [phase, setPhase] = useState<KickPhase>("MENU");
	const [level, setLevel] = useState(1);
	const [score, setScore] = useState(0);
	const [shots, setShots] = useState<(string | null)[]>([null, null, null, null, null]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!canvasRef.current) {
			return;
		}

		const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;
		const engine = new Engine(canvasRef.current, true, {
			stencil: true,
			antialias: dpr <= 1,
			audioEngine: true,
			adaptToDeviceRatio: true,
			powerPreference: "high-performance",
		});
		engine.setHardwareScalingLevel(1 / dpr);

		// Explicit audio unlock for strict browsers like Safari
		if (Engine.audioEngine) {
			Engine.audioEngine.useCustomUnlockedButton = true;
			const unlockAudio = () => {
				if (!Engine.audioEngine!.unlocked) {
					Engine.audioEngine!.unlock();
				}
				document.removeEventListener('pointerdown', unlockAudio);
				document.removeEventListener('touchstart', unlockAudio);
			};
			document.addEventListener('pointerdown', unlockAudio);
			document.addEventListener('touchstart', unlockAudio);
		}

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
			setIsLoading(false);
		});

		let listener: () => void;
		window.addEventListener("resize", listener = () => {
			engine.resize();
			if ((window as any).updateCameraResponsive) {
				(window as any).updateCameraResponsive();
			}
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

		(window as any).updateCameraResponsive = () => {
			if (engine.getRenderWidth() < engine.getRenderHeight()) {
				camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
			} else {
				camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
			}
		};
		(window as any).updateCameraResponsive();

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

		(window as any).cameraSettings = { fov: 0.8, posX: 0, posY: 0.5, posZ: -4, pitchX: 0.1, yawY: 0, rollZ: 0, shakeIntensity: 0.05, shakeSpeed: 50, shakeDuration: 0.8};
		cameraFolder.add((window as any).cameraSettings, 'shakeIntensity', 0.0, 0.5).step(0.01).name('Shake Intensity').listen();
		cameraFolder.add((window as any).cameraSettings, 'shakeSpeed', 1, 100).step(1).name('Shake Speed').listen();
		cameraFolder.add((window as any).cameraSettings, 'shakeDuration', 0.1, 2.0).step(0.1).name('Shake Duration').listen();

		let shakeTime = 0;
		let isShaking = false;
		let baseFov = camera.fov;
		
		(window as any).shakeCamera = () => {
			shakeTime = 0;
			if (!isShaking) {
				baseFov = camera.fov;
			}
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
			levelScale: 1, levelOpacity: 1, levelTop: 16, levelLeft: 16,
			sbScale: 1, sbOpacity: 1, sbTop: 80, sbRight: 16,
			centerScale: 0.5, centerOpacity: 1.0, centerTop: 190,
			outcomeScale: 1, outcomeOpacity: 1.0, outcomeTop: 120,
			dirScale: 1.0, dirOpacity: 1.0, dirBottom: 256,
			gaugeScale: 1.1, gaugeX: 0,
			pwrScale: 1, pwrX: 0, pwrY: 0,
			hgtScale: 1, hgtX: 0, hgtY: 0,
			crvScale: 1, crvX: 0, crvY: 27,
			dirSpeedLvl1: 2.6,
			dirSpeedLvl2: 3.5,
			dirSpeedLvl3: 4.5,
			arrowColor: "#ffff00",
			jiggleIntensity: 0.15,
			jiggleSpeed: 40,
			jiggleDecay: 5,
			jiggleDuration: 1,
			dirSpeed: 2.6,
			pwrSpeed: 5.5,
			hgtSpeed: 5.5,
			hgtPwrMultLvl1: 0,
			hgtPwrMultLvl2: 0.5,
			hgtPwrMultLvl3: 1,
			crvSpeed: 5.5,
			preloaderSpinnerScale: 1, preloaderSpinnerTop: 0,
			preloaderTitleScale: 1, preloaderTitleTop: 0,
			preloaderSubScale: 1, preloaderSubTop: 0,
			endBgOpacity: 0.8,
			endTitleScale: 1, endTitleY: 0, endTitleColor: "#ffffff",
			endSubScale: 1, endSubY: 0, endSubColor: "#ffffff",
			endBtnScale: 1, endBtnY: 0, endBtnColor: "#ffffff", endBtnBgColor: "#22c55e",
			compBgOpacity: 0.6,
			compTitleScale: 1, compTitleY: 0, compTitleColor: "#facc15",
			compSubScale: 1, compSubY: 0, compSubColor: "#ffffff",
			compIconScale: 1, compIconY: 0, compIconColor: "#facc15",
			compBtnScale: 1, compBtnY: 0, compBtnColor: "#000000", compBtnBgColor: "#ff6bba",
			failBgOpacity: 0.8,
			failTitleScale: 1, failTitleY: 0, failTitleColor: "#f87171",
			failSubScale: 1, failSubY: 0, failSubColor: "#d1d5db",
			failBtnScale: 1, failBtnY: 0, failBtnColor: "#ffffff", failBtnBgColor: "#22c55e",
		};

		(window as any).audioSettings = { kickVolume: 0.6, netSwishVolume: 1.0, boingVolume: 1.0 };
		const audioFolder = gui.addFolder('Audio Settings');
		audioFolder.add((window as any).audioSettings, 'kickVolume', 0.0, 1.0).step(0.1).name('Kick Volume').listen();
		audioFolder.add((window as any).audioSettings, 'netSwishVolume', 0.0, 1.0).step(0.1).name('Net Swish Volume').listen();
		audioFolder.add((window as any).audioSettings, 'boingVolume', 0.0, 1.0).step(0.1).name('Boing Volume').listen();

		const uiFolder = gui.addFolder('UI Elements');
		
		const testControls = {
			testEnd: () => { if ((window as any).gameManager) (window as any).gameManager.setPhase("ENDGAME"); },
			testComp: () => { if ((window as any).gameManager) (window as any).gameManager.setPhase("LEVEL_COMPLETE"); },
			testFail: () => { if ((window as any).gameManager) (window as any).gameManager.setPhase("LEVEL_FAILED"); },
			testIdle: () => { if ((window as any).gameManager) (window as any).gameManager.setPhase("IDLE"); }
		};
		const testScreensFolder = uiFolder.addFolder('Test Screens');
		testScreensFolder.add(testControls, 'testEnd').name('Show Endgame');
		testScreensFolder.add(testControls, 'testComp').name('Show Level Complete');
		testScreensFolder.add(testControls, 'testFail').name('Show Level Failed');
		testScreensFolder.add(testControls, 'testIdle').name('Resume Game (Idle)');

		const endgameFolder = uiFolder.addFolder('Endgame Screen');
		endgameFolder.add((window as any).uiSettings, 'endBgOpacity', 0.0, 1.0).step(0.05).name('Bg Opacity').listen();
		endgameFolder.add((window as any).uiSettings, 'endTitleScale', 0.1, 5.0).step(0.05).name('Title Scale').listen();
		endgameFolder.add((window as any).uiSettings, 'endTitleY', -1000, 1000).step(1).name('Title Y Offset').listen();
		endgameFolder.addColor((window as any).uiSettings, 'endTitleColor').name('Title Color').listen();
		endgameFolder.add((window as any).uiSettings, 'endSubScale', 0.1, 5.0).step(0.05).name('Subtitle Scale').listen();
		endgameFolder.add((window as any).uiSettings, 'endSubY', -1000, 1000).step(1).name('Subtitle Y Offset').listen();
		endgameFolder.addColor((window as any).uiSettings, 'endSubColor').name('Subtitle Color').listen();
		endgameFolder.add((window as any).uiSettings, 'endBtnScale', 0.1, 5.0).step(0.05).name('Button Scale').listen();
		endgameFolder.add((window as any).uiSettings, 'endBtnY', -1000, 1000).step(1).name('Button Y Offset').listen();
		endgameFolder.addColor((window as any).uiSettings, 'endBtnColor').name('Button Text Color').listen();
		endgameFolder.addColor((window as any).uiSettings, 'endBtnBgColor').name('Button Bg Color').listen();

		const compFolder = uiFolder.addFolder('Level Complete Screen');
		compFolder.add((window as any).uiSettings, 'compBgOpacity', 0.0, 1.0).step(0.05).name('Bg Opacity').listen();
		compFolder.add((window as any).uiSettings, 'compTitleScale', 0.1, 5.0).step(0.05).name('Title Scale').listen();
		compFolder.add((window as any).uiSettings, 'compTitleY', -1000, 1000).step(1).name('Title Y Offset').listen();
		compFolder.addColor((window as any).uiSettings, 'compTitleColor').name('Title Color').listen();
		compFolder.add((window as any).uiSettings, 'compSubScale', 0.1, 5.0).step(0.05).name('Subtitle Scale').listen();
		compFolder.add((window as any).uiSettings, 'compSubY', -1000, 1000).step(1).name('Subtitle Y Offset').listen();
		compFolder.addColor((window as any).uiSettings, 'compSubColor').name('Subtitle Color').listen();
		compFolder.add((window as any).uiSettings, 'compIconScale', 0.1, 5.0).step(0.05).name('Icon Scale').listen();
		compFolder.add((window as any).uiSettings, 'compIconY', -1000, 1000).step(1).name('Icon Y Offset').listen();
		compFolder.addColor((window as any).uiSettings, 'compIconColor').name('Icon Color').listen();
		compFolder.add((window as any).uiSettings, 'compBtnScale', 0.1, 5.0).step(0.05).name('Button Scale').listen();
		compFolder.add((window as any).uiSettings, 'compBtnY', -1000, 1000).step(1).name('Button Y Offset').listen();
		compFolder.addColor((window as any).uiSettings, 'compBtnColor').name('Button Text Color').listen();
		compFolder.addColor((window as any).uiSettings, 'compBtnBgColor').name('Button Bg Color').listen();

		const failFolder = uiFolder.addFolder('Level Failed Screen');
		failFolder.add((window as any).uiSettings, 'failBgOpacity', 0.0, 1.0).step(0.05).name('Bg Opacity').listen();
		failFolder.add((window as any).uiSettings, 'failTitleScale', 0.1, 5.0).step(0.05).name('Title Scale').listen();
		failFolder.add((window as any).uiSettings, 'failTitleY', -1000, 1000).step(1).name('Title Y Offset').listen();
		failFolder.addColor((window as any).uiSettings, 'failTitleColor').name('Title Color').listen();
		failFolder.add((window as any).uiSettings, 'failSubScale', 0.1, 5.0).step(0.05).name('Subtitle Scale').listen();
		failFolder.add((window as any).uiSettings, 'failSubY', -1000, 1000).step(1).name('Subtitle Y Offset').listen();
		failFolder.addColor((window as any).uiSettings, 'failSubColor').name('Subtitle Color').listen();
		failFolder.add((window as any).uiSettings, 'failBtnScale', 0.1, 5.0).step(0.05).name('Button Scale').listen();
		failFolder.add((window as any).uiSettings, 'failBtnY', -1000, 1000).step(1).name('Button Y Offset').listen();
		failFolder.addColor((window as any).uiSettings, 'failBtnColor').name('Button Text Color').listen();
		failFolder.addColor((window as any).uiSettings, 'failBtnBgColor').name('Button Bg Color').listen();
		
		const preloaderFolder = gui.addFolder('Preloader');
		preloaderFolder.add((window as any).uiSettings, 'preloaderSpinnerScale', 0.1, 5.0).step(0.05).name('Spinner Scale').listen();
		preloaderFolder.add((window as any).uiSettings, 'preloaderSpinnerTop', -1000, 1000).step(1).name('Spinner Y Offset').listen();
		preloaderFolder.add((window as any).uiSettings, 'preloaderTitleScale', 0.1, 5.0).step(0.05).name('Title Scale').listen();
		preloaderFolder.add((window as any).uiSettings, 'preloaderTitleTop', -1000, 1000).step(1).name('Title Y Offset').listen();
		preloaderFolder.add((window as any).uiSettings, 'preloaderSubScale', 0.1, 5.0).step(0.05).name('Subtitle Scale').listen();
		preloaderFolder.add((window as any).uiSettings, 'preloaderSubTop', -1000, 1000).step(1).name('Subtitle Y Offset').listen();

		const levelFolder = uiFolder.addFolder('Level Badge');
		levelFolder.add((window as any).uiSettings, 'levelScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		levelFolder.add((window as any).uiSettings, 'levelOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		levelFolder.add((window as any).uiSettings, 'levelTop', -1000, 2000).step(1).name('Y Offset').listen();
		levelFolder.add((window as any).uiSettings, 'levelLeft', -1000, 2000).step(1).name('X Offset').listen();

		const sbFolder = uiFolder.addFolder('Scoreboard (Shots)');
		sbFolder.add((window as any).uiSettings, 'sbScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		sbFolder.add((window as any).uiSettings, 'sbOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		sbFolder.add((window as any).uiSettings, 'sbTop', -1000, 2000).step(1).name('Y Offset').listen();
		sbFolder.add((window as any).uiSettings, 'sbRight', -1000, 2000).step(1).name('X Offset').listen();

		const centerFolder = uiFolder.addFolder('Center Instruction Text');
		centerFolder.add((window as any).uiSettings, 'centerScale', 0.1, 5.0).step(0.05).name('Scale').listen();
		centerFolder.add((window as any).uiSettings, 'centerOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		centerFolder.add((window as any).uiSettings, 'centerTop', -1000, 2000).step(1).name('Y Offset').listen();

		const outcomeFolder = uiFolder.addFolder('Outcome Text');
		outcomeFolder.add((window as any).uiSettings, 'outcomeScale', 0.1, 10.0).step(0.05).name('Scale').listen();
		outcomeFolder.add((window as any).uiSettings, 'outcomeOpacity', 0.1, 1.0).step(0.05).name('Opacity').listen();
		outcomeFolder.add((window as any).uiSettings, 'outcomeTop', -5000, 5000).step(1).name('Y Offset').listen();

		const dirFolder = uiFolder.addFolder('Direction / Text Overlays');
		dirFolder.add((window as any).uiSettings, 'centerScale', 0.1, 3.0).step(0.1).name('Center Text Scale').listen();
		dirFolder.add((window as any).uiSettings, 'centerTop', 0, 500).step(1).name('Center Text Y Offset').listen();
		dirFolder.add((window as any).uiSettings, 'outcomeScale', 0.1, 5.0).step(0.1).name('Outcome Text Scale').listen();
		dirFolder.add((window as any).uiSettings, 'outcomeTop', 0, 500).step(1).name('Outcome Text Y Offset').listen();

		const retroFolder = uiFolder.addFolder('Retro Gauges Config');
		retroFolder.add((window as any).uiSettings, 'dirBottom', 0, 500).step(1).name('Global Y Position').listen();
		retroFolder.add((window as any).uiSettings, 'gaugeX', -500, 500).step(1).name('Global X Position').listen();
		retroFolder.add((window as any).uiSettings, 'gaugeScale', 0.5, 3.0).step(0.1).name('Global Size').listen();

		const dirArrowFolder = retroFolder.addFolder('Direction Arrow');
		dirArrowFolder.add((window as any).uiSettings, 'dirSpeedLvl1', 0.5, 10).step(0.1).name('Speed Lvl 1').listen();
		dirArrowFolder.add((window as any).uiSettings, 'dirSpeedLvl2', 0.5, 10).step(0.1).name('Speed Lvl 2').listen();
		dirArrowFolder.add((window as any).uiSettings, 'dirSpeedLvl3', 0.5, 10).step(0.1).name('Speed Lvl 3').listen();
		dirArrowFolder.addColor((window as any).uiSettings, 'arrowColor').name('Arrow Color').listen();
		dirArrowFolder.add((window as any).uiSettings, 'jiggleIntensity', 0, 1.0).step(0.01).name('Jiggle Intensity').listen();
		dirArrowFolder.add((window as any).uiSettings, 'jiggleSpeed', 1, 100).step(1).name('Jiggle Speed').listen();
		dirArrowFolder.add((window as any).uiSettings, 'jiggleDecay', 0.1, 15).step(0.1).name('Jiggle Decay').listen();
		dirArrowFolder.add((window as any).uiSettings, 'jiggleDuration', 0.1, 3.0).step(0.1).name('Jiggle Duration').listen();

		const pwrFolder = retroFolder.addFolder('Power Gauge');
		pwrFolder.add((window as any).uiSettings, 'pwrScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		pwrFolder.add((window as any).uiSettings, 'pwrX', -100, 100).step(1).name('X Offset').listen();
		pwrFolder.add((window as any).uiSettings, 'pwrY', -100, 100).step(1).name('Y Offset').listen();
		pwrFolder.add((window as any).uiSettings, 'pwrSpeed', 0.5, 10).step(0.1).name('Speed').listen();

		const hgtFolder = retroFolder.addFolder('Height Gauge');
		hgtFolder.add((window as any).uiSettings, 'hgtScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		hgtFolder.add((window as any).uiSettings, 'hgtX', -100, 100).step(1).name('X Offset').listen();
		hgtFolder.add((window as any).uiSettings, 'hgtY', -100, 100).step(1).name('Y Offset').listen();
		hgtFolder.add((window as any).uiSettings, 'hgtSpeed', 0.5, 10).step(0.1).name('Speed').listen();
		hgtFolder.add((window as any).uiSettings, 'hgtPwrMultLvl1', 0.0, 5.0).step(0.1).name('Power Mult Lvl 1').listen();
		hgtFolder.add((window as any).uiSettings, 'hgtPwrMultLvl2', 0.0, 5.0).step(0.1).name('Power Mult Lvl 2').listen();
		hgtFolder.add((window as any).uiSettings, 'hgtPwrMultLvl3', 0.0, 5.0).step(0.1).name('Power Mult Lvl 3').listen();

		const crvFolder = retroFolder.addFolder('Curve Gauge');
		crvFolder.add((window as any).uiSettings, 'crvScale', 0.1, 3.0).step(0.05).name('Scale').listen();
		crvFolder.add((window as any).uiSettings, 'crvX', -100, 100).step(1).name('X Offset').listen();
		crvFolder.add((window as any).uiSettings, 'crvY', -100, 100).step(1).name('Y Offset').listen();
		crvFolder.add((window as any).uiSettings, 'crvSpeed', 0.5, 10).step(0.1).name('Speed').listen();

		(window as any).gameSettings = { ballMass: 3.1, sceneGravity: -14.0, kickPowerMultiplier: 0.9, kickHeightMultiplier: 1.0, curveForceMultiplier: 8.0, netBulgeMultiplier: 0.9, netImpactRadius: 1.9, rippleAmplitude: 0.4, rippleSpeed: 9.0, signboardBounciness: 0.6, signboardFriction: 0.5};
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
			jumpSpeedMultiplier: 3, 
			jumpArcGravity: 50, 
			maxJumpHeight: 1.3,
			gkSizeLvl1: 1,
			gkSizeLvl2: 1.05,
			gkSizeLvl3: 1.1,
			landingScale: 0.6,
			landingOffsetX: 0,
			landingOffsetY: -1.2,
			landingPlaybackRate: 1,
			landingOpacity: 1,
			landingJumpThreshold: 1.1
		};
		const animFolder = gui.addFolder('Goalkeeper Tuning');
		animFolder.add((window as any).animSettings, 'idleFPS', 1, 30).step(1).name('Idle Anim FPS').listen();
		animFolder.add((window as any).animSettings, 'jumpSpeedMultiplier', 0.1, 3.0).step(0.1).name('Jump Speed').listen();
		animFolder.add((window as any).animSettings, 'jumpArcGravity', 5.0, 50.0).step(1.0).name('Jump Arc Gravity').listen();
		animFolder.add((window as any).animSettings, 'maxJumpHeight', 1.0, 4.0).step(0.1).name('Max Jump Height').listen();
		
		(window as any).updateGkScale = () => {
			if ((window as any).gkBodyRef) {
				const body = (window as any).gkBodyRef;
				const level = (window as any).gameManager?.level || 1;
				const size = level === 1 ? (window as any).animSettings.gkSizeLvl1 : 
							 level === 2 ? (window as any).animSettings.gkSizeLvl2 : 
							 (window as any).animSettings.gkSizeLvl3;
				
				console.log(`[updateGkScale] Level: ${level}, size: ${size}, current scaling.y: ${body.scaling.y}`);
				
				body.scaling.setAll(size);
				body.position.y = 0.8 * size;
					if (body.physicsBody) {
						body.physicsBody.dispose();
						new PhysicsAggregate(body, PhysicsShapeType.CAPSULE, { mass: 0, restitution: 0.0, friction: 0.8 }, scene);
						if (body.physicsBody) {
							body.physicsBody.disablePreStep = false;
						}
					}
			}
		};

		animFolder.add((window as any).animSettings, 'gkSizeLvl1', 0.5, 3.0).step(0.05).name('Size (Level 1)').onChange((window as any).updateGkScale);
		animFolder.add((window as any).animSettings, 'gkSizeLvl2', 0.5, 3.0).step(0.05).name('Size (Level 2)').onChange((window as any).updateGkScale);
		animFolder.add((window as any).animSettings, 'gkSizeLvl3', 0.5, 3.0).step(0.05).name('Size (Level 3)').onChange((window as any).updateGkScale);

		const landingFolder = animFolder.addFolder('Landing Dust Effect');
		landingFolder.add((window as any).animSettings, 'landingScale', 0.1, 5.0).step(0.1).name('Scale').listen();
		landingFolder.add((window as any).animSettings, 'landingOffsetX', -5.0, 5.0).step(0.1).name('X Offset').listen();
		landingFolder.add((window as any).animSettings, 'landingOffsetY', -5.0, 5.0).step(0.1).name('Y Offset').listen();
		landingFolder.add((window as any).animSettings, 'landingPlaybackRate', 0.1, 3.0).step(0.1).name('Speed').listen();
		landingFolder.add((window as any).animSettings, 'landingOpacity', 0.0, 1.0).step(0.05).name('Opacity').listen();
		landingFolder.add((window as any).animSettings, 'landingJumpThreshold', 0.0, 3.0).step(0.1).name('Min Jump Height').listen();

		(window as any).aiSettings = {
			wrongDiveProbLvl1: 0.2,
			predictionErrorLvl1: 0.9,
			wrongDiveProbLvl2: 0.2,
			predictionErrorLvl2: 0.7,
			wrongDiveProbLvl3: 0.05,
			predictionErrorLvl3: 0.8,
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
			fieldThickness: 1,
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
			lvl1Mode: "Striped", lvl1Light: "#a3d27f", lvl1Dark: "#b1df90", lvl1Solid: "#a3d27f",
			lvl2Mode: "Striped", lvl2Light: "#d3ec79", lvl2Dark: "#b3e38c", lvl2Solid: "#d3ec79",
			lvl3Mode: "Striped", lvl3Light: "#ffb98a", lvl3Dark: "#ffc7a8", lvl3Solid: "#ffb98a",
			stripeSize: 0.5,
			fieldWidth: 75,
			fieldDepth: 40,
			netGridScale: 30
		};
		const updateLawn = () => {
			if ((window as any).lawnCtx && (window as any).lawnTex) {
				const ctx = (window as any).lawnCtx;
				const level = (window as any).gameManager?.level || 1;
				
				let lightColor, darkColor;
				if (level === 1) {
					const mode = (window as any).fieldSettings.lvl1Mode;
					lightColor = mode === "Solid" ? (window as any).fieldSettings.lvl1Solid : (window as any).fieldSettings.lvl1Light;
					darkColor = mode === "Solid" ? (window as any).fieldSettings.lvl1Solid : (window as any).fieldSettings.lvl1Dark;
				} else if (level === 2) {
					const mode = (window as any).fieldSettings.lvl2Mode;
					lightColor = mode === "Solid" ? (window as any).fieldSettings.lvl2Solid : (window as any).fieldSettings.lvl2Light;
					darkColor = mode === "Solid" ? (window as any).fieldSettings.lvl2Solid : (window as any).fieldSettings.lvl2Dark;
				} else {
					const mode = (window as any).fieldSettings.lvl3Mode;
					lightColor = mode === "Solid" ? (window as any).fieldSettings.lvl3Solid : (window as any).fieldSettings.lvl3Light;
					darkColor = mode === "Solid" ? (window as any).fieldSettings.lvl3Solid : (window as any).fieldSettings.lvl3Dark;
				}

				ctx.fillStyle = lightColor;
				ctx.fillRect(0, 0, 16, 256);
				ctx.fillStyle = darkColor;
				ctx.fillRect(0, 256, 16, 256);
				(window as any).lawnTex.update();
			}
		};
		(window as any).updateLawn = updateLawn;

		const levelTestManager = {
			jumpToLevel1: () => {
				const gm = (window as any).gameManager;
				if (gm) {
					gm.level = 1;
					gm.score = 0;
					gm.shots = [null, null, null, null, null];
					gm.currentShotIndex = 0;
					gm.setPhase("IDLE");
					if ((window as any).updateLawn) (window as any).updateLawn();
					if ((window as any).updateSignboard) (window as any).updateSignboard();
					if ((window as any).updateGkScale) (window as any).updateGkScale();
					if ((window as any).updateCrowd) (window as any).updateCrowd();
					if ((window as any).updateClouds) (window as any).updateClouds();
					if ((window as any).applyFieldLinesSettings) (window as any).applyFieldLinesSettings();
				}
			},
			jumpToLevel2: () => {
				const gm = (window as any).gameManager;
				if (gm) {
					gm.level = 2;
					gm.score = 3;
					gm.shots = [null, null, null, null, null];
					gm.currentShotIndex = 0;
					gm.setPhase("IDLE");
					if ((window as any).updateLawn) (window as any).updateLawn();
					if ((window as any).updateSignboard) (window as any).updateSignboard();
					if ((window as any).updateGkScale) (window as any).updateGkScale();
					if ((window as any).updateCrowd) (window as any).updateCrowd();
					if ((window as any).updateClouds) (window as any).updateClouds();
					if ((window as any).applyFieldLinesSettings) (window as any).applyFieldLinesSettings();
				}
			},
			jumpToLevel3: () => {
				const gm = (window as any).gameManager;
				if (gm) {
					gm.level = 3;
					gm.score = 6;
					gm.shots = [null, null, null, null, null];
					gm.currentShotIndex = 0;
					gm.setPhase("IDLE");
					if ((window as any).updateLawn) (window as any).updateLawn();
					if ((window as any).updateSignboard) (window as any).updateSignboard();
					if ((window as any).updateGkScale) (window as any).updateGkScale();
					if ((window as any).updateCrowd) (window as any).updateCrowd();
					if ((window as any).updateClouds) (window as any).updateClouds();
				}
			}
		};

		const testFolder = gui.addFolder('Level Select (Testing)');
		testFolder.add(levelTestManager, 'jumpToLevel1').name('Jump to Level 1');
		testFolder.add(levelTestManager, 'jumpToLevel2').name('Jump to Level 2');
		testFolder.add(levelTestManager, 'jumpToLevel3').name('Jump to Level 3');

		const fieldFolder = gui.addFolder('Field Appearance');
		
		const f1Folder = fieldFolder.addFolder('Level 1 Field');
		f1Folder.add((window as any).fieldSettings, 'lvl1Mode', ["Striped", "Solid"]).name("Pattern").onChange(updateLawn);
		f1Folder.addColor((window as any).fieldSettings, 'lvl1Solid').name('Solid Color').onChange(updateLawn);
		f1Folder.addColor((window as any).fieldSettings, 'lvl1Light').name('Striped Light').onChange(updateLawn);
		f1Folder.addColor((window as any).fieldSettings, 'lvl1Dark').name('Striped Dark').onChange(updateLawn);

		const f2Folder = fieldFolder.addFolder('Level 2 Field');
		f2Folder.add((window as any).fieldSettings, 'lvl2Mode', ["Striped", "Solid"]).name("Pattern").onChange(updateLawn);
		f2Folder.addColor((window as any).fieldSettings, 'lvl2Solid').name('Solid Color').onChange(updateLawn);
		f2Folder.addColor((window as any).fieldSettings, 'lvl2Light').name('Striped Light').onChange(updateLawn);
		f2Folder.addColor((window as any).fieldSettings, 'lvl2Dark').name('Striped Dark').onChange(updateLawn);

		const f3Folder = fieldFolder.addFolder('Level 3 Field');
		f3Folder.add((window as any).fieldSettings, 'lvl3Mode', ["Striped", "Solid"]).name("Pattern").onChange(updateLawn);
		f3Folder.addColor((window as any).fieldSettings, 'lvl3Solid').name('Solid Color').onChange(updateLawn);
		f3Folder.addColor((window as any).fieldSettings, 'lvl3Light').name('Striped Light').onChange(updateLawn);
		f3Folder.addColor((window as any).fieldSettings, 'lvl3Dark').name('Striped Dark').onChange(updateLawn);

		const sizeFolder = fieldFolder.addFolder('Field Dimensions');
		sizeFolder.add((window as any).fieldSettings, 'stripeSize', 0.5, 5).step(0.1).name('Stripe Width').onChange(() => {
			if ((window as any).lawnTex) {
				(window as any).lawnTex.vScale = (window as any).fieldSettings.fieldDepth / ((window as any).fieldSettings.stripeSize * 2);
			}
		});
		
		const updateFieldDimensions = () => {
			const groundMesh = scene.getMeshByName("ground");
			if (groundMesh) {
				groundMesh.scaling.x = (window as any).fieldSettings.fieldWidth / 30;
				groundMesh.scaling.z = (window as any).fieldSettings.fieldDepth / 40;
				
				// Rebuild physics aggregate
				if (groundMesh.physicsBody) {
					groundMesh.physicsBody.dispose();
				}
				new PhysicsAggregate(groundMesh, PhysicsShapeType.BOX, { mass: 0, restitution: 0.5, friction: 0.8 }, scene);
				
				// Rebuild texture scaling
				if ((window as any).lawnTex) {
					(window as any).lawnTex.vScale = (window as any).fieldSettings.fieldDepth / ((window as any).fieldSettings.stripeSize * 2);
				}
			}
		};
		sizeFolder.add((window as any).fieldSettings, 'fieldWidth', 10, 100).step(1).name('Field Width').onChange(updateFieldDimensions);
		sizeFolder.add((window as any).fieldSettings, 'fieldDepth', 20, 150).step(1).name('Field Depth').onChange(updateFieldDimensions);
		
		(window as any).applyNetGridScale = () => {
			if ((window as any).netMat && (window as any).netMat.netTex) {
				const goalWidth = 7.32; // Physical width of the goal
				const baseScale = (window as any).fieldSettings.netGridScale / goalWidth;
				(window as any).netMat.netTex.uScale = baseScale;
				(window as any).netMat.netTex.vScale = baseScale;
			}
		};
		sizeFolder.add((window as any).fieldSettings, 'netGridScale', 5, 100).step(1).name('Net Grid Size').onChange((window as any).applyNetGridScale);

		// Field Lines UI
		(window as any).fieldLinesSettings = {
			level1: { color: "#ffffff", posX: 0, posY: 0.002, posZ: 1, scale: 1.0 },
			level2: { color: "#ffffff", posX: 0, posY: 0.002, posZ: 1, scale: 1.0 },
			level3: { color: "#ffffff", posX: 0, posY: 0.002, posZ: 1, scale: 1.0 }
		};

		(window as any).applyFieldLinesSettings = () => {
			const level = (window as any).gameManager?.level || 1;
			const set = (window as any).fieldLinesSettings[`level${level}`];
			if (!set) return;

			if ((window as any).fieldLinesMat) {
				(window as any).fieldLinesMat.emissiveColor = Color3.FromHexString(set.color);
			}
			const root = (window as any).fieldLinesRoot;
			if (root) {
				root.position.set(set.posX, set.posY, set.posZ);
				const s = set.scale;
				root.scaling.set(s, s, s);
			}
		};

		const createLinesFolder = (lvl: number, name: string) => {
			const f = fieldFolder.addFolder(name);
			const set = (window as any).fieldLinesSettings[`level${lvl}`];
			f.addColor(set, 'color').name('Line Color').onChange((window as any).applyFieldLinesSettings);
			f.add(set, 'posX', -20, 20).onChange((window as any).applyFieldLinesSettings);
			f.add(set, 'posY', -1, 5).onChange((window as any).applyFieldLinesSettings);
			f.add(set, 'posZ', -20, 20).onChange((window as any).applyFieldLinesSettings);
			f.add(set, 'scale', 0.1, 5).onChange((window as any).applyFieldLinesSettings);
		};

		createLinesFolder(1, 'Level 1 Field Lines');
		createLinesFolder(2, 'Level 2 Field Lines');
		createLinesFolder(3, 'Level 3 Field Lines');

		// Global game settings Manager (LocalStorage integration)
		const settingsManager = {
			saveLocal: () => {
				localStorage.setItem('game_debug_settings', JSON.stringify({
					cameraPos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
					cameraRot: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
					uiSettings: (window as any).uiSettings,
					animSettings: (window as any).animSettings,
					gameSettings: (window as any).gameSettings,
					lilGuiState: gui.save()
				}));
				alert('Settings saved to local storage! They will now persist across reloads.');
			},
			clearLocal: () => {
				localStorage.removeItem('game_debug_settings');
				alert('Saved settings cleared. Reloading page to apply hardcoded defaults.');
				window.location.reload();
			},
			printToConsole: () => {
				const jsonStr = JSON.stringify((window as any).debugGUI.save());
				console.log("Current Settings JSON (Paste this to the developer if you want them hardcoded):");
				console.log(jsonStr);
				navigator.clipboard.writeText(jsonStr).then(() => {
					alert('Settings copied directly to your clipboard and printed to console!');
				}).catch(() => {
					alert('Settings printed to browser console!');
				});
			}
		};

		const saveFolder = gui.addFolder('💾 Save / Export');
		saveFolder.add(settingsManager, 'saveLocal').name('Save to LocalStorage');
		saveFolder.add(settingsManager, 'clearLocal').name('Reset to Defaults');
		saveFolder.add(settingsManager, 'printToConsole').name('Print to Console');

		// Load from local storage immediately to override the default
		const userProvidedState = `{"controllers":{},"folders":{"Camera":{"controllers":{"FOV":0.72,"Pos X":0,"Pos Y":0.5,"Pos Z":-3.3,"Pitch (X)":0.1243550000306659,"Yaw (Y)":0,"Roll (Z)":0,"Shake Intensity":0.05,"Shake Speed":50,"Shake Duration":0.8},"folders":{}},"Audio Settings":{"controllers":{"Kick Volume":0.6,"Net Swish Volume":1,"Boing Volume":1},"folders":{}},"UI Elements":{"controllers":{},"folders":{"Test Screens":{"controllers":{},"folders":{}},"Endgame Screen":{"controllers":{"Bg Opacity":0.8,"Title Scale":1,"Title Y Offset":0,"Title Color":"#ffffff","Subtitle Scale":1,"Subtitle Y Offset":0,"Subtitle Color":"#ffffff","Button Scale":1,"Button Y Offset":0,"Button Text Color":"#ffffff","Button Bg Color":"#22c55e"},"folders":{}},"Level Complete Screen":{"controllers":{"Bg Opacity":0.6,"Title Scale":1,"Title Y Offset":0,"Title Color":"#facc15","Subtitle Scale":1,"Subtitle Y Offset":0,"Subtitle Color":"#ffffff","Icon Scale":1,"Icon Y Offset":0,"Icon Color":"#facc15","Button Scale":1,"Button Y Offset":0,"Button Text Color":"#000000","Button Bg Color":"#ff6bba"},"folders":{}},"Level Failed Screen":{"controllers":{"Bg Opacity":0.8,"Title Scale":1,"Title Y Offset":0,"Title Color":"#f87171","Subtitle Scale":1,"Subtitle Y Offset":0,"Subtitle Color":"#d1d5db","Button Scale":1,"Button Y Offset":0,"Button Text Color":"#ffffff","Button Bg Color":"#22c55e"},"folders":{}},"Level Badge":{"controllers":{"Scale":3,"Opacity":1,"Y Offset":16,"X Offset":16},"folders":{}},"Scoreboard (Shots)":{"controllers":{"Scale":1.8,"Opacity":1,"Y Offset":208,"X Offset":16},"folders":{}},"Center Instruction Text":{"controllers":{"Scale":0.8,"Opacity":1,"Y Offset":86},"folders":{}},"Outcome Text":{"controllers":{"Scale":1.65,"Opacity":1,"Y Offset":90},"folders":{}},"Direction / Text Overlays":{"controllers":{"Center Text Scale":0.8,"Center Text Y Offset":86,"Outcome Text Scale":1.65,"Outcome Text Y Offset":90},"folders":{}},"Retro Gauges Config":{"controllers":{"Global Y Position":38,"Global X Position":0,"Global Size":1.7},"folders":{"Direction Arrow":{"controllers":{"Speed Lvl 1":2.6,"Speed Lvl 2":3.5,"Speed Lvl 3":4.5,"Arrow Color":"#ffff00","Jiggle Intensity":0.15,"Jiggle Speed":40,"Jiggle Decay":5,"Jiggle Duration":1},"folders":{}},"Power Gauge":{"controllers":{"Scale":1,"X Offset":0,"Y Offset":0,"Speed":5.5},"folders":{}},"Height Gauge":{"controllers":{"Scale":1,"X Offset":0,"Y Offset":0,"Speed":5.5,"Power Mult Lvl 1":0,"Power Mult Lvl 2":0.5,"Power Mult Lvl 3":1},"folders":{}},"Curve Gauge":{"controllers":{"Scale":1,"X Offset":0,"Y Offset":27,"Speed":5.5},"folders":{}}}}}},"Preloader":{"controllers":{"Spinner Scale":1,"Spinner Y Offset":0,"Title Scale":1,"Title Y Offset":0,"Subtitle Scale":1,"Subtitle Y Offset":0},"folders":{}},"Game Physics & Rules":{"controllers":{"Ball Mass":3.1,"World Gravity":-14,"Kick Power":0.9,"Kick Height":1,"Curve Force":8,"Net Bulge Multiplier":0.9,"Net Impact Radius":1.9,"Net Ripple Amplitude":0.4,"Net Ripple Speed":9,"Signboard Bounciness":0.6,"Signboard Friction":0.5},"folders":{}},"Goalkeeper Tuning":{"controllers":{"Idle Anim FPS":12,"Jump Speed":3,"Jump Arc Gravity":50,"Max Jump Height":1.3,"Size (Level 1)":1,"Size (Level 2)":1.05,"Size (Level 3)":1.1},"folders":{"Landing Dust Effect":{"controllers":{"Scale":0.6,"X Offset":0,"Y Offset":-1.2,"Speed":1,"Opacity":1,"Min Jump Height":1.1},"folders":{}}}},"Goalkeeper AI Difficulty":{"controllers":{},"folders":{"Level 1":{"controllers":{"Wrong Way %":0.2,"Prediction Error":0.9},"folders":{}},"Level 2":{"controllers":{"Wrong Way %":0.2,"Prediction Error":0.7},"folders":{}},"Level 3":{"controllers":{"Wrong Way %":0.05,"Prediction Error":0.8},"folders":{}}}},"Collider Tuning":{"controllers":{"Show Colliders":false,"Ball Size":0.24,"Visual Y Offset":-0.12,"Post Size":0.12,"Net Depth":0.1,"Field Thickness":1,"GK Capsule Radius":0.3},"folders":{}},"Level Select (Testing)":{"controllers":{},"folders":{}},"Field Appearance":{"controllers":{},"folders":{"Level 1 Field":{"controllers":{"Pattern":"Solid","Solid Color":"#b98764","Striped Light":"#a3d27f","Striped Dark":"#b1df90"},"folders":{}},"Level 2 Field":{"controllers":{"Pattern":"Solid","Solid Color":"#5ecd93","Striped Light":"#d3ec79","Striped Dark":"#b3e38c"},"folders":{}},"Level 3 Field":{"controllers":{"Pattern":"Striped","Solid Color":"#60ce95","Striped Light":"#60ce95","Striped Dark":"#00b155"},"folders":{}},"Field Dimensions":{"controllers":{"Stripe Width":0.5,"Field Width":75,"Field Depth":40,"Net Grid Size":30},"folders":{}},"Level 1 Field Lines":{"controllers":{"Line Color":"#8b5427","posX":0,"posY":0.002,"posZ":1,"scale":1},"folders":{}},"Level 2 Field Lines":{"controllers":{"Line Color":"#ffffff","posX":0,"posY":0.002,"posZ":1,"scale":1},"folders":{}},"Level 3 Field Lines":{"controllers":{"Line Color":"#ffffff","posX":0,"posY":0.002,"posZ":1,"scale":1},"folders":{}}}},"💾 Save / Export":{"controllers":{},"folders":{}},"Signboard":{"controllers":{},"folders":{"Level 1":{"controllers":{"Width":47.35,"Height":0.7755,"Pos Z":12.5,"Pos Y":0,"uScale":10},"folders":{}},"Level 2":{"controllers":{"Width":47.35,"Height":0.7755,"Pos Z":12.5,"Pos Y":0,"uScale":10},"folders":{}},"Level 3":{"controllers":{"Width":47.35,"Height":0.7755,"Pos Z":12.5,"Pos Y":0,"uScale":10},"folders":{}}}},"Crowd Characters":{"controllers":{},"folders":{"Level 1":{"controllers":{},"folders":{"Character 1":{"controllers":{"Enabled":true,"Texture Path":"/crowd_level_01/crowd_man_01.png","Pos X":-6.8,"Pos Y":0,"Pos Z":14.040180080520576,"Scale":2.25,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 2":{"controllers":{"Enabled":true,"Texture Path":"/crowd_level_01/crowd_man_02.png","Pos X":7.8,"Pos Y":0,"Pos Z":15.091522762283393,"Scale":1.9326,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 3":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_01/crowd_man_01.png","Pos X":0,"Pos Y":0,"Pos Z":15.308819507164111,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 4":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_01/crowd_man_01.png","Pos X":2,"Pos Y":0,"Pos Z":14.50240388193018,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 5":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_01/crowd_man_01.png","Pos X":4,"Pos Y":0,"Pos Z":14.723105130517377,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 6":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_01/crowd_man_01.png","Pos X":6,"Pos Y":0,"Pos Z":15.735629147074318,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 7":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_01/crowd_man_01.png","Pos X":8,"Pos Y":0,"Pos Z":15.556004459443853,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 8":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_01/crowd_man_01.png","Pos X":10,"Pos Y":0,"Pos Z":14.453435697563393,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 9":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_01/crowd_man_01.png","Pos X":12,"Pos Y":0,"Pos Z":14.892153025390307,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 10":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_01/crowd_man_01.png","Pos X":14,"Pos Y":0,"Pos Z":15.801631140013455,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}}}},"Level 2":{"controllers":{},"folders":{"Character 1":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_02/crowd_man_01.png","Pos X":-4,"Pos Y":0,"Pos Z":14.480919068747305,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 2":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_02/crowd_man_01.png","Pos X":-2,"Pos Y":0,"Pos Z":14.926974028012198,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 3":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_02/crowd_man_01.png","Pos X":0,"Pos Y":0,"Pos Z":15.999742573940587,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 4":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_02/crowd_man_01.png","Pos X":2,"Pos Y":0,"Pos Z":14.403774817828715,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 5":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_02/crowd_man_01.png","Pos X":4,"Pos Y":0,"Pos Z":14.110329596646563,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 6":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_02/crowd_man_01.png","Pos X":6,"Pos Y":0,"Pos Z":15.509952360452843,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 7":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_02/crowd_man_01.png","Pos X":8,"Pos Y":0,"Pos Z":15.777060136373551,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 8":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_02/crowd_man_01.png","Pos X":10,"Pos Y":0,"Pos Z":14.196260920664946,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 9":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_02/crowd_man_01.png","Pos X":12,"Pos Y":0,"Pos Z":14.991667554460692,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 10":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_02/crowd_man_01.png","Pos X":14,"Pos Y":0,"Pos Z":15.290171562509729,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}}}},"Level 3":{"controllers":{},"folders":{"Character 1":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_03/crowd_man_01.png","Pos X":-4,"Pos Y":0,"Pos Z":15.741981559389991,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 2":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_03/crowd_man_01.png","Pos X":-2,"Pos Y":0,"Pos Z":14.324954940222423,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 3":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_03/crowd_man_01.png","Pos X":0,"Pos Y":0,"Pos Z":14.726494321896105,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 4":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_03/crowd_man_01.png","Pos X":2,"Pos Y":0,"Pos Z":14.373757835068075,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 5":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_03/crowd_man_01.png","Pos X":4,"Pos Y":0,"Pos Z":15.18676775233867,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 6":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_03/crowd_man_01.png","Pos X":6,"Pos Y":0,"Pos Z":15.84313571064792,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 7":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_03/crowd_man_01.png","Pos X":8,"Pos Y":0,"Pos Z":14.98584933356153,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 8":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_03/crowd_man_01.png","Pos X":10,"Pos Y":0,"Pos Z":15.6021725580205,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 9":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_03/crowd_man_01.png","Pos X":12,"Pos Y":0,"Pos Z":14.874936372876103,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}},"Character 10":{"controllers":{"Enabled":false,"Texture Path":"/crowd_level_03/crowd_man_01.png","Pos X":14,"Pos Y":0,"Pos Z":14.780330448497807,"Scale":1.5,"Jump Height":1,"Jump Speed":10,"Jump Duration":2},"folders":{}}}}}},"Cloud Layer":{"controllers":{"Scroll Speed":1.48},"folders":{"Level 1":{"controllers":{},"folders":{"Cloud 1":{"controllers":{"Enabled":true,"Texture Path":"/clouds_level_01/level_01_cloud_01.png","Pos X":24.967864000175663,"Pos Y":6.42,"Pos Z":25.980119798422283,"Scale":4},"folders":{}},"Cloud 2":{"controllers":{"Enabled":true,"Texture Path":"/clouds_level_01/level_01_cloud_02.png","Pos X":39.967864000174345,"Pos Y":8.16,"Pos Z":27.072977316867853,"Scale":4},"folders":{}},"Cloud 3":{"controllers":{"Enabled":true,"Texture Path":"/clouds_level_01/level_01_cloud_03.png","Pos X":-45.032135999824895,"Pos Y":7.29,"Pos Z":29.822848983062176,"Scale":6.0899},"folders":{}},"Cloud 4":{"controllers":{"Enabled":false,"Texture Path":"/clouds_level_01/cloud_01.png","Pos X":35,"Pos Y":9.985142173312482,"Pos Z":29.786784399552275,"Scale":4},"folders":{}},"Cloud 5":{"controllers":{"Enabled":false,"Texture Path":"/clouds_level_01/cloud_01.png","Pos X":50,"Pos Y":9.431766976809987,"Pos Z":29.801210428731462,"Scale":4},"folders":{}}}},"Level 2":{"controllers":{},"folders":{"Cloud 1":{"controllers":{"Enabled":true,"Texture Path":"/clouds_level_02/level_02_cloud_01.png","Pos X":23.37272400002107,"Pos Y":5.1,"Pos Z":28.914898038784617,"Scale":10.1495},"folders":{}},"Cloud 2":{"controllers":{"Enabled":true,"Texture Path":"/clouds_level_02/level_02_cloud_02.png","Pos X":-41.308731999964316,"Pos Y":5.55,"Pos Z":28.97873648941075,"Scale":8.4182},"folders":{}},"Cloud 3":{"controllers":{"Enabled":false,"Texture Path":"/clouds_level_02/cloud_01.png","Pos X":20,"Pos Y":10.303109383878681,"Pos Z":26.548887210941402,"Scale":4},"folders":{}},"Cloud 4":{"controllers":{"Enabled":false,"Texture Path":"/clouds_level_02/cloud_01.png","Pos X":35,"Pos Y":11.30480457820917,"Pos Z":27.347403700083742,"Scale":4},"folders":{}},"Cloud 5":{"controllers":{"Enabled":false,"Texture Path":"/clouds_level_02/cloud_01.png","Pos X":50,"Pos Y":8.852465298019531,"Pos Z":26.227475699323456,"Scale":4},"folders":{}}}},"Level 3":{"controllers":{},"folders":{"Cloud 1":{"controllers":{"Enabled":false,"Texture Path":"/clouds_level_03/cloud_01.png","Pos X":-10,"Pos Y":9.392251580367438,"Pos Z":29.483255014447163,"Scale":4},"folders":{}},"Cloud 2":{"controllers":{"Enabled":false,"Texture Path":"/clouds_level_03/cloud_01.png","Pos X":5,"Pos Y":8.041467433161525,"Pos Z":29.131106897925186,"Scale":4},"folders":{}},"Cloud 3":{"controllers":{"Enabled":false,"Texture Path":"/clouds_level_03/cloud_01.png","Pos X":20,"Pos Y":10.659820183424628,"Pos Z":26.4791038702554,"Scale":4},"folders":{}},"Cloud 4":{"controllers":{"Enabled":false,"Texture Path":"/clouds_level_03/cloud_01.png","Pos X":35,"Pos Y":10.238197888698977,"Pos Z":25.354992928567857,"Scale":4},"folders":{}},"Cloud 5":{"controllers":{"Enabled":false,"Texture Path":"/clouds_level_03/cloud_01.png","Pos X":50,"Pos Y":8.704645354298375,"Pos Z":29.3462850063655,"Scale":4},"folders":{}}}}}},"Confetti":{"controllers":{"Gravity":-18.69,"Burst Power":25,"Dispersion / Spread":1.5,"Size":0.2349,"Shower Rate":30,"Burst Density":100},"folders":{}},"Fake Shadows":{"controllers":{"opacity":0.15,"softness":0.16,"ballSize":0.24,"gkSize":1},"folders":{}},"Goalkeeper Impact Effect":{"controllers":{"Core Color":"#ffcc33","Edge Color":"#ff661a","Min Size":0.3,"Max Size":1,"Particle Count":2000,"Min Burst Speed":10,"Max Burst Speed":47.134},"folders":{}},"Anime Speedlines Effect":{"controllers":{"Line Color":"#e6f2ff","Animation Speed":30,"Line Density":150,"Line Thickness (inverse)":0.85,"Min Power Required":0.8,"Intensity Multiplier":5},"folders":{}},"Environment":{"controllers":{},"folders":{"Level 1 Sky":{"controllers":{"Sky Color":"#23baec"},"folders":{}},"Level 2 Sky":{"controllers":{"Sky Color":"#c490c0"},"folders":{}},"Level 3 Sky":{"controllers":{"Sky Color":"#101820"},"folders":{}}}},"Power Rings":{"controllers":{"Base Size":0.1927,"Max Size":1.5,"Opacity":0.1594,"Ring Thickness":40},"folders":{}}}}`;
		const defaultSettingsStr = `{"lilGuiState": ${userProvidedState}}`;
		const savedStr = localStorage.getItem('game_debug_settings') || defaultSettingsStr;

		if (savedStr) {
			try {
				const saved = JSON.parse(savedStr);
				
				if (saved.cameraPos) camera.position.set(saved.cameraPos.x, saved.cameraPos.y, saved.cameraPos.z);
				if (saved.cameraRot) camera.rotation.set(saved.cameraRot.x, saved.cameraRot.y, saved.cameraRot.z);

				// Object.assign((window as any).uiSettings, saved.uiSettings);
				if (saved.animSettings) Object.assign((window as any).animSettings, saved.animSettings);
				if (saved.gameSettings) Object.assign((window as any).gameSettings, saved.gameSettings);

				// Apply physics right away
				scene.getPhysicsEngine()?.setGravity(new Vector3(0, (window as any).gameSettings.sceneGravity, 0));
				scene.getPhysicsEngine()?.setSubTimeStep(1000 / 120); // 120Hz physics to prevent tunneling

				if (saved.lilGuiState) {
					// Store it to load at the end of onSceneReady when all folders exist
					(window as any).savedGuiState = saved.lilGuiState;
				}
			} catch(e) {
				console.error("Failed to parse saved settings", e);
			}
		}

		// Collapse all folders and the entire GUI by default so it doesn't block the screen
		gui.folders.forEach(f => f.close());
		gui.close();

		const light = new HemisphericLight("light1", new Vector3(0, 1, 0), scene);
		light.intensity = 0.7;

		// 3. Programmatic Scene Generation (Placeholders)
		
		// Ground
		const ground = MeshBuilder.CreateBox("ground", { width: 30, height: 1.0, depth: 40 }, scene);
		ground.position.y = -0.5; // Ensure top surface is precisely at y=0
		
		// Landing Dust Effect Setup (PNG Sequence)
		const landingDustTextures: Texture[] = [];
		for (let i = 1; i <= 13; i++) {
			const numStr = i.toString().padStart(5, '0');
			const tex = new Texture(`/dust_land/dust_${numStr}.png`, scene);
			tex.hasAlpha = true;
			landingDustTextures.push(tex);
		}
		
		const dustMat = new StandardMaterial("dustMat", scene);
		dustMat.disableLighting = true;
		dustMat.emissiveColor = new Color3(1, 1, 1);
		dustMat.useAlphaFromDiffuseTexture = true; // Use alpha channel from the PNGs
		dustMat.backFaceCulling = false;
		if (landingDustTextures.length > 0) {
			dustMat.diffuseTexture = landingDustTextures[0];
			dustMat.emissiveTexture = landingDustTextures[0];
			dustMat.diffuseTexture.hasAlpha = true;
		}
		
		const landingDustPlane = MeshBuilder.CreatePlane("landingDustPlane", {size: 5}, scene);
		landingDustPlane.material = dustMat;
		landingDustPlane.billboardMode = Mesh.BILLBOARDMODE_Y;
		landingDustPlane.isVisible = false;
		landingDustPlane.renderingGroupId = 1; // Render on top of everything to ensure it's not hiding in the ground
		
		// Expose globally for GoalkeeperController
		(window as any).landingDustTextures = landingDustTextures;
		(window as any).landingDustPlane = landingDustPlane;

		// Pre-warming not needed for PNG sequence


		const groundMat = new StandardMaterial("groundMat", scene);
		const lawnTex = new DynamicTexture("lawnTex", {width: 16, height: 512}, scene, false);
		(window as any).lawnTex = lawnTex;
		(window as any).lawnCtx = lawnTex.getContext();
		
		updateLawn(); // Draw initial colors
		
		lawnTex.wrapU = Texture.WRAP_ADDRESSMODE;
		lawnTex.wrapV = Texture.WRAP_ADDRESSMODE;
		lawnTex.vScale = (window as any).fieldSettings.fieldDepth / ((window as any).fieldSettings.stripeSize * 2);
		lawnTex.uScale = 1;
		lawnTex.gammaSpace = false; // Prevents Babylon from converting the canvas hex colors to linear (darkening them)

		groundMat.diffuseTexture = lawnTex;
		groundMat.emissiveTexture = lawnTex;
		groundMat.emissiveColor = new Color3(1, 1, 1);
		groundMat.disableLighting = true; 
		ground.material = groundMat;
		new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, restitution: 0.5, friction: 0.8 }, scene);
		updateFieldDimensions();

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
		(window as any).netMat = netMat;
		
		const scaleUVs = (mesh: Mesh, u: number, v: number) => {
			const uvs = mesh.getVerticesData("uv");
			if (uvs) {
				for (let i = 0; i < uvs.length; i += 2) {
					uvs[i] *= u;
					uvs[i + 1] *= v;
				}
				mesh.setVerticesData("uv", uvs);
			}
		};
		
		// Back
		const netBack = MeshBuilder.CreateGround("netBack", { width: goalWidth, height: goalHeight, subdivisions: 20 }, scene);
		netBack.rotation.x = -Math.PI / 2;
		netBack.position = new Vector3(0, goalHeight / 2, 11);
		scaleUVs(netBack, goalWidth, goalHeight);

		// Top
		const netTop = MeshBuilder.CreateGround("netTop", { width: goalWidth, height: 1.0, subdivisions: 20 }, scene);
		netTop.rotation.x = Math.PI; // Face down
		netTop.position = new Vector3(0, goalHeight, 10.5);
		scaleUVs(netTop, goalWidth, 1.0);

		// Left
		const netLeft = MeshBuilder.CreateGround("netLeft", { width: goalHeight, height: 1.0, subdivisions: 20 }, scene);
		netLeft.rotation.z = -Math.PI / 2; // Face right (+X)
		netLeft.position = new Vector3(-goalWidth / 2, goalHeight / 2, 10.5);
		scaleUVs(netLeft, goalHeight, 1.0); // Wait, width in the constructor is goalHeight!

		// Right
		const netRight = MeshBuilder.CreateGround("netRight", { width: goalHeight, height: 1.0, subdivisions: 20 }, scene);
		netRight.rotation.z = Math.PI / 2; // Face left (-X)
		netRight.position = new Vector3(goalWidth / 2, goalHeight / 2, 10.5);
		scaleUVs(netRight, goalHeight, 1.0); // Width in constructor is goalHeight

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

		const signboard = MeshBuilder.CreateBox("signboard", { width: 30, height: 1.5, depth: 0.5 }, scene);
		signboard.scaling.x = 47.35 / 30;
		signboard.scaling.y = 1.75 / 1.5;
		signboard.position = new Vector3(0, 1.75 / 2, 12.5);
		signboard.material = signboardMat;
		signboard.name = "signboard";
		(window as any).signboardRef = signboard;

		const updateSignboardPhysics = () => {
			if (signboard.physicsBody) {
				signboard.physicsBody.dispose();
			}
			signboard.computeWorldMatrix(true);
			const gameSettings = (window as any).gameSettings;
			new PhysicsAggregate(signboard, PhysicsShapeType.BOX, { 
				mass: 0, 
				restitution: gameSettings ? gameSettings.signboardBounciness : 0.6, 
				friction: gameSettings ? gameSettings.signboardFriction : 0.5
			}, scene);
			if (signboard.physicsBody) {
				signboard.physicsBody.disablePreStep = false;
			}
		};

		updateSignboardPhysics();
		const sbGuiFolder = gui.addFolder('Signboard');
		(window as any).signboardSettings = {
			lvl1Width: 47.35, lvl1Height: 0.7755, lvl1PosZ: 12.5, lvl1PosY: 0, lvl1UScale: 10,
			lvl2Width: 47.35, lvl2Height: 0.7755, lvl2PosZ: 12.5, lvl2PosY: 0, lvl2UScale: 10,
			lvl3Width: 47.35, lvl3Height: 0.7755, lvl3PosZ: 12.5, lvl3PosY: 0, lvl3UScale: 10
		};

		const updateSignboard = () => {
			const level = (window as any).gameManager?.level || 1;
			const st = (window as any).signboardSettings;
			let w, h, pZ, pY, u;
			if (level === 1) {
				w = st.lvl1Width; h = st.lvl1Height; pZ = st.lvl1PosZ; pY = st.lvl1PosY; u = st.lvl1UScale;
				signboardTex.updateURL("/textures/signboard_01.png");
			} else if (level === 2) {
				w = st.lvl2Width; h = st.lvl2Height; pZ = st.lvl2PosZ; pY = st.lvl2PosY; u = st.lvl2UScale;
				signboardTex.updateURL("/textures/signboard_02.png");
			} else {
				w = st.lvl3Width; h = st.lvl3Height; pZ = st.lvl3PosZ; pY = st.lvl3PosY; u = st.lvl3UScale;
				signboardTex.updateURL("/textures/signboard_03.png");
			}
			signboard.scaling.x = w / 30;
			signboard.scaling.y = h / 1.5;
			signboard.position.z = pZ;
			signboard.position.y = pY + (h / 2);
			signboardTex.uScale = u;
			updateSignboardPhysics();
		};
		(window as any).updateSignboard = updateSignboard;
		updateSignboard(); // Initialize with correct texture and scales

		const sbLvl1 = sbGuiFolder.addFolder('Level 1');
		sbLvl1.add((window as any).signboardSettings, 'lvl1Width', 10, 100).name('Width').onChange(updateSignboard);
		sbLvl1.add((window as any).signboardSettings, 'lvl1Height', 0.5, 10).name('Height').onChange(updateSignboard);
		sbLvl1.add((window as any).signboardSettings, 'lvl1PosZ', 10, 30).name('Pos Z').onChange(updateSignboard);
		sbLvl1.add((window as any).signboardSettings, 'lvl1PosY', -2, 10).name('Pos Y').onChange(updateSignboard);
		sbLvl1.add((window as any).signboardSettings, 'lvl1UScale', 1, 20).step(1).name('uScale').onChange(updateSignboard);

		const sbLvl2 = sbGuiFolder.addFolder('Level 2');
		sbLvl2.add((window as any).signboardSettings, 'lvl2Width', 10, 100).name('Width').onChange(updateSignboard);
		sbLvl2.add((window as any).signboardSettings, 'lvl2Height', 0.5, 10).name('Height').onChange(updateSignboard);
		sbLvl2.add((window as any).signboardSettings, 'lvl2PosZ', 10, 30).name('Pos Z').onChange(updateSignboard);
		sbLvl2.add((window as any).signboardSettings, 'lvl2PosY', -2, 10).name('Pos Y').onChange(updateSignboard);
		sbLvl2.add((window as any).signboardSettings, 'lvl2UScale', 1, 20).step(1).name('uScale').onChange(updateSignboard);

		const sbLvl3 = sbGuiFolder.addFolder('Level 3');
		sbLvl3.add((window as any).signboardSettings, 'lvl3Width', 10, 100).name('Width').onChange(updateSignboard);
		sbLvl3.add((window as any).signboardSettings, 'lvl3Height', 0.5, 10).name('Height').onChange(updateSignboard);
		sbLvl3.add((window as any).signboardSettings, 'lvl3PosZ', 10, 30).name('Pos Z').onChange(updateSignboard);
		sbLvl3.add((window as any).signboardSettings, 'lvl3PosY', -2, 10).name('Pos Y').onChange(updateSignboard);
		sbLvl3.add((window as any).signboardSettings, 'lvl3UScale', 1, 20).step(1).name('uScale').onChange(updateSignboard);

		// --- Crowd Characters ---
		const crowdSettings: any = {};
		
		for (let l = 1; l <= 3; l++) {
			for (let s = 0; s < 10; s++) {
				crowdSettings[`lvl${l}_${s}_enabled`] = (l === 1 && (s === 0 || s === 1));
				crowdSettings[`lvl${l}_${s}_tex`] = (l === 1 && s === 0) ? "/crowd_level_01/crowd_man_01.png" : 
					(l === 1 && s === 1) ? "/crowd_level_01/crowd_man_02.png" : 
					`/crowd_level_0${l}/crowd_man_01.png`;
				crowdSettings[`lvl${l}_${s}_x`] = -4 + (s * 2);
				crowdSettings[`lvl${l}_${s}_y`] = 0;
				crowdSettings[`lvl${l}_${s}_z`] = 14 + (Math.random() * 2);
				crowdSettings[`lvl${l}_${s}_scale`] = 1.5;
				crowdSettings[`lvl${l}_${s}_jumpHeight`] = 1.0;
				crowdSettings[`lvl${l}_${s}_jumpSpeed`] = 10;
				crowdSettings[`lvl${l}_${s}_jumpDuration`] = 2.0;
			}
		}
		(window as any).crowdSettings = crowdSettings;

		const crowdMeshes: Mesh[] = [];
		const crowdMaterials: StandardMaterial[] = [];

		const updateCrowd = () => {
			const currentLevel = (window as any).gameManager?.level || 1;
			let meshIndex = 0;
			for (let l = 1; l <= 3; l++) {
				for (let s = 0; s < 10; s++) {
					const mesh = crowdMeshes[meshIndex];
					const mat = crowdMaterials[meshIndex];
					const enabled = crowdSettings[`lvl${l}_${s}_enabled`];
					const tex = crowdSettings[`lvl${l}_${s}_tex`];
					const x = crowdSettings[`lvl${l}_${s}_x`];
					const baseY = crowdSettings[`lvl${l}_${s}_y`];
					const z = crowdSettings[`lvl${l}_${s}_z`];
					const scale = crowdSettings[`lvl${l}_${s}_scale`];

					if (l === currentLevel && enabled) {
						mesh.isVisible = true;
						mesh.position.x = x;
						if (!(window as any).isCrowdJumping) {
							mesh.position.y = baseY;
						}
						mesh.position.z = z;
						mesh.scaling.set(scale, scale, scale);
						// Update texture if changed
						if ((mat.diffuseTexture as Texture)?.name !== tex) {
							const newTex = new Texture(tex, scene, true, true);
							newTex.hasAlpha = true;
							mat.diffuseTexture = newTex;
						}
					} else {
						mesh.isVisible = false;
					}
					meshIndex++;
				}
			}
		};
		(window as any).updateCrowd = updateCrowd;

		// Create meshes
		for (let l = 1; l <= 3; l++) {
			for (let s = 0; s < 10; s++) {
				const plane = MeshBuilder.CreatePlane(`crowd_l${l}_s${s}`, { size: 1 }, scene);
				const positions = plane.getVerticesData("position");
				if (positions) {
					for (let i = 1; i < positions.length; i += 3) {
						positions[i] += 0.5; // Shift Y up by half size
					}
					plane.setVerticesData("position", positions);
				}
				plane.billboardMode = Mesh.BILLBOARDMODE_Y;
				plane.position.y = 0;

				const mat = new StandardMaterial(`crowdMat_l${l}_s${s}`, scene);
				mat.diffuseTexture = new Texture(crowdSettings[`lvl${l}_${s}_tex`], scene, true, true);
				mat.diffuseTexture.hasAlpha = true;
				mat.useAlphaFromDiffuseTexture = true;
				mat.specularColor = new Color3(0, 0, 0);
				mat.disableLighting = true;
				mat.emissiveColor = new Color3(1, 1, 1);
				plane.material = mat;
				
				crowdMeshes.push(plane);
				crowdMaterials.push(mat);
			}
		}

		const crowdGuiFolder = gui.addFolder('Crowd Characters');

		for (let l = 1; l <= 3; l++) {
			const lvlFolder = crowdGuiFolder.addFolder(`Level ${l}`);
			lvlFolder.close();
			for (let s = 0; s < 10; s++) {
				const slotFolder = lvlFolder.addFolder(`Character ${s + 1}`);
				slotFolder.close();
				slotFolder.add(crowdSettings, `lvl${l}_${s}_enabled`).name('Enabled').onChange(updateCrowd);
				slotFolder.add(crowdSettings, `lvl${l}_${s}_tex`).name('Texture Path').onChange(updateCrowd);
				slotFolder.add(crowdSettings, `lvl${l}_${s}_x`, -50, 50).name('Pos X').onChange(updateCrowd);
				slotFolder.add(crowdSettings, `lvl${l}_${s}_y`, -10, 10).name('Pos Y').onChange(updateCrowd);
				slotFolder.add(crowdSettings, `lvl${l}_${s}_z`, 12, 50).name('Pos Z').onChange(updateCrowd);
				slotFolder.add(crowdSettings, `lvl${l}_${s}_scale`, 0.1, 5).name('Scale').onChange(updateCrowd);
				slotFolder.add(crowdSettings, `lvl${l}_${s}_jumpHeight`, 0.1, 5).name('Jump Height');
				slotFolder.add(crowdSettings, `lvl${l}_${s}_jumpSpeed`, 1, 30).name('Jump Speed');
				slotFolder.add(crowdSettings, `lvl${l}_${s}_jumpDuration`, 0.5, 10).name('Jump Duration');
			}
		}
		
		updateCrowd();

		let isCrowdJumping = false;
		let crowdJumpTimer = 0;
		(window as any).isCrowdJumping = false;
		const triggerCrowdJump = () => {
			(window as any).isCrowdJumping = true;
			crowdJumpTimer = 0;
			crowdMeshes.forEach(m => {
				if (m.isVisible) {
					(m as any).jumpOffset = Math.random() * Math.PI;
				}
			});
		};
		(window as any).triggerCrowdJump = triggerCrowdJump;

		scene.onBeforeRenderObservable.add(() => {
			if ((window as any).isCrowdJumping) {
				crowdJumpTimer += scene.getEngine().getDeltaTime() * 0.001;
				
				let stillJumping = false;
				crowdMeshes.forEach((mesh, i) => {
					if (mesh.isVisible) {
						const l = Math.floor(i / 10) + 1;
						const s = i % 10;
						const baseY = crowdSettings[`lvl${l}_${s}_y`] || 0;
						const height = crowdSettings[`lvl${l}_${s}_jumpHeight`] || 1.0;
						const speed = crowdSettings[`lvl${l}_${s}_jumpSpeed`] || 10;
						const duration = crowdSettings[`lvl${l}_${s}_jumpDuration`] || 2.0;
						const offset = (mesh as any).jumpOffset || 0;
						
						let localTime = (crowdJumpTimer * speed) - offset; 
						if (localTime < 0) localTime = 0;
						
						if (crowdJumpTimer < duration + (offset / speed)) { 
							stillJumping = true;
							const decay = Math.max(0, 1 - (crowdJumpTimer / duration));
							mesh.position.y = baseY + Math.abs(Math.sin(localTime)) * height * decay;
						} else {
							mesh.position.y = baseY;
						}
					}
				});
				
				if (!stillJumping && crowdJumpTimer > 15) {
					(window as any).isCrowdJumping = false;
					crowdMeshes.forEach((mesh, i) => {
						const l = Math.floor(i / 10) + 1;
						const s = i % 10;
						mesh.position.y = crowdSettings[`lvl${l}_${s}_y`] || 0;
					});
				}
			}
		});
		// --- Cloud Layer ---
		const cloudSettings: any = {
			scrollSpeed: 1.0
		};
		
		for (let l = 1; l <= 3; l++) {
			for (let s = 0; s < 5; s++) {
				cloudSettings[`lvl${l}_${s}_enabled`] = (l === 1 && (s === 0 || s === 1 || s === 2));
				cloudSettings[`lvl${l}_${s}_tex`] = (l === 1 && s === 0) ? "/clouds_level_01/level_01_cloud_01.png" : 
					(l === 1 && s === 1) ? "/clouds_level_01/level_01_cloud_02.png" : 
					(l === 1 && s === 2) ? "/clouds_level_01/level_01_cloud_03.png" : 
					`/clouds_level_0${l}/cloud_01.png`;
				cloudSettings[`lvl${l}_${s}_x`] = -10 + (s * 15);
				cloudSettings[`lvl${l}_${s}_y`] = 8 + (Math.random() * 4);
				cloudSettings[`lvl${l}_${s}_z`] = 25 + (Math.random() * 5);
				cloudSettings[`lvl${l}_${s}_scale`] = 4.0;
			}
		}
		(window as any).cloudSettings = cloudSettings;

		const cloudMeshes: Mesh[] = [];
		const cloudMaterials: StandardMaterial[] = [];

		const updateClouds = () => {
			const currentLevel = (window as any).gameManager?.level || 1;
			let meshIndex = 0;
			for (let l = 1; l <= 3; l++) {
				for (let s = 0; s < 5; s++) {
					const mesh = cloudMeshes[meshIndex];
					const mat = cloudMaterials[meshIndex];
					const enabled = cloudSettings[`lvl${l}_${s}_enabled`];
					const tex = cloudSettings[`lvl${l}_${s}_tex`];
					const y = cloudSettings[`lvl${l}_${s}_y`];
					const z = cloudSettings[`lvl${l}_${s}_z`];
					const scale = cloudSettings[`lvl${l}_${s}_scale`];

					if (l === currentLevel && enabled) {
						mesh.isVisible = true;
						mesh.position.y = y;
						mesh.position.z = z;
						mesh.scaling.set(scale, scale, scale);
						if ((mat.diffuseTexture as Texture)?.name !== tex) {
							const newTex = new Texture(tex, scene, true, true, Texture.NEAREST_SAMPLINGMODE);
							newTex.hasAlpha = true;
							mat.diffuseTexture = newTex;
						}
					} else {
						mesh.isVisible = false;
					}
					meshIndex++;
				}
			}
		};
		(window as any).updateClouds = updateClouds;

		for (let l = 1; l <= 3; l++) {
			for (let s = 0; s < 5; s++) {
				const plane = MeshBuilder.CreatePlane(`cloud_l${l}_s${s}`, { size: 1 }, scene);
				plane.billboardMode = Mesh.BILLBOARDMODE_Y;
				plane.position.x = cloudSettings[`lvl${l}_${s}_x`];
				plane.position.y = cloudSettings[`lvl${l}_${s}_y`];
				plane.position.z = cloudSettings[`lvl${l}_${s}_z`];

				const mat = new StandardMaterial(`cloudMat_l${l}_s${s}`, scene);
				mat.diffuseTexture = new Texture(cloudSettings[`lvl${l}_${s}_tex`], scene, false, true);
				mat.diffuseTexture.hasAlpha = true;
				mat.useAlphaFromDiffuseTexture = true;
				mat.specularColor = new Color3(0, 0, 0);
				mat.disableLighting = true;
				mat.emissiveColor = new Color3(1, 1, 1);
				plane.material = mat;
				
				cloudMeshes.push(plane);
				cloudMaterials.push(mat);
			}
		}

		const cloudGuiFolder = gui.addFolder('Cloud Layer');
		cloudGuiFolder.add(cloudSettings, 'scrollSpeed', 0, 10).name('Scroll Speed');

		for (let l = 1; l <= 3; l++) {
			const lvlFolder = cloudGuiFolder.addFolder(`Level ${l}`);
			lvlFolder.close();
			for (let s = 0; s < 5; s++) {
				const slotFolder = lvlFolder.addFolder(`Cloud ${s + 1}`);
				slotFolder.close();
				slotFolder.add(cloudSettings, `lvl${l}_${s}_enabled`).name('Enabled').onChange(updateClouds);
				slotFolder.add(cloudSettings, `lvl${l}_${s}_tex`).name('Texture Path').onChange(updateClouds);
				slotFolder.add(cloudSettings, `lvl${l}_${s}_x`, -50, 50).name('Pos X').onChange((v: number) => {
					cloudMeshes[(l-1)*5 + s].position.x = v;
				}).listen();
				slotFolder.add(cloudSettings, `lvl${l}_${s}_y`, 0, 30).name('Pos Y').onChange(updateClouds);
				slotFolder.add(cloudSettings, `lvl${l}_${s}_z`, 15, 60).name('Pos Z').onChange(updateClouds);
				slotFolder.add(cloudSettings, `lvl${l}_${s}_scale`, 0.1, 20).name('Scale').onChange(updateClouds);
			}
		}
		
		updateClouds();

		scene.onBeforeRenderObservable.add(() => {
			const speed = cloudSettings.scrollSpeed;
			if (speed > 0) {
				const dt = scene.getEngine().getDeltaTime() * 0.001;
				let meshIndex = 0;
				for (let l = 1; l <= 3; l++) {
					for (let s = 0; s < 5; s++) {
						const mesh = cloudMeshes[meshIndex];
						if (mesh.isVisible) {
							mesh.position.x -= speed * dt; // Scroll left
							if (mesh.position.x < -50) {
								mesh.position.x += 100; // Seamless wrap to right
							}
							cloudSettings[`lvl${l}_${s}_x`] = mesh.position.x;
						}
						meshIndex++;
					}
				}
			}
		});

		// Goalkeeper Physics Capsule (Main Root)
		const goalkeeperBody = MeshBuilder.CreateCapsule("goalkeeperBody", { height: 1.6, radius: 0.3 }, scene);
		goalkeeperBody.position = new Vector3(0, 0.8, 9.6); // Center is at 0.8 height
		goalkeeperBody.visibility = 0; // Invisible
		new PhysicsAggregate(goalkeeperBody, PhysicsShapeType.CAPSULE, { mass: 0, restitution: 0.6, friction: 0.8 }, scene);
		if (goalkeeperBody.physicsBody) {
			goalkeeperBody.physicsBody.disablePreStep = false;
		}
		(window as any).gkBodyRef = goalkeeperBody;

		// Goalkeeper Visual Plane (Child of Physics Body)
		const goalkeeper = MeshBuilder.CreatePlane("goalkeeper", { width: 1.61, height: 1.61 }, scene);
		goalkeeper.parent = goalkeeperBody;
		// Position relative to the center of the capsule (which is 0, 0, 0 in local space)
		goalkeeper.position = new Vector3(0, 0, -0.2);
		const gkMat = new StandardMaterial("gkMat", scene);
		gkMat.disableLighting = true;
		gkMat.emissiveColor = new Color3(1, 1, 1); // Ensure base emission is white so texture colors show
		gkMat.useAlphaFromDiffuseTexture = true;
		gkMat.transparencyMode = 2; // ALPHATEST removes black interpolation outline
		gkMat.alphaCutOff = 0.5;
		
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
			const targetDelay = animSettings && animSettings.idleFPS > 0 ? 1000 / animSettings.idleFPS : 12
			
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

		const ballImport = await SceneLoader.ImportMeshAsync("", "/soccer_ball/", "soccer_ball_rm_01.glb", scene);
		const ballMesh = ballImport.meshes[1] as Mesh;
		
		// Field Lines
		const fieldLinesMat = new StandardMaterial("fieldLinesMat", scene);
		fieldLinesMat.disableLighting = true;
		fieldLinesMat.emissiveColor = Color3.FromHexString((window as any).fieldLinesSettings.level1.color);
		(window as any).fieldLinesMat = fieldLinesMat;

		SceneLoader.ImportMeshAsync("", "/field_lines/", "field_lines_01.glb", scene).then((result) => {
			const root = result.meshes[0];
			(window as any).fieldLinesRoot = root;
			
			result.meshes.forEach(m => {
				m.material = fieldLinesMat;
				m.receiveShadows = false;
				// Ensure no physics impostor
				if (m.physicsBody) {
					m.physicsBody.dispose();
				}
			});
			(window as any).applyFieldLinesSettings();
		});
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
			particleSystem.renderingGroupId = 1; // Render above everything else to prevent ground clipping
			
			(window as any).impactSystem = particleSystem;

			// --- Confetti Particle System (Ultra-Safe Core Implementation) ---
			// Create a basic white square texture to guarantee rendering
			const texSize = 32;
			const confettiTex = new DynamicTexture("confettiTex", {width: texSize, height: texSize}, scene, false);
			const cCtx = confettiTex.getContext();
			cCtx.fillStyle = "#ffffff";
			cCtx.fillRect(0, 0, texSize, texSize); // Fill entirely to prevent any alpha-interpolation black edges
			confettiTex.update();
			
			const confettiColors = ["#ff0055", "#00aaff", "#ffdd00", "#00ffaa", "#ba00ff"];
			const confettiSystems: ParticleSystem[] = [];

			const createConfettiCannon = (name: string, pos: Vector3, dir1: Vector3, dir2: Vector3, isShower: boolean, colorHex: string) => {
				const sys = new ParticleSystem(name, 1000, scene);
				sys.particleTexture = confettiTex;
				sys.blendMode = ParticleSystem.BLENDMODE_STANDARD;

				// Convert Hex to Color4
				const r = parseInt(colorHex.slice(1,3), 16) / 255;
				const g = parseInt(colorHex.slice(3,5), 16) / 255;
				const b = parseInt(colorHex.slice(5,7), 16) / 255;
				const col = new Color4(r, g, b, 1.0);
				const colDead = new Color4(r, g, b, 0.0); // 0 alpha forces it to gracefully fade out
				
				sys.color1 = col;
				sys.color2 = col;
				sys.colorDead = colDead;
				
				sys.minLifeTime = 2.0;
				sys.maxLifeTime = 2.6; // Dies naturally before hitting the floor
				sys.minSize = 0.2;
				sys.maxSize = 0.5;

				const emitter = MeshBuilder.CreateBox(name + "Emitter", {size: 0.1}, scene);
				emitter.position = pos;
				emitter.isVisible = false;
				sys.emitter = emitter;

				if (isShower) {
					sys.minEmitBox = new Vector3(-20, 0, -5);
					sys.maxEmitBox = new Vector3(20, 0, 5);
				} else {
					sys.minEmitBox = new Vector3(0, 0, 0);
					sys.maxEmitBox = new Vector3(0, 0, 0);
				}

				sys.direction1 = dir1.normalize();
				sys.direction2 = dir2.normalize();
				
				sys.minAngularSpeed = -Math.PI * 2;
				sys.maxAngularSpeed = Math.PI * 2;
				sys.minInitialRotation = 0;
				sys.maxInitialRotation = Math.PI * 2;
				
				sys.emitRate = 0;
				sys.renderingGroupId = 2; // Force to render completely on top of group 0 (meshes)

				confettiSystems.push(sys);
				return sys;
			};

			// Force rendering group 2 to clear depth so confetti renders completely over all 3D objects
			scene.setRenderingAutoClearDepthStencil(2, true, false, false);

			// Create 15 individual basic systems (5 colors x 3 positions) to ensure flawless execution
			// Positioned at z=13, y=1.5 so they blast upward from just behind the top of the signboard (signboard is at z=12.5, y=0.875, height=1.75)
			for (let i = 0; i < 5; i++) {
				createConfettiCannon("leftCannon_" + i, new Vector3(-4.5, 1.5, 13), new Vector3(0.5, 1.5, -0.2), new Vector3(1.5, 2.5, 0.2), false, confettiColors[i]);
				createConfettiCannon("rightCannon_" + i, new Vector3(4.5, 1.5, 13), new Vector3(-0.5, 1.5, -0.2), new Vector3(-1.5, 2.5, 0.2), false, confettiColors[i]);
				createConfettiCannon("topShower_" + i, new Vector3(0, 10, 8), new Vector3(-0.2, -1, -0.2), new Vector3(0.2, -2, 0.2), true, confettiColors[i]);
			}
			
			const confettiSettings = {
				gravity: -10.0,
				burstPower: 25,
				spread: 1.5,
				size: 0.5,
				showerRate: 30, // Per color (30 * 5 = 150 total)
				burstCount: 100, // Per color per cannon (100 * 5 = 500 total)
				trigger: () => { (window as any).triggerConfetti(); }
			};

			const applyConfettiPhysics = () => {
				confettiSystems.forEach((sys, idx) => {
					sys.minSize = confettiSettings.size * 0.4;
					sys.maxSize = confettiSettings.size;
					
					const isShower = idx % 3 === 2;
					const s = confettiSettings.spread;
					
					if (isShower) {
						sys.gravity = new Vector3(0, confettiSettings.gravity * 0.5, 0);
						sys.minEmitPower = 2;
						sys.maxEmitPower = 4;
						
						sys.minEmitBox = new Vector3(-20 * s, 0, -5 * s);
						sys.maxEmitBox = new Vector3(20 * s, 0, 5 * s);
						sys.direction1 = new Vector3(-0.2 * s, -1, -0.2 * s);
						sys.direction2 = new Vector3(0.2 * s, -2, 0.2 * s);
					} else {
						sys.gravity = new Vector3(0, confettiSettings.gravity, 0);
						sys.minEmitPower = confettiSettings.burstPower * 0.6;
						sys.maxEmitPower = confettiSettings.burstPower;
						
						// Increase the spawn area so they are instantly spread out
						sys.minEmitBox = new Vector3(-s, 0, -s);
						sys.maxEmitBox = new Vector3(s, 0, s);
						
						const isLeft = idx % 3 === 0;
						if (isLeft) {
							sys.direction1 = new Vector3(1 - s, 1.5, -s * 0.5).normalize();
							sys.direction2 = new Vector3(1.5 + s, 2.5, s * 0.5).normalize();
						} else {
							sys.direction1 = new Vector3(-1 + s, 1.5, -s * 0.5).normalize();
							sys.direction2 = new Vector3(-1.5 - s, 2.5, s * 0.5).normalize();
						}
					}
				});
			};
			applyConfettiPhysics();

			(window as any).triggerConfetti = () => {
				console.log("🎉 Ultra-Safe Trigger Executed!");
				confettiSystems.forEach((sys, idx) => {
					sys.stop(); // Stop any active emission securely without reset() state wipes
					
					const isShower = idx % 3 === 2;
					if (isShower) {
						sys.manualEmitCount = 0;
						sys.emitRate = confettiSettings.showerRate;
						sys.targetStopDuration = 5.0;
					} else {
						sys.emitRate = 0;
						sys.manualEmitCount = confettiSettings.burstCount;
						sys.targetStopDuration = 0; // Disable targetStopDuration for manualEmitCount
					}
					
					sys.start();
				});
			};
			const setupConfetti = () => {
				const texSize = 32;
				const confettiTex = new DynamicTexture("confettiTex", {width: texSize, height: texSize}, scene, false);
				const cCtx = confettiTex.getContext();
				cCtx.fillStyle = "#ffffff";
				cCtx.fillRect(0, 0, texSize, texSize); 
				confettiTex.update();
				
				const confettiColors = ["#ff0055", "#00aaff", "#ffdd00", "#00ffaa", "#ba00ff"];
				const confettiSystems: ParticleSystem[] = [];

				const createConfettiCannon = (name: string, pos: Vector3, dir1: Vector3, dir2: Vector3, isShower: boolean, colorHex: string) => {
					const sys = new ParticleSystem(name, 1000, scene);
					sys.particleTexture = confettiTex;
					sys.blendMode = ParticleSystem.BLENDMODE_STANDARD;

					const r = parseInt(colorHex.slice(1,3), 16) / 255;
					const g = parseInt(colorHex.slice(3,5), 16) / 255;
					const b = parseInt(colorHex.slice(5,7), 16) / 255;
					const col = new Color4(r, g, b, 1.0);
					const colDead = new Color4(r, g, b, 0.0);
					
					sys.color1 = col;
					sys.color2 = col;
					sys.colorDead = colDead;
					
					sys.minLifeTime = 2.0;
					sys.maxLifeTime = 2.6;
					sys.minSize = 0.2;
					sys.maxSize = 0.5;

					const emitter = MeshBuilder.CreateBox(name + "Emitter", {size: 0.1}, scene);
					emitter.position = pos;
					emitter.isVisible = false;
					sys.emitter = emitter;

					if (isShower) {
						sys.minEmitBox = new Vector3(-20, 0, -5);
						sys.maxEmitBox = new Vector3(20, 0, 5);
					} else {
						sys.minEmitBox = new Vector3(0, 0, 0);
						sys.maxEmitBox = new Vector3(0, 0, 0);
					}

					sys.direction1 = dir1.normalize();
					sys.direction2 = dir2.normalize();
					
					sys.minAngularSpeed = -Math.PI * 2;
					sys.maxAngularSpeed = Math.PI * 2;
					sys.minInitialRotation = 0;
					sys.maxInitialRotation = Math.PI * 2;
					
					sys.emitRate = 0;
					sys.renderingGroupId = 2;

					confettiSystems.push(sys);
					return sys;
				};

				scene.setRenderingAutoClearDepthStencil(2, true, false, false);

				for (let i = 0; i < 5; i++) {
					createConfettiCannon("leftCannon_" + i, new Vector3(-4.5, 1.5, 13), new Vector3(0.5, 1.5, -0.2), new Vector3(1.5, 2.5, 0.2), false, confettiColors[i]);
					createConfettiCannon("rightCannon_" + i, new Vector3(4.5, 1.5, 13), new Vector3(-0.5, 1.5, -0.2), new Vector3(-1.5, 2.5, 0.2), false, confettiColors[i]);
					createConfettiCannon("topShower_" + i, new Vector3(0, 10, 8), new Vector3(-0.2, -1, -0.2), new Vector3(0.2, -2, 0.2), true, confettiColors[i]);
				}
				
				const confettiSettings = {
					gravity: -10.0,
					burstPower: 25,
					spread: 1.5,
					size: 0.5,
					showerRate: 30,
					burstCount: 100,
					trigger: () => { (window as any).triggerConfetti(); }
				};

				const applyConfettiPhysics = () => {
					confettiSystems.forEach((sys, idx) => {
						sys.minSize = confettiSettings.size * 0.4;
						sys.maxSize = confettiSettings.size;
						const isShower = idx % 3 === 2;
						const s = confettiSettings.spread;
						if (isShower) {
							sys.gravity = new Vector3(0, confettiSettings.gravity * 0.5, 0);
							sys.minEmitPower = 2;
							sys.maxEmitPower = 4;
							sys.minEmitBox = new Vector3(-20 * s, 0, -5 * s);
							sys.maxEmitBox = new Vector3(20 * s, 0, 5 * s);
							sys.direction1 = new Vector3(-0.2 * s, -1, -0.2 * s);
							sys.direction2 = new Vector3(0.2 * s, -2, 0.2 * s);
						} else {
							sys.gravity = new Vector3(0, confettiSettings.gravity, 0);
							sys.minEmitPower = confettiSettings.burstPower * 0.6;
							sys.maxEmitPower = confettiSettings.burstPower;
							sys.minEmitBox = new Vector3(-s, 0, -s);
							sys.maxEmitBox = new Vector3(s, 0, s);
							const isLeft = idx % 3 === 0;
							if (isLeft) {
								sys.direction1 = new Vector3(1 - s, 1.5, -s * 0.5).normalize();
								sys.direction2 = new Vector3(1.5 + s, 2.5, s * 0.5).normalize();
							} else {
								sys.direction1 = new Vector3(-1 + s, 1.5, -s * 0.5).normalize();
								sys.direction2 = new Vector3(-1.5 - s, 2.5, s * 0.5).normalize();
							}
						}
					});
				};
				applyConfettiPhysics();

				(window as any).triggerConfetti = () => {
					confettiSystems.forEach((sys, idx) => {
						sys.stop();
						const isShower = idx % 3 === 2;
						if (isShower) {
							sys.manualEmitCount = 0;
							sys.emitRate = confettiSettings.showerRate;
							sys.targetStopDuration = 5.0;
						} else {
							sys.emitRate = 0;
							sys.manualEmitCount = confettiSettings.burstCount;
							sys.targetStopDuration = 0;
						}
						sys.start();
					});
				};

				const confettiFolder = gui.addFolder('Confetti');
				confettiFolder.add(confettiSettings, 'gravity', -30, 0).name('Gravity').onChange(applyConfettiPhysics);
				confettiFolder.add(confettiSettings, 'burstPower', 10, 80).name('Burst Power').onChange(applyConfettiPhysics);
				confettiFolder.add(confettiSettings, 'spread', 0.1, 5.0).name('Dispersion / Spread').onChange(applyConfettiPhysics);
				confettiFolder.add(confettiSettings, 'size', 0.1, 2.0).name('Size').onChange(applyConfettiPhysics);
				confettiFolder.add(confettiSettings, 'showerRate', 0, 100).name('Shower Rate').onChange((v: number) => { confettiSettings.showerRate = v; });
				confettiFolder.add(confettiSettings, 'burstCount', 10, 200).name('Burst Density').onChange((v: number) => { confettiSettings.burstCount = v; });
				confettiFolder.add(confettiSettings, 'trigger').name('Test Burst');
				
				(window as any).applyConfettiPhysics = applyConfettiPhysics;
			};
			setupConfetti();

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
		(window as any).shadowSettings = {
			opacity: 0.15,
			softness: 0.16,
			ballSize: 0.24,
			gkSize: 1,
		};

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

		const ballShadow = MeshBuilder.CreatePlane("ballShadow", {size: 1.0}, scene);
		ballShadow.rotation.x = Math.PI / 2;
		ballShadow.material = shadowMat;
		ballShadow.scaling.setAll((window as any).shadowSettings.ballSize);

		const gkShadow = MeshBuilder.CreatePlane("gkShadow", {size: 1.0}, scene);
		gkShadow.rotation.x = Math.PI / 2;
		gkShadow.material = shadowMat;
		gkShadow.scaling.setAll((window as any).shadowSettings.gkSize);

		shadowFolder.add((window as any).shadowSettings, 'ballSize', 0.1, 3).step(0.1).onChange((v: number) => {
			ballShadow.scaling.setAll(v);
		});
		shadowFolder.add((window as any).shadowSettings, 'gkSize', 0.5, 5).step(0.1).onChange((v: number) => {
			gkShadow.scaling.setAll(v);
		});

		scene.onBeforeRenderObservable.add(() => {
			if (ball) {
				ballShadow.position.x = ball.position.x;
				ballShadow.position.z = ball.position.z;
				ballShadow.position.y = 0.01;
			}
			if (goalkeeperBody) {
				gkShadow.position.x = goalkeeperBody.position.x;
				gkShadow.position.z = goalkeeperBody.position.z;
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

		// --- Speedlines Effect Settings ---
		const slFolder = gui.addFolder('Anime Speedlines Effect');
		(window as any).slSettings = {
			color: "#e6f2ff",
			speed: 30.0,
			density: 150.0,
			thickness: 0.85,
			minPower: 0.8,
			intensityMult: 5.0
		};
		slFolder.addColor((window as any).slSettings, 'color').name('Line Color');
		slFolder.add((window as any).slSettings, 'speed', 1, 100).name('Animation Speed');
		slFolder.add((window as any).slSettings, 'density', 10, 500).name('Line Density');
		slFolder.add((window as any).slSettings, 'thickness', 0.5, 0.99).name('Line Thickness (inverse)');
		slFolder.add((window as any).slSettings, 'minPower', 0.1, 1.0).name('Min Power Required');
		slFolder.add((window as any).slSettings, 'intensityMult', 1.0, 10.0).name('Intensity Multiplier');
		impactFolder.add((window as any).impactSettings, 'minEmitPower', 1, 100).name('Min Burst Speed').onChange(updateImpact);
		impactFolder.add((window as any).impactSettings, 'maxEmitPower', 1, 100).name('Max Burst Speed').onChange(updateImpact);

		const skyFolder = gui.addFolder('Environment');
		(window as any).envSettings = { 
			lvl1Sky: "#5cb8ff",
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
		arrowMat.emissiveColor = Color3.FromHexString((window as any).uiSettings?.arrowColor || "#ffff00"); // Pure yellow default
		arrowMat.opacityTexture = arrowTex;
		arrowMat.disableLighting = true;
		arrow.material = arrowMat;

		// --- Power Rings ---
		(window as any).spotSettings = { scale: 0.1927, maxScale: 1.5, thickness: 40, ringOpacity: 0.1594, speed: 5.5 };
		const spotFolder = gui.addFolder('Power Rings');
		spotFolder.add((window as any).spotSettings, 'scale', 0.1, 1.0).name('Base Size');
		spotFolder.add((window as any).spotSettings, 'maxScale', 0.5, 3.0).name('Max Size');
		spotFolder.add((window as any).spotSettings, 'ringOpacity', 0.1, 1.0).name('Opacity');

		const ringTex = new DynamicTexture("ringTex", 512, scene, false);
		ringTex.hasAlpha = true;
		const rCtx = ringTex.getContext();
		
		const drawRings = () => {
			rCtx.clearRect(0, 0, 512, 512);
			const thickness = (window as any).spotSettings.thickness;
			rCtx.lineWidth = thickness;
			rCtx.strokeStyle = "white";
			
			[70, 145, 220].forEach(r => {
				rCtx.beginPath();
				rCtx.arc(256, 256, r, 0, 2 * Math.PI);
				rCtx.stroke();
			});
			ringTex.update();
		};
		(window as any).drawRings = drawRings;
		drawRings(); // Initial draw

		spotFolder.add((window as any).spotSettings, 'thickness', 2, 40).name('Ring Thickness').onChange(drawRings);

		const ringMat = new StandardMaterial("ringMat", scene);
		ringMat.emissiveTexture = ringTex;
		ringMat.opacityTexture = ringTex;
		ringMat.disableLighting = true;

		const powerRing = MeshBuilder.CreatePlane("powerRing", {size: 1.0}, scene);
		powerRing.rotation.x = Math.PI / 2;
		powerRing.position = new Vector3(0, 0.015, 0);
		powerRing.material = ringMat;
		powerRing.isVisible = false;

		// --- End Penalty Spot ---

		// 4. Attach Logic Scripts manually (since we bypassed the editor loader)
		// NOTE: When you import your .glb, you will delete the MeshBuilder lines above and run SceneLoader.AppendAsync() instead, then find the meshes by name.
		const ballScript = new BallController(ball);
		ballScript.onStart();
		const gkScript = new GoalkeeperController(goalkeeperBody as any);
		gkScript.onStart();
		
		const gmScript = new GameManager(ground);
		gmScript.onStart();
		gmScript.onOutcome = (text: string | null) => {
            if ((window as any).setOutcomeText) {
                (window as any).setOutcomeText(text);
            }
        };
		gameManagerRef = gmScript;
		(window as any).gameManager = gmScript;
		if ((window as any).updateGkScale) (window as any).updateGkScale();

		// Make globally accessible for the React UI to trigger a manual reset
		(window as any).resetBall = () => {
			try {
				if (ballMeshRef && ballMeshRef.physicsBody) {
					ballMeshRef.physicsBody.disablePreStep = false;
					ballMeshRef.position.set(0, 0.12, -2);
					ballMeshRef.physicsBody.setLinearVelocity(Vector3.Zero());
					ballMeshRef.physicsBody.setAngularVelocity(Vector3.Zero());
				}
				const bc = (window as any).ballController;
				if (bc) {
					bc["_isKicked"] = false;
					bc.hasHitGK = false;
					bc.hasHitEnvironment = false;
					bc.hasHitNet = false;
				}
				if (typeof ballShadow !== 'undefined' && ballShadow) {
					ballShadow.position.x = 0;
					ballShadow.position.z = -2;
				}

				// Clear previous aim states so rings and UI don't glitch on first frame
				(window as any).aimDirection = 0;
				(window as any).aimPower = 0;
				(window as any).aimHeight = 0;
				(window as any).aimCurve = 0;
			} catch (e: any) {
				alert("resetBall error: " + e.message);
			}
		};

		// --- Anime Speedlines Post Process ---
		Effect.ShadersStore["speedlinesFragmentShader"] = `
#ifdef GL_ES
precision highp float;
#endif
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
uniform float intensity;
uniform vec3 lineColor;
uniform float animSpeed;
uniform float lineDensity;
uniform float lineThickness;

float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }
void main(void) {
    vec4 color = texture2D(textureSampler, vUV);
    if (intensity <= 0.001) {
        gl_FragColor = color;
        return;
    }
    vec2 uv = vUV - vec2(0.5);
    uv.x *= 1.777; // aspect ratio approximation
    float dist = length(uv);
    float angle = atan(uv.y, uv.x);
    float noise = rand(vec2(floor(angle * lineDensity), floor(time * animSpeed)));
    float line = smoothstep(lineThickness, 1.0, noise);
    float mask = smoothstep(0.2, 0.6, dist);
    float alpha = line * mask * intensity;
    vec3 finalColor = mix(color.rgb, lineColor, alpha);
    gl_FragColor = vec4(finalColor, color.a);
}
`;
		const speedlinesPostProcess = new PostProcess("speedlines", "speedlines", ["time", "intensity", "lineColor", "animSpeed", "lineDensity", "lineThickness"], null, 1.0, camera);
		speedlinesPostProcess.samples = 4; // Enable MSAA to fix aliasing/pixelation caused by adding a post-process
		let shaderTime = 0;
		(window as any).speedlineIntensity = 0.0;
		speedlinesPostProcess.onApply = (effect) => {
			shaderTime += 0.01;
			effect.setFloat("time", shaderTime);
			
			const sls = (window as any).slSettings;
			if (sls) {
				const c = Color4.FromHexString(sls.color + "FF");
				effect.setFloat3("lineColor", c.r, c.g, c.b);
				effect.setFloat("animSpeed", sls.speed);
				effect.setFloat("lineDensity", sls.density);
				effect.setFloat("lineThickness", sls.thickness);
			}
			
			const gm = (window as any).gameManager;
			let targetIntensity = 0;
			
			if (gm) {
				const minP = sls ? sls.minPower : 0.8;
				const mult = sls ? sls.intensityMult : 5.0;
				
				if (gm.phase === "KICKED") {
					// Only show during the flight
					const p = (window as any).aimPower || 0;
					if (p >= minP) {
						const bc = (window as any).ballController;
						if (bc && (bc.hasHitEnvironment || bc.hasHitGK)) {
							targetIntensity = 0;
						} else {
							targetIntensity = (p - minP) * mult;
						}
					}
				}
			}
			
			// Smooth interpolation
			(window as any).speedlineIntensity += (targetIntensity - (window as any).speedlineIntensity) * 0.15;
			effect.setFloat("intensity", (window as any).speedlineIntensity);
		};

		let ringAnimAlpha = 0;

		// Update loop to run script logic
		scene.onBeforeRenderObservable.add(() => {
			ballScript.onUpdate();
			gkScript.onUpdate();
			gmScript.onUpdate();

			// Update arrow visually
			if (gameManagerRef) {
				const phase = gameManagerRef.phase;
				// Arrow Logic
				if (phase === "IDLE" || phase === "DIRECTION" || phase === "POWER" || phase === "HEIGHT" || phase === "CURVE") {
					arrow.isVisible = true;
					if (arrowMat && (window as any).uiSettings?.arrowColor) {
						arrowMat.emissiveColor = Color3.FromHexString((window as any).uiSettings.arrowColor);
					}
					if (phase !== "IDLE") {
						const dir = (window as any).aimDirection || 0;
						
						let jiggleOffset = 0;
						if (phase === "POWER") {
							const jiggleStart = (window as any).arrowJiggleStart || 0;
							const elapsed = (performance.now() - jiggleStart) / 1000;
							const settings = (window as any).uiSettings;
							if (elapsed < settings.jiggleDuration) {
								const speedFactor = (window as any).arrowJiggleSpeedFactor || 2.6;
								const amplitude = settings.jiggleIntensity * (speedFactor / 2.6); // Scale amplitude by speed
								jiggleOffset = amplitude * Math.sin(elapsed * settings.jiggleSpeed) * Math.exp(-elapsed * settings.jiggleDecay);
							}
						}
						
						arrowParent.rotation.y = (dir * (Math.PI / 4)) + jiggleOffset;
					} else {
						arrowParent.rotation.y = 0;
					}
					arrowParent.position.x = ball.position.x;
					arrowParent.position.z = ball.position.z;
				} else {
					arrow.isVisible = false;
				}

				// Power Ring Logic
				const spotSet = (window as any).spotSettings;

				if (phase === "POWER") {
					powerRing.isVisible = true;
					// Snap to full opacity so fast kickers still see it fully before the kick
					ringAnimAlpha = spotSet.ringOpacity;
					(window as any).ringShockwaveVelocity = null; // reset
					
					const pwr = (window as any).aimPower || 0;
					const s = spotSet.scale + (pwr * (spotSet.maxScale - spotSet.scale));
					powerRing.scaling.set(s, s, s);
					if (powerRing.material) powerRing.material.alpha = ringAnimAlpha;
					powerRing.position.x = ball.position.x;
					powerRing.position.z = ball.position.z;
					powerRing.rotation.y += 0.02; // Dynamic spin
				} else if (phase === "HEIGHT" || phase === "CURVE") {
					// Ring stops scaling but keeps spinning
					powerRing.isVisible = true;
					if (powerRing.material) powerRing.material.alpha = ringAnimAlpha;
					powerRing.rotation.y += 0.02; // Keep spinning
				} else if (phase === "KICKED" || phase === "IN_AIR" || phase === "OUTCOME") {
					if (powerRing.isVisible) {
						if ((window as any).ringShockwaveVelocity == null) {
							(window as any).ringShockwaveVelocity = 0.5 + ((window as any).aimPower || 0) * 1.5;
						}
						
						const scale = powerRing.scaling.x + (window as any).ringShockwaveVelocity;
						(window as any).ringShockwaveVelocity *= 0.88; // slower deceleration for a longer spring
						
						powerRing.scaling.set(scale, scale, scale);
						
						ringAnimAlpha -= 0.015; // Slower fade out (takes ~1 second from 1.0)
						if (powerRing.material) powerRing.material.alpha = Math.max(0, ringAnimAlpha);
						powerRing.rotation.y += 0.04; // Spin outward
						
						if (ringAnimAlpha <= 0) {
							powerRing.isVisible = false;
						}
					}
				} else {
					powerRing.isVisible = false;
					ringAnimAlpha = 0; // Reset for next kick
					(window as any).ringShockwaveVelocity = null;
				}
			}
		});

		// Now that ALL folders and variables are created, apply the saved GUI state
		if ((window as any).savedGuiState) {
			gui.load((window as any).savedGuiState);
			if ((window as any).applyConfettiPhysics) (window as any).applyConfettiPhysics();
			if ((window as any).drawRings) (window as any).drawRings();
			if ((window as any).applyFieldLinesSettings) (window as any).applyFieldLinesSettings();
			if ((window as any).applyNetGridScale) (window as any).applyNetGridScale();
		}

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
		<main className="relative flex w-screen h-[100dvh] flex-col items-center justify-between bg-black">
			{phase === "MENU" && <MainMenu onPlay={() => handleSetPhase("IDLE")} />}
			<GameUI 
				onKickParamsUpdate={(params) => {
					if (params.direction !== undefined) {
						(window as any).aimDirection = params.direction;
					}
					if (params.power !== undefined) {
						(window as any).aimPower = params.power;
					}
				}}
				onKickExecute={handleKickExecute}
				phase={phase}
				setPhase={handleSetPhase}
				level={level}
				score={score}
				shots={shots}
				isLoading={isLoading}
				onAdvanceLevel={() => {
					if (gameManagerRef) {
						gameManagerRef.advanceLevel();
						if ((window as any).updateLawn) (window as any).updateLawn();
						if ((window as any).updateSignboard) (window as any).updateSignboard();
						if ((window as any).updateCrowd) (window as any).updateCrowd();
						if ((window as any).updateSky) (window as any).updateSky();
						if ((window as any).applyFieldLinesSettings) (window as any).applyFieldLinesSettings();
						if ((window as any).updateBallTexture) (window as any).updateBallTexture();
					}
				}}
				onRetryLevel={() => {
					if (gameManagerRef) {
						gameManagerRef.retryLevel();
						if ((window as any).updateLawn) (window as any).updateLawn();
						if ((window as any).updateSignboard) (window as any).updateSignboard();
						if ((window as any).updateCrowd) (window as any).updateCrowd();
						if ((window as any).updateSky) (window as any).updateSky();
						if ((window as any).applyFieldLinesSettings) (window as any).applyFieldLinesSettings();
						if ((window as any).updateBallTexture) (window as any).updateBallTexture();
					}
				}}
			/>
			<canvas
				ref={canvasRef}
				className="w-full h-full outline-none select-none touch-none"
				style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
			/>
		</main>
	);
}
 
