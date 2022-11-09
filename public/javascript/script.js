const STATUS = document.getElementById('status');               
/*--------------------------------------------------------------------------------------------------------*/
/* A. INTEGRATE MACHINE LEARNING MODEL (sketchRNN) */
const SKETCH_RNN_ML_MODEL     = "https://storage.googleapis.com/quickdraw-models/sketchRNN/models/";
const DEFINED_MLMODEL_OBJECTS = [
  "bird","ant","ambulance","angel","alarm_clock","antyoga","backpack","barn","basket","bear","bee", "beeflower",
  "bicycle","book","brain","bridge","bulldozer","bus","butterfly","cactus","calendar","castle","cat","catbus",
  "catpig","chair","couch","crab","crabchair","crabrabbitfacepig","cruise_ship","diving_board","dog","dogbunny",
  "dolphin","duck","elephant","elephantpig","everything","eye","face","fan","fire_hydrant","firetruck","flamingo",
  "flower","floweryoga","frog","frogsofa","garden","hand","hedgeberry","hedgehog","helicopter","kangaroo","key",
  "lantern","lighthouse","lion","lionsheep","lobster","map","mermaid","monapassport","monkey","mosquito","octopus",
  "owl","paintbrush","palm_tree","parrot","passport","peas","penguin","pig","pigsheep","pineapple","pool","postcard",
  "power_outlet","rabbit","rabbitturtle","radio","radioface","rain","rhinoceros","rifle","roller_coaster",
  "sandwich","scorpion","sea_turtle","sheep","skull","snail","snowflake","speedboat","spider",
  "squirrel","steak","stove","strawberry","swan","swing_set","the_mona_lisa","tiger","toothbrush",
  "toothpaste","tractor","trombone","truck","whale","windmill","yoga","yogabicycle",
]
/*--------------------------------------------------------------------------------------------------------*/

/*--------------------------------------------------------------------------------------------------------*/
/* B. SET-UP SKETCH LOGIC */  

