import { useEffect, useId, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, Bell, CalendarDays, ChartNoAxesGantt, Check,
  ChevronDown, ChevronRight, CircleDollarSign, Clock3, Fuel, Gauge, LayoutDashboard, Menu,
  MoreHorizontal, Pencil, Phone, Plane, PlaneLanding, PlaneTakeoff, Plus, RefreshCw, Search,
  Eye, Mail, Settings, ShieldCheck, Sparkles, Users, X, Wrench,
} from 'lucide-react';
import { api } from './api';
import { demoData } from './demoData';
import './fleet-card.css';
import './pilot-card.css';

const NAV = [
  { id:'dashboard', label:'Overview', icon:LayoutDashboard },
  { id:'schedule', label:'Flight schedule', icon:CalendarDays },
  { id:'timeline', label:'Trip timeline', icon:ChartNoAxesGantt },
  { id:'unscheduled', label:'Needs scheduling', icon:Clock3 },
  { id:'trips', label:'Trip requests', icon:PlaneTakeoff },
  { id:'fleet', label:'Fleet', icon:Plane },
  { id:'pilots', label:'Pilots', icon:Users },
  { id:'fuel', label:'Fuel log', icon:Fuel },
];

const initialData = { dashboard:null, pilots:[], aircraft:[], trips:[], flights:[], pilotFlights:[], fuelLogs:[] };
const title = (value='') => value.replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase());
const dateFmt = (value, options={}) => value ? new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', ...options }).format(new Date(value)) : '—';
const timeFmt = (value) => value ? new Intl.DateTimeFormat('en-US', { hour:'numeric', minute:'2-digit' }).format(new Date(value)) : '—';
const dateTimeFmt = (value) => value ? new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }).format(new Date(value)) : '—';
const money = (value) => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(value || 0);
const initials = (first='', last='') => `${first[0] || ''}${last[0] || ''}`;
const durationFmt = (minutes) => {
  if (minutes == null) return '—';
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return hours ? `${hours}h ${remaining}m` : `${remaining}m`;
};
const calculateFlightEstimates = (distanceNm, aircraft) => {
  if (!distanceNm || !aircraft?.cruise_speed_kts || !aircraft?.fuel_burn_gph) return null;
  const flightHours = distanceNm / aircraft.cruise_speed_kts;
  return {
    distance_nm: distanceNm,
    estimated_flight_time_minutes: Math.round(flightHours * 6000) / 100,
    estimated_leg_time_minutes: Math.round((flightHours * 60 + 30) * 100) / 100,
    estimated_fuel_usage_gallons: Math.round(flightHours * aircraft.fuel_burn_gph * 100) / 100,
  };
};

function Badge({ status }) {
  return <span className={`badge ${status}`}><i />{title(status)}</span>;
}

function Avatar({ pilot, small=false }) {
  return <span className={`avatar ${small ? 'small' : ''}`}>{initials(pilot?.first_name, pilot?.last_name)}</span>;
}

function Toast({ toast, onClose }) {
  useEffect(() => { if (toast) { const id=setTimeout(onClose, 3600); return () => clearTimeout(id); } }, [toast, onClose]);
  if (!toast) return null;
  return <div className={`toast ${toast.type || 'success'}`}><span>{toast.type === 'error' ? '!' : <Check size={15}/>}</span>{toast.message}<button onClick={onClose}><X size={15}/></button></div>;
}

function Header({ current, query, setQuery, onCreate, demo, setDemo, sidebarOpen, setSidebarOpen }) {
  const labels = Object.fromEntries(NAV.map(n => [n.id,n.label]));
  return <header className="topbar">
    <div className="page-title"><button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20}/></button><div><span>Operations</span><h1>{labels[current]}</h1></div></div>
    <div className="top-actions">
      <label className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search operations"/><kbd>⌘K</kbd></label>
      <button className="icon-button" aria-label="Notifications"><Bell size={18}/><i /></button>
      {demo && <button className="demo-pill" onClick={() => setDemo(false)}><Sparkles size={14}/> Demo data <X size={13}/></button>}
      <button className="primary" onClick={onCreate}><Plus size={17}/> New request</button>
    </div>
  </header>;
}

function Sidebar({ current, setCurrent, open, close, data }) {
  const unscheduledCount=data.trips.filter(t=>t.status==='approved'&&!data.flights.some(f=>f.trip_id===t.id&&f.status!=='cancelled')).length;
  return <aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand"><span className="brand-mark"><Plane size={20}/></span><strong>Pilot<span>GPT</span></strong><button className="sidebar-close" onClick={close}><X size={18}/></button></div>
    <div className="workspace"><span>PA</span><div><b>Private Aviation</b><small>Flight operations</small></div><ChevronDown size={15}/></div>
    <nav>
      <p>Workspace</p>
      {NAV.map(({id,label,icon:Icon})=><button key={id} className={current===id?'active':''} onClick={()=>{setCurrent(id); close();}}><Icon size={18}/><span>{label}</span>{id==='unscheduled'&&unscheduledCount>0&&<em>{unscheduledCount}</em>}</button>)}
    </nav>
    <div className="sidebar-bottom">
      <button><Settings size={18}/> Settings</button>
      <div className="support"><span><ShieldCheck size={17}/></span><div><b>All systems operational</b><small>API connected</small></div></div>
      <div className="profile"><span className="avatar">MP</span><div><b>Michael Penniman</b><small>Operations admin</small></div><MoreHorizontal size={18}/></div>
    </div>
  </aside>;
}

function StatCard({ icon:Icon, label, value, meta, tone='lime', children }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19}/></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{meta}</small></div>{children}</article>;
}

function FlightRow({ flight, data, onStatus, onDetails, showAircraft=false }) {
  const aircraft = data.aircraft.find(a=>a.id===flight.aircraft_id);
  const pilots = data.pilots.filter(p=>flight.pilot_ids?.includes(p.id));
  return <div className="flight-row">
    <div className="flight-time"><b>{timeFmt(flight.scheduled_departure)}</b><span>{dateFmt(flight.scheduled_departure)}</span></div>
    <div className={`route-icon ${flight.status}`}><PlaneTakeoff size={17}/></div>
    <button className="route flight-trip-link" onClick={()=>onDetails(flight)} aria-label={`View ${flight.flight_number} flight details`}><div><b>{flight.origin}</b><span></span><Plane size={14}/><span></span><b>{flight.destination}</b></div><small>{flight.flight_number}{!showAircraft&&` · ${aircraft?.model || 'Unassigned aircraft'}`}</small>{flight.distance_nm&&<small className="flight-estimate-line">{Math.round(flight.distance_nm)} NM · {durationFmt(flight.estimated_leg_time_minutes)} leg · {flight.estimated_fuel_usage_gallons == null ? '—' : `${Math.round(flight.estimated_fuel_usage_gallons)} gal`}</small>}<Eye className="flight-trip-eye" size={14}/></button>
    {showAircraft&&<div className="aircraft-cell"><b>{aircraft?.tail_number || 'Unassigned'}</b><span>{aircraft?.model || 'Aircraft TBD'}</span></div>}
    <div className="crew"><div className="avatar-stack">{pilots.slice(0,2).map(p=><Avatar key={p.id} pilot={p} small/>)}</div><span>{pilots[0]?.last_name || 'Crew TBD'}{pilots.length>1?` +${pilots.length-1}`:''}</span></div>
    <Badge status={flight.status}/>
    {flight.status==='scheduled' && !['pending_cancellation','pending_reschedule','needs_rescheduling'].includes(flight.sub_status) && <button className="row-action" onClick={()=>onStatus(flight,'departed')}>Depart <ChevronRight size={14}/></button>}
    {flight.status==='departed' && <button className="row-action" onClick={()=>onStatus(flight,'completed')}>Complete <ChevronRight size={14}/></button>}
  </div>;
}

