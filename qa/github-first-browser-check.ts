import fs from "fs";
const WS: any = require("next/dist/compiled/ws");
import { launch } from "./cdp";
(globalThis as any).WebSocket = WS;
const pause=(n:number)=>new Promise(r=>setTimeout(r,n));
async function main(){const {proc,page,tempDir}=await launch(9335);let readmeCalls=0;try{
 await page.send("Fetch.enable",{patterns:[{urlPattern:"*api/auth/session*",requestStage:"Request"},{urlPattern:"*api/github/repos*",requestStage:"Request"},{urlPattern:"*api/github/readme*",requestStage:"Request"}]});
 page.on("Fetch.requestPaused",async p=>{const u=p.request.url;let body="{}",status=200,headers=[{name:"Content-Type",value:"application/json"}];if(u.includes("/api/auth/session")){body=JSON.stringify({authenticated:true,fresh:false,user:{id:101,login:"octocat",displayname:"Octo Student",email:"o@example.test",validatedProjects:[]}})}else if(u.includes("/api/github/repos")){body=JSON.stringify({login:"octocat",repositories:[{name:"hello-world",fullName:"octocat-qa/hello-world",url:"https://github.com/octocat-qa/hello-world",description:"A demo project",language:"TypeScript",defaultBranch:"main"}]})}else{readmeCalls++;status=503;body=JSON.stringify({error:"Mock README failure"})}try{await page.send("Fetch.fulfillRequest",{requestId:p.requestId,responseCode:status,responseHeaders:headers,body:btoa(unescape(encodeURIComponent(body)))})}catch{}});
 await page.goto("http://localhost:3000/studio",6000); await pause(3000);
 const state=await page.eval("document.body.innerText.slice(0,1600)"); console.log("BODY",state);
 const fill=async(sel:string,val:string)=>page.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw Error('missing '+${JSON.stringify(sel)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(val)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
 const clickText=async(t:string)=>page.eval(`(()=>{const e=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()===${JSON.stringify(t)});if(!e)throw Error('missing button '+${JSON.stringify(t)});e.click();return true})()`);
 await fill("#github-profile-url","https://github.com/octocat");await clickText("Find repositories");await pause(1000);if(!(await page.eval("document.body.innerText.includes('hello-world')")))throw Error("repository discovery not rendered");
 await clickText("Add project");await pause(500);await clickText("Fetch README.md");await pause(500);await clickText("Retry README (1/3)");await pause(500);await clickText("Retry README (2/3)");await pause(700);if(readmeCalls!==3)throw Error(`expected exactly 3 README attempts, got ${readmeCalls}`);if(!(await page.eval("document.body.innerText.includes('Three attempts used')")))throw Error("retry limit message missing");
 const file="C:/Users/Ali_n/.orca/printcv-captured-branch-20261112/qa-cycle2/manual-github-readme.md";fs.writeFileSync(file,"# Verified project\nImplemented a deterministic parser and documented tests.");const input=await page.eval("[...document.querySelectorAll('input[type=file]')].map((e,i)=>({i,accept:e.accept}))");if(!input.length)throw Error("manual README upload input missing");await page.send("DOM.enable");const doc=await page.send("DOM.getDocument",{depth:-1,pierce:true});const node=await page.send("DOM.querySelector",{nodeId:doc.root.nodeId,selector:'input[type=file]'});await page.send("DOM.setFileInputFiles",{nodeId:node.nodeId,files:[file]});await pause(1000);if(!(await page.eval("document.body.innerText.includes('README loaded')")))throw Error("manual README did not load");await page.eval("[...document.querySelectorAll(\"summary\")].find(x=>x.innerText.includes(\"README loaded\"))?.click()");await pause(200);await clickText("Add project and use README in writing helper");await pause(1200);if(!(await page.eval("document.body.innerText.includes('Verified project')")))throw Error("README context was not passed into helper preview");console.log("PASS GitHub discovery, add-to-CV selection, exactly3 failed README attempts, manual upload, helper context");
 }finally{page.close();proc.kill();try{fs.rmSync(tempDir,{recursive:true,force:true})}catch{}}}
main().catch(e=>{console.error(e);process.exitCode=1});





