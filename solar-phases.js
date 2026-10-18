/* Solar-phase sky colours and local-day solar events.
   Sky colour is a schematic palette, not a photometric sky simulation.
   Astronomical events use Astronomy Engine's searches rather than sampled approximations. */
(function (root) {
  'use strict';
  const PALETTE = [
    [-90,'#000000'],[-18,'#050913'],[-12,'#142b50'],
    [-6,'#265c9c'],[-4,'#4d7db8'],[-0.833,'#b17c91'],
    [0,'#e6a665'],[3,'#e6bb83'],[6,'#91c5e9'],
    [20,'#76b7e2'],[90,'#76b7e2']
  ];
  const ANGLES = Object.freeze({ astronomical:-18, nautical:-12, civil:-6, blue:-4, golden:6 });
  function parseHex(hex) {return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
  function interpolate(a,b,t) {
    const c=parseHex(a),d=parseHex(b);
    return '#'+c.map((n,i)=>Math.round(n+(d[i]-n)*t).toString(16).padStart(2,'0')).join('');
  }
  function skyColor(alt) {
    if(!Number.isFinite(alt))return '#000000';
    if(alt<=PALETTE[0][0])return PALETTE[0][1];
    for(let i=1;i<PALETTE.length;i++){
      if(alt<=PALETTE[i][0]){
        const [a,ca]=PALETTE[i-1],[b,cb]=PALETTE[i];
        return interpolate(ca,cb,(alt-a)/(b-a));
      }
    }
    return PALETTE.at(-1)[1];
  }
  function phaseName(alt) {
    if(!Number.isFinite(alt))return 'Unknown';
    if(alt < -18)return 'Night';
    if(alt < -12)return 'Astronomical twilight';
    if(alt < -6)return 'Nautical twilight';
    if(alt < -4)return 'Blue hour';
    if(alt < 6)return 'Golden hour';
    return 'Day';
  }
  function localDayStart(day,offset) {
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if(!m||!Number.isFinite(offset))throw new Error('Invalid date or UTC offset');
    const date=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])-offset*3600000);
    if(!Number.isFinite(date.getTime()))throw new Error('Invalid calendar date');
    return date;
  }
  function eventDate(time) {return time?.date instanceof Date ? time.date : null;}
  function calculateDay(day,offset,lat,lon,heightM) {
    const A=root.Astronomy;
    if(!A)throw new Error('Astronomy Engine is unavailable');
    const observer=new A.Observer(lat,lon,heightM);
    const start=localDayStart(day,offset),end=start.getTime()+86400000;
    function within(time) {
      const date=eventDate(time);
      return date&&date.getTime()>=start.getTime()&&date.getTime()<end?date:null;
    }
    function atAltitude(angle,direction) {
      return within(A.SearchAltitude('Sun',observer,direction,start,1,angle));
    }
    function riseSet(direction) {
      return within(A.SearchRiseSet('Sun',observer,direction,start,1));
    }
    const events={};
    for(const [key,angle] of Object.entries(ANGLES)){
      events[key]={morning:atAltitude(angle,1),evening:atAltitude(angle,-1)};
    }
    events.sun={morning:riseSet(1),evening:riseSet(-1)};
    return {day,offset,start,events};
  }
  function formatTime(utc,offset) {
    if(!(utc instanceof Date)||!Number.isFinite(utc.getTime()))return '—';
    return new Date(utc.getTime()+offset*3600000).toISOString().slice(11,16);
  }
  function toRows(info) {
    const e=info.events,z=info.offset;
    const instant=(label,k)=>({
      label,
      morning:{text:formatTime(e[k].morning,z),time:e[k].morning},
      evening:{text:formatTime(e[k].evening,z),time:e[k].evening}
    });
    function interval(label,amStart,amEnd,pmStart,pmEnd) {
      function cell(start,finish) {
        return {text:start&&finish?formatTime(start,z)+'–'+formatTime(finish,z):'—',time:start&&finish?start:null};
      }
      return {label,morning:cell(amStart,amEnd),evening:cell(pmStart,pmEnd)};
    }
    return [
      instant('Astronomical twilight','astronomical'),
      instant('Nautical twilight','nautical'),
      instant('Civil twilight','civil'),
      instant('Sunrise / sunset','sun'),
      interval('Blue hour',e.civil.morning,e.blue.morning,e.blue.evening,e.civil.evening),
      interval('Golden hour',e.blue.morning,e.golden.morning,e.golden.evening,e.blue.evening)
    ];
  }
  const api={PALETTE,ANGLES,skyColor,phaseName,localDayStart,calculateDay,formatTime,toRows};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.SolarPhases=api;
})(typeof window!=='undefined'?window:globalThis);