function TripCard({ trip, onApprove, onReject, onDetails }) {
  return <article className="request-card">
    <div className="request-head"><div className="customer-avatar">{trip.customer_name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div><b>{trip.customer_name}</b><span>Requested {dateFmt(trip.created_at || trip.departure_at)}</span></div><button aria-label={`View ${trip.customer_name} trip details`} onClick={()=>onDetails(trip)}><Eye size={17}/></button></div>
    <div className="request-route"><div><small>FROM</small><strong>{trip.origin}</strong></div><span><i></i><Plane size={15}/><i></i></span><div><small>TO</small><strong>{trip.destination}</strong></div></div>
    <div className="request-info"><span><CalendarDays size={15}/>{dateFmt(trip.departure_at, {weekday:'short'})} · {timeFmt(trip.departure_at)}</span><span><Users size={15}/>{trip.passengers} passengers</span></div>
    <div className="request-actions"><button onClick={()=>onReject(trip)}>Decline</button><button className="dark" onClick={()=>onApprove(trip)}>Approve request <Check size={15}/></button></div>
  </article>;
}

function Empty({ icon:Icon=Plane, title:heading, copy, action, actionLabel }) {
  return <div className="empty"><span><Icon size={24}/></span><h3>{heading}</h3><p>{copy}</p>{action && <button className="primary" onClick={action}><Plus size={16}/>{actionLabel}</button>}</div>;
}

function Overview({ data, setView, onApprove, onReject, onCreate, onStatus, onDetails, onFlightDetails, useDemo }) {
  const requested = data.trips.filter(t=>t.status==='requested').slice(0,3);
  const upcoming = [...data.flights].filter(f=>['scheduled','departed'].includes(f.status)).sort((a,b)=>new Date(a.scheduled_departure)-new Date(b.scheduled_departure)).slice(0,5);
  const d = data.dashboard || {};
  return <main className="content overview">
    <section className="welcome"><div><p>{new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric'}).format(new Date())}</p><h2>Good morning, Michael.</h2><span>Here’s what’s happening across your operation today.</span></div><button className="secondary" onClick={()=>setView('schedule')}><CalendarDays size={16}/> View calendar</button></section>
    <section className="stats-grid">
      <StatCard icon={PlaneTakeoff} label="Flights today" value={upcoming.length} meta={`${upcoming.filter(x=>x.status==='departed').length} currently airborne`}><div className="mini-bars"><i/><i/><i/><i/><i/></div></StatCard>
      <StatCard icon={Plane} label="Available aircraft" value={`${d.available_aircraft || 0} / ${d.aircraft || 0}`} meta="Fleet ready" tone="blue"><div className="ring" style={{'--pct':`${(d.available_aircraft/(d.aircraft||1))*100}%`}}><span>{Math.round((d.available_aircraft/(d.aircraft||1))*100)}%</span></div></StatCard>
      <StatCard icon={Users} label="Active pilots" value={d.active_pilots || 0} meta={`${Math.max((d.pilots||0)-(d.active_pilots||0),0)} currently off duty`} tone="purple"><div className="faces">{data.pilots.filter(p=>p.active).slice(0,3).map(p=><Avatar pilot={p} small key={p.id}/>)}</div></StatCard>
      <StatCard icon={CircleDollarSign} label="Fuel spend" value={money(d.fuel_cost)} meta={`${(d.fuel_gallons||0).toLocaleString()} gal logged`} tone="orange"><span className="trend"><ArrowDownRight size={14}/> 8.2%</span></StatCard>
    </section>
    <section className="main-grid">
      <div className="panel schedule-panel"><div className="panel-head"><div><h3>Today’s schedule</h3><p>Live flight activity and upcoming departures</p></div><button onClick={()=>setView('schedule')}>View full schedule <ArrowRight size={15}/></button></div>
        <div className="flight-list">{upcoming.length?upcoming.map(f=><FlightRow key={f.id} flight={f} data={data} onStatus={onStatus} onDetails={onFlightDetails}/>):<Empty title="No flights scheduled" copy="Add a flight leg to start building today’s schedule." action={onCreate} actionLabel="Create request"/>}</div>
      </div>
      <div className="panel requests-panel"><div className="panel-head"><div><h3>Trip requests</h3><p>{requested.length} waiting for review</p></div><button className="round" onClick={()=>setView('trips')}><ArrowRight size={17}/></button></div>
        <div className="requests-list">{requested.length?requested.slice(0,2).map(t=><TripCard key={t.id} trip={t} onApprove={onApprove} onReject={onReject} onDetails={onDetails}/>):<Empty icon={Check} title="Inbox clear" copy="New trip requests will appear here."/>}</div>
      </div>
    </section>
    <section className="bottom-grid">
      <div className="panel fleet-strip"><div className="panel-head"><div><h3>Fleet status</h3><p>Aircraft availability at a glance</p></div><button onClick={()=>setView('fleet')}>Manage fleet <ArrowRight size={15}/></button></div><div className="fleet-cards">{data.aircraft.map(a=><div key={a.id}><span className="plane-art"><Plane size={25}/></span><div><b>{a.tail_number}</b><small>{a.model}</small></div><Badge status={a.status}/></div>)}</div></div>
      <div className="panel quick-actions"><div className="panel-head"><div><h3>Quick actions</h3><p>Common operation tasks</p></div></div><div><button onClick={onCreate}><PlaneTakeoff/><span><b>New trip</b><small>Create a flight request</small></span><ChevronRight/></button><button onClick={()=>setView('fuel')}><Fuel/><span><b>Log fuel</b><small>Record a fuel purchase</small></span><ChevronRight/></button><button onClick={()=>setView('pilots')}><Users/><span><b>Add pilot</b><small>Update your crew roster</small></span><ChevronRight/></button></div></div>
    </section>
    {!useDemo && !data.trips.length && !data.flights.length && <div className="onboarding"><Sparkles size={20}/><div><b>Your workspace is ready</b><span>Create the first request, or preview the console with sample operations.</span></div></div>}
  </main>;
}

function PageHeading({ eyebrow, title:heading, copy, action, actionLabel }) {
  return <div className="section-heading"><div><span>{eyebrow}</span><h2>{heading}</h2><p>{copy}</p></div>{action&&<button className="primary" onClick={action}><Plus size={16}/>{actionLabel}</button>}</div>;
}

function SchedulePage({ data, onStatus, onCreate, onDetails }) {
  const [filter,setFilter]=useState('all');
  const flights=data.flights.filter(f=>filter==='all'||f.status===filter).sort((a,b)=>new Date(a.scheduled_departure)-new Date(b.scheduled_departure));
  return <main className="content inner-page"><PageHeading eyebrow="Flight operations" title="Flight schedule" copy="Monitor departures, arrivals, aircraft, and crew assignments." action={onCreate} actionLabel="Add flight"/><div className="filter-bar"><div>{['all','scheduled','departed','completed'].map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{title(x)}{x!=='all'&&<span>{data.flights.filter(f=>f.status===x).length}</span>}</button>)}</div><button><CalendarDays size={16}/> This week <ChevronDown size={14}/></button></div><section className="panel table-panel"><div className="table-head"><span>Departure</span><span>Flight & route</span><span>Aircraft</span><span>Crew</span><span>Status</span><span></span></div>{flights.length?flights.map(f=><FlightRow key={f.id} flight={f} data={data} onStatus={onStatus} onDetails={onDetails} showAircraft/>):<Empty title="No matching flights" copy="Try another filter or add a new flight leg."/>}</section></main>;
}

function TripsPage({ data, onApprove, onReject, onCreate, onDetails, onEdit, onAddLeg }) {
  const [filter,setFilter]=useState('all'); const trips=data.trips.filter(t=>filter==='all'||t.status===filter);
  return <main className="content inner-page"><PageHeading eyebrow="Customer travel" title="Trip requests" copy="Review requested travel and coordinate approved trips." action={onCreate} actionLabel="New request"/><div className="filter-bar"><div>{['all','requested','approved','rejected','cancelled'].map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{title(x)}<span>{data.trips.filter(t=>x==='all'||t.status===x).length}</span></button>)}</div></div><div className="trip-grid">{trips.map(t=><article className="trip-card" key={t.id}><div className="trip-card-top"><div className="trip-statuses"><Badge status={t.status}/>{t.sub_status&&<Badge status={t.sub_status}/>}</div><div className="trip-card-tools">{!['rejected','cancelled'].includes(t.status)&&<button aria-label={`Edit ${t.customer_name} trip`} onClick={()=>onEdit(t)}><Pencil size={16}/></button>}<button aria-label={`View ${t.customer_name} trip details`} onClick={()=>onDetails(t)}><Eye size={17}/></button></div></div><div className="big-route"><div><strong>{t.origin}</strong><small>{timeFmt(t.departure_at)}</small></div><span><i/><Plane size={18}/><i/></span><div><strong>{t.destination}</strong><small>{dateFmt(t.departure_at)}</small></div></div><h3>{t.customer_name}</h3><p>{t.purpose || 'Private charter'}</p><div className="trip-meta"><span><Users size={15}/>{t.passengers} passengers</span><span><CalendarDays size={15}/>{dateFmt(t.return_at) || 'One way'}</span></div>{t.status==='requested'?<div className="request-actions"><button onClick={()=>onReject(t)}>Decline</button><button className="dark" onClick={()=>onApprove(t)}>Review <ArrowRight size={15}/></button></div>:<div className="assignment"><span><Plane size={15}/>{data.aircraft.find(a=>a.id===t.aircraft_id)?.tail_number || 'No aircraft assigned'}</span><span><Users size={15}/>{t.pilot_ids?.length || 0} pilots</span><span><PlaneTakeoff size={15}/>{data.flights.filter(f=>f.trip_id===t.id&&f.status!=='cancelled').length} legs</span></div>}{t.status==='approved'&&<button className="add-leg-button" onClick={()=>onAddLeg(t)}><Plus size={14}/> Add flight leg</button>}<button className="trip-details-link" onClick={()=>onDetails(t)}>View trip details <ChevronRight size={14}/></button></article>)}</div>{!trips.length&&<Empty title="No trip requests here" copy="New customer requests will be collected in this workspace." action={onCreate} actionLabel="New request"/>}</main>;
}

const TIMELINE_STAGES = [
  { id:'requested', label:'Requested', copy:'Awaiting review' },
  { id:'approved', label:'Approved', copy:'Scheduling' },
  { id:'trip_pending', label:'Trip pending', copy:'Action required' },
  { id:'in_progress', label:'In progress', copy:'Active flight' },
  { id:'complete', label:'Complete', copy:'Trip closed' },
];

function getTripTimelineState(trip, flights) {
  const linked = flights.filter(f=>f.trip_id===trip.id&&f.status!=='cancelled');
  const raw = `${trip.sub_status||trip.workflow_status||trip.status||''}`.toLowerCase().replaceAll('-','_').replaceAll(' ','_');
  const flightPendingReschedule = linked.some(f=>`${f.sub_status||f.status||''}`.toLowerCase().replaceAll('-','_').includes('pending_resched'));
  const hasDeparted = linked.some(f=>['departed','in_progress'].includes(f.status)||f.actual_departure);

  if (['complete','completed'].includes(raw)||linked.length&&linked.every(f=>f.status==='completed')) return { stage:'complete', detail:'Completed', tone:'complete' };
  if (flightPendingReschedule||(raw.includes('pending_resched')&&(hasDeparted||raw.includes('flight')))) return { stage:'in_progress', detail:'Flight pending reschedule', tone:'attention' };
  if (hasDeparted) return { stage:'in_progress', detail:'Flight in progress', tone:'active' };
  if (raw.includes('pending_cancel')) return { stage:'trip_pending', detail:'Pending cancellation', tone:'attention' };
  if (raw.includes('pending_resched')) return { stage:'trip_pending', detail:'Pending reschedule', tone:'attention' };
  if (raw==='needs_rescheduling') return { stage:'trip_pending', detail:'Needs rescheduling', tone:'attention' };
  if (['cancelled','canceled'].includes(raw)) return { stage:'trip_pending', detail:'Cancelled', tone:'muted' };
  if (linked.some(f=>f.status==='scheduled')) return { stage:'approved', detail:'Scheduled', tone:'scheduled' };
  if (raw==='approved') return { stage:'approved', detail:'Pending scheduling', tone:'pending' };
  if (raw==='rejected') return { stage:'requested', detail:'Declined', tone:'muted' };
  return { stage:'requested', detail:'Awaiting approval', tone:'pending' };
}

