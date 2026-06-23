import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CustomMaterial } from "@babylonjs/materials/custom/customMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

export function createNetMaterial(name: string, scene: Scene): CustomMaterial {
    const netMaterial = new CustomMaterial(name, scene);
    
    // Unlit-like style
    netMaterial.emissiveColor = new Color3(1, 1, 1);
    netMaterial.disableLighting = true;
    netMaterial.backFaceCulling = false;

    // Use the actual net.png file we saved to the public directory for 100% guaranteed rendering!
    const netTex = new Texture("/net.png", scene);
    netTex.hasAlpha = true;
    
    // Tile the texture across the unmerged mesh UVs to create the net grid
    netTex.uScale = 30;
    netTex.vScale = 30;
    
    netMaterial.diffuseTexture = netTex;
    netMaterial.useAlphaFromDiffuseTexture = true;
    (netMaterial as any).netTex = netTex;

    // Add uniforms for vertex displacement
    netMaterial.AddUniform('localBallPosition', 'vec3', null);
    netMaterial.AddUniform('impactForce', 'float', null);
    netMaterial.AddUniform('time', 'float', null);
    netMaterial.AddUniform('impactRadius', 'float', null);
    netMaterial.AddUniform('bulgeMultiplier', 'float', null);
    netMaterial.AddUniform('rippleAmplitude', 'float', null);
    netMaterial.AddUniform('rippleSpeed', 'float', null);

    // Inject vertex shader code to displace vertices based on distance to localBallPosition
    netMaterial.Vertex_Before_PositionUpdated(`
        float dist = distance(positionUpdated, localBallPosition);
        
        // Use exposed GUI variables, with fallbacks
        float radius = impactRadius > 0.0 ? impactRadius : 1.5;
        float multiplier = bulgeMultiplier > 0.0 ? bulgeMultiplier : 1.0;
        float rAmp = rippleAmplitude > 0.0 ? rippleAmplitude : 0.3;
        float rSpeed = rippleSpeed > 0.0 ? rippleSpeed : 20.0;
        
        if (impactForce > 0.0) {
            // Base structural bulge (localized to impact radius)
            float bulge = 0.0;
            if (dist < radius) {
                bulge = (radius - dist) * impactForce * multiplier;
            }
            
            // Global Ripple effect radiating outwards across the entire net
            // The amplitude is heavily influenced by the impactForce (shot power)
            float attenuation = 1.0 / (1.0 + (dist * 0.8)); // Smooth decay over distance
            float ripple = sin((dist * 15.0) - (time * rSpeed)) * rAmp * impactForce * attenuation;
            
            vec3 outwardDir = normalize(positionUpdated - localBallPosition);
            positionUpdated += outwardDir * (bulge + ripple);
        }
    `);

    let currentImpactForce = 0.0;

    // In the render loop, update uniforms
    netMaterial.onBindObservable.add((mesh) => {
        const ballController = (window as any).ballController;
        if (ballController && ballController.mesh && mesh) {
            const ballPos = ballController.mesh.getAbsolutePosition();
            
            const invWorld = mesh.getWorldMatrix().clone().invert();
            const localBallPos = Vector3.TransformCoordinates(ballPos, invWorld);
            
            // Determine force based on velocity
            if (ballPos.z > 9.0 && ballPos.x > -4.5 && ballPos.x < 4.5 && ballPos.y < 3.5) {
                const vel = ballController.mesh.physicsBody?.getLinearVelocity().length() || 0;
                if (vel > 0.5) {
                    currentImpactForce = Math.max(currentImpactForce, Math.min(1.0, vel / 10.0)); 
                }
            }

            // Decay the impact force smoothly so the ripple continues after the ball stops
            currentImpactForce = Math.max(0, currentImpactForce - 0.015);

            netMaterial.getEffect()?.setVector3("localBallPosition", localBallPos);
            netMaterial.getEffect()?.setFloat("impactForce", currentImpactForce);
            
            const gameSettings = (window as any).gameSettings;
            const radius = gameSettings ? gameSettings.netImpactRadius : 1.5;
            const multiplier = gameSettings ? gameSettings.netBulgeMultiplier : 1.0;
            const rAmp = gameSettings ? gameSettings.rippleAmplitude : 0.3;
            const rSpeed = gameSettings ? gameSettings.rippleSpeed : 20.0;
            
            netMaterial.getEffect()?.setFloat("impactRadius", radius);
            netMaterial.getEffect()?.setFloat("bulgeMultiplier", multiplier);
            netMaterial.getEffect()?.setFloat("rippleAmplitude", rAmp);
            netMaterial.getEffect()?.setFloat("rippleSpeed", rSpeed);
            netMaterial.getEffect()?.setFloat("time", performance.now() / 1000.0);
        }
    });

    return netMaterial;
}
