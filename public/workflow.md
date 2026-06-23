# Penalty Shooter: Development & Deployment Workflow

This document outlines the end-to-end pipeline used to build, iterate, and deploy the Penalty Shooter game. It covers the technology stack, the local development process, and how the team can collaborate using cloud deployments.

---

## 1. Technology Stack Overview

Our game is built using a modern, web-first technology stack designed for high performance, rapid iteration, and easy distribution across all devices.

### **Babylon.js** (The 3D Engine)
Babylon.js is the core graphics and physics engine. It is responsible for everything you "play":
- **3D Rendering**: Drawing the stadium, the ball, the goalkeeper, and the lighting.
- **Physics**: Handling the Havok physics engine, which calculates gravity, collisions, and the Magnus effect (curve forces) on the ball.
- **Shaders**: Running complex mathematics on the GPU, such as the ripples and deformation of the goal net when the ball hits it.

### **Next.js & React** (The Web Framework)
Instead of building a barebones HTML file, we use Next.js (built on React) to structure the application.
- **React** is used to build the user interface overlays—things like the level badges, the scoreboard, the loading spinner, and the interactive UI components.
- **Next.js** provides the robust file structure, handles optimizations (like font loading and image caching), and makes the game easily deployable to cloud servers.

### **Tailwind CSS** (The Styling System)
Tailwind CSS is used to rapidly style the React UI components. Instead of writing separate, complex CSS files, Tailwind allows us to style elements directly in the code (e.g., adding \`text-white text-4xl font-bold\` to instantly style a retro arcade font).

### **GitHub** (Version Control)
GitHub acts as the "save state" and central hub for the codebase. Every time a new feature is added (like fixing the goalkeeper AI), the changes are committed and pushed to GitHub. This keeps a complete history of the project and allows multiple people to collaborate safely.

### **Vercel** (Cloud Deployment)
Vercel is the hosting platform that automatically takes the code from GitHub and turns it into a live, playable website.

---

## 2. The Development Pipeline

The process of building and refining the game follows a strict but fluid pipeline: Local Development -> Version Control -> Cloud Deployment -> Team Review.

### Step 1: Local Development (\`localhost:3000\`)
The developer works on their local machine. By running the \`npm run dev\` command, a local server spins up at \`http://localhost:3000\`. 
- **Real-Time Iteration:** Any changes made to the code (whether it's adjusting the physics in Babylon.js or tweaking the UI in React) are instantly reflected in the browser without needing a hard refresh.
- **Developer Tools:** The developer uses the integrated \`lil-gui\` menu to experiment with physics forces, AI difficulties, and UI positioning in real-time.

### Step 2: Version Control & Cloud Sync
Once a feature is tested and working perfectly on \`localhost:3000\`, the code is pushed to **GitHub**. 
GitHub securely stores the updated code and immediately pings **Vercel** to let it know an update is available.

### Step 3: Vercel Auto-Deployment
Vercel automatically pulls the latest code from GitHub and begins a "Build" process.
- It compiles the Next.js application, bundles the Babylon.js scripts, and optimizes all assets.
- Within minutes, it deploys the updated game to a live browser link.
- **Cross-Platform Access:** Because the game is deployed to the web, the URL can be opened on desktop browsers, mobile phones, or tablets. The game is designed to dynamically resize and perform identically across all form factors.

### Step 4: Team Collaboration & Review
This is where the broader team gets involved without needing to touch a line of code.
1. **Playtesting:** The developer shares the live Vercel URL with the team.
2. **Tweaking Settings:** Team members can open the game on their phones or laptops, open the \`lil-gui\` developer menu, and tweak the game to their liking. They can adjust how strong the curve force is, how hard the goalkeeper is to beat, or where the UI sits on the screen.
3. **Closing the Loop:** Once a team member finds the "perfect" setup, they simply click **"Copy JSON to Clipboard"** in the developer menu and send that text string back to the developer.
4. **Implementation:** The developer pastes that JSON into the codebase on their local machine, tests it on \`localhost:3000\`, pushes it to GitHub, and Vercel automatically deploys the tuned version for everyone to see.

---

### Summary
This pipeline ensures that the technical heavy-lifting happens securely on the developer's local machine, while Vercel provides a frictionless, instantly-updated platform for the team to playtest, review, and fine-tune the game on any device.
