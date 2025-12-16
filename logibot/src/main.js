import './style.css'

import * as THREE from 'three';
import  {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {gsap} from "gsap";

let isSwitching = false;
let model = null;
let modelClickable = true;
let sessionId = null;
const loader = new GLTFLoader().setPath('/models/');
const raycaster = new THREE.Raycaster();
let renderer, scene, camera, gender, currentBodyPart, selectedMesh, controls, animationTimeline, animationId, origCamPosition, letters;
let particleExists = false;
let createdParticles = [];

const canvas = document.querySelector('#model-canvas');
const landingPage = document.getElementById('landing-page');
const modelPage = document.getElementById('model-page');
const startButton = document.getElementById('start-button');
const backButton = document.getElementById('back-button');
const chatBox = document.getElementById('chatbox-popup');
const resetButton = document.getElementById('reset-button');
const selectText = document.getElementById('selectText');
const chatMessages = document.getElementById('chatbox-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const switchButton = document.getElementById('switch-button');

document.addEventListener('DOMContentLoaded', () => {
  gsap.set("#landing-page h2, #landing-page h3, #landing-page footer, #start-button", {opacity : 0});
  animateLandingPage();
});

sendButton.addEventListener("click", handleSendMessage);

userInput.addEventListener("keypress", (e) => {
  if ( e.key === 'Enter') {
    handleSendMessage();
  }
})

switchButton.addEventListener("click", () => {
  if (isSwitching) return;
  isSwitching = true;

  fetch('http://localhost:3000/reset-session', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({})
  }).catch(err => console.log('Session reset error:', err))

  selectedMesh = null;
  currentBodyPart = null;
  modelClickable = true;
  chatMessages.innerHTML = '';
  userInput.value = '';
  if (model && scene) {
    scene.remove(model);
    model.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
  }
    
  if (gender == 'male'){
    loadFemale();
  }
  else if (gender == 'female'){
    loadMale();
  }

  setTimeout(() => {
  isSwitching = false;
  }, 1000);
});

resetButton.addEventListener("click", () => {
  if (selectedMesh) {
    selectedMesh.material.color.set(0xffffff);
    selectedMesh = null;
  }

  if (model) {
    model.traverse((child) => {
      if (child.isMesh) {
        gsap.killTweensOf(child.material.color);
        
        if (child.userData.originalColor) {
          child.material.color.copy(child.userData.originalColor);
          delete child.userData.originalColor;
        } else {
          child.material.color.set(0xffffff);
        }
      }
    });
  }

  if(currentBodyPart && gender) {
    fetch('http://localhost:3000/reset-session', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        sessionId
      })
    }).catch(err => console.log('Session reset error:', err));
  }

  sessionId = null;
  modelClickable = true;
  currentBodyPart = null;

  chatMessages.innerHTML = '';
  userInput.value = '';
  gsap.killTweensOf(model.rotation);

  gsap.to(model.rotation, {
    duration: 2,
    y: 0,
    ease: 'power1.inOut',
    onComplete:() => {
      gsap.to(switchButton, {
        y: '0%',
        duration: 0.5,
        ease: 'power1.in'
      });
      gsap.to(selectText, {
        opacity: 1,
        duration: 0.5,
        ease: 'power1.in'
      });
    }
  });

  gsap.to(chatBox,{
    x: '110%',
    duration: 2,
    ease: 'power1.out'
  });

  gsap.to(camera.position, {
    duration: 2,
    x: origCamPosition.x,
    y: origCamPosition.y,
    z: origCamPosition.z,
    ease: 'power1.inOut',
    onUpdate: () => {
      camera.lookAt(0, 3, 0);
    }
  })

  gsap.to(controls.target, {
    duration: 2,
    x: 0,
    y: 3,
    z: 0,
    ease: 'power1.inOut',
    onUpdate: () => controls.update(),
    onComplete: () => {
      controls.enabled = true;
    }
  });
})

