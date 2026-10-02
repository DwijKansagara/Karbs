// Original Karbs robot faces. Mechanical panel, antenna and expressive display.
import type {BotStateName,BotEmoteName} from '../core/layout';
export type RGB=readonly[number,number,number];
export type EyeShape='pill'|'wide'|'dot'|'line'|'flat'|'happy'|'closed'|'spiral'|'heart'|'star'|'tired'|'wink'|'cup';
export function hexToRGB(hex:string):RGB{const v=parseInt(hex.replace('#',''),16);return[(v>>16&255)/255,(v>>8&255)/255,(v&255)/255];}
export function drawMark(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,color='#51d7a0',active=false,phase=0,state:BotStateName='idle',lookX=0,lookY=0){
  ctx.save();ctx.translate(x,y);const s=size;
  ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,s*.035);ctx.fillStyle=color;
  ctx.beginPath();ctx.moveTo(0,-s*.28);ctx.lineTo(0,-s*.43);ctx.stroke();ctx.fillRect(-s*.035,-s*.48,s*.07,s*.07);
  ctx.fillRect(-s*.47,-s*.1,s*.1,s*.23);ctx.fillRect(s*.37,-s*.1,s*.1,s*.23);
  ctx.beginPath();ctx.moveTo(-s*.3,-s*.28);ctx.lineTo(s*.3,-s*.28);ctx.lineTo(s*.37,-s*.2);ctx.lineTo(s*.37,s*.24);ctx.lineTo(s*.29,s*.32);ctx.lineTo(-s*.29,s*.32);ctx.lineTo(-s*.37,s*.24);ctx.lineTo(-s*.37,-s*.2);ctx.closePath();ctx.fill();
  ctx.fillStyle='#14231c';ctx.beginPath();ctx.rect(-s*.28,-s*.18,s*.56,s*.33);ctx.fill();
  ctx.fillStyle='#edfff2';ctx.strokeStyle='#edfff2';ctx.lineWidth=Math.max(1,s*.035);ctx.lineCap='square';
  const blink=state==='sleeping'||(active&&phase%3.5>3.36);const eyeY=-s*.04+Math.max(-1,Math.min(1,lookY))*s*.025;
  for(const side of[-1,1]){const eyeX=side*s*.13+Math.max(-1,Math.min(1,lookX))*s*.025;
    if(blink){ctx.fillRect(eyeX-s*.045,eyeY,s*.09,s*.025);}
    else if(state==='finished'){ctx.beginPath();ctx.moveTo(eyeX-s*.045,eyeY+s*.02);ctx.lineTo(eyeX,eyeY-s*.025);ctx.lineTo(eyeX+s*.045,eyeY+s*.02);ctx.stroke();}
    else if(state==='error'){ctx.beginPath();ctx.moveTo(eyeX-s*.04,eyeY-s*.04);ctx.lineTo(eyeX+s*.04,eyeY+s*.04);ctx.moveTo(eyeX+s*.04,eyeY-s*.04);ctx.lineTo(eyeX-s*.04,eyeY+s*.04);ctx.stroke();}
    else ctx.fillRect(eyeX-s*.04,eyeY-s*.055,s*.08,state==='approval'?s*.15:s*.11);
  }
  ctx.strokeStyle='#14231c';ctx.lineWidth=Math.max(1,s*.025);ctx.beginPath();ctx.moveTo(-s*.065,s*.225);ctx.lineTo(s*.065,s*.225);ctx.stroke();
  if(active){ctx.fillStyle='#14231c';for(let i=0;i<3;i++){ctx.globalAlpha=Math.floor(phase*3)%3===i?1:.3;ctx.fillRect(s*(.18+i*.05),s*.22,s*.025,s*.025);}}
  ctx.restore();
}
export class BotEngine{
  isMini=false;bodyColor:RGB|null=null;particleOverhang=0;state:BotStateName='idle';
  permanentEye:EyeShape|null=null;eyeOverride:EyeShape|null=null;eyeOverrideUntil=0;permanentEmote:BotEmoteName|null=null;
  lookX=0;lookY=0;tgEs=1;morph=0;slotHTarget=0;slotH=0;slotHVel=0;onDizzy:(()=>void)|null=null;private phase=0;
  setState(next:BotStateName,_force=false){this.state=next;}
  setPermanentEmote(value:BotEmoteName|null){this.permanentEmote=value;}
  triggerEmote(_value:BotEmoteName,_duration=1.8){}
  blink(){} squash(){} gulp(){} slap(){} greet(){} interruptGreet(){} doRoll(_duration:number,_turns:number){}
  animateMorph(target:number,_duration?:number){this.morph=target;} resetMorph(){this.morph=0;}
  get busy(){return ['working','thinking','searching'].includes(this.state);}
  update(dt:number){this.phase+=dt*.7;}
  draw(ctx:CanvasRenderingContext2D,w:number,h:number){
    const c=this.bodyColor;const color=c?`rgb(${c.map(n=>Math.round(n*255)).join(',')})`:this.state==='error'?'#f47c76':this.state==='approval'?'#e9b965':'#51d7a0';
    drawMark(ctx,w/2,(h+this.particleOverhang)/2,Math.min(w,h-this.particleOverhang)*.8,color,this.busy,this.phase,this.state,this.lookX,this.lookY);
  }
}