function TripTimelinePage({ data, onDetails }) {
  const [filter,setFilter]=useState('all');
  const rows=data.trips.map(trip=>({...trip,timeline:getTripTimelineState(trip,data.flights)})).sort((a,b)=>new Date(a.departure_at)-new Date(b.departure_at));
  const filtered=rows.filter(trip=>filter==='all'||(filter==='attention'?trip.timeline.tone==='attention':trip.timeline.stage===filter));
  const stageCount=stage=>rows.filter(trip=>trip.timeline.stage===stage).length;
  return <main className="content inner-page timeline-page">
    <PageHeading eyebrow="Trip operations" title="Trip timeline" copy="Follow every trip from request through completion, ordered by departure date."/>
    <section className="timeline-summary">
      <div><span>All trips</span><strong>{rows.length}</strong><small>Sorted chronologically</small></div>
      <div><span>Needs attention</span><strong>{rows.filter(t=>t.timeline.tone==='attention').length}</strong><small>Reschedule or cancellation</small></div>
      <div><span>In progress</span><strong>{stageCount('in_progress')}</strong><small>Active trip legs</small></div>
      <div><span>Completed</span><strong>{stageCount('complete')}</strong><small>Closed trips</small></div>
    </section>
    <div className="filter-bar timeline-filters"><div>{[['all','All trips'],['attention','Needs attention'],['in_progress','In progress'],['complete','Complete']].map(([id,label])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}<span>{id==='all'?rows.length:id==='attention'?rows.filter(t=>t.timeline.tone==='attention').length:stageCount(id)}</span></button>)}</div><span><CalendarDays size={14}/> Sorted by trip date</span></div>
    <section className="panel timeline-panel">
      <div className="timeline-scroll">
        <div className="timeline-header"><div className="timeline-trip-heading"><span>Trip</span><small>Departure date</small></div>{TIMELINE_STAGES.map((stage,index)=><div key={stage.id} className="timeline-stage-heading"><i>{index+1}</i><span>{stage.label}<small>{stage.copy}</small></span></div>)}</div>
        {filtered.map(trip=>{const activeIndex=TIMELINE_STAGES.findIndex(stage=>stage.id===trip.timeline.stage);const linked=data.flights.filter(f=>f.trip_id===trip.id&&f.status!=='cancelled');return <div className="timeline-row" key={trip.id}>
          <button className="timeline-trip" onClick={()=>onDetails(trip)}><div className="timeline-date"><strong>{dateFmt(trip.departure_at,{day:'2-digit'})}</strong><span>{new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric'}).format(new Date(trip.departure_at))}</span></div><div><b>{trip.customer_name}</b><span className="timeline-route"><code>{trip.origin}</code><ArrowRight size={12}/><code>{trip.destination}</code></span><small>{timeFmt(trip.departure_at)} · {trip.passengers} pax</small></div><ChevronRight className="timeline-open" size={15}/></button>
          {TIMELINE_STAGES.map((stage,index)=><div key={stage.id} className={`timeline-cell ${index<activeIndex?'passed':''} ${index===activeIndex?'current':''}`}><div className="timeline-stage-row"><span className="timeline-track"><i>{index<activeIndex?<Check size={11}/>:null}</i></span></div><div className="timeline-substatus-row">{index===activeIndex&&<div className={`timeline-status ${trip.timeline.tone}`}><span>{trip.timeline.detail}</span>{linked.length>0&&<small>{linked.length} flight {linked.length===1?'leg':'legs'}</small>}</div>}</div></div>)}
        </div>})}
        {!filtered.length&&<Empty icon={ChartNoAxesGantt} title="No trips in this view" copy="Choose another filter to see the rest of the trip timeline."/>}
      </div>
    </section>
  </main>;
}

