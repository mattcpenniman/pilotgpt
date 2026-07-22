import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, Bell, CalendarDays, Check, ChevronDown,
  ChevronRight, CircleDollarSign, Clock3, Fuel, Gauge, LayoutDashboard, Menu,
  MoreHorizontal, Plane, PlaneLanding, PlaneTakeoff, Plus, RefreshCw, Search,
  Settings, ShieldCheck, Sparkles, Users, X, Wrench,
} from 'lucide-react';
import { api } from './api';
import { demoData } from './demoData';

const NAV = [
  { id:'dashboard', label:'Overview', icon:LayoutDashboard },
  { id:'schedule', label:'Flight schedule', icon:CalendarDays },
  { id:'trips', label:'Trip requests', icon:PlaneTakeoff },
  { id:'fleet', label:'Fleet', icon:Plane },
  { id:'pilots', label:'Pilots', icon:Users },
  { id:'fuel', label:'Fuel log', icon:Fuel },
];

const initialData = { dashboard:null, pilots:[], aircraft:[], trips:[], flights:[], fuelLogs:[] };
const title = (value='') => value.replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase());
const dateFmt = (value, options={}) => value ? new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', ...options }).format(new Date(value)) : '—';
const timeFmt = (value) => value ? new Intl.DateTimeFormat('en-US', { hour:'numeric', minute:'2-digit' }).format(new Date(value)) : '—';
const money = (value) => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(value || 0);
const initials = (first='', last='') => `${first[0] || ''}${last[0] || ''}`;

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

