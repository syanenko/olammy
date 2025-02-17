import*as app from "./renderer.js"
let {renderer, scene, camera, onShaderError, events, noiseTexture,noiseMaterial} = app;


import generators from "./generators.js"
import converse from "./converse.js"

let setVisible = (e, visible=true) => e.style.display = visible ? '' : 'none'

const chatContainer = document.getElementById("chat-container");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const saveBtn = document.getElementById("save-btn");
const chatBtn = document.getElementById("chat-btn");
const stopButton = document.getElementById("stop-btn")
const chatInput = document.getElementById("chat-input");
const repairButton = document.getElementById('repair-btn')

const divider = document.getElementById("divider");
const chatPanel = document.getElementById('chat-panel')
const leftPane = document.getElementById('left-pane')

let activeGenerator = generators.uvEffect;

let model = "deepseek-r1:32b"

let exchanges = []

let shaderError;
let glslElement;
let errorElement;
let repairRequest;
let conversation;

setVisible(repairButton, false)
setVisible(stopButton, false);

let makeEditable = (elem) => {
    elem.contentEditable = true;
    elem.setAttribute('spellcheck', 'false');
    elem.setAttribute('autocorrect', 'off');
    elem.setAttribute('autocapitalize', 'off');
    elem.style.whiteSpace = "pre-wrap"
}

repairButton.addEventListener('click', (e) => {
    repairButton.style.display = 'none';
    if (repairRequest) {
        send({
            message: repairRequest
        });
        repairRequest = null;
    }
}
);

stopButton.addEventListener('click', (e) => {
    stopButton.style.display = 'none';
    if (conversation) {
        conversation.stop();
        conversation = null;
    }
}
);

let badFiles = []
import {previewShader, plane, addPreviewer, previewShaderMap} from "./generators/shaders/previewer.js"

onShaderError.fn = (errorInfo) => {

    glslElement && (glslElement.style.background = 'red');
    if (!(errorInfo.fs.status)) {
        if (!errorElement)
            errorElement = appendChatMessage("", "user", "red");
        let ecks = errorInfo.fs.errors.split(":");
        let errLine = parseInt(ecks[2]);
        let err = ecks[3] + ":" + ecks[4];
        let lines = errorInfo.fs.source.split("\n");
        let hdrOff = 0;
        let chunk = lines.slice(hdrOff);
        let errorLine = errLine - hdrOff - 1;
        let eline = chunk[errorLine];

        repairRequest = eline + " [ERROR] " + err
        // + " [/ERROR] "
        chunk[errorLine] = repairRequest;
        repairRequest = chunk.join("\n") + `
Fix the error marked with [ERROR]. Do not change anything else.
`
        //console.log(lines[errLine - 1], errorInfo.fs.errors);

        errorElement.innerText = lines[errLine - 1] + '\n' + errorInfo.fs.errors;

        repairButton.style.display = "";
let key = errorInfo.fs.source.slice(errorInfo.fs.source.indexOf(`

varying vec3 vWorldPos`))
        let owner = previewShaderMap[key]
        if(owner){
            console.log("Bad shader:",owner.fileName);
            badFiles.push(owner.fileName);
        }
    }
    shaderError && shaderError(errorInfo);
}