function UnscheduledPage({ data, onSchedule }) {
  const trips=data.trips.filter(t=>t.status==='approved'&&!data.flights.some(f=>f.trip_id===t.id&&f.status!=='cancelled')).sort((a,b)=>new Date(a.departure_at)-new Date(b.departure_at));
  return <main className="content inner-page"><PageHeading eyebrow="Dispatch queue" title="Approved trips to schedule" copy="Build flight legs for approved travel that has not reached the operations schedule."/><div className="queue-summary"><div><span><Clock3 size={18}/></span><p>Awaiting scheduling<strong>{trips.length}</strong></p></div><div><span><CalendarDays size={18}/></span><p>Next requested departure<strong>{trips.length?dateFmt(trips[0].departure_at,{weekday:'short'}):'All clear'}</strong></p></div><div><span><Users size={18}/></span><p>Travelers waiting<strong>{trips.reduce((sum,t)=>sum+t.passengers,0)}</strong></p></div></div>{trips.length?<section className="panel unscheduled-table"><div className="unscheduled-head"><span>Customer</span><span>Route</span><span>Requested departure</span><span>Passengers</span><span>Aircraft & crew</span><span></span></div>{trips.map(trip=>{const aircraft=data.aircraft.find(a=>a.id===trip.aircraft_id);const pilots=data.pilots.filter(p=>trip.pilot_ids?.includes(p.id));return <div className="unscheduled-row" key={trip.id}><div className="unscheduled-customer"><span className="customer-avatar">{trip.customer_name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><span><b>{trip.customer_name}</b><small>{trip.purpose||'Private charter'}</small></span></div><div className="compact-route"><b>{trip.origin}</b><ArrowRight size={13}/><b>{trip.destination}</b></div><div className="date-cell"><b>{dateFmt(trip.departure_at,{weekday:'short',year:'numeric'})}</b><small>{timeFmt(trip.departure_at)}</small></div><span className="passenger-cell"><Users size={14}/>{trip.passengers}</span><div className="assigned-cell"><span><Plane size={14}/>{aircraft?`${aircraft.tail_number} · ${aircraft.model}`:'Aircraft not assigned'}</span><span><Users size={14}/>{pilots.length?pilots.map(p=>`${p.first_name} ${p.last_name}`).join(', '):'Crew not assigned'}</span></div><button className="schedule-button" disabled={!trip.aircraft_id||!trip.pilot_ids?.length} onClick={()=>onSchedule(trip)}>Schedule leg <ArrowRight size={14}/></button></div>})}</section>:<section className="panel"><Empty icon={Check} title="Every approved trip is scheduled" copy="Newly approved trips will appear here until their first flight leg is created."/></section>}</main>;
}

function FleetCard({ aircraft, onEdit }) {
  return <article className="aircraft-card">
    <div className="aircraft-visual"><span>{aircraft.year ? `${aircraft.make} · ${aircraft.year}` : aircraft.make}</span><Plane size={68}/><Badge status={aircraft.status}/></div>
    <div className="aircraft-copy">
      <div><h3>{aircraft.tail_number}</h3><p>{aircraft.make} {aircraft.model}</p></div>
      <button className="aircraft-edit" onClick={()=>onEdit(aircraft)} aria-label={`Edit ${aircraft.tail_number}`} title={`Edit ${aircraft.tail_number}`}><MoreHorizontal size={18}/></button>
      <dl>
        <div><dt>HOME BASE</dt><dd>{aircraft.home_airport}</dd></div>
        <div><dt>CAPACITY</dt><dd>{aircraft.passenger_capacity} pax</dd></div>
        <div><dt>TOTAL TIME</dt><dd>{aircraft.total_hours?.toLocaleString() ?? '—'} hrs</dd></div>
      </dl>
      <div className="aircraft-performance">
        <div><span><Gauge size={15}/></span><p>CRUISE SPEED<b>{aircraft.cruise_speed_kts ? `${aircraft.cruise_speed_kts.toLocaleString()} kt` : 'Not set'}</b></p></div>
        <div><span><Fuel size={15}/></span><p>FUEL BURN<b>{aircraft.fuel_burn_gph ? `${aircraft.fuel_burn_gph.toLocaleString()} gal/hr` : 'Not set'}</b></p></div>
      </div>
    </div>
  </article>;
}

function FleetPage({ data, onCreate, onEdit }) {
  return <main className="content inner-page"><PageHeading eyebrow="Fleet management" title="Aircraft" copy="Track aircraft readiness, performance, and home base." action={()=>onCreate('aircraft')} actionLabel="Add aircraft"/><div className="resource-grid">{data.aircraft.map(aircraft=><FleetCard aircraft={aircraft} onEdit={onEdit} key={aircraft.id}/>)}</div>{!data.aircraft.length&&<Empty title="No aircraft yet" copy="Add your first aircraft to begin assigning trips." action={()=>onCreate('aircraft')} actionLabel="Add aircraft"/>}</main>;
}

function PilotCard({ pilot, onEdit }) {
  const certifications=pilot.certifications || [];
  return <article className="pilot-card">
    <header><Avatar pilot={pilot}/><div><h3>{pilot.first_name} {pilot.last_name}</h3><a href={`mailto:${pilot.email}`}><Mail size={13}/>{pilot.email}</a></div><div className="pilot-card-actions"><Badge status={pilot.active?'active':'inactive'}/><button onClick={()=>onEdit(pilot)} aria-label={`Edit ${pilot.first_name} ${pilot.last_name}`} title={`Edit ${pilot.first_name} ${pilot.last_name}`}><MoreHorizontal size={18}/></button></div></header>
    <div className="pilot-card-certifications">{certifications.length?certifications.map(c=><span key={c}>{c}</span>):<span>Certifications pending</span>}</div>
    <dl><div><dt><ShieldCheck size={14}/> License</dt><dd>{pilot.license_number}</dd></div><div><dt><CalendarDays size={14}/> Medical expires</dt><dd>{dateFmt(pilot.medical_expires,{year:'numeric'})}</dd></div></dl>
    {pilot.phone&&<a className="pilot-card-phone" href={`tel:${pilot.phone}`}><Phone size={14}/>{pilot.phone}</a>}
  </article>;
}

function PilotsPage({ data, onCreate }) {
  const [pilots,setPilots]=useState(data.pilots);
  const [editing,setEditing]=useState(null);
  useEffect(()=>setPilots(data.pilots),[data.pilots]);
  const save=async(pilot,body)=>{try{const updated=await api.update('pilots',pilot.id,body);setPilots(current=>current.map(item=>item.id===pilot.id?updated:item));setEditing(null);}catch(error){if(error.status){window.alert(error.message);return;}setPilots(current=>current.map(item=>item.id===pilot.id?{...item,...body,updated_at:new Date().toISOString()}:item));setEditing(null);}};
  return <main className="content inner-page"><PageHeading eyebrow="Crew management" title="Pilot roster" copy="Manage certifications, medical status, and crew availability." action={()=>onCreate('pilot')} actionLabel="Add pilot"/><section className="pilot-grid">{pilots.map(p=><PilotCard pilot={p} onEdit={setEditing} key={p.id}/>)}</section>{!pilots.length&&<Empty icon={Users} title="No pilots yet" copy="Add pilots before approving a trip." action={()=>onCreate('pilot')} actionLabel="Add pilot"/>}{editing&&<EditPilotModal pilot={editing} onClose={()=>setEditing(null)} onSubmit={save}/>}</main>;
}

function FuelPage({ data, onCreate }) {
  const total=data.fuelLogs.reduce((s,l)=>s+(l.total_cost || l.gallons*l.price_per_gallon),0); const gallons=data.fuelLogs.reduce((s,l)=>s+l.gallons,0);
  return <main className="content inner-page"><PageHeading eyebrow="Cost tracking" title="Fuel log" copy="Review fuel purchases and operating spend across the fleet." action={()=>onCreate('fuel')} actionLabel="Log fuel"/><div className="fuel-summary"><div><span><Fuel/></span><p>Total fuel logged<strong>{gallons.toLocaleString()} <small>gal</small></strong></p></div><div><span><CircleDollarSign/></span><p>Total fuel spend<strong>{money(total)}</strong></p></div><div><span><Gauge/></span><p>Average price<strong>{gallons?money(total/gallons):'$0'} <small>/ gal</small></strong></p></div></div><section className="panel fuel-table"><div className="fuel-head"><span>Date</span><span>Aircraft</span><span>Airport / Vendor</span><span>Gallons</span><span>Unit price</span><span>Total</span></div>{data.fuelLogs.map(l=>{const a=data.aircraft.find(a=>a.id===l.aircraft_id);return <div key={l.id}><span>{dateFmt(l.fueled_at,{year:'numeric'})}<small>{timeFmt(l.fueled_at)}</small></span><b>{a?.tail_number||'—'}</b><span>{l.airport}<small>{l.vendor||'Unspecified vendor'}</small></span><span>{l.gallons.toLocaleString()}</span><span>${l.price_per_gallon.toFixed(2)}</span><b>{money(l.total_cost||l.gallons*l.price_per_gallon)}</b></div>})}</section>{!data.fuelLogs.length&&<Empty icon={Fuel} title="No fuel purchases logged" copy="Fuel entries will roll up into your operating dashboard." action={()=>onCreate('fuel')} actionLabel="Log fuel"/>}</main>;
}

const Input = ({label, ...props}) => <label className="field"><span>{label}</span><input {...props}/></label>;
const Select = ({label, children, ...props}) => <label className="field"><span>{label}</span><select {...props}>{children}</select></label>;

function AirportInput({ label, value, onChange, ...props }) {
  const listId = useId();
  const [matches, setMatches] = useState([]);
  const [airport, setAirport] = useState(null);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    setAirport(null);
    setLookupError("");
    if (value.trim().length < 2) {
      setMatches([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setMatches(await api.airports(value.trim()));
      } catch (error) {
        setMatches([]);
        setLookupError(error.message);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  const resolve = async () => {
    if (value.trim().length < 2) return;
    try {
      const result = await api.airport(value.trim());
      setAirport(result);
      setLookupError("");
    } catch (error) {
      setAirport(null);
      setLookupError(error.message);
    }
  };

  return (
    <label className={`field airport-field ${lookupError ? "invalid" : ""}`}>
      <span>{label}</span>
      <input
        {...props}
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        onBlur={resolve}
      />
      <datalist id={listId}>
        {matches.map((match) => (
          <option key={match.ident} value={match.ident}>
            {match.name} {match.municipality ? `- ${match.municipality}` : ""}
          </option>
        ))}
      </datalist>
      {airport && (
        <small className="airport-match">
          {airport.name}
          {airport.municipality ? `, ${airport.municipality}` : ""}
        </small>
      )}
      {lookupError && <small className="airport-error">{lookupError}</small>}
    </label>
  );
}

const localDateTime=value=>{if(!value)return '';const d=new Date(value);const offset=d.getTimezoneOffset();return new Date(d.getTime()-offset*60000).toISOString().slice(0,16)};

function ScheduleTripModal({ trip, data, onClose, onSubmit }) {
  const existingLegs = data.flights
    .filter((flight) => flight.trip_id === trip.id && flight.status !== "cancelled")
    .sort(
      (a, b) =>
        new Date(a.scheduled_departure) - new Date(b.scheduled_departure),
    );
  const previousLeg = existingLegs.at(-1);
  const departure = previousLeg
    ? new Date(new Date(previousLeg.scheduled_arrival).getTime() + 2 * 60 * 60 * 1000)
    : new Date(trip.departure_at);
  const arrival = new Date(departure.getTime() + 2 * 60 * 60 * 1000);
  const approvedPilots = data.pilots.filter((p) =>
    trip.pilot_ids?.includes(p.id),
  );
  const aircraft = data.aircraft.find((a) => a.id === trip.aircraft_id);
  const [form, setForm] = useState({
    flight_number: `PG ${String(data.flights.length + 101).padStart(3, "0")}`,
    trip_id: trip.id,
    aircraft_id: trip.aircraft_id || "",
    pilot_ids: [...(trip.pilot_ids || [])],
    origin: previousLeg?.destination || trip.origin,
    destination:
      previousLeg?.destination === trip.destination && trip.return_at
        ? trip.origin
        : trip.destination,
    scheduled_departure: localDateTime(departure),
    scheduled_arrival: localDateTime(arrival),
    passengers: trip.passengers,
  });
  const [formError, setFormError] = useState("");
  const [distance, setDistance] = useState(null);
  const estimates = calculateFlightEstimates(distance?.distance_nm, aircraft);
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const togglePilot = (id) =>
    set(
      "pilot_ids",
      form.pilot_ids.includes(id)
        ? form.pilot_ids.filter((p) => p !== id)
        : [...form.pilot_ids, id],
    );
  useEffect(() => {
    if (form.origin.length < 3 || form.destination.length < 3) {
      setDistance(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setDistance(await api.airportDistance(form.origin, form.destination));
      } catch {
        setDistance(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [form.origin, form.destination]);
  const submit = (e) => {
    e.preventDefault();
    if (
      new Date(form.scheduled_arrival) <= new Date(form.scheduled_departure)
    ) {
      setFormError("Arrival must be after departure.");
      return;
    }
    if (!form.pilot_ids.length) {
      setFormError("Select at least one approved pilot.");
      return;
    }
    setFormError("");
    onSubmit("flight", {
      ...form,
      ...(estimates || {}),
      scheduled_departure: new Date(form.scheduled_departure).toISOString(),
      scheduled_arrival: new Date(form.scheduled_arrival).toISOString(),
      passengers: Number(form.passengers),
    });
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal schedule-modal">
        <div className="modal-head">
          <div>
            <span>Schedule approved travel</span>
            <h2>
              {trip.origin} <ArrowRight size={18} /> {trip.destination}
            </h2>
          </div>
          <button onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="schedule-context">
          <div>
            <span>Customer</span>
            <b>{trip.customer_name}</b>
          </div>
          <div>
            <span>Approved aircraft</span>
            <b>
              {aircraft
                ? `${aircraft.tail_number} · ${aircraft.model}`
                : "Not assigned"}
            </b>
          </div>
          <div>
            <span>Travelers</span>
            <b>{trip.passengers} passengers</b>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <Input
              label="Flight number"
              required
              value={form.flight_number}
              onChange={(e) => set("flight_number", e.target.value)}
              placeholder="PG 201"
            />
            <Select
              label="Aircraft"
              required
              value={form.aircraft_id}
              onChange={(e) => set("aircraft_id", e.target.value)}
            >
              <option value="">Select aircraft</option>
              {data.aircraft
                .filter((a) => a.id === trip.aircraft_id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tail_number} · {a.model}
                  </option>
                ))}
            </Select>
            <AirportInput
              label="Origin"
              required
              minLength="3"
              maxLength="4"
              value={form.origin}
              onChange={(value) => set("origin", value)}
            />
            <AirportInput
              label="Destination"
              required
              minLength="3"
              maxLength="4"
              value={form.destination}
              onChange={(value) => set("destination", value)}
            />
            {distance && (
              <div className="flight-estimates full" aria-live="polite">
                <div><span>Distance</span><b>{Math.round(distance.distance_nm)} NM</b></div>
                <div><span>Est. in air</span><b>{durationFmt(estimates?.estimated_flight_time_minutes)}</b></div>
                <div><span>Est. leg</span><b>{durationFmt(estimates?.estimated_leg_time_minutes)}</b></div>
                <div><span>Est. fuel</span><b>{estimates ? `${Math.round(estimates.estimated_fuel_usage_gallons)} gal` : '—'}</b></div>
                {!estimates && <small>Add cruise speed and fuel burn to the assigned aircraft to calculate time and fuel.</small>}
              </div>
            )}
            <Input
              label="Scheduled departure"
              required
              type="datetime-local"
              value={form.scheduled_departure}
              onChange={(e) => set("scheduled_departure", e.target.value)}
            />
            <Input
              label="Scheduled arrival"
              required
              type="datetime-local"
              value={form.scheduled_arrival}
              onChange={(e) => set("scheduled_arrival", e.target.value)}
            />
            <Input
              label="Passengers"
              required
              type="number"
              min="0"
              max={aircraft?.passenger_capacity || 1000}
              value={form.passengers}
              onChange={(e) => set("passengers", e.target.value)}
            />
            <label className="field">
              <span>Trip ID</span>
              <input value={form.trip_id} disabled />
              <small>This leg will be linked to the approved trip.</small>
            </label>
            <fieldset className="pilot-picker field full">
              <legend>Assigned pilots</legend>
              {approvedPilots.map((p) => (
                <label
                  key={p.id}
                  className={form.pilot_ids.includes(p.id) ? "selected" : ""}
                >
                  <input
                    type="checkbox"
                    checked={form.pilot_ids.includes(p.id)}
                    onChange={() => togglePilot(p.id)}
                  />
                  <Avatar pilot={p} small />
                  <span>
                    <b>
                      {p.first_name} {p.last_name}
                    </b>
                    <small>{p.certifications?.[0] || p.license_number}</small>
                  </span>
                  <Check size={15} />
                </label>
              ))}
            </fieldset>
            {formError && <p className="form-error">{formError}</p>}
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary"
              type="submit"
              disabled={!form.aircraft_id || !approvedPilots.length}
            >
              Create flight leg <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateModal({ type='trip', data, onClose, onSubmit }) {
  const defaults={trip:{customer_name:'',customer_email:'',origin:'',destination:'',departure_at:'',return_at:'',passengers:1,purpose:''},aircraft:{tail_number:'',make:'',model:'',year:'',passenger_capacity:8,home_airport:'',status:'available',total_hours:0,cruise_speed_kts:'',fuel_burn_gph:''},pilot:{first_name:'',last_name:'',email:'',phone:'',license_number:'',certifications:'',medical_expires:'',active:true},fuel:{aircraft_id:'',flight_id:'',airport:'',fueled_at:'',gallons:'',price_per_gallon:'',vendor:''},flight:{flight_number:'',trip_id:'',aircraft_id:'',pilot_ids:'',origin:'',destination:'',scheduled_departure:'',scheduled_arrival:'',passengers:0}};
  const [form,setForm]=useState(defaults[type]||defaults.trip); const set=(key,val)=>setForm(f=>({...f,[key]:val}));
  const submit=e=>{e.preventDefault(); const body={...form}; ['departure_at','return_at','fueled_at','scheduled_departure','scheduled_arrival'].forEach(k=>{if(body[k])body[k]=new Date(body[k]).toISOString();else delete body[k]}); ['year','passenger_capacity','total_hours','passengers','gallons','price_per_gallon','cruise_speed_kts','fuel_burn_gph'].forEach(k=>{if(body[k]!==undefined&&body[k]!=='')body[k]=Number(body[k]);else delete body[k]}); if(type==='pilot')body.certifications=form.certifications.split(',').map(x=>x.trim()).filter(Boolean); if(type==='flight')body.pilot_ids=[form.pilot_ids]; ['customer_email','flight_id','trip_id','phone','vendor','medical_expires'].forEach(k=>{if(body[k]==='')delete body[k]}); onSubmit(type,body);};
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><div><span>{type==='trip'?'Customer travel':type==='fuel'?'Expense tracking':'Operations'}</span><h2>{type==='trip'?'New trip request':type==='fuel'?'Log fuel purchase':`Add ${type}`}</h2></div><button onClick={onClose}><X size={19}/></button></div><form onSubmit={submit}><div className="form-grid">
    {type==='trip'&&<><Input label="Customer name" required value={form.customer_name} onChange={e=>set('customer_name',e.target.value)} placeholder="Full name or organization"/><Input label="Customer email" type="email" value={form.customer_email} onChange={e=>set('customer_email',e.target.value)} placeholder="ops@company.com"/><AirportInput label="Origin" required minLength="3" maxLength="4" value={form.origin} onChange={value=>set('origin',value)} placeholder="KTEB"/><AirportInput label="Destination" required minLength="3" maxLength="4" value={form.destination} onChange={value=>set('destination',value)} placeholder="KPBI"/><Input label="Departure" required type="datetime-local" value={form.departure_at} onChange={e=>set('departure_at',e.target.value)}/><Input label="Return (optional)" type="datetime-local" value={form.return_at} onChange={e=>set('return_at',e.target.value)}/><Input label="Passengers" required type="number" min="1" value={form.passengers} onChange={e=>set('passengers',e.target.value)}/><Input label="Purpose" value={form.purpose} onChange={e=>set('purpose',e.target.value)} placeholder="Executive travel"/></>}
    {type==='aircraft'&&<><Input label="Tail number" required value={form.tail_number} onChange={e=>set('tail_number',e.target.value.toUpperCase())} placeholder="N712PG"/><Input label="Manufacturer" required value={form.make} onChange={e=>set('make',e.target.value)} placeholder="Cessna"/><Input label="Model" required value={form.model} onChange={e=>set('model',e.target.value)} placeholder="Citation Latitude"/><Input label="Year" type="number" min="1903" max="2100" value={form.year} onChange={e=>set('year',e.target.value)}/><Input label="Passenger capacity" required type="number" min="1" value={form.passenger_capacity} onChange={e=>set('passenger_capacity',e.target.value)}/><Input label="Cruise speed (kt)" required type="number" min="1" step="0.1" value={form.cruise_speed_kts} onChange={e=>set('cruise_speed_kts',e.target.value)}/><Input label="Fuel burn (gal/hr)" required type="number" min="0.1" step="0.1" value={form.fuel_burn_gph} onChange={e=>set('fuel_burn_gph',e.target.value)}/><AirportInput label="Home airport" required minLength="3" maxLength="4" value={form.home_airport} onChange={value=>set('home_airport',value)} placeholder="KTEB"/></>}
    {type==='pilot'&&<><Input label="First name" required value={form.first_name} onChange={e=>set('first_name',e.target.value)}/><Input label="Last name" required value={form.last_name} onChange={e=>set('last_name',e.target.value)}/><Input label="Email" required type="email" value={form.email} onChange={e=>set('email',e.target.value)}/><Input label="Phone" value={form.phone} onChange={e=>set('phone',e.target.value)}/><Input label="License number" required value={form.license_number} onChange={e=>set('license_number',e.target.value)}/><Input label="Medical expires" type="date" value={form.medical_expires} onChange={e=>set('medical_expires',e.target.value)}/><label className="field full"><span>Certifications</span><input value={form.certifications} onChange={e=>set('certifications',e.target.value)} placeholder="ATP, Citation Latitude"/><small>Separate multiple certifications with commas.</small></label></>}
    {type==='fuel'&&<><Select label="Aircraft" required value={form.aircraft_id} onChange={e=>set('aircraft_id',e.target.value)}><option value="">Select aircraft</option>{data.aircraft.map(a=><option key={a.id} value={a.id}>{a.tail_number} · {a.model}</option>)}</Select><Select label="Flight (optional)" value={form.flight_id} onChange={e=>set('flight_id',e.target.value)}><option value="">No linked flight</option>{data.flights.map(f=><option key={f.id} value={f.id}>{f.flight_number}</option>)}</Select><Input label="Airport" required minLength="3" maxLength="4" value={form.airport} onChange={e=>set('airport',e.target.value.toUpperCase())}/><Input label="Fueled at" required type="datetime-local" value={form.fueled_at} onChange={e=>set('fueled_at',e.target.value)}/><Input label="Gallons" required type="number" min="0.01" step="0.01" value={form.gallons} onChange={e=>set('gallons',e.target.value)}/><Input label="Price per gallon" required type="number" min="0" step="0.01" value={form.price_per_gallon} onChange={e=>set('price_per_gallon',e.target.value)}/><Input label="Vendor" value={form.vendor} onChange={e=>set('vendor',e.target.value)}/></>}
  </div><div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{type==='trip'?'Create request':type==='fuel'?'Save fuel log':`Add ${type}`}<ArrowRight size={16}/></button></div></form></div></div>;
}

function EditAircraftModal({ aircraft, onClose, onSubmit }) {
  const [form,setForm]=useState({
    tail_number:aircraft.tail_number,
    make:aircraft.make,
    model:aircraft.model,
    year:aircraft.year ?? '',
    passenger_capacity:aircraft.passenger_capacity,
    home_airport:aircraft.home_airport || '',
    status:aircraft.status,
    total_hours:aircraft.total_hours ?? 0,
    cruise_speed_kts:aircraft.cruise_speed_kts ?? '',
    fuel_burn_gph:aircraft.fuel_burn_gph ?? '',
  });
  const set=(key,value)=>setForm(current=>({...current,[key]:value}));
  const submit=event=>{
    event.preventDefault();
    onSubmit(aircraft,{
      ...form,
      year:form.year === '' ? null : Number(form.year),
      passenger_capacity:Number(form.passenger_capacity),
      total_hours:Number(form.total_hours),
      cruise_speed_kts:form.cruise_speed_kts === '' ? null : Number(form.cruise_speed_kts),
      fuel_burn_gph:form.fuel_burn_gph === '' ? null : Number(form.fuel_burn_gph),
    });
  };
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><div><span>Fleet card</span><h2>Edit {aircraft.tail_number}</h2></div><button onClick={onClose} aria-label="Close aircraft editor"><X size={19}/></button></div><form onSubmit={submit}><div className="form-grid">
    <Input label="Tail number" required value={form.tail_number} onChange={event=>set('tail_number',event.target.value.toUpperCase())}/><Input label="Manufacturer" required value={form.make} onChange={event=>set('make',event.target.value)}/><Input label="Model" required value={form.model} onChange={event=>set('model',event.target.value)}/><Input label="Year" type="number" min="1903" max="2100" value={form.year} onChange={event=>set('year',event.target.value)}/><Input label="Passenger capacity" required type="number" min="1" value={form.passenger_capacity} onChange={event=>set('passenger_capacity',event.target.value)}/><AirportInput label="Home airport" required minLength="3" maxLength="4" value={form.home_airport} onChange={value=>set('home_airport',value)}/><Select label="Status" value={form.status} onChange={event=>set('status',event.target.value)}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="out_of_service">Out of service</option></Select><Input label="Total hours" required type="number" min="0" step="0.1" value={form.total_hours} onChange={event=>set('total_hours',event.target.value)}/><Input label="Cruise speed (kt)" type="number" min="1" step="0.1" value={form.cruise_speed_kts} onChange={event=>set('cruise_speed_kts',event.target.value)}/><Input label="Fuel burn (gal/hr)" type="number" min="0.1" step="0.1" value={form.fuel_burn_gph} onChange={event=>set('fuel_burn_gph',event.target.value)}/>
  </div><div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Save aircraft <ArrowRight size={16}/></button></div></form></div></div>;
}

function EditPilotModal({ pilot, onClose, onSubmit }) {
  const [form,setForm]=useState({first_name:pilot.first_name,last_name:pilot.last_name,email:pilot.email,phone:pilot.phone||'',license_number:pilot.license_number,certifications:(pilot.certifications||[]).join(', '),medical_expires:pilot.medical_expires||'',active:pilot.active});
  const set=(key,value)=>setForm(current=>({...current,[key]:value}));
  const submit=event=>{event.preventDefault();onSubmit(pilot,{...form,phone:form.phone||null,medical_expires:form.medical_expires||null,certifications:form.certifications.split(',').map(value=>value.trim()).filter(Boolean)});};
  return <div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><div><span>Pilot card</span><h2>Edit {pilot.first_name} {pilot.last_name}</h2></div><button onClick={onClose} aria-label="Close pilot editor"><X size={19}/></button></div><form onSubmit={submit}><div className="form-grid">
    <Input label="First name" required value={form.first_name} onChange={event=>set('first_name',event.target.value)}/><Input label="Last name" required value={form.last_name} onChange={event=>set('last_name',event.target.value)}/><Input label="Email" required type="email" value={form.email} onChange={event=>set('email',event.target.value)}/><Input label="Phone" value={form.phone} onChange={event=>set('phone',event.target.value)}/><Input label="License number" required value={form.license_number} onChange={event=>set('license_number',event.target.value)}/><Input label="Medical expires" type="date" value={form.medical_expires} onChange={event=>set('medical_expires',event.target.value)}/><Select label="Status" value={form.active?'active':'inactive'} onChange={event=>set('active',event.target.value==='active')}><option value="active">Active</option><option value="inactive">Inactive</option></Select><label className="field full"><span>Certifications</span><input value={form.certifications} onChange={event=>set('certifications',event.target.value)} placeholder="ATP, Citation Latitude"/><small>Separate multiple certifications with commas.</small></label>
  </div><div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Save pilot <ArrowRight size={16}/></button></div></form></div></div>;
}

function EditTripModal({ trip, onClose, onSubmit }) {
  const requested = trip.status === "requested";
  const [form, setForm] = useState({
    customer_name: trip.customer_name,
    customer_email: trip.customer_email || "",
    customer_phone: trip.customer_phone || "",
    origin: trip.origin,
    destination: trip.destination,
    departure_at: localDateTime(trip.departure_at),
    return_at: localDateTime(trip.return_at),
    passengers: trip.passengers,
    purpose: trip.purpose || "",
    notes: trip.notes || "",
    sub_status: trip.sub_status || "",
  });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!requested) return onSubmit(trip, { sub_status: form.sub_status || null });
    const body = {
      ...form,
      passengers: Number(form.passengers),
      departure_at: new Date(form.departure_at).toISOString(),
      return_at: form.return_at ? new Date(form.return_at).toISOString() : null,
      sub_status: form.sub_status || null,
    };
    ["customer_email", "customer_phone", "purpose", "notes"].forEach((key) => {
      if (!body[key]) body[key] = null;
    });
    onSubmit(trip, body);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal edit-trip-modal">
        <div className="modal-head"><div><span>Trip card</span><h2>Edit {trip.customer_name}</h2></div><button onClick={onClose} aria-label="Close trip editor"><X size={19} /></button></div>
        <form onSubmit={submit}>
          {!requested && <p className="edit-trip-note">Approved itinerary changes use the reschedule workflow. Operational sub-status can be updated here.</p>}
          <div className="form-grid">
            {requested && <>
              <Input label="Customer name" required value={form.customer_name} onChange={(event) => set("customer_name", event.target.value)} />
              <Input label="Customer email" type="email" value={form.customer_email} onChange={(event) => set("customer_email", event.target.value)} />
              <Input label="Customer phone" value={form.customer_phone} onChange={(event) => set("customer_phone", event.target.value)} />
              <Input label="Passengers" required type="number" min="1" value={form.passengers} onChange={(event) => set("passengers", event.target.value)} />
              <AirportInput label="Origin" required minLength="3" maxLength="4" value={form.origin} onChange={(value) => set("origin", value)} />
              <AirportInput label="Destination" required minLength="3" maxLength="4" value={form.destination} onChange={(value) => set("destination", value)} />
              <Input label="Departure" required type="datetime-local" value={form.departure_at} onChange={(event) => set("departure_at", event.target.value)} />
              <Input label="Return (optional)" type="datetime-local" value={form.return_at} onChange={(event) => set("return_at", event.target.value)} />
              <Input label="Purpose" value={form.purpose} onChange={(event) => set("purpose", event.target.value)} />
              <Input label="Notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} />
            </>}
            <Select label="Operational sub-status" value={form.sub_status} onChange={(event) => set("sub_status", event.target.value)}>
              <option value="">No sub-status</option>
              <option value="needs_rescheduling">Needs rescheduling</option>
              <option value="pending_cancellation">Pending cancellation</option>
            </Select>
          </div>
          <div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Save trip <ArrowRight size={16} /></button></div>
        </form>
      </div>
    </div>
  );
}

function ApproveModal({ trip, data, onClose, onSubmit }) {
  const available=data.aircraft.filter(a=>a.status==='available'&&a.passenger_capacity>=trip.passengers);
  const eligible=data.pilots.filter(p=>p.active&&(!p.medical_expires||new Date(`${p.medical_expires}T23:59:59`)>=new Date(trip.departure_at)));
  const [aircraft,setAircraft]=useState(available[0]?.id||''); const [pilots,setPilots]=useState(eligible[0]?[eligible[0].id]:[]); const [approvedBy,setApprovedBy]=useState('Operations');
  const toggle=id=>setPilots(x=>x.includes(id)?x.filter(p=>p!==id):[...x,id]);
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal approval-modal"><div className="modal-head"><div><span>Approve request</span><h2>{trip.origin} <ArrowRight size={18}/> {trip.destination}</h2></div><button onClick={onClose}><X size={19}/></button></div><div className="approval-summary"><div><span>Customer</span><b>{trip.customer_name}</b></div><div><span>Departure</span><b>{dateFmt(trip.departure_at,{weekday:'short'})}, {timeFmt(trip.departure_at)}</b></div><div><span>Travelers</span><b>{trip.passengers} passengers</b></div></div><div className="approval-section"><label>Assign aircraft</label>{available.length?<div className="choice-list">{available.map(a=><button key={a.id} className={aircraft===a.id?'selected':''} onClick={()=>setAircraft(a.id)}><span className="choice-icon"><Plane size={19}/></span><span><b>{a.tail_number}</b><small>{a.model} · {a.passenger_capacity} seats</small></span>{aircraft===a.id&&<Check size={17}/>}</button>)}</div>:<p className="approval-empty">No available aircraft can accommodate {trip.passengers} passengers.</p>}</div><div className="approval-section"><label>Assign crew</label>{eligible.length?<div className="choice-list crew-choices">{eligible.map(p=><button key={p.id} className={pilots.includes(p.id)?'selected':''} onClick={()=>toggle(p.id)}><Avatar pilot={p}/><span><b>{p.first_name} {p.last_name}</b><small>{p.certifications?.[0] || p.license_number}</small></span>{pilots.includes(p.id)&&<Check size={17}/>}</button>)}</div>:<p className="approval-empty">No active pilots have a valid medical certificate for this departure.</p>}</div><div className="approval-section"><label className="field"><span>Approved by</span><input required maxLength="120" value={approvedBy} onChange={e=>setApprovedBy(e.target.value)} placeholder="Approver name"/></label></div><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!aircraft||!pilots.length||!approvedBy.trim()} onClick={()=>onSubmit(trip,{aircraft_id:aircraft,pilot_ids:pilots,approved_by:approvedBy.trim()})}>Approve trip <Check size={16}/></button></div></div></div>;
}

function FlightDetailsModal({ flight, data, onClose, onWorkflow, onViewTrip, backTrip }) {
  const [workflow,setWorkflow]=useState(flight.sub_status||'');
  const aircraft=data.aircraft.find(item=>item.id===flight.aircraft_id);
  const trip=data.trips.find(item=>item.id===flight.trip_id);
  const assignments=data.pilotFlights.filter(item=>item.flight_id===flight.id);
  const pilots=data.pilots.filter(pilot=>flight.pilot_ids?.includes(pilot.id));
  const editable=flight.status==='scheduled';
  const submit=e=>{
    e.preventDefault();
    if(workflow==='cancellation_confirmed'&&!confirm(`Confirm cancellation of ${flight.flight_number}?`))return;
    onWorkflow(flight,workflow||null);
  };
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><article className="modal flight-detail-modal" role="dialog" aria-modal="true" aria-labelledby="flight-detail-title">
    <div className="trip-detail-head"><div><span>Flight card</span><h2 id="flight-detail-title">{flight.flight_number}</h2><p>{trip?.customer_name||'Independent flight operation'}</p></div><div><Badge status={flight.status}/>{flight.sub_status&&<Badge status={flight.sub_status}/>}<button aria-label="Close flight details" onClick={onClose}><X size={19}/></button></div></div>
    <div className="trip-detail-route flight-detail-route"><div><small>Departure</small><strong>{flight.origin}</strong><span>{dateTimeFmt(flight.scheduled_departure)}</span></div><div className="trip-detail-flightpath"><i/><span><Plane size={20}/></span><i/></div><div><small>Arrival</small><strong>{flight.destination}</strong><span>{dateTimeFmt(flight.scheduled_arrival)}</span></div></div>
    <div className="flight-detail-body">
      <section className="flight-detail-facts"><div><span>Aircraft</span><b>{aircraft?.tail_number||'Unassigned'}</b><small>{aircraft?.model||'Aircraft TBD'}</small></div><div><span>Passengers</span><b>{flight.passengers}</b><small>Travelers manifest</small></div><div><span>Estimated leg</span><b>{durationFmt(flight.estimated_leg_time_minutes)}</b><small>{flight.distance_nm?`${Math.round(flight.distance_nm)} NM`:'Distance unavailable'}</small></div><div><span>Fuel estimate</span><b>{flight.estimated_fuel_usage_gallons==null?'—':`${Math.round(flight.estimated_fuel_usage_gallons)} gal`}</b><small>Planning estimate</small></div></section>
      <section className="flight-detail-section"><div className="trip-detail-section-title"><span><Users size={15}/></span><div><h3>Pilot assignments</h3><p>Inherited PilotFlight workflow status</p></div></div><div className="flight-pilot-list">{pilots.map(pilot=>{const assignment=assignments.find(item=>item.pilot_id===pilot.id);return <div key={pilot.id}><Avatar pilot={pilot} small/><span><b>{pilot.first_name} {pilot.last_name}</b><small>{pilot.license_number}</small></span><Badge status={assignment?.status||'assigned'}/></div>})}</div></section>
      <form className="flight-workflow" onSubmit={submit}><div><span>Workflow status</span><p>Changes cascade to every pilot assignment on this flight.</p></div><label><span>Flight workflow</span><select value={workflow} disabled={!editable} onChange={e=>setWorkflow(e.target.value)}><option value="">No active workflow</option><option value="pending_reschedule">Pending reschedule</option><option value="reschedule_confirmed">Reschedule confirmed</option><option value="pending_cancellation">Pending cancellation</option><option value="cancellation_confirmed">Cancellation confirmed</option></select></label><button className="primary" disabled={!editable||workflow===(flight.sub_status||'')} type="submit">Save status</button></form>
      {(trip||backTrip)&&<button className="flight-view-trip" onClick={()=>onViewTrip(backTrip||trip)}><span><b>{backTrip?'Back to trip card':'View parent trip'}</b><small>{(backTrip||trip).customer_name}</small></span><ArrowRight size={16}/></button>}
    </div>
  </article></div>;
}

function TripDetailsModal({ trip, data, onClose, onEdit, onFlightDetails }) {
  const aircraft=data.aircraft.find(a=>a.id===trip.aircraft_id);
  const pilots=data.pilots.filter(p=>trip.pilot_ids?.includes(p.id));
  const flights=data.flights.filter(f=>f.trip_id===trip.id).sort((a,b)=>new Date(a.scheduled_departure)-new Date(b.scheduled_departure));
  const workflow=getTripTimelineState(trip,data.flights);
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><article className="modal trip-detail-modal" role="dialog" aria-modal="true" aria-labelledby="trip-detail-title">
    <div className="trip-detail-head"><div><span>Trip card</span><h2 id="trip-detail-title">{trip.customer_name}</h2><p>{trip.purpose||'Private charter'}</p></div><div><Badge status={trip.status}/>{!['rejected','cancelled'].includes(trip.status)&&<button aria-label={`Edit ${trip.customer_name} trip`} onClick={()=>onEdit(trip)}><Pencil size={17}/></button>}<button aria-label="Close trip details" onClick={onClose}><X size={19}/></button></div></div>
    <div className="trip-detail-route"><div><small>Origin</small><strong>{trip.origin}</strong><span>{dateTimeFmt(trip.departure_at)}</span></div><div className="trip-detail-flightpath"><i/><span><Plane size={20}/></span><i/></div><div><small>Destination</small><strong>{trip.destination}</strong><span>{trip.return_at?`Return ${dateTimeFmt(trip.return_at)}`:'One way'}</span></div></div>
    <div className="trip-detail-stage"><span>Current stage</span><b>{title(workflow.stage)}</b><i/><span>Sub-status</span><b>{workflow.detail}</b></div>
    <div className="trip-detail-body">
      <section className="trip-detail-section"><div className="trip-detail-section-title"><span><Users size={15}/></span><div><h3>Customer & travel</h3><p>Contact and request information</p></div></div><dl className="trip-detail-grid"><div><dt>Customer</dt><dd>{trip.customer_name}</dd></div><div><dt>Passengers</dt><dd>{trip.passengers}</dd></div><div><dt>Email</dt><dd>{trip.customer_email?<a href={`mailto:${trip.customer_email}`}><Mail size={13}/>{trip.customer_email}</a>:'Not provided'}</dd></div><div><dt>Phone</dt><dd>{trip.customer_phone?<a href={`tel:${trip.customer_phone}`}><Phone size={13}/>{trip.customer_phone}</a>:'Not provided'}</dd></div><div><dt>Purpose</dt><dd>{trip.purpose||'Not provided'}</dd></div><div><dt>Requested</dt><dd>{dateTimeFmt(trip.created_at)}</dd></div></dl></section>
      <section className="trip-detail-section"><div className="trip-detail-section-title"><span><Plane size={15}/></span><div><h3>Aircraft & crew</h3><p>Approved operational assignment</p></div></div><div className="trip-detail-assignment"><div className="trip-detail-aircraft"><span><Plane size={21}/></span><div><small>Aircraft</small><b>{aircraft?aircraft.tail_number:'Not assigned'}</b><p>{aircraft?`${aircraft.make} ${aircraft.model} · ${aircraft.passenger_capacity} seats`:'Aircraft will appear after approval.'}</p></div></div><div className="trip-detail-crew"><small>Crew</small>{pilots.length?pilots.map(p=><div key={p.id}><Avatar pilot={p} small/><span><b>{p.first_name} {p.last_name}</b><small>{p.certifications?.[0]||p.license_number}</small></span></div>):<p>No crew assigned</p>}</div></div></section>
      <section className="trip-detail-section full"><div className="trip-detail-section-title"><span><CalendarDays size={15}/></span><div><h3>Flight legs</h3><p>{flights.length?`${flights.length} linked ${flights.length===1?'leg':'legs'}`:'No flight legs scheduled'}</p></div></div>{flights.length?<div className="trip-detail-legs">{flights.map((flight,index)=>{const legAircraft=data.aircraft.find(a=>a.id===flight.aircraft_id);return <button type="button" key={flight.id} onClick={()=>onFlightDetails(flight,trip)} aria-label={`View ${flight.flight_number} flight card`}><em>{index+1}</em><span><b>{flight.origin} <ArrowRight size={13}/> {flight.destination}</b><small>{flight.flight_number} · {legAircraft?.tail_number||'No aircraft'}</small>{flight.distance_nm&&<small className="leg-estimate-summary">{Math.round(flight.distance_nm)} NM · {durationFmt(flight.estimated_flight_time_minutes)} in air · {durationFmt(flight.estimated_leg_time_minutes)} leg · {flight.estimated_fuel_usage_gallons == null?'—':`${Math.round(flight.estimated_fuel_usage_gallons)} gal fuel`}</small>}</span><span><b>{dateTimeFmt(flight.scheduled_departure)}</b><small>Arrives {dateTimeFmt(flight.scheduled_arrival)}</small></span><Badge status={flight.status}/><ChevronRight size={15}/></button>})}</div>:<div className="trip-detail-empty">This trip has not been added to the flight schedule.</div>}</section>
      {(trip.notes||trip.rejected_reason)&&<section className="trip-detail-section full"><div className="trip-detail-section-title"><span><MoreHorizontal size={15}/></span><div><h3>Operations notes</h3><p>Special handling and workflow context</p></div></div><div className="trip-detail-notes">{trip.notes&&<p>{trip.notes}</p>}{trip.rejected_reason&&<p><b>Decline reason:</b> {trip.rejected_reason}</p>}</div></section>}
      <section className="trip-detail-audit full"><div><span>Trip ID</span><code>{trip.id}</code></div><div><span>Approved by</span><b>{trip.approved_by||'Not approved'}</b><small>{trip.approved_at?dateTimeFmt(trip.approved_at):'—'}</small></div><div><span>Last updated</span><b>{dateTimeFmt(trip.updated_at)}</b></div></section>
    </div>
  </article></div>;
}

export default function App() {
  const [view,setView]=useState('dashboard'); const [data,setData]=useState(initialData); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [demo,setDemo]=useState(false); const [modal,setModal]=useState(null); const [toast,setToast]=useState(null); const [query,setQuery]=useState(''); const [sidebarOpen,setSidebarOpen]=useState(false);
  const load=async(show=true)=>{if(show)setLoading(true);try{const [dashboard,pilots,aircraft,trips,flights,pilotFlights,fuelLogs]=await Promise.all([api.dashboard(),api.pilots(),api.aircraft(),api.trips(),api.flights(),api.pilotFlights(),api.fuelLogs()]);setData({dashboard,pilots,aircraft,trips,flights,pilotFlights,fuelLogs});setError('');setDemo(false);}catch(e){setData(demoData);setDemo(true);setError(e.message);}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  useEffect(()=>{const handler=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();document.querySelector('.search input')?.focus()}if(e.key==='Escape')setModal(null)};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[]);
  const displayed=useMemo(()=>{if(!query.trim())return data;const q=query.toLowerCase();return {...data,trips:data.trips.filter(t=>`${t.customer_name} ${t.origin} ${t.destination}`.toLowerCase().includes(q)),flights:data.flights.filter(f=>`${f.flight_number} ${f.origin} ${f.destination}`.toLowerCase().includes(q)),aircraft:data.aircraft.filter(a=>`${a.tail_number} ${a.model}`.toLowerCase().includes(q)),pilots:data.pilots.filter(p=>`${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(q))}},[data,query]);
  const notify=(message,type='success')=>setToast({message,type});
  const create=async(type,body)=>{if(demo){if(type==='flight'){setData(current=>{const id=`demo-flight-${Date.now()}`;const trip=current.trips.find(item=>item.id===body.trip_id);const subStatus=trip?.sub_status||null;const flight={...body,id,status:'scheduled',sub_status:subStatus};const assignmentStatus=subStatus==='needs_rescheduling'?'pending_reschedule':subStatus||'assigned';const pilotFlights=body.pilot_ids.map(pilotId=>({id:`pf-${id}-${pilotId}`,flight_id:id,pilot_id:pilotId,status:assignmentStatus,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}));return {...current,flights:[...current.flights,flight],pilotFlights:[...current.pilotFlights,...pilotFlights]}});setModal(null);notify('Flight leg added to the demo trip.');return;}notify('Demo mode is read-only. Connect the API to save changes.','error');return;} const resources={trip:'trips',aircraft:'aircraft',pilot:'pilots',fuel:'fuel-logs',flight:'flights'};try{await api.create(resources[type],body);setModal(null);notify(`${title(type)} saved successfully.`);load(false);}catch(e){notify(e.message,'error')}};
  const approve=async(trip,payload)=>{if(demo){setData(d=>({...d,trips:d.trips.map(t=>t.id===trip.id?{...t,status:'approved',...payload}:t),dashboard:{...d.dashboard,requested_trips:d.dashboard.requested_trips-1,approved_trips:d.dashboard.approved_trips+1}}));setModal(null);notify('Trip approved and assigned.');return;}try{await api.approveTrip(trip.id,payload);setModal(null);notify('Trip approved and assigned.');load(false)}catch(e){notify(e.message,'error')}};
  const reject=async trip=>{if(!confirm(`Decline ${trip.customer_name}'s trip request?`))return;if(demo){setData(d=>({...d,trips:d.trips.map(t=>t.id===trip.id?{...t,status:'rejected'}:t)}));notify('Trip request declined.');return;}try{await api.rejectTrip(trip.id,'Declined by operations');notify('Trip request declined.');load(false)}catch(e){notify(e.message,'error')}};
  const status=async(flight,next)=>{if(demo){setData(d=>({...d,flights:d.flights.map(f=>f.id===flight.id?{...f,status:next}:f)}));notify(`Flight marked ${next}.`);return;}try{await api.flightStatus(flight.id,next);notify(`Flight marked ${next}.`);load(false)}catch(e){notify(e.message,'error')}};
  const updateTrip=async(trip,body)=>{if(demo){setData(current=>{const now=new Date().toISOString();const trips=current.trips.map(item=>item.id===trip.id?{...item,...body,updated_at:now}:item);if(!Object.hasOwn(body,'sub_status'))return {...current,trips};const linkedIds=new Set(current.flights.filter(item=>item.trip_id===trip.id&&item.status==='scheduled').map(item=>item.id));const flights=current.flights.map(item=>linkedIds.has(item.id)?{...item,sub_status:body.sub_status,updated_at:now}:item);const assignmentStatus=body.sub_status==='needs_rescheduling'?'pending_reschedule':body.sub_status||'assigned';const pilotFlights=current.pilotFlights.map(item=>linkedIds.has(item.flight_id)?{...item,status:assignmentStatus,updated_at:now}:item);return {...current,trips,flights,pilotFlights}});setModal(null);notify('Trip updated in the demo workspace.');return;}try{await api.update('trips',trip.id,body);setModal(null);notify('Trip updated.');load(false)}catch(e){notify(e.message,'error')}};
  const updateFlightWorkflow=async(flight,subStatus)=>{if(demo){setData(current=>{const now=new Date().toISOString();const cancelled=subStatus==='cancellation_confirmed';const flights=current.flights.map(item=>item.id===flight.id?{...item,status:cancelled?'cancelled':item.status,sub_status:subStatus,updated_at:now}:item);const assignmentStatus=cancelled?'cancellation_confirmed':subStatus==='needs_rescheduling'?'pending_reschedule':subStatus||'assigned';const pilotFlights=current.pilotFlights.map(item=>item.flight_id===flight.id?{...item,status:assignmentStatus,updated_at:now}:item);return {...current,flights,pilotFlights}});setModal(null);notify('Flight workflow updated in the demo workspace.');return;}try{await api.update('flights',flight.id,{sub_status:subStatus});setModal(null);notify('Flight workflow updated.');load(false)}catch(e){notify(e.message,'error')}};
  const updateAircraft=async(aircraft,body)=>{if(demo){setData(current=>({...current,aircraft:current.aircraft.map(item=>item.id===aircraft.id?{...item,...body,updated_at:new Date().toISOString()}:item)}));setModal(null);notify('Aircraft updated in the demo workspace.');return;}try{await api.update('aircraft',aircraft.id,body);setModal(null);notify('Aircraft updated.');load(false)}catch(e){notify(e.message,'error')}};
  const openCreate=(type='trip')=>setModal({type});
  const openDetails=trip=>setModal({type:'trip-details',trip});
  const openFlightDetails=(flight,backTrip=null)=>setModal({type:'flight-details',flight,backTrip});
  const setDemoMode=value=>{if(value){setData(demoData);setDemo(true)}else load()};
  return <div className="app-shell"><Sidebar current={view} setCurrent={setView} open={sidebarOpen} close={()=>setSidebarOpen(false)} data={data}/><div className="app-main"><Header current={view} query={query} setQuery={setQuery} onCreate={()=>openCreate("trip")} demo={demo} setDemo={setDemoMode} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}/>{loading?<div className="loader"><span/><p>Preparing your operation…</p></div>:<>{error&&demo&&<div className="connection-note"><Activity size={15}/> Live API unavailable — showing a fully interactive demo workspace.<button onClick={()=>load()}><RefreshCw size={14}/> Retry</button></div>}{view==="dashboard"&&<Overview data={displayed} setView={setView} onApprove={trip=>setModal({type:"approve",trip})} onReject={reject} onCreate={()=>openCreate("trip")} onStatus={status} onDetails={openDetails} onFlightDetails={openFlightDetails} useDemo={demo}/>} {view==="schedule"&&<SchedulePage data={displayed} onStatus={status} onCreate={()=>openCreate("trip")} onDetails={openFlightDetails}/>} {view==="timeline"&&<TripTimelinePage data={displayed} onDetails={openDetails}/>} {view==="unscheduled"&&<UnscheduledPage data={displayed} onSchedule={trip=>setModal({type:"schedule-trip",trip})}/>} {view==="trips"&&<TripsPage data={displayed} onApprove={trip=>setModal({type:"approve",trip})} onReject={reject} onCreate={()=>openCreate("trip")} onDetails={openDetails} onEdit={trip=>setModal({type:"edit-trip",trip})} onAddLeg={trip=>setModal({type:"schedule-trip",trip})}/>} {view==="fleet"&&<FleetPage data={displayed} onCreate={openCreate} onEdit={aircraft=>setModal({type:"edit-aircraft",aircraft})}/>} {view==="pilots"&&<PilotsPage data={displayed} onCreate={openCreate}/>} {view==="fuel"&&<FuelPage data={displayed} onCreate={openCreate}/>}</>}</div>{sidebarOpen&&<div className="sidebar-scrim" onClick={()=>setSidebarOpen(false)}/>} {modal?.type==="approve"?<ApproveModal trip={modal.trip} data={data} onClose={()=>setModal(null)} onSubmit={approve}/>:modal?.type==="schedule-trip"?<ScheduleTripModal trip={modal.trip} data={data} onClose={()=>setModal(null)} onSubmit={create}/>:modal?.type==="edit-trip"?<EditTripModal trip={modal.trip} onClose={()=>setModal(null)} onSubmit={updateTrip}/>:modal?.type==="edit-aircraft"?<EditAircraftModal aircraft={modal.aircraft} onClose={()=>setModal(null)} onSubmit={updateAircraft}/>:modal?.type==="flight-details"?<FlightDetailsModal flight={modal.flight} data={data} backTrip={modal.backTrip} onClose={()=>setModal(null)} onWorkflow={updateFlightWorkflow} onViewTrip={openDetails}/>:modal?.type==="trip-details"?<TripDetailsModal trip={modal.trip} data={data} onClose={()=>setModal(null)} onEdit={trip=>setModal({type:"edit-trip",trip})} onFlightDetails={openFlightDetails}/>:modal&&<CreateModal type={modal.type} data={data} onClose={()=>setModal(null)} onSubmit={create}/>}<Toast toast={toast} onClose={()=>setToast(null)}/></div>;
}
