/* Solar-phase sky colours and local-day solar events.
   Sky colour is a schematic palette, not a photometric sky simulation.
   Astronomical events use Astronomy Engine's searches rather than sampled approximations. */
(function (root) {
  'use strict';
  // Discrete colours. Each twilight-table row has a dedicated swatch.
  // Blue hour and civil twilight overlap; golden hour contains sunrise/sunset.
  // Short, explicit boundary bands give each row a visible representation.
  const PHASE_COLORS = Object.freeze({
    night:'#000000',
    astronomical:'#18172f',
    nautical:'#182c54',
    civil:'#527da7',
    blue:'#2865b5',
    sun:'#db8464',
    golden:'#e4ac59',
    day:'#76b7e2'
  });
  const PHASE_LABELS = Object.freeze({
    night:'Night', astronomical:'Astronomical twilight',
    nautical:'Nautical twilight', civil:'Civil twilight',
    blue:'Blue hour', sun:'Sunrise / sunset',
    golden:'Golden hour', day:'Day'
  });
  const ANGLES = Object.freeze({ astronomical:-18, nautical:-12, civil:-6, blue:-4, golden:6 });
  function phaseForAltitude(alt) {
    if(!Number.isFinite(alt))return {key:'night',label:'Unknown'};
    let key;
    if(alt < -18) key='night';
    else if(alt < -12) key='astronomical';
    else if(alt < -6) key='nautical';
    else if(alt < -5.5) key='civil';
    else if(alt < -4) key='blue';
    else if(alt < -0.9) key='golden';
    else if(alt < 0.9) key='sun';
    else if(alt < 6) key='golden';
    else key='day';
    return {key,label:PHASE_LABELS[key]};
  }
  function phaseName(alt) {return phaseForAltitude(alt).label;}
  function skyColor(alt) {return PHASE_COLORS[phaseForAltitude(alt).key];}
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
      label,key:k,
      morning:{text:formatTime(e[k].morning,z),time:e[k].morning},
      evening:{text:formatTime(e[k].evening,z),time:e[k].evening}
    });
    function interval(label,key,amStart,amEnd,pmStart,pmEnd) {
      function cell(start,finish) {
        return {text:start&&finish?formatTime(start,z)+'–'+formatTime(finish,z):'—',time:start&&finish?start:null};
      }
      return {label,key,morning:cell(amStart,amEnd),evening:cell(pmStart,pmEnd)};
    }
    return [
      instant('Astronomical twilight','astronomical'),
      instant('Nautical twilight','nautical'),
      instant('Civil twilight','civil'),
      instant('Sunrise / sunset','sun'),
      interval('Blue hour','blue',e.civil.morning,e.blue.morning,e.blue.evening,e.civil.evening),
      interval('Golden hour','golden',e.blue.morning,e.golden.morning,e.golden.evening,e.blue.evening)
    ];
  }
  const api={PHASE_COLORS,PHASE_LABELS,ANGLES,phaseForAltitude,skyColor,phaseName,localDayStart,calculateDay,formatTime,toRows};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.SolarPhases=api;
})(typeof window!=='undefined'?window:globalThis);