async function send({message, system, onResult, onShaderCompiled, onShaderCrashed}) {

    // Display user message
    appendChatMessage(message, "user", "blue");
    sendBtn.disabled = true;

    let botMessage = "";

    // Create a bot message placeholder
    let botMessageElement;
    let lines = []
    let glslLines = [];
    let currentLine = ""
    let inGLSL = false;
    let inThink = false;
    let shaderCrashed;
    let saveCB = plane.onBeforeRender;
    
    shaderError = (errorInfo) => {

        plane.material.dispose();
        plane.material = noiseMaterial;
        saveBtn.style.display = 'none';
        shaderCrashed = true;
        plane.onBeforeRender = saveCB;
        //alert("Shader crushed!")
        onShaderCrashed && onShaderCrashed()
    }

    let crashCheck = () => {
        if (!shaderCrashed) {
            saveBtn.style.display = '';
            //alert("ShaderGoood!!")
            onShaderCompiled && onShaderCompiled()
        }
    }

    let waitForCrash = () => {
        setTimeout(crashCheck, 1000);
        plane.onBeforeRender = saveCB;
    }

    let preview = () => {

        if (errorElement) {
            errorElement.remove()
            errorElement = null;
        }
        plane.material = previewShader(glslElement.innerText, activeGenerator.vertex, activeGenerator.fragment);
        saveBtn.style.display = 'none';
        shaderCrashed = false;
        plane.onBeforeRender = waitForCrash;

        renderer.compile(scene, camera)

    }
    let runGLSL = () => {
        if (!(glslLines.length || glslElement))
            return
        glslElement.innerText = glslLines.join("\n")
        //console.log(glslElement.innerText);
        preview();
        makeEditable(glslElement)
        glslElement.addEventListener('input', function() {
            console.log('Content changed!');
            glslElement.style.background = 'orange'
            preview();
        });

    }

    let parseLine = (currentLine) => {
        let isDelimeter = true;
        if (currentLine == "<think>") {
            inThink = true;
        } else if (currentLine == "</think>") {
            inThink = false;
        } else if (currentLine.startsWith("```")) {
            if (!inGLSL) {
                inGLSL = true;
            } else {
                inGLSL = false;
                runGLSL();
            }
        } else if (currentLine == "") {
            if (inThink) {
                botMessageElement = null;
                botMessage = ""
            }
        } else if (currentLine !== "") {
            if (inGLSL) {
                glslLines.push(currentLine);
            }
            // Update message dynamically
            if (!botMessage.length)
                botMessage = currentLine;
            else
                botMessage += "\n" + currentLine;

            isDelimeter = false;

        }
        let stateColor = inThink ? "lightblue" : (inGLSL ? "orange" : 'blue');
       if(currentLine=="")
           return;
        console.log(`%c${currentLine}`, `color:${stateColor};`);
        if (isDelimeter) {
            botMessageElement = null;
            botMessage = ""
        } else {
            if (!botMessageElement)
                botMessageElement = appendChatMessage("", "bot", stateColor);

            if (inGLSL) {
                glslElement = botMessageElement;
            }
            ///Can you format your responses in html?
            updateChat(()=>{
                    
                if (botMessage.startsWith("<"))
                    botMessageElement.innerHTML = botMessage;
                else
                    botMessageElement.innerText = botMessage;
            })

        }
    }
    conversation = converse({
        message,
        system,
        model,
        parseLine,
        onDone: (exchange) => {
            exchanges.push(exchange);
            stopButton.style.display = 'none';
            onResult && onResult(exchange);
        }
    });
    stopButton.style.display = '';
}

async function sendChat() {
    let message = userInput.innerText.trim();
    if (!message)
        return;
    send({
        message
    });
    sendBtn.disabled = false;
}

async function sendMessage(message = userInput.innerText.trim(), generator=activeGenerator) {

    //let message = userInput.innerText.trim();

    if (!message)
        return;

    message = generator.generator(message);

    let doRandomGen = (result) => {

        let rseed = '' + ((Math.random() * 100000) | 0);
        send({
            message: rseed + " Generate a short simple prompt for an interesting fragment shader!",
            onResult: (result) => {
                let lines = result.lines;
                let seed = lines.pop();
                if (seed.split(' ').length >= 3) {
                    let message = generator.generator(seed);
                    send({
                        message,
                        system: generator.system,
                        onShaderCompiled,
                        onShaderCrashed
                    })
                }
            }
        })
    }

    let onShaderCompiled = (result) => {
        let p = {
            src: glslElement.innerText,
        }
        let prv = addPreviewer(p.src);
        prv.mesh.frustumCulled = true;
        uploadJSON(p);
        
        doRandomGen(result)
    }
    let onShaderCrashed = (result) => {
        doRandomGen(result)
    }
    send({
        message,
        system: generator.system,
        onShaderCompiled,
        onShaderCrashed
    });

    sendBtn.disabled = false;
}

let updateChat=(cb)=>{
// Determine if we're near the bottom (10px tolerance)
    const atBottom = chatContainer.scrollTop + chatContainer.offsetHeight >= chatContainer.scrollHeight - 100;
    let scrollTop = chatContainer.scrollTop;

cb()
    if (atBottom)
        scrollTop = chatContainer.scrollHeight;
    
    chatContainer.scrollTo({
      top: scrollTop,//chatContainer.scrollHeight,
      left: 0,
      behavior: 'smooth'
    });

    
}
function appendChatMessage(text="", sender="bot", bgcolor='lightblue') {

    const messageElement = document.createElement("div");
    messageElement.classList.add("message", sender);
    messageElement.innerText = text;
    messageElement.style.background = bgcolor
    
    updateChat(()=>{
        while( chatContainer.children.length > 100 ){
            chatContainer.children[0].remove();
        }
        chatContainer.appendChild(messageElement);
    })
    
    return messageElement;
}

let fakeEnter = (evt, elem) => {}

let shiftEnterKD = (e) => {
    if (e.key === "Enter") {
        e.preventDefault()
        if (e.shiftKey) {
            document.execCommand("insertParagraph");
        } else if (e.ctrlKey)
            sendMessage();
        else
            sendChat();
    }
}

makeEditable(userInput);

sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", shiftEnterKD)
userInput.addEventListener("input", (e) => {});

let artifacts = {}

let galleryDir = await (await fetch("./data.json")).json();
//[];//await (await fetch("/files")).json()
//console.log("gallery files:",galleryDir.length);
let fraggles = {}

