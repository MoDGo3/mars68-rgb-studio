const HID=require("../studio/node_modules/node-hid");
const info=HID.devices().find(d=>d.vendorId==0x3151&&d.productId==0x5030&&d.usagePage==0xffff&&d.usage==2);
const dev=new HID.HID(info.path);
const chk7=a=>{a[7]=(255-(a[0]+a[1]+a[2]+a[3]+a[4]+a[5]+a[6]))&255;return a};
const hex=r=>Array.from(r).slice(0,12).map(x=>x.toString(16).padStart(2,"0")).join(" ");
function xfer(a){dev.sendFeatureReport([0,...a]);return dev.getFeatureReport(0,65)}
const LED=[1,7,13,19,25,31,37,43,49,55,61,67,73,79,85, 2,8,14,20,26,32,38,44,50,56,62,68,74,80,86, 3,9,15,21,27,33,39,45,51,57,63,69,81,87, 4,16,22,28,34,40,46,52,58,64,70,76,82,88, 5,11,17,41,59,65,71,77,83,89];
const PAL={P:[240,20,120],B:[60,190,255],R:[255,0,0],V:[180,30,240],D:[190,40,70]};
const PAT="PPPPPPPPBBPBBPP"+"PPRPPPPBBPPBBPP"+"PRRRPPPBBBBBVV"+"PPPPPPPBBBBPDP"+"PPPPBPPDDD";
function frame(shift=0){const rgb=new Array(378).fill(0);for(let i=0;i<LED.length;i++){const c=PAL[PAT[(i+shift)%PAT.length]];rgb.set?0:0;rgb[LED[i]*3]=c[0];rgb[LED[i]*3+1]=c[1];rgb[LED[i]*3+2]=c[2];}return rgb}
function sendFrame(rgb,gap){const res=[];for(let p=0;p<7;p++){const ch=rgb.slice(p*56,p*56+56),a=new Array(64).fill(0);a[0]=12;a[2]=255;a[3]=p;a[4]=ch.length;a[5]=p==6?1:0;ch.forEach((v,i)=>a[8+i]=v);chk7(a);res.push(hex(xfer(a)));if(gap){const t=Date.now();while(Date.now()-t<gap);}}return res}
module.exports={dev,xfer,chk7,hex,frame,sendFrame};
if(require.main===module){
  console.log("GetLed:",hex(xfer(chk7([0x87,...new Array(63).fill(0)]))));
  const t=performance.now();const r=sendFrame(frame(0),0);console.log("frame no-gap ms",(performance.now()-t).toFixed(1));r.forEach((x,i)=>console.log(" p"+i,x));
  dev.close();
}
