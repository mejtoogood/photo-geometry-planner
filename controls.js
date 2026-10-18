/* Lens scrubber mappings and standard third-stop nominal f-numbers. */
(function(root){
  'use strict';
  const apertures=Object.freeze([0.7,0.8,0.9,1,1.1,1.2,1.4,1.6,1.8,2,2.2,2.5,2.8,3.2,3.5,4,4.5,5,5.6,6.3,7.1,8,9,10,11,13,14,16,18,20,22,25,29,32,36,40,45,51,57,64]);
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function logarithmicToValue(position,min,max){return min*Math.pow(max/min,clamp(Number(position),0,1000)/1000);}
  function valueToLogarithmic(value,min,max){return clamp(Math.round(1000*Math.log(clamp(Number(value),min,max)/min)/Math.log(max/min)),0,1000);}
  function focalFromSlider(position){return Math.round(logarithmicToValue(position,8,1200));}
  function focalToSlider(mm){return valueToLogarithmic(mm,8,1200);}
  function focusFromSlider(position){const m=logarithmicToValue(position,0.2,10000);return m<10?Math.round(m*100)/100:m<100?Math.round(m*10)/10:Math.round(m);}
  function focusToSlider(m){return valueToLogarithmic(m,0.2,10000);}
  function apertureIndex(value){return apertures.reduce((best,v,i)=>Math.abs(Math.log(v/Number(value)))<Math.abs(Math.log(apertures[best]/Number(value)))?i:best,0);}
  const api={apertures,focalFromSlider,focalToSlider,focusFromSlider,focusToSlider,apertureIndex};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.LensControls=api;
})(typeof window!=='undefined'?window:globalThis);