function Sidebar({ current, setCurrent, open, close }) {
  return <aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand"><span className="brand-mark"><Plane size={20}/></span><strong>Pilot<span>GPT</span></strong><button className="sidebar-close" onClick={close}><X size={18}/></button></div>
    <div className="workspace"><span>PA</span><div><b>Private Aviation</b><small>Flight operations</small></div><ChevronDown size={15}/></div>
    <nav>
      <p>Workspace</p>
      {NAV.map(({id,label,icon:Icon})=><button key={id} className={current===id?'active':''} onClick={()=>{setCurrent(id); close();}}><Icon size={18}/><span>{label}</span>{id==='trips' && <em>3</em>}</button>)}
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

function FlightRow({ flight, data, onStatus }) {
  const aircraft = data.aircraft.find(a=>a.id===flight.aircraft_id);
  const pilots = data.pilots.filter(p=>flight.pilot_ids?.includes(p.id));
  return <div className="flight-row">
    <div className="flight-time"><b>{timeFmt(flight.scheduled_departure)}</b><span>{dateFmt(flight.scheduled_departure)}</span></div>
    <div className={`route-icon ${flight.status}`}><PlaneTakeoff size={17}/></div>
    <div className="route"><div><b>{flight.origin}</b><span></span><Plane size={14}/><span></span><b>{flight.destination}</b></div><small>{flight.flight_number} · {aircraft?.model || 'Unassigned aircraft'}</small></div>
    <div className="crew"><div className="avatar-stack">{pilots.slice(0,2).map(p=><Avatar key={p.id} pilot={p} small/>)}</div><span>{pilots[0]?.last_name || 'Crew TBD'}{pilots.length>1?` +${pilots.length-1}`:''}</span></div>
    <Badge status={flight.status}/>
    {flight.status==='scheduled' && <button className="row-action" onClick={()=>onStatus(flight,'departed')}>Depart <ChevronRight size={14}/></button>}
    {flight.status==='departed' && <button className="row-action" onClick={()=>onStatus(flight,'completed')}>Complete <ChevronRight size={14}/></button>}
  </div>;
}

function TripCard({ trip, onApprove, onReject }) {
  return <article className="request-card">
    <div className="request-head"><div className="customer-avatar">{trip.customer_name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div><b>{trip.customer_name}</b><span>Requested {dateFmt(trip.created_at || trip.departure_at)}</span></div><button><MoreHorizontal size={18}/></button></div>
    <div className="request-route"><div><small>FROM</small><strong>{trip.origin}</strong></div><span><i></i><Plane size={15}/><i></i></span><div><small>TO</small><strong>{trip.destination}</strong></div></div>
    <div className="request-info"><span><CalendarDays size={15}/>{dateFmt(trip.departure_at, {weekday:'short'})} · {timeFmt(trip.departure_at)}</span><span><Users size={15}/>{trip.passengers} passengers</span></div>
    <div className="request-actions"><button onClick={()=>onReject(trip)}>Decline</button><button className="dark" onClick={()=>onApprove(trip)}>Review request <ArrowRight size={15}/></button></div>
  </article>;
}

function Empty({ icon:Icon=Plane, title:heading, copy, action, actionLabel }) {
  return <div className="empty"><span><Icon size={24}/></span><h3>{heading}</h3><p>{copy}</p>{action && <button className="primary" onClick={action}><Plus size={16}/>{actionLabel}</button>}</div>;
}

function Overview({ data, setView, onApprove, onReject, onCreate, onStatus, useDemo }) {
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
        <div className="flight-list">{upcoming.length?upcoming.map(f=><FlightRow key={f.id} flight={f} data={data} onStatus={onStatus}/>):<Empty title="No flights scheduled" copy="Add a flight leg to start building today’s schedule." action={onCreate} actionLabel="Create request"/>}</div>
      </div>
      <div className="panel requests-panel"><div className="panel-head"><div><h3>Trip requests</h3><p>{requested.length} waiting for review</p></div><button className="round" onClick={()=>setView('trips')}><ArrowRight size={17}/></button></div>
        <div className="requests-list">{requested.length?requested.slice(0,2).map(t=><TripCard key={t.id} trip={t} onApprove={onApprove} onReject={onReject}/>):<Empty icon={Check} title="Inbox clear" copy="New trip requests will appear here."/>}</div>
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

function SchedulePage({ data, onStatus, onCreate }) {
  const [filter,setFilter]=useState('all');
  const flights=data.flights.filter(f=>filter==='all'||f.status===filter).sort((a,b)=>new Date(a.scheduled_departure)-new Date(b.scheduled_departure));
  return <main className="content inner-page"><PageHeading eyebrow="Flight operations" title="Flight schedule" copy="Monitor departures, arrivals, aircraft, and crew assignments." action={onCreate} actionLabel="Add flight"/><div className="filter-bar"><div>{['all','scheduled','departed','completed'].map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{title(x)}{x!=='all'&&<span>{data.flights.filter(f=>f.status===x).length}</span>}</button>)}</div><button><CalendarDays size={16}/> This week <ChevronDown size={14}/></button></div><section className="panel table-panel"><div className="table-head"><span>Departure</span><span>Flight & route</span><span>Aircraft</span><span>Crew</span><span>Status</span><span></span></div>{flights.length?flights.map(f=><FlightRow key={f.id} flight={f} data={data} onStatus={onStatus}/>):<Empty title="No matching flights" copy="Try another filter or add a new flight leg."/>}</section></main>;
}

function TripsPage({ data, onApprove, onReject, onCreate }) {
  const [filter,setFilter]=useState('all'); const trips=data.trips.filter(t=>filter==='all'||t.status===filter);
  return <main className="content inner-page"><PageHeading eyebrow="Customer travel" title="Trip requests" copy="Review requested travel and coordinate approved trips." action={onCreate} actionLabel="New request"/><div className="filter-bar"><div>{['all','requested','approved','rejected','cancelled'].map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{title(x)}<span>{data.trips.filter(t=>x==='all'||t.status===x).length}</span></button>)}</div></div><div className="trip-grid">{trips.map(t=><article className="trip-card" key={t.id}><div className="trip-card-top"><Badge status={t.status}/><button><MoreHorizontal size={18}/></button></div><div className="big-route"><div><strong>{t.origin}</strong><small>{timeFmt(t.departure_at)}</small></div><span><i/><Plane size={18}/><i/></span><div><strong>{t.destination}</strong><small>{dateFmt(t.departure_at)}</small></div></div><h3>{t.customer_name}</h3><p>{t.purpose || 'Private charter'}</p><div className="trip-meta"><span><Users size={15}/>{t.passengers} passengers</span><span><CalendarDays size={15}/>{dateFmt(t.return_at) || 'One way'}</span></div>{t.status==='requested'?<div className="request-actions"><button onClick={()=>onReject(t)}>Decline</button><button className="dark" onClick={()=>onApprove(t)}>Review <ArrowRight size={15}/></button></div>:<div className="assignment"><span><Plane size={15}/>{data.aircraft.find(a=>a.id===t.aircraft_id)?.tail_number || 'No aircraft assigned'}</span><span><Users size={15}/>{t.pilot_ids?.length || 0} pilots</span></div>}</article>)}</div>{!trips.length&&<Empty title="No trip requests here" copy="New customer requests will be collected in this workspace." action={onCreate} actionLabel="New request"/>}</main>;
}

function FleetPage({ data, onCreate }) {
  return <main className="content inner-page"><PageHeading eyebrow="Fleet management" title="Aircraft" copy="Track aircraft readiness, utilization, and home base." action={()=>onCreate('aircraft')} actionLabel="Add aircraft"/><div className="resource-grid">{data.aircraft.map(a=><article className="aircraft-card" key={a.id}><div className="aircraft-visual"><span>{a.make}</span><Plane size={68}/><Badge status={a.status}/></div><div className="aircraft-copy"><div><h3>{a.tail_number}</h3><p>{a.make} {a.model}</p></div><button><MoreHorizontal size={18}/></button><dl><div><dt>HOME BASE</dt><dd>{a.home_airport}</dd></div><div><dt>CAPACITY</dt><dd>{a.passenger_capacity} pax</dd></div><div><dt>TOTAL TIME</dt><dd>{a.total_hours?.toLocaleString()} hrs</dd></div></dl><div className="utilization"><span>Utilization this month <b>{Math.min(Math.round((a.total_hours%100)),92)}%</b></span><i><em style={{width:`${Math.min(Math.round((a.total_hours%100)),92)}%`}}/></i></div></div></article>)}</div>{!data.aircraft.length&&<Empty title="No aircraft yet" copy="Add your first aircraft to begin assigning trips." action={()=>onCreate('aircraft')} actionLabel="Add aircraft"/>}</main>;
}

function PilotsPage({ data, onCreate }) {
  return <main className="content inner-page"><PageHeading eyebrow="Crew management" title="Pilot roster" copy="Manage certifications, medical status, and crew availability." action={()=>onCreate('pilot')} actionLabel="Add pilot"/><section className="panel people-table"><div className="people-head"><span>Pilot</span><span>License</span><span>Certifications</span><span>Medical</span><span>Status</span><span></span></div>{data.pilots.map(p=><div className="person-row" key={p.id}><div><Avatar pilot={p}/><span><b>{p.first_name} {p.last_name}</b><small>{p.email}</small></span></div><code>{p.license_number}</code><div className="chips">{p.certifications.slice(0,2).map(c=><span key={c}>{c}</span>)}</div><span>{dateFmt(p.medical_expires,{year:'numeric'})}</span><Badge status={p.active?'active':'inactive'}/><button><MoreHorizontal size={18}/></button></div>)}</section>{!data.pilots.length&&<Empty icon={Users} title="No pilots yet" copy="Add pilots before approving a trip." action={()=>onCreate('pilot')} actionLabel="Add pilot"/>}</main>;
}

function FuelPage({ data, onCreate }) {
  const total=data.fuelLogs.reduce((s,l)=>s+(l.total_cost || l.gallons*l.price_per_gallon),0); const gallons=data.fuelLogs.reduce((s,l)=>s+l.gallons,0);
  return <main className="content inner-page"><PageHeading eyebrow="Cost tracking" title="Fuel log" copy="Review fuel purchases and operating spend across the fleet." action={()=>onCreate('fuel')} actionLabel="Log fuel"/><div className="fuel-summary"><div><span><Fuel/></span><p>Total fuel logged<strong>{gallons.toLocaleString()} <small>gal</small></strong></p></div><div><span><CircleDollarSign/></span><p>Total fuel spend<strong>{money(total)}</strong></p></div><div><span><Gauge/></span><p>Average price<strong>{gallons?money(total/gallons):'$0'} <small>/ gal</small></strong></p></div></div><section className="panel fuel-table"><div className="fuel-head"><span>Date</span><span>Aircraft</span><span>Airport / Vendor</span><span>Gallons</span><span>Unit price</span><span>Total</span></div>{data.fuelLogs.map(l=>{const a=data.aircraft.find(a=>a.id===l.aircraft_id);return <div key={l.id}><span>{dateFmt(l.fueled_at,{year:'numeric'})}<small>{timeFmt(l.fueled_at)}</small></span><b>{a?.tail_number||'—'}</b><span>{l.airport}<small>{l.vendor||'Unspecified vendor'}</small></span><span>{l.gallons.toLocaleString()}</span><span>${l.price_per_gallon.toFixed(2)}</span><b>{money(l.total_cost||l.gallons*l.price_per_gallon)}</b></div>})}</section>{!data.fuelLogs.length&&<Empty icon={Fuel} title="No fuel purchases logged" copy="Fuel entries will roll up into your operating dashboard." action={()=>onCreate('fuel')} actionLabel="Log fuel"/>}</main>;
}

const Input = ({label, ...props}) => <label className="field"><span>{label}</span><input {...props}/></label>;
const Select = ({label, children, ...props}) => <label className="field"><span>{label}</span><select {...props}>{children}</select></label>;

function CreateModal({ type='trip', data, onClose, onSubmit }) {
  const defaults={trip:{customer_name:'',customer_email:'',origin:'',destination:'',departure_at:'',return_at:'',passengers:1,purpose:''},aircraft:{tail_number:'',make:'',model:'',year:'',passenger_capacity:8,home_airport:'',status:'available',total_hours:0},pilot:{first_name:'',last_name:'',email:'',phone:'',license_number:'',certifications:'',medical_expires:'',active:true},fuel:{aircraft_id:'',flight_id:'',airport:'',fueled_at:'',gallons:'',price_per_gallon:'',vendor:''},flight:{flight_number:'',trip_id:'',aircraft_id:'',pilot_ids:'',origin:'',destination:'',scheduled_departure:'',scheduled_arrival:'',passengers:0}};
  const [form,setForm]=useState(defaults[type]||defaults.trip); const set=(key,val)=>setForm(f=>({...f,[key]:val}));
  const submit=e=>{e.preventDefault(); const body={...form}; ['departure_at','return_at','fueled_at','scheduled_departure','scheduled_arrival'].forEach(k=>{if(body[k])body[k]=new Date(body[k]).toISOString();else delete body[k]}); ['year','passenger_capacity','total_hours','passengers','gallons','price_per_gallon'].forEach(k=>{if(body[k]!==undefined&&body[k]!=='')body[k]=Number(body[k]);else delete body[k]}); if(type==='pilot')body.certifications=form.certifications.split(',').map(x=>x.trim()).filter(Boolean); if(type==='flight')body.pilot_ids=[form.pilot_ids]; ['customer_email','flight_id','trip_id','phone','vendor','medical_expires'].forEach(k=>{if(body[k]==='')delete body[k]}); onSubmit(type,body);};
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><div><span>{type==='trip'?'Customer travel':type==='fuel'?'Expense tracking':'Operations'}</span><h2>{type==='trip'?'New trip request':type==='fuel'?'Log fuel purchase':`Add ${type}`}</h2></div><button onClick={onClose}><X size={19}/></button></div><form onSubmit={submit}><div className="form-grid">
    {type==='trip'&&<><Input label="Customer name" required value={form.customer_name} onChange={e=>set('customer_name',e.target.value)} placeholder="Full name or organization"/><Input label="Customer email" type="email" value={form.customer_email} onChange={e=>set('customer_email',e.target.value)} placeholder="ops@company.com"/><Input label="Origin" required minLength="3" maxLength="4" value={form.origin} onChange={e=>set('origin',e.target.value.toUpperCase())} placeholder="KTEB"/><Input label="Destination" required minLength="3" maxLength="4" value={form.destination} onChange={e=>set('destination',e.target.value.toUpperCase())} placeholder="KPBI"/><Input label="Departure" required type="datetime-local" value={form.departure_at} onChange={e=>set('departure_at',e.target.value)}/><Input label="Return (optional)" type="datetime-local" value={form.return_at} onChange={e=>set('return_at',e.target.value)}/><Input label="Passengers" required type="number" min="1" value={form.passengers} onChange={e=>set('passengers',e.target.value)}/><Input label="Purpose" value={form.purpose} onChange={e=>set('purpose',e.target.value)} placeholder="Executive travel"/></>}
    {type==='aircraft'&&<><Input label="Tail number" required value={form.tail_number} onChange={e=>set('tail_number',e.target.value.toUpperCase())} placeholder="N712PG"/><Input label="Manufacturer" required value={form.make} onChange={e=>set('make',e.target.value)} placeholder="Cessna"/><Input label="Model" required value={form.model} onChange={e=>set('model',e.target.value)} placeholder="Citation Latitude"/><Input label="Year" type="number" min="1903" max="2100" value={form.year} onChange={e=>set('year',e.target.value)}/><Input label="Passenger capacity" required type="number" min="1" value={form.passenger_capacity} onChange={e=>set('passenger_capacity',e.target.value)}/><Input label="Home airport" required minLength="3" maxLength="4" value={form.home_airport} onChange={e=>set('home_airport',e.target.value.toUpperCase())} placeholder="KTEB"/></>}
    {type==='pilot'&&<><Input label="First name" required value={form.first_name} onChange={e=>set('first_name',e.target.value)}/><Input label="Last name" required value={form.last_name} onChange={e=>set('last_name',e.target.value)}/><Input label="Email" required type="email" value={form.email} onChange={e=>set('email',e.target.value)}/><Input label="Phone" value={form.phone} onChange={e=>set('phone',e.target.value)}/><Input label="License number" required value={form.license_number} onChange={e=>set('license_number',e.target.value)}/><Input label="Medical expires" type="date" value={form.medical_expires} onChange={e=>set('medical_expires',e.target.value)}/><label className="field full"><span>Certifications</span><input value={form.certifications} onChange={e=>set('certifications',e.target.value)} placeholder="ATP, Citation Latitude"/><small>Separate multiple certifications with commas.</small></label></>}
    {type==='fuel'&&<><Select label="Aircraft" required value={form.aircraft_id} onChange={e=>set('aircraft_id',e.target.value)}><option value="">Select aircraft</option>{data.aircraft.map(a=><option key={a.id} value={a.id}>{a.tail_number} · {a.model}</option>)}</Select><Select label="Flight (optional)" value={form.flight_id} onChange={e=>set('flight_id',e.target.value)}><option value="">No linked flight</option>{data.flights.map(f=><option key={f.id} value={f.id}>{f.flight_number}</option>)}</Select><Input label="Airport" required minLength="3" maxLength="4" value={form.airport} onChange={e=>set('airport',e.target.value.toUpperCase())}/><Input label="Fueled at" required type="datetime-local" value={form.fueled_at} onChange={e=>set('fueled_at',e.target.value)}/><Input label="Gallons" required type="number" min="0.01" step="0.01" value={form.gallons} onChange={e=>set('gallons',e.target.value)}/><Input label="Price per gallon" required type="number" min="0" step="0.01" value={form.price_per_gallon} onChange={e=>set('price_per_gallon',e.target.value)}/><Input label="Vendor" value={form.vendor} onChange={e=>set('vendor',e.target.value)}/></>}
  </div><div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{type==='trip'?'Create request':type==='fuel'?'Save fuel log':`Add ${type}`}<ArrowRight size={16}/></button></div></form></div></div>;
}

function ApproveModal({ trip, data, onClose, onSubmit }) {
  const [aircraft,setAircraft]=useState(''); const [pilots,setPilots]=useState([]); const available=data.aircraft.filter(a=>a.status==='available'&&a.passenger_capacity>=trip.passengers); const eligible=data.pilots.filter(p=>p.active);
  const toggle=id=>setPilots(x=>x.includes(id)?x.filter(p=>p!==id):[...x,id]);
  return <div className="modal-backdrop"><div className="modal approval-modal"><div className="modal-head"><div><span>Review request</span><h2>{trip.origin} <ArrowRight size={18}/> {trip.destination}</h2></div><button onClick={onClose}><X size={19}/></button></div><div className="approval-summary"><div><span>Customer</span><b>{trip.customer_name}</b></div><div><span>Departure</span><b>{dateFmt(trip.departure_at,{weekday:'short'})}, {timeFmt(trip.departure_at)}</b></div><div><span>Travelers</span><b>{trip.passengers} passengers</b></div></div><div className="approval-section"><label>Assign aircraft</label><div className="choice-list">{available.map(a=><button key={a.id} className={aircraft===a.id?'selected':''} onClick={()=>setAircraft(a.id)}><span className="choice-icon"><Plane size={19}/></span><span><b>{a.tail_number}</b><small>{a.model} · {a.passenger_capacity} seats</small></span>{aircraft===a.id&&<Check size={17}/>}</button>)}</div></div><div className="approval-section"><label>Assign crew</label><div className="choice-list crew-choices">{eligible.map(p=><button key={p.id} className={pilots.includes(p.id)?'selected':''} onClick={()=>toggle(p.id)}><Avatar pilot={p}/><span><b>{p.first_name} {p.last_name}</b><small>{p.certifications?.[0] || p.license_number}</small></span>{pilots.includes(p.id)&&<Check size={17}/>}</button>)}</div></div><div className="modal-actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!aircraft||!pilots.length} onClick={()=>onSubmit(trip,{aircraft_id:aircraft,pilot_ids:pilots,approved_by:'Operations'})}>Approve trip <Check size={16}/></button></div></div></div>;
}

export default function App() {
  const [view,setView]=useState('dashboard'); const [data,setData]=useState(initialData); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [demo,setDemo]=useState(false); const [modal,setModal]=useState(null); const [toast,setToast]=useState(null); const [query,setQuery]=useState(''); const [sidebarOpen,setSidebarOpen]=useState(false);
  const load=async(show=true)=>{if(show)setLoading(true);try{const [dashboard,pilots,aircraft,trips,flights,fuelLogs]=await Promise.all([api.dashboard(),api.pilots(),api.aircraft(),api.trips(),api.flights(),api.fuelLogs()]);setData({dashboard,pilots,aircraft,trips,flights,fuelLogs});setError('');setDemo(false);}catch(e){setData(demoData);setDemo(true);setError(e.message);}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  useEffect(()=>{const handler=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();document.querySelector('.search input')?.focus()}if(e.key==='Escape')setModal(null)};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[]);
  const displayed=useMemo(()=>{if(!query.trim())return data;const q=query.toLowerCase();return {...data,trips:data.trips.filter(t=>`${t.customer_name} ${t.origin} ${t.destination}`.toLowerCase().includes(q)),flights:data.flights.filter(f=>`${f.flight_number} ${f.origin} ${f.destination}`.toLowerCase().includes(q)),aircraft:data.aircraft.filter(a=>`${a.tail_number} ${a.model}`.toLowerCase().includes(q)),pilots:data.pilots.filter(p=>`${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(q))}},[data,query]);
  const notify=(message,type='success')=>setToast({message,type});
  const create=async(type,body)=>{if(demo){notify('Demo mode is read-only. Connect the API to save changes.','error');return;} const resources={trip:'trips',aircraft:'aircraft',pilot:'pilots',fuel:'fuel-logs',flight:'flights'};try{await api.create(resources[type],body);setModal(null);notify(`${title(type)} saved successfully.`);load(false);}catch(e){notify(e.message,'error')}};
  const approve=async(trip,payload)=>{if(demo){setData(d=>({...d,trips:d.trips.map(t=>t.id===trip.id?{...t,status:'approved',...payload}:t),dashboard:{...d.dashboard,requested_trips:d.dashboard.requested_trips-1,approved_trips:d.dashboard.approved_trips+1}}));setModal(null);notify('Trip approved and assigned.');return;}try{await api.approveTrip(trip.id,payload);setModal(null);notify('Trip approved and assigned.');load(false)}catch(e){notify(e.message,'error')}};
  const reject=async trip=>{if(!confirm(`Decline ${trip.customer_name}'s trip request?`))return;if(demo){setData(d=>({...d,trips:d.trips.map(t=>t.id===trip.id?{...t,status:'rejected'}:t)}));notify('Trip request declined.');return;}try{await api.rejectTrip(trip.id,'Declined by operations');notify('Trip request declined.');load(false)}catch(e){notify(e.message,'error')}};
  const status=async(flight,next)=>{if(demo){setData(d=>({...d,flights:d.flights.map(f=>f.id===flight.id?{...f,status:next}:f)}));notify(`Flight marked ${next}.`);return;}try{await api.flightStatus(flight.id,next);notify(`Flight marked ${next}.`);load(false)}catch(e){notify(e.message,'error')}};
  const openCreate=(type='trip')=>setModal({type});
  const setDemoMode=value=>{if(value){setData(demoData);setDemo(true)}else load()};
  return <div className="app-shell"><Sidebar current={view} setCurrent={setView} open={sidebarOpen} close={()=>setSidebarOpen(false)}/><div className="app-main"><Header current={view} query={query} setQuery={setQuery} onCreate={()=>openCreate('trip')} demo={demo} setDemo={setDemoMode} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}/>{loading?<div className="loader"><span/><p>Preparing your operation…</p></div>:<>{error&&demo&&<div className="connection-note"><Activity size={15}/> Live API unavailable — showing a fully interactive demo workspace.<button onClick={()=>load()}><RefreshCw size={14}/> Retry</button></div>}{view==='dashboard'&&<Overview data={displayed} setView={setView} onApprove={trip=>setModal({type:'approve',trip})} onReject={reject} onCreate={()=>openCreate('trip')} onStatus={status} useDemo={demo}/>} {view==='schedule'&&<SchedulePage data={displayed} onStatus={status} onCreate={()=>openCreate('trip')}/>} {view==='trips'&&<TripsPage data={displayed} onApprove={trip=>setModal({type:'approve',trip})} onReject={reject} onCreate={()=>openCreate('trip')}/>} {view==='fleet'&&<FleetPage data={displayed} onCreate={openCreate}/>} {view==='pilots'&&<PilotsPage data={displayed} onCreate={openCreate}/>} {view==='fuel'&&<FuelPage data={displayed} onCreate={openCreate}/>}</>}</div>{sidebarOpen&&<div className="sidebar-scrim" onClick={()=>setSidebarOpen(false)}/>} {modal?.type==='approve'?<ApproveModal trip={modal.trip} data={data} onClose={()=>setModal(null)} onSubmit={approve}/>:modal&&<CreateModal type={modal.type} data={data} onClose={()=>setModal(null)} onSubmit={create}/>}<Toast toast={toast} onClose={()=>setToast(null)}/></div>;
}
