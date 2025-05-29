// Camera movement settings
let clickStartTime = null;
let clickStartPosition = { x: 0, y: 0 };
const cameraEaseAmount = 0.04;  // Easing factor (0-1, higher = smoother)
const scrollSensitivity = -0.06; // How much mouse scroll affects camera movement
const touchSensitivity = 2;    // New sensitivity constant for touch movement
const dragSensitivity = 0.00002;
const maxCameraZ = 150;         // If you try to scroll away from this point...
// you attempt to set cameraZ > maxCameraZ) then we need
// to scroll the website and not three.js scene)
let isDragging = false;
let dragStartPos = { x: 0, y: 0 };

const startFadeDistance = 5;
const endFadeDistance = -20;
let cameraZoffset = 0;

// Distance-based position animation
const maxSpreadDistance = 1000; // Start spreading at this distance
const minSpreadDistance = 300;  // Fully centered at this distance
const maxSpreadAmount = 5;      // Maximum spread distance in X/Y

// New opacity animation parameters
const maxOpacityDistance = 200; // Distance where opacity is 1

let allImagesLoaded = false;

// Three.js initialization
function initThreeJS() {
    const canvas = document.getElementById('threejs-canvas');

    // Scene setup
    threeScene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(7, window.innerWidth / window.innerHeight, 1, 2000);
    let targetCameraPosition = new THREE.Vector3(0, 0, maxCameraZ);
    let currentCameraPosition = new THREE.Vector3(0, 0, 0);
    let dragCameraStartPos = null;

    // Renderer
    threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
    threeRenderer.setClearColor(0x000000, 1);

    function onMouseDown(event) {
        isDragging = true;
        dragStartPos = { x: event.clientX, y: event.clientY };
        dragCameraStartPos = { x: targetCameraPosition.x, y: targetCameraPosition.y };

        // Track click start
        clickStartTime = Date.now();
        clickStartPosition = { x: event.clientX, y: event.clientY };
    }

    function onMouseUp(event) {
        isDragging = false;

        // Check if this should trigger image scroll
        if (clickStartTime) {
            const clickDuration = Date.now() - clickStartTime;
            const mouseMovement = Math.sqrt(
                Math.pow(event.clientX - clickStartPosition.x, 2) +
                Math.pow(event.clientY - clickStartPosition.y, 2)
            );

            if (clickDuration < 400 && mouseMovement < 10) {
                tryScrollToImage(event);
            }

            clickStartTime = null;
        }
    }

    function onMouseMove(event) {
        event.preventDefault();
        if (isDragging) {
            // Calculate delta movement from start position
            const deltaX = event.clientX - dragStartPos.x;
            const deltaY = event.clientY - dragStartPos.y;

            // Convert to normalized device coordinates (-1 to +1)
            targetCameraPosition.x = dragCameraStartPos.x + -deltaX * window.innerWidth * dragSensitivity;
            targetCameraPosition.y = dragCameraStartPos.y + deltaY * window.innerHeight * dragSensitivity;
        }
        // Get mouse position in normalized device coordinates (-1 to +1)
        mouse.x = -(event.clientX / window.innerWidth) * 2 + 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('mousemove', onMouseMove);

    function onMouseWheel(event) {
        // Prevent page scrolling
        event.preventDefault();

        // Update target position based on scroll direction
        targetCameraPosition.z += event.deltaY * scrollSensitivity;
        targetCameraPosition.x = 0;
        targetCameraPosition.y = 0;
    }

    // Touch handling variables
    let touchStartY = null;
    let considerTouchAsClick = false;

    function onTouchStart(event) {
        if (event.touches.length === 1 && event.target === canvas) {
            event.preventDefault();
            touchStartY = event.touches[0].clientY;
            mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
        }
        considerTouchAsClick = true;
        setTimeout(() => considerTouchAsClick = false, 100)
    }

    function onTouchMove(event) {
        if (event.touches.length === 1 && event.target === canvas) {
            event.preventDefault();
            const currentTouchY = event.touches[0].clientY;
            const deltaY = currentTouchY - touchStartY;

            // Update targetCameraPosition.z based on touch movement
            targetCameraPosition.z += deltaY * touchSensitivity;
            touchStartY = currentTouchY; // Update reference point

            // Prevent scrolling the page
            event.preventDefault();
        }
    }

    function onTouchEnd(event) {
        touchStartY = null;
        if (considerTouchAsClick) {
            tryScrollToImage(event);
            event.preventDefault();
        }
    }

    canvas.addEventListener('wheel', onMouseWheel, { passive: false });

    // Add touch event listeners
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });

    // Add click event listener for raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function tryScrollToImage(event) {
        // Update mouse position
        if (event.clientX != null) {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        }

        // Cast ray through scene
        raycaster.setFromCamera(mouse, threeCamera);
        const intersects = raycaster.intersectObjects(threeScene.children);

        for (const intersected of intersects) {
            const intersectedObject = intersected.object;
            if (intersectedObject instanceof THREE.Mesh &&
                intersectedObject.visible &&
                intersectedObject.material.opacity >= 1
            ) {
                // Set new target and reset current position for smooth movement
                doScrollToImage(intersectedObject);
                break;
            }
        }
    }

    function handleKeyDown(event) {
        if (scrollFraction >= 0.999) { // Only handle when fully scrolled down

            const currentIndex = Math.round(
                (-currentCameraPosition.z - startFadeDistance) / imageSpacing
            );

            let nextImageIndex;

            switch (event.keyCode) {
                case 38: // up
                case 39: // right
                    nextImageIndex = Math.max(0, currentIndex + 1);
                    event.preventDefault();
                    break;

                case 37: // left
                case 40: // down
                    nextImageIndex = currentIndex - 1;
                    event.preventDefault();
                    break;
            }

            if (nextImageIndex != null && nextImageIndex < imagePlanes.length && nextImageIndex >= 0) {
                doScrollToImage(imagePlanes[nextImageIndex].plane);
            }
        }
    }

    // Add keyboard event listener
    document.body.addEventListener('keydown', handleKeyDown);

    const imagePlanes = [];
    // Load image list and start downloading
    fetch('assets/images-list.txt')
        .then(response => response.text())
        .then(text => {
            const imageFiles = text.split('\n').filter(line => line.trim() !== '');

            // Create planes for each image
            imageFiles.forEach((file, i) => {
                // Create plane with default size, we'll adjust it when texture loads
                const geometry = new THREE.PlaneGeometry(5, 5);
                const material = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    side: THREE.DoubleSide,
                    transparent: true,
                    toneMapped: false // Disable tone mapping for accurate colors
                });

                const plane = new THREE.Mesh(geometry, material);
                plane.visible = false; // Start hidden
                plane.userData.loaded = false;
                plane.userData.maxOpacity = 0;

                // Position along Z-axis with angular distribution
                plane.position.z = -i * imageSpacing;

                // Calculate angle in degrees (i*100) and convert to radians
                const angle = (i * 100) * (Math.PI / 180);

                // Calculate unit vector components
                const x = Math.cos(angle);
                const y = Math.sin(angle);

                // Apply random magnitude between minOffset and maxOffset
                const magnitude = minOffset + Math.random() * (maxOffset - minOffset);

                plane.position.x = x * magnitude;
                plane.position.y = y * magnitude / (window.innerWidth / window.innerHeight);

                threeScene.add(plane);
                imagePlanes.push({ plane, file });
            });

            // Function to load images in parallel batches
            const textureLoader = new THREE.TextureLoader();
            const loadImagesInBatches = async (planes, batchSize = 20) => {
                for (let i = 0; i < planes.length; i += batchSize) {
                    const batch = planes.slice(i, i + batchSize);
                    await Promise.all(batch.map(({ plane, file }) =>
                        new Promise((resolve) => {
                            textureLoader.load(`assets/images/optimized/${file}`, (texture) => {
                                // Adjust plane size based on texture aspect ratio
                                const aspect = texture.image.width / texture.image.height;
                                plane.scale.set(aspect, 1, 1);

                                // Set texture properties
                                texture.colorSpace = THREE.SRGBColorSpace; // Preserve color space
                                texture.minFilter = THREE.LinearFilter; // Better quality

                                // Update material
                                plane.material.map = texture;
                                plane.material.needsUpdate = true;
                                plane.userData.loaded = true;
                                plane.userData.maxOpacity = 0;
                                plane.visible = true;
                                resolve();
                            });
                        })
                    ));
                }
            };

            // Start loading images
            loadImagesInBatches(imagePlanes).then(() => {
                setTimeout(() =>
                    allImagesLoaded = true, 200);
            });
        })
        .catch(error => console.error('Error loading image list:', error));

    function doScrollToImage(intersectedObject) {
        targetCameraPosition.z = intersectedObject.userData.originalOffset.z + startFadeDistance;

        const imagePosition = new THREE.Vector2(
            intersectedObject.userData.originalOffset.x,
            intersectedObject.userData.originalOffset.y
        );
        imagePosition.normalize();

        // Keep the original X/Y position of the plane
        targetCameraPosition.x = intersectedObject.userData.originalOffset.x + imagePosition.x * 0.8;
        targetCameraPosition.y = intersectedObject.userData.originalOffset.y + imagePosition.y * 0.8;
    }

    // Easing function for smooth transitions
    function easeInOutQuad(t) {
        t = Math.min(1, Math.max(0, t));
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    // Animation loop
    function animate() {
        // Update camera position with easing in all dimensions
        if (canvas.style.opacity > 0) {
            // Update Z position
            currentCameraPosition.z += (targetCameraPosition.z - currentCameraPosition.z) * cameraEaseAmount;

            // If we exceed maxCameraZ, scroll the website instead
            if (currentCameraPosition.z > maxCameraZ) {
                currentCameraPosition.z = maxCameraZ;
                targetCameraPosition.z = maxCameraZ;

                // Scroll to 100px above bottom smoothly
                scrollOutsideOfGallery();
            }

            // Update X and Y positions with easing
            currentCameraPosition.x += (targetCameraPosition.x - currentCameraPosition.x) * cameraEaseAmount;
            currentCameraPosition.y += (targetCameraPosition.y - currentCameraPosition.y) * cameraEaseAmount;
            currentCameraPosition.z = currentCameraPosition.z;

            cameraZoffset = ((16 / 9) / (window.innerWidth / window.innerHeight)) * 10 + 50;

            // Apply all camera positions
            threeCamera.position.copy(currentCameraPosition);
            threeCamera.position.z += cameraZoffset;

            // Smoothly rotate camera towards target rotation
            threeCamera.lookAt(new THREE.Vector3(0, 0, currentCameraPosition.z - 1000));
        }

        // Make all planes face the camera and handle centering
        threeScene.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                // Calculate original offset (stored in userData)
                if (!child.userData.originalOffset) {
                    child.userData.originalOffset = {
                        x: child.position.x,
                        y: child.position.y,
                        z: child.position.z
                    };
                    // Calculate direction from center to original position
                    const centerToPos = new THREE.Vector2(
                        child.userData.originalOffset.x,
                        child.userData.originalOffset.y
                    );
                    centerToPos.normalize();

                    // Store normalized spread direction
                    child.userData.spreadDirection = {
                        x: centerToPos.x,
                        y: centerToPos.y
                    };
                }

                // Calculate distance to camera
                const distance = currentCameraPosition.z - child.userData.originalOffset.z;

                // Distance-based position animation
                if (distance > minSpreadDistance) {
                    // Calculate spread amount based on distance
                    const spreadProgress = Math.min(1,
                        (distance - minSpreadDistance) / (maxSpreadDistance - minSpreadDistance)
                    );
                    const spreadAmount = easeInOutQuad(spreadProgress) * maxSpreadAmount;

                    // Apply spread in random direction
                    child.position.x = child.userData.originalOffset.x +
                        child.userData.spreadDirection.x * spreadAmount;
                    child.position.y = child.userData.originalOffset.y +
                        child.userData.spreadDirection.y * spreadAmount;
                }

                // Handle opacity fading - distance based
                if (distance > maxSpreadDistance) {
                    child.material.color.setRGB(0, 0, 0);
                    child.visible = false;
                } else if (distance > minSpreadDistance) {
                    const opacityProgress = (distance - minSpreadDistance) /
                        (maxSpreadDistance - minSpreadDistance);
                    const grayColor = 0.3 * (1 - easeInOutQuad(opacityProgress));
                    child.material.color.setRGB(grayColor, grayColor, grayColor);
                    child.visible = true;
                } else if (distance > maxOpacityDistance) {
                    const opacityProgress = (distance - maxOpacityDistance) /
                        (minSpreadDistance - maxOpacityDistance);
                    const grayColor = 0.3 + 0.7 * (1 - easeInOutQuad(opacityProgress));
                    child.material.color.setRGB(grayColor, grayColor, grayColor);
                } else if (distance > endFadeDistance) {
                    child.material.color.setRGB(1, 1, 1);
                    child.visible = true;
                } else {
                    child.visible = false;
                }
                if (!child.userData.loaded)
                    child.visible = false;
                else
                    child.material.needsUpdate = true;

                // Handle opacity fading - close range
                if (distance <= startFadeDistance) {
                    const fadeProgress = 1 - Math.max(0, (distance - endFadeDistance) /
                        (startFadeDistance - endFadeDistance));
                    child.material.opacity = easeInOutQuad(1 - fadeProgress);
                } else {
                    child.material.opacity = 1;
                }
                if (child.userData.loaded && child.userData.maxOpacity < 1) {
                    child.userData.maxOpacity += 0.1;
                }
                child.material.opacity = Math.min(child.userData.maxOpacity, child.material.opacity);
            }
        });

    }

    function render() {
        requestAnimationFrame(render);
        threeRenderer.render(threeScene, threeCamera);
    }
    setInterval(() => animate(), 1000 / 60);
    render();

    threeInitialized = true;
    if (scrollFraction == 0) {
        setTimeout(() => {
            canvas.style.opacity = '1';
        }, 1500)
    } else {
        canvas.style.opacity = '1';
    }

    // monkey-patch scrollToTop function we have in different script
    const _oldScrollToTop = scrollToTop;
    window.scrollToTop = function () {
        targetCameraPosition.x = 0;
        targetCameraPosition.y = 0;
        targetCameraPosition.z = maxCameraZ;
        _oldScrollToTop.call(this);
    };
}

// Wait for Three.js to load
function waitForThreeJS() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (typeof THREE !== 'undefined') {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });
}

// Handle window resize
window.addEventListener('resize', () => {
    if (threeInitialized) {
        threeCamera.aspect = window.innerWidth / window.innerHeight;
        threeCamera.updateProjectionMatrix();
        threeRenderer.setSize(window.innerWidth, window.innerHeight);
    }
});

// Convert scrollY -> a fraction in [0..1]
let imageSpacing = 100;
const minOffset = isMobile ? 2 : 10;  // Minimum random offset in X and Y directions
const maxOffset = isMobile ? 6 : 20; // Maximum random offset in X and Y directions

let threeScene = null;
let threeCamera = null;
let threeRenderer = null;
let threeInitialized = false;

waitForThreeJS().then(() => {
    initThreeJS();
});
