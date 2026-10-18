/* Ground-projected bearings for daily solar/lunar rise, set and current directions.
   Coordinates follow the WGS84 ellipsoid; dates refer to the selected local day. */
(function(root){
  'use strict';
  const A=6378137, F=1/298.257223563, B=A*(1-F);
  const toRad=Math.PI/180,toDeg=180/Math.PI;
  const DEFAULT_LENGTH=3000, MIN_LENGTH=100, MAX_LENGTH=50000;
  function limitLength(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.max(MIN_LENGTH,Math.min(MAX_LENGTH,n)):DEFAULT_LENGTH;
  }
  function fromSlider(value){
    const t=Math.max(0,Math.min(1000,Number(value)))/1000;
    return Math.round(MIN_LENGTH*Math.pow(MAX_LENGTH/MIN_LENGTH,t)/10)*10;
  }
  function toSlider(value){
    return Math.round(1000*Math.log(limitLength(value)/MIN_LENGTH)/Math.log(MAX_LENGTH/MIN_LENGTH));
  }
  // Vincenty's direct geodesic solution: initial bearing clockwise from true north.
  function destination(lat,lon,bearing,distanceM){
    if(![lat,lon,bearing,distanceM].every(Number.isFinite) || lat< -90 || lat>90 || distanceM<0)
      throw new RangeError('Invalid geodesic bearing');
    if(distanceM===0)return {lat,lon:((lon+180)%360+360)%360-180};
    const alpha1=bearing*toRad, phi1=lat*toRad;
    const sinAlpha1=Math.sin(alpha1),cosAlpha1=Math.cos(alpha1);
    const tanU1=(1-F)*Math.tan(phi1);
    const cosU1=1/Math.sqrt(1+tanU1*tanU1),sinU1=tanU1*cosU1;
    const sigma1=Math.atan2(tanU1,cosAlpha1);
    const sinAlpha=cosU1*sinAlpha1,cosSqAlpha=1-sinAlpha*sinAlpha;
    const uSq=cosSqAlpha*(A*A-B*B)/(B*B);
    const coeffA=1+uSq/16384*(4096+uSq*(-768+uSq*(320-175*uSq)));
    const coeffB=uSq/1024*(256+uSq*(-128+uSq*(74-47*uSq)));
    let sigma=distanceM/(B*coeffA),last;
    for(let i=0;i<30;i++){
      const twoSigmaM=2*sigma1+sigma;
      const cos2=Math.cos(twoSigmaM),sin=Math.sin(sigma),cos=Math.cos(sigma);
      const delta=coeffB*sin*(cos2+coeffB/4*(cos*(-1+2*cos2*cos2)
        -coeffB/6*cos2*(-3+4*sin*sin)*(-3+4*cos2*cos2)));
      last=sigma;
      sigma=distanceM/(B*coeffA)+delta;
      if(Math.abs(sigma-last)<1e-12)break;
    }
    const sinSigma=Math.sin(sigma),cosSigma=Math.cos(sigma);
    const temp=sinU1*sinSigma-cosU1*cosSigma*cosAlpha1;
    const phi2=Math.atan2(sinU1*cosSigma+cosU1*sinSigma*cosAlpha1,
      (1-F)*Math.sqrt(sinAlpha*sinAlpha+temp*temp));
    const lambda=Math.atan2(sinSigma*sinAlpha1,
      cosU1*cosSigma-sinU1*sinSigma*cosAlpha1);
    const C=F/16*cosSqAlpha*(4+F*(4-3*cosSqAlpha));
    const L=lambda-(1-C)*F*sinAlpha*(sigma+C*sinSigma*
      (Math.cos(2*sigma1+sigma)+C*cosSigma*(-1+2*Math.pow(Math.cos(2*sigma1+sigma),2))));
    const lon2=((lon+(L*toDeg)+180)%360+360)%360-180;
    return {lat:phi2*toDeg,lon:lon2};
  }
  function sampleRay(lat,lon,az,lengthM,stepM=250){
    const length=limitLength(lengthM);
    const n=Math.max(1,Math.ceil(length/Math.max(25,stepM)));
    return Array.from({length:n+1},(_,i)=>destination(lat,lon,az,length*i/n));
  }
  function startUtc(day,offsetHours){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if(!m||!Number.isFinite(offsetHours))throw new RangeError('Invalid local day or UTC offset');
    return new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]))-offsetHours*3600000);
  }
  function dailyRiseSet(astronomy,calculate,day,offset,lat,lon,heightM){
    if(!astronomy || typeof calculate!=='function')throw new TypeError('Astronomy unavailable');
    const start=startUtc(day,offset),end=start.getTime()+86400000;
    const observer=new astronomy.Observer(lat,lon,heightM);
    const result={};
    for(const body of ['sun','moon']){
      result[body]={};
      for(const [label,direction] of [['rise',1],['set',-1]]){
        const found=astronomy.SearchRiseSet(body==='sun'?'Sun':'Moon',observer,direction,start,1);
        const date=found?.date;
        if(!(date instanceof Date) || !(date.getTime()>=start.getTime()&&date.getTime()<end)){
          result[body][label]=null;
          continue;
        }
        const az=calculate(date,lat,lon,heightM)[body].az;
        result[body][label]=Number.isFinite(az)?{date,az:(az+360)%360}:null;
      }
    }
    return result;
  }
  function oppositeAzimuth(az) {
    if(!Number.isFinite(az))throw new RangeError('Azimuth must be finite');
    return ((az+180)%360+360)%360;
  }
  // Provides both bearing directions at the fixed physical target.
  // The reverse line contains candidate photographer locations; it is only
  // a horizontal azimuth guide and does not guarantee vertical alignment.
  function targetAlignments(astronomy,calculate,day,offset,lat,lon,heightM) {
    const events=dailyRiseSet(astronomy,calculate,day,offset,lat,lon,heightM);
    return ['sun','moon'].flatMap(body=>['rise','set'].map(event=>{
      const hit=events[body][event];
      return {body,event,date:hit?.date??null,
        celestialAz:hit?.az??null,
        cameraAz:hit?oppositeAzimuth(hit.az):null};
    }));
  }
  const api={DEFAULT_LENGTH,MIN_LENGTH,MAX_LENGTH,limitLength,fromSlider,toSlider,destination,sampleRay,startUtc,dailyRiseSet,oppositeAzimuth,targetAlignments};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.GroundBearings=api;
})(typeof window!=='undefined'?window:globalThis);