function setFrustumCulled(){
    this.onBeforeCompile = undefined;
    this.frustumCulled = true;
}
let parse=async (fraggle)=>{
    let f = fraggle.fileName;
    if (fraggles[fraggle.src]) {
        console.log("Found duplicate:", fraggle.fileName)

        badFiles.push(fraggle.fileName);
    } else {
        fraggles[fraggle.src] = f;
        let previewer = addPreviewer(fraggle.src)
        if(!previewer){
            console.log("Bad artifact:",f);
            badFiles.push(fraggle.fileName);
        }else{
            previewer.fileName = fraggle.fileName;
            artifacts[fraggle.fileName] = fraggle;
            previewer.mesh.onBeforeRender = setFrustumCulled;

        }
    }
}

let load = async (f, i) => {
    try{
        let fraggle = await (await fetch("data/" + f)).json()
        parse(fraggle)
    }
    catch(e){
        console.warn(e);
    }
}

let k = Object.keys(galleryDir);
k.forEach(key =>{
    galleryDir[key].fileName = key;
    parse(galleryDir[key]);
});

//let proms = galleryDir.map((f,i)=>load(f,i));
//await Promise.all(proms);


console.log("Fraggles all loaded...")
    
/*
for(let i=0;i<galleryDir.length;i++)
    await load(galleryDir[i],i);
*/
/*
function uploadFile() {
    var file = document.getElementById('fileInput').files[0];
    var formData = new FormData();
    formData.append('file', file);
*/

async function uploadJSON(jsonObject, filename="data.json") {
    const blob = new Blob([JSON.stringify(jsonObject, null, 2)],{
        type: "application/json"
    });
    const formData = new FormData();
    formData.append("file", blob, filename);

    try {
        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        if (response.ok) {
            console.log("JSON uploaded successfully!");
            saveBtn.style.display = 'none';
                    
              const result = await response.json();
              console.log('Uploaded successfully:', result.filename);
           //  alert(`File uploaded. New filename: ${result.filename}`);
            artifacts[result.filename] = jsonObject;
            jsonObject.fileName = result.filename;
        } else {
            console.error("Upload failed:", await response.text());
        }
    } catch (error) {
        console.error("Error uploading JSON:", error);
    }
}

function uploadFile() {
    saveBtn.style.display = 'none';
    if (glslElement) {
        uploadJSON({
            src: glslElement.innerText,
        })
        addPreviewer(glslElement.innerText);
    } else {
        alert("no glsl!")
    }
}

async function deleteFile(filename) {
  try {
    const response = await fetch('/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filename })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const result = await response.text();
    console.log('File deleted successfully:', result);
    // You could update the UI here if needed
  } catch (err) {
    console.error('Error deleting file:', err);
  }
}

events.listen('frame',async()=>{
    if(badFiles.length){
        infoPanel.innerText = `${badFiles.length} insurgent shaders detected.\nScheduling for deletion.`
    }
    while(badFiles.length){
        await deleteFile(badFiles.shift())
    }
})

saveBtn.addEventListener("click", uploadFile);
modelList.addEventListener("change", (e) => {
    model = e.target.value;
}
);

function fetchModels(onSuccess, onError) {
    fetch('/models').then(response => response.json()).then(data => {
        onSuccess && onSuccess(data);
    }
    ).catch(error => {
        console.error('Error fetching models:', error);
        onError && onError();
    }
    );
}


import {download} from "./generators/shaders/download.js";
let infoPanel = document.getElementById('info-panel')
events.listen('artifact-selected',(p)=>{
    if(!p){
        infoPanel.innerHTML = ''
        return;
    }
    if(!p.fileName)
        return;
    let a = artifacts[p.fileName]
    infoPanel.innerHTML += `<button id="save-info">💾</button><button id="close-info">⛔</button><button id="delete-effect">☠️</button></br>
`+a.src;
    //infoPanel.innerText += "\n"+a.src;
    document.getElementById('close-info').addEventListener('click',(e)=>{
        infoPanel.innerHTML=infoPanel.innerText='';
    })
    document.getElementById('delete-effect').addEventListener('click',(e)=>{
        let a = artifacts[p.fileName];
        if(confirm("Delete this effect :"+p.fileName+"?")){
            deleteFile(p.fileName);
            infoPanel.innerHTML=infoPanel.innerText='';
        }
    })    
    document.getElementById('save-info').addEventListener('click',(e)=>{
        let a = artifacts[p.fileName];
        
        download(a.src,p.fileName)
    })
})

fetchModels( (data) => {
    const modelList = document.getElementById('modelList');
    modelList.innerHTML = '';
    // Clear previous list
    data.models.forEach(fmodel => {
        const li = document.createElement('option');
        li.textContent = fmodel.name;
        modelList.appendChild(li);
        if (fmodel.name == model) {
            li.setAttribute('selected', true);
        }
    }
    );
}
, () => {
    setVisible(divider,false);
    setVisible(chatPanel,false);
    leftPane.style.width = '100%';
}
);