startButton.addEventListener("click", () => {
  buildScene();
  loadMale();
  gsap.to(landingPage,{
    opacity: 0,
    duration: 1,
    onComplete: () => {
      landingPage.style.display = "none";
      modelPage.style.display = "block";
      modelPage.style.pointerEvents = "all";
      gsap.to(modelPage, {opacity : 1, duration: 1});
      animateModelPage();
      endLandingAnimation();
    }
  })
});

backButton.addEventListener("click", () => {
  fetch('http://localhost:3000/reset-session', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({})
  }).catch(err => console.log('Session reset error:', err));

  endModelPageAnimation();

  if (model) {
    model.traverse((child) => {
      if (child.isMesh) {
        gsap.killTweensOf(child.material.color);
        if (child.userData.originalColor) {
          delete child.userData.originalColor;
        }
      }
    });
  }

  sessionId = null;
  selectedMesh = null;
  currentBodyPart = null;
  modelClickable = true;

  chatMessages.innerHTML = '';
  userInput.value = '';

  gsap.set(chatBox, { x: '110%' });
  gsap.set(switchButton, { y: '0%' });
  gsap.set(selectText, { opacity: 1 });


  gsap.to(modelPage,{
    opacity: 0,
    duration: 1,
    onComplete: () => {
      modelPage.style.display = "none";
      landingPage.style.display = "flex";
      modelPage.style.pointerEvents = "none";
      resetScene();
      gsap.set("#landing-page h1, #landing-page h2, #landing-page h3, #landing-page footer, #start-button", {opacity : 0});
      gsap.set(letters, { opacity: 0, y: -50, rotationX: -90 });
      gsap.to(landingPage, {
        opacity: 1, 
        duration: 1,
        onComplete: () => {
          animateLandingPage();
        }
      });
    }
  });
});

function buildScene() {
  renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas: canvas
});

renderer.outputColorSpace = THREE.SRGBColorSpace;

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(window.devicePixelRatio);

scene = new THREE.Scene();
camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.set(0, 6, 15); 
origCamPosition = camera.position.clone();

controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 11;
controls.maxDistance = 13;
controls.minPolarAngle = 0.5;
controls.maxPolarAngle = 2.3;
controls.autoRotate =  false;
controls.target = new THREE.Vector3(0, 3, 0);
controls.update();

const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

const spotLight = new THREE.SpotLight(0xffffff, 20, 0, Math.PI / 3, 0.3, 2);
spotLight.position.set(0, 8, 0);
scene.add(spotLight);

function animate(){
  animationId = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
};

animate();
};

