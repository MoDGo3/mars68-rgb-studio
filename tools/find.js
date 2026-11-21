const s=require("fs").readFileSync(process.argv[2],"utf8");
const all=k=>{const o=[];let i=-1;while((i=s.indexOf(k,i+1))>=0)o.push(i);return o};
for(const k of process.argv.slice(3)) console.log(k, JSON.stringify(all(k).slice(0,30)));
