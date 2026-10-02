import {drawMark} from './engine';
export class Greeting{
  onComplete:(()=>void)|null=null;private started=0;private finished=false;
  start(){this.started=performance.now();this.finished=false;}
  hover(){} interrupt(){this.finish();}
  get elapsed(){return(performance.now()-this.started)/1000;} get done(){return this.finished;}
  private finish(){if(!this.finished){this.finished=true;this.onComplete?.();}}
  draw(ctx:CanvasRenderingContext2D){ctx.clearRect(0,0,640,150);if(this.elapsed>.9){this.finish();return;}drawMark(ctx,320,65,76);}
}