window.addEventListener('resize', () => {
  if (!camera || !renderer) return; 
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function onMouseDown(event){
  if(!modelClickable || !model) return;

  const coords = new THREE.Vector2(
    (event.clientX / renderer.domElement.clientWidth) * 2 - 1,
    -((event.clientY / renderer.domElement.clientHeight) * 2 - 1),
  )
  raycaster.setFromCamera(coords, camera);

  const intersections = raycaster.intersectObject(model, true);
  if (intersections.length > 0){
    selectedMesh = intersections[0].object;

    currentBodyPart = selectedMesh.userData.bodyPart;
    selectedMesh.material.color.set(0xff0000);
    modelClickable = false;

    setTimeout(() => {
      addMessage(`You've selected the ${currentBodyPart}. How can I help you with this area?`, false);
    }, 2500);
    
    const currentPos = camera.position.clone();
    const targetPos = controls.target.clone();
    const offset = currentPos.sub(targetPos);
    
    const currentRadius = offset.length();
    const currentTheta = Math.atan2(offset.x, offset.z);
    const currentPhi = Math.acos(offset.y / currentRadius);
    

    const origOffset = origCamPosition.clone().sub(new THREE.Vector3(0, 3, 0));
    const targetRadius = origOffset.length();
    const targetTheta = Math.atan2(origOffset.x, origOffset.z);
    const targetPhi = Math.acos(origOffset.y / targetRadius);
    
    const spherical = { 
      radius: Math.max(currentRadius, targetRadius, 12),
      theta: currentTheta, 
      phi: currentPhi 
    };

    gsap.to(spherical, {
      duration: 3,
      radius: targetRadius,
      theta: targetTheta,
      phi: targetPhi,
      ease: "power1.inOut",
      onUpdate: () => {
        const x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
        const y = spherical.radius * Math.cos(spherical.phi);
        const z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
        
        camera.position.set(x, y + 3, z);
        camera.lookAt(0, 3, 0);
        controls.update();
      }
  });

      gsap.to(controls.target, {
        duration: 2,
        x: 3.25,
        y: 2.5,
        z: 0,
        ease: "power1.inOut",
        onUpdate: () => controls.update(),
        onComplete: () => {
          controls.enabled = false;
          gsap.to(model.rotation, {
            duration: 5,
            y: model.rotation.y + Math.PI * 2,
            repeat: -1,
            ease: "none"
          });
            gsap.to(chatBox, {
            x: '-2%', 
            duration: 2,
            ease: "power1.out"
          });
        }
      });

  gsap.to(selectText, {
    opacity: 0,
    duration: 1,
    ease: 'power1.inOut'
  });

  gsap.to(switchButton, {
    y: '-150%',
    duration: 0.5,
    ease: 'power1.out'
  });
  };
};

document.addEventListener('mousedown', onMouseDown);

function loadMale(){
  loader.load('male_model.glb', (glb) => {
    gender = 'male';
    model = glb.scene;
    model.traverse((child) =>{
      if (child.isMesh){
        child.material = child.material.clone();
        if(child.name.includes('head_mesh')){
          child.userData.bodyPart = 'Head';
        }else if (child.name.includes('leftarm_mesh')){
          child.userData.bodyPart = 'LeftArm';
        }else if (child.name.includes('rightarm_mesh')){
          child.userData.bodyPart = 'RightArm';
        }else if (child.name.includes('torso_mesh')){
          child.userData.bodyPart = 'Torso';
        }else if (child.name.includes('legs_mesh')){
          child.userData.bodyPart = 'Legs';
        }
      }
    });
    model.position.set(0, 0.4, 0);
    scene.add(model);

    camera.position.set(0, 6, 15); 
    origCamPosition = camera.position.clone();
    controls.target.set(0, 3, 0);
    controls.update();
  });
};

function loadFemale(){
  loader.load('female_model.glb', (glb) => {
    gender = 'female';
    model = glb.scene;
    model.traverse((child) =>{
      if (child.isMesh){
        child.material = child.material.clone();
        if(child.name.includes('head_mesh')){
          child.userData.bodyPart = 'Head';
        }else if (child.name.includes('left_arm')){
          child.userData.bodyPart = 'LeftArm';
        }else if (child.name.includes('right_arm')){
          child.userData.bodyPart = 'RightArm';
        }else if (child.name.includes('torso_mesh')){
          child.userData.bodyPart = 'Torso';
        }else if (child.name.includes('legs_mesh')){
          child.userData.bodyPart = 'Legs';
        }
      }
    });
    model.scale.set(0.85, 0.85, 0.85);
    model.position.set(0, 0.4, 0);
    scene.add(model);

    camera.position.set(0, 6, 15);
    origCamPosition = camera.position.clone();
    controls.target.set(0, 3, 0);
    controls.update();
  });
};

function resetScene() {
  cancelAnimationFrame(animationId);
  gsap.killTweensOf(model.rotation);
  gsap.killTweensOf(camera.position);
  gsap.killTweensOf(controls.target);
  gsap.killTweensOf(chatBox);
  gsap.killTweensOf(selectText);

  gsap.set(chatBox, { x: '110%' });
  gsap.set(switchButton, { y: '0%' });
  gsap.set(selectText, { opacity: 1 });

  if (model && scene) {
    scene.remove(model);
    model.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
  }

  if (renderer) {
    renderer.dispose();
  }
  if (controls) {
    controls.dispose();
  }

  model = null;
  renderer = null;
  scene = null;
  camera = null;
  gender = null;
  currentBodyPart = null;
  selectedMesh = null;
  controls = null;
  modelClickable = true;
};

function addMessage(text, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        margin: 10px;
        padding: 10px 15px;
        border-radius: 15px;
        max-width: 80%;
        word-wrap: break-word;
        font-family: "Syne Mono", monospace;
        ${isUser 
          ? 'background: #7fe3f4; color: #010403; margin-left: auto;' 
          : 'background: rgba(127, 227, 244, 0.2); color: #e0f7fa; margin-right: auto;'
        }
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if(isUser) {
        messageDiv.innerHTML = text.replace(/\n/g, '<br>');
        chatMessages.scrollTop = chatMessages.scrollHeight + 100;
    } else {
        messageDiv.innerHTML = '';
        const speed = 30; 
        const formattedText = text.replace(/\n/g, '<br>');
        let currentIndex = 0;

        const typeMessageRecursively = () => {
            if (currentIndex < text.length) {
                
                if (text.substring(currentIndex, currentIndex + 2) === '\n\n') {
                    messageDiv.innerHTML += '<br><br>'; 
                    currentIndex += 2;
                } 
                else if (text[currentIndex] === '\n') {
                    messageDiv.innerHTML += '<br>';
                    currentIndex++;
                } 
                else {
                    messageDiv.innerHTML += text[currentIndex];
                    currentIndex++;
                }
                
                chatMessages.scrollTop = chatMessages.scrollHeight + 100;

                setTimeout(typeMessageRecursively, speed);
            } else {
                messageDiv.innerHTML = formattedText;
                chatMessages.scrollTop = chatMessages.scrollHeight + 100;
            }
        };
        
        typeMessageRecursively();
    }
}

function handleSendMessage() {
  const message = userInput.value.trim();
  if (!message) return;
  addMessage(message, true);
  userInput.value = '';

  fetch('http://localhost:3000/chat', {
    method: 'POST',
    headers: {'Content-Type' : 'application/json'},
    body: JSON.stringify({
      message,
      bodyPart: currentBodyPart,
      gender,
      sessionId
    })
  })
  .then(res => res.json())
  .then(data => {
    sessionId = data.sessionId;
    addMessage(data.reply, false);
    console.log('Session ID:', sessionId);  
    console.log('Accumulated symptoms:', data.accumulatedSymptoms);
    
    if (data.shouldRedirect) {
      selectedMesh.material.color.set(0xffffff);  
      
    if (data.suggestedParts && data.suggestedParts.length > 0) {
        highlightSuggestedParts(data.suggestedParts);
      }
    }
  })
  .catch(err => addMessage("Error connecting to server. Please try again later.", false));
}

/**
 * @param {Array<string>} suggestedParts 
 */
function highlightSuggestedParts(suggestedParts) {
  if (!model || !suggestedParts || suggestedParts.length === 0) return;
  
  model.traverse((child) => {
    if (child.isMesh && suggestedParts.includes(child.userData.bodyPart)) {
      if (!child.userData.originalColor) {
        child.userData.originalColor = child.material.color.clone();
      }
      
      gsap.killTweensOf(child.material.color);
      
      gsap.to(child.material.color, {
        r: 1,
        g: 0,
        b: 0,
        duration: 0.8,
        repeat: -1,  
        yoyo: true,
        ease: 'sine.inOut',
        onComplete: () => {
          if (child.userData.originalColor) {
            child.material.color.copy(child.userData.originalColor);
          }
        }
      });
    }
  });
}

function animateLandingPage(){
  if (!particleExists) {
    generateParticles();
    particleExists = true;
  }
  const h1 = document.querySelector("#landing-page h1");
  gsap.set(h1, {opacity: 1});
  const text = h1.textContent.trim();
  h1.innerHTML = '';
  
  letters = text.split('').map(letter => {
    const span = document.createElement('span');
    span.textContent = letter === ' ' ? '\u00A0' : letter;
    span.style.display = 'inline-block';
    h1.appendChild(span);
    return span;
  });

  gsap.set(letters, { opacity: 0, y: -50, rotationX: -90 });
  
  animationTimeline = gsap.timeline({ defaults: { ease: "power3.out" } });
  animationTimeline.to(letters, {
    opacity: 1,
    y: 0,
    rotationX: 0,
    stagger: 0.1,
    duration: 0.8,
    ease: "back.out(3)"
  })
  .to("#landing-page h2", {
    duration: 1,
    y: 0,
    opacity: 1,
    ease: "back.out(1.7)"
  }, "-=0.8")
  .to("#landing-page h3", {
    duration: 0.8,
    y: 0,
    opacity: 1
  }, "-=0.5")
  .to("#start-button", {
    duration: 1.2,
    scale: 1,
    opacity: 1,
    ease: "elastic.out(1, 0.6)"
  }, "-=0.3")
  .to("#landing-page footer", {
    duration: 0.8,
    y: 0,
    opacity: 1
  }, "-=0.6");

  gsap.to("#landing-page h1", {
    textShadow: "0 0 20px #5ad1e8, 0 0 40px #5ad1e8",
    duration: 2,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });

  gsap.to("#start-button", {
    y: -15,
    duration: 2.5,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    delay: 1.5
  });

  startButton.addEventListener('mouseenter', () => {
    gsap.to(startButton, {
      scale: 1.15,
      duration: 0.4,
      ease: "back.out(2)",
    })
  });

  startButton.addEventListener('mouseleave', () => {
    gsap.to(startButton, {
      scale: 1,
      duration: 0.4,
      ease: "power2.out",
    })
  });

  startButton.addEventListener('mousedown', () => {
    gsap.to(startButton, {
      scale: 0.95,
      duration: 0.1
    });
  });

  startButton.addEventListener('mouseup', () => {
    gsap.to(startButton, {
      scale: 1.15,
      duration: 0.2
    });
  });

  gsap.to("#start-button", {
    boxShadow: "0 0 25px #7fe3f4, 0 0 50px #7fe3f4, 0 0 75px #7fe3f4",
    duration: 2,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    delay: 1.5
  });

  gsap.to("#landing-page h2, #landing-page h3", {
    scale: 1.2,
    duration: 3,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });
  
  gsap.to(landingPage, {
    background: "linear-gradient(210deg, #0a0a0a, #1a1a1a, #a09e9e)",
    duration: 4,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });
}

function endLandingAnimation() {
  animationTimeline.kill()

  const h1Letters = document.querySelectorAll("#landing-page h1 span");
  h1Letters.forEach(letter => gsap.killTweensOf(letter));

  gsap.killTweensOf("#landing-page h1");
  gsap.killTweensOf("#landing-page h2");
  gsap.killTweensOf("#landing-page h3");
  gsap.killTweensOf("#start-button");
  gsap.killTweensOf("#landing-page footer");
  //gsap.killTweensOf(landingPage);

  /*createdParticles.forEach(particle => {
    gsap.killTweensOf(particle);
    particle.remove();
  })
  createdParticles= [];*/

  const h1 = document.querySelector("#landing-page h1");
  const text = Array.from(h1.querySelectorAll('span')).map(s => s.textContent).join('');
  h1.textContent = text;
}

function generateParticles () {
  const particleCount = 20;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: absolute;
      width: ${Math.random() * 4 + 2}px;
      height: ${Math.random() * 4 + 2}px;
      background: #7fe3f4;
      border-radius: 50%;
      opacity: ${Math.random() * 0.5 + 0.3};
      box-shadow: 0 0 ${Math.random() * 10 + 5}px #7fe3f4;
      pointer-events: none;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
    `;
    
    landingPage.appendChild(particle);
    createdParticles.push(particle);
    
    gsap.to(particle, {
      y: `+=${Math.random() * 200 - 100}`,
      x: `+=${Math.random() * 200 - 100}`,
      opacity: 0,
      duration: Math.random() * 3 + 2,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      delay: Math.random() * 2
    });
  }
}

function endModelPageAnimation() {
  gsap.killTweensOf(modelPage);
}














