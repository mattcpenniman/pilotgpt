const now = new Date();
const at = (day, hour, minute = 0) => {
  const d = new Date(now); d.setDate(now.getDate() + day); d.setHours(hour, minute, 0, 0); return d.toISOString();
};

export const demoData = {
  dashboard: { pilots: 6, active_pilots: 5, aircraft: 4, available_aircraft: 3, requested_trips: 3, approved_trips: 5, scheduled_flights: 4, fuel_gallons: 1842.4, fuel_cost: 11920.74 },
  pilots: [
    { id:'p1', first_name:'Avery', last_name:'Stone', email:'avery@pilotgpt.io', license_number:'ATP-492018', certifications:['ATP','Citation Latitude'], medical_expires:'2027-03-18', active:true },
    { id:'p2', first_name:'Morgan', last_name:'Lee', email:'morgan@pilotgpt.io', license_number:'ATP-306621', certifications:['ATP','Phenom 300'], medical_expires:'2026-12-08', active:true },
    { id:'p3', first_name:'James', last_name:'Bennett', email:'james@pilotgpt.io', license_number:'ATP-721904', certifications:['ATP','Challenger 350'], medical_expires:'2027-01-22', active:true },
    { id:'p4', first_name:'Elena', last_name:'Torres', email:'elena@pilotgpt.io', license_number:'CPL-184527', certifications:['Commercial','Phenom 300'], medical_expires:'2026-09-14', active:true },
    { id:'p5', first_name:'Noah', last_name:'Brooks', email:'noah@pilotgpt.io', license_number:'ATP-611209', certifications:['ATP','Citation Latitude'], medical_expires:'2027-05-02', active:true },
    { id:'p6', first_name:'Mia', last_name:'Chen', email:'mia@pilotgpt.io', license_number:'ATP-903415', certifications:['ATP'], medical_expires:'2026-08-11', active:false },
  ],
  aircraft: [
    { id:'a1', tail_number:'N712PG', make:'Cessna', model:'Citation Latitude', year:2022, passenger_capacity:9, home_airport:'KTEB', status:'available', total_hours:1842.6 },
    { id:'a2', tail_number:'N304PX', make:'Embraer', model:'Phenom 300E', year:2023, passenger_capacity:8, home_airport:'KHPN', status:'available', total_hours:976.3 },
    { id:'a3', tail_number:'N889CL', make:'Bombardier', model:'Challenger 350', year:2021, passenger_capacity:10, home_airport:'KTEB', status:'maintenance', total_hours:2351.8 },
    { id:'a4', tail_number:'N150GP', make:'Gulfstream', model:'G150', year:2018, passenger_capacity:7, home_airport:'KMMU', status:'available', total_hours:3920.1 },
  ],
  trips: [
    { id:'t1', customer_name:'Evelyn Hart', origin:'KTEB', destination:'KPBI', departure_at:at(0,8,30), return_at:at(2,16), passengers:5, purpose:'Executive travel', status:'approved', aircraft_id:'a1', pilot_ids:['p1','p5'] },
    { id:'t2', customer_name:'Marcus Hill', origin:'KHPN', destination:'KBOS', departure_at:at(0,11,15), return_at:at(0,18,30), passengers:3, purpose:'Client meeting', status:'approved', aircraft_id:'a2', pilot_ids:['p2','p4'] },
    { id:'t3', customer_name:'Cameron Reid', origin:'KTEB', destination:'KORD', departure_at:at(1,9), return_at:at(2,13), passengers:7, purpose:'Board meeting', status:'requested', aircraft_id:null, pilot_ids:[] },
    { id:'t4', customer_name:'Sofia Laurent', origin:'KMMU', destination:'KACK', departure_at:at(1,13,30), return_at:at(1,19), passengers:4, purpose:'Personal travel', status:'requested', aircraft_id:null, pilot_ids:[] },
    { id:'t5', customer_name:'Theo Walker', origin:'KTEB', destination:'KMIA', departure_at:at(3,7,45), return_at:at(5,15), passengers:6, purpose:'Conference', status:'requested', aircraft_id:null, pilot_ids:[] },
  ],
  flights: [
    { id:'f1', trip_id:'t1', flight_number:'PG 271', aircraft_id:'a1', pilot_ids:['p1','p5'], origin:'KTEB', destination:'KPBI', scheduled_departure:at(0,8,30), scheduled_arrival:at(0,11,12), passengers:5, status:'departed' },
    { id:'f2', trip_id:'t2', flight_number:'PG 304', aircraft_id:'a2', pilot_ids:['p2','p4'], origin:'KHPN', destination:'KBOS', scheduled_departure:at(0,11,15), scheduled_arrival:at(0,12,18), passengers:3, status:'scheduled' },
    { id:'f3', trip_id:null, flight_number:'PG 118', aircraft_id:'a4', pilot_ids:['p3'], origin:'KMMU', destination:'KDCA', scheduled_departure:at(0,14,40), scheduled_arrival:at(0,15,52), passengers:4, status:'scheduled' },
    { id:'f4', trip_id:null, flight_number:'PG 442', aircraft_id:'a1', pilot_ids:['p1'], origin:'KPBI', destination:'KTEB', scheduled_departure:at(2,16), scheduled_arrival:at(2,18,38), passengers:5, status:'scheduled' },
  ],
  fuelLogs: [
    { id:'l1', aircraft_id:'a1', flight_id:'f1', airport:'KTEB', fueled_at:at(-1,17), gallons:321.8, price_per_gallon:6.41, vendor:'Atlantic Aviation', total_cost:2062.74 },
    { id:'l2', aircraft_id:'a2', flight_id:'f2', airport:'KHPN', fueled_at:at(-1,15), gallons:218.2, price_per_gallon:6.72, vendor:'Million Air', total_cost:1466.3 },
    { id:'l3', aircraft_id:'a4', flight_id:'f3', airport:'KMMU', fueled_at:at(-2,11), gallons:284.6, price_per_gallon:6.18, vendor:'Signature', total_cost:1759.03 },
  ],
};
