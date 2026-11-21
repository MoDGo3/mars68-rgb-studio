// ดาวน์โหลด chunk ที่อ้างถึงกันจนครบ (อ่านเป็นข้อความเท่านั้น ไม่รันโค้ด)
const fs=require("fs"),path=require("path");
const dir=process.argv[2], base="https://hid.carotmas.com/assets/";
const seen=new Set(fs.readdirSync(dir));
(async()=>{let changed=true,round=0;
 while(changed&&round<10){changed=false;round++;
  const want=new Set();
  for(const f of fs.readdirSync(dir)) if(/\.(js)$/.test(f)) for(const m of fs.readFileSync(path.join(dir,f),"utf8").matchAll(/["'`]\.\/([A-Za-z0-9_.-]+\.(?:js|css))["'`]/g)) want.add(m[1]);
  const todo=[...want].filter(f=>!seen.has(f));
  await Promise.all(todo.map(async f=>{seen.add(f);try{const r=await fetch(base+f,{headers:{"User-Agent":"Mozilla/5.0"}});if(!r.ok){console.log("HTTP",r.status,f);return}fs.writeFileSync(path.join(dir,f),Buffer.from(await r.arrayBuffer()));console.log("got",f);changed=true}catch(e){console.log("ERR",f,e.message)}}));
 }
 console.log("done; files:",fs.readdirSync(dir).length);
})();