const SKETCH  = function (p) {
  let MLModel; 
  let MLModelState;
  let MLModelLoaded     = false; 
  let MLModelIsActive   = false; 

  const temperature     = 0.1; 

  // 1. Setup Model Pen's State
  let dx, dy; 
  let x, y; 
  let startX, startY;   
  let pen               = [0, 0, 0];  
  let previousPen       = [1, 0, 0];
  const DRAWING_PEN     = {DOWN: 0, UP: 1, END: 2};
  const epsilon         = 2.0;

  // 2. Setup Human Drawing's State
  let currentRawLine    = [];
  let userPen           = 0;
  let previousUserPen   = 0; 
  let currentColor      = "black";

  // 3. Track All Drawing's Last State
  let lastHumanStroke; 
  let lastHumanDrawing; 
  let lastModelDrawing  = [];

  // 4. Don't record mouse events when the splash is done
  let splashIsOpen      = true; 

/*--------------------------------------------------------------------------------------------------------*/

/*--------------------------------------------------------------------------------------------------------*/
/* C. SETUP P5.JS  
  What is p5.js? p5 is a JS library to create interactive visuals with code in the web browser
*/  

  p.setup = function () {
    //Initialize the canvas 
    const containerSize = document.getElementById("sketch")
                                  .getBoundingClientRect();
    const screenWidth   = Math.floor(containerSize.width);
    const screenHeight  = Math.floor(containerSize.height);
    p.createCanvas(screenWidth, screenHeight);
    p.frameRate(60);
    restartApp();
    initModel(22); //Default model selection when you restart the app

    selectModels.innerHTML  = DEFINED_MLMODEL_OBJECTS
      .map((m) => `<option>${m}</option>`)
      .join("");
    
    selectModels.selectedIndex  = 22; 
    selectModels.addEventListener("change", () => 
      initModel(selectModels.selectedIndex)
    );

    btnClear.addEventListener("click", restartApp);
    btnRetry.addEventListener("click", retryDrawing);
    btnHelp.addEventListener("click", () => {
      splash.classList.remove("hidden");
      splashIsOpen = true; 
    });
    btnGo.addEventListener("click", () => {
      splashIsOpen  = false; 
      splash.classList.add("hidden");
    });
    btnSave.addEventListener("click", () => {
      p.saveCanvas("magic-drawing-board", "jpg")
    });
  };

  p.windowResized = function () {
    console.log("resize canvas");
    const containerSize = document 
      .getElementById("sketch")
      .getBoundingClientRect();
    const screenWidth   = Math.floor(containerSize.width);
    const screenHeight  = Math.floor(containerSize.height)
    p.resizeCanvas(screenWidth, screenHeight);
  }

/*--------------------------------------------------------------------------------------------------------*/
/* D. SETUP HUMAN DRAWING */  

//1. Start drawing
p.mousePressed = function () {
  if (!splashIsOpen && p.isInBounds()) {
    x = startX = p.mouseX; 
    y = startY = p.mouseY; 
    userPen = 1;

    MLModelIsActive = false; 
    currentRawLine = [];
    lastHumanDrawing = [];
    previousUserPen = userPen;
    p.stroke(currentColor);
  }
};

//2. Finish drawing 
p.mouseReleased = function () {
  if (!splashIsOpen && p.isInBounds()) {
    userPen = 0; 
    const currentRawLineSimplified = MLModel.simplifyLine(currentRawLine);

    //What if you accidentally finish your drawing?
    if (currentRawLineSimplified.length > 1) {
      lastHumanStroke = MLModel.lineToStroke(currentRawLineSimplified, [
        startX, 
        startY
      ]);
      encodeStrokes(lastHumanStroke);
    }
    currentRawLine = [];
    previousUserPen = userPen;
  }
};

p.mouseDragged = function () {
  if (!splashIsOpen && !MLModelIsActive && p.isInBounds()) {
    const dx0   = p.mouseX - x; 
    const dy0   = p.mouseY - y; 
    if (dx0 * dx0 + dy0 * dy0 > epsilon * epsilon) {
      
      dx = dx0; 
      dy = dy0; 
      userPen = 1; 

      if (previousUserPen == 1) {
        p.line(x, y, x + dx, y + dy); // draw line connecting prev point to current point
        lastHumanDrawing.push([x, y, x + dx, y + dy]);
      }
      x += dx; 
      y += dy; 
      currentRawLine.push([x, y]);
    }
    previousUserPen = userPen;
  }
  return false; 
};
/*--------------------------------------------------------------------------------------------------------*/

/*--------------------------------------------------------------------------------------------------------*/
/* D. SETUP MODEL / AI DRAWING */  

p.draw = function () {

  //Model inactive state
  if (!MLModelLoaded || !MLModelIsActive) {
    return; 
  }

  //New Drawing State
  pen = previousPen; 
  MLModelState = MLModel.update([dx, dy, ...pen], MLModelState);
  const pdf = MLModel.getPDF(MLModelState, temperature);
  [dx, dy, ...pen] = MLModel.sample(pdf);

  //If user's finished with previous drawing, start a new drawing
  if (pen[DRAWING_PEN.END] === 1) {
    console.log("This drawing is finished");
    MLModelIsActive = false; 
  } 
  else 
  {
    // ML only draw on the paper if the pen is still touching the paper
    if (previousPen[DRAWING_PEN.DOWN] === 1) {
      p.line(x, y, x + dx, y + dy);
      lastModelDrawing.push([x, y, x + dx, y + dy]);
    }

    // Update drawing line
    x += dx; 
    y += dy; 
    previousPen = pen; 
  }
};

p.isInBounds = function () {
  return (
    p.mouseX >= 0 &&
    p.mouseY >= 0 &&
    p.mouseX < p.width && 
    p.mouseY < p.height
  );
};
/*--------------------------------------------------------------------------------------------------------*/

/*--------------------------------------------------------------------------------------------------------*/
/* E. HELPERS FUNCTION */ 

function retryDrawing() {
  p.stroke("white");
  p.strokeWeight(6);

  //Undo previous line that the model drew
  for (let i = 0; i < lastModelDrawing.length; i++) {
    p.line(...lastModelDrawing[i]);
  }

  //Undo previous line that the human drawn
  for (let i = 0; i < lastHumanDrawing.length; i++) {
    p.line(...lastHumanDrawing[i]);
  }
  p.strokeWeight(3.0);
  p.stroke(currentColor);

  //Redraw human's drawing
  for (let i = 0; i < lastHumanDrawing.length; i++) {
    p.line(...lastHumanDrawing[i]);
  }
  encodeStrokes(lastHumanStroke);
};

function restartApp() {
  p.background(255, 255, 255, 255);
  p.strokeWeight(3.0);

  //Start drawing in the middle of the screen
  startX = x = p.width / 2.0; 
  startY = y = p.height / 3.0;

  //Reset user's drawing state 
  userPen = 1; 
  previousPen = 0; 
  currentRawLine = [];
  strokes = [];

  //Reset ML Model's drawing state
  MLModelIsActive = false; 
  previousPen = [0, 1, 0];
}

// Initilize ML Model
function initModel(index) {
  MLModelLoaded = false; 
  document.getElementById("sketch").classList.add("loading");

  if (MLModel) {
    MLModel.dispose();
  }

  MLModel = new ms.SketchRNN(`${SKETCH_RNN_ML_MODEL}${DEFINED_MLMODEL_OBJECTS[index]}.gen.json`);
  MLModel.initialize().then(() => {
    MLModelLoaded = true; 
    document.getElementById("sketch").classList.remove("loading");
    STATUS.innerText = `${DEFINED_MLMODEL_OBJECTS[index]} model loaded!`;
    MLModel.setPixelFactor(5.0);
  });
}

function encodeStrokes(sequence) {
  if (sequence.length <= 5) {
    return; 
  }

  //Encode the strokes in the model 
  let newState = MLModel.zeroState();
  newState = MLModel.update(MLModel.zeroInput(), newState);
  newState = MLModel.updateStrokes(sequence, newState, sequence.length - 1);

  //Reset the actual model we're using to the encoded strokes model one
  MLModelState = MLModel.copyState(newState);
  const lastHumanLine = lastHumanDrawing[lastHumanDrawing.length - 1];
  x = lastHumanLine[0];
  y = lastHumanLine[1];

  //Update pen state
  const s = sequence[sequence.length - 1];
  dx = s[0];
  dy = s[1];
  previousPen = [s[2], s[3], s[4]];
  lastModelDrawing = [];
  MLModelIsActive = true;
}
/*--------------------------------------------------------------------------------------------------------*/

/*--------------------------------------------------------------------------------------------------------*/
/* F. COLOR VARIANTS &  FUNCTION 
What does this code do?
...
*/ 
const COLORS = [
  { name: "black", hex: "#000000" },
  { name: "red", hex: "#f44336" },
  { name: "pink", hex: "#E91E63" },
  { name: "purple", hex: "#9C27B0" },
  { name: "deeppurple", hex: "#673AB7" },
  { name: "indigo", hex: "#3F51B5" },
  { name: "blue", hex: "#2196F3" },
  { name: "cyan", hex: "#00BCD4" },
  { name: "teal", hex: "#009688" },
  { name: "green", hex: "#4CAF50" },
  { name: "lightgreen", hex: "#8BC34A" },
  { name: "lime", hex: "#CDDC39" },
  { name: "yellow", hex: "#FFEB3B" },
  { name: "amber", hex: "#FFC107" },
  { name: "orange", hex: "#FF9800" },
  { name: "deeporange", hex: "#FF5722" },
  { name: "brown", hex: "#795548" },
  { name: "grey", hex: "#9E9E9E" },
];

p.updateCurrentColor = function (index) {
  currentColor = COLORS[index].hex
  }
};

const p5Sketch = new p5(SKETCH, "sketch");
function changeColor(event) {
  const btn = event.target; 
  p5Sketch.updateCurrentColor(btn.dataset.index);
  document.querySelector(".active").classList.remove("active");
  btn.classList.add("active")
}



