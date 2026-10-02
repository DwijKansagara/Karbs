// Original short notification tones, synthesized locally without audio assets.
export const SOUND_NAMES=['peek','open','close','hover','blip','slap','annoyed','dizzy','greet','work','finish','error','approval','question','approve','gulp','tick','send','love','pop','proud','wink','yawn','attach','think','search','rate','sleep'] as const;
export type SoundName=typeof SOUND_NAMES[number];
class SoundEngine{
  enabled=false;volume=.12;private ctx:AudioContext|null=null;
  async preload(){} resume(){if(this.enabled){this.ctx??=new AudioContext();void this.ctx.resume();}}
  idle(){void this.ctx?.suspend();}setVolume(v:number){this.volume=Math.max(0,Math.min(.2,v));}setEnabled(v:boolean){this.enabled=v;}
  play(name:string){if(!this.enabled || !['finish','error','approval','send'].includes(name))return;this.resume();const c=this.ctx!;const o=c.createOscillator(),g=c.createGain();o.frequency.value=name==='error'?220:name==='finish'?660:440;g.gain.setValueAtTime(this.volume*.2,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.12);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.12);}
}
export const Sound=new SoundEngine();
