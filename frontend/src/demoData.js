const now = new Date();
const at = (day, hour, minute = 0) => {
  const d = new Date(now); d.setDate(now.getDate() + day); d.setHours(hour, minute, 0, 0); return d.toISOString();
};

export const demoAirports = [
  { ident:'KTEB', type:'medium_airport', name:'Teterboro Airport', latitude_deg:40.8501, longitude_deg:-74.0608, elevation_ft:9, municipality:'Teterboro', iso_country:'US', iso_region:'US-NJ', gps_code:'KTEB', icao_code:'KTEB', iata_code:'TEB', local_code:'TEB' },
  { ident:'KHPN', type:'medium_airport', name:'Westchester County Airport', latitude_deg:41.067, longitude_deg:-73.7076, elevation_ft:439, municipality:'White Plains', iso_country:'US', iso_region:'US-NY', gps_code:'KHPN', icao_code:'KHPN', iata_code:'HPN', local_code:'HPN' },
  { ident:'KMMU', type:'medium_airport', name:'Morristown Municipal Airport', latitude_deg:40.7994, longitude_deg:-74.4149, elevation_ft:187, municipality:'Morristown', iso_country:'US', iso_region:'US-NJ', gps_code:'KMMU', icao_code:'KMMU', iata_code:'MMU', local_code:'MMU' },
  { ident:'KPBI', type:'large_airport', name:'Palm Beach International Airport', latitude_deg:26.6832, longitude_deg:-80.0956, elevation_ft:19, municipality:'West Palm Beach', iso_country:'US', iso_region:'US-FL', gps_code:'KPBI', icao_code:'KPBI', iata_code:'PBI', local_code:'PBI' },
  { ident:'KBOS', type:'large_airport', name:'Logan International Airport', latitude_deg:42.3643, longitude_deg:-71.0052, elevation_ft:20, municipality:'Boston', iso_country:'US', iso_region:'US-MA', gps_code:'KBOS', icao_code:'KBOS', iata_code:'BOS', local_code:'BOS' },
  { ident:'KORD', type:'large_airport', name:"Chicago O'Hare International Airport", latitude_deg:41.9786, longitude_deg:-87.9048, elevation_ft:680, municipality:'Chicago', iso_country:'US', iso_region:'US-IL', gps_code:'KORD', icao_code:'KORD', iata_code:'ORD', local_code:'ORD' },
  { ident:'KACK', type:'medium_airport', name:'Nantucket Memorial Airport', latitude_deg:41.2531, longitude_deg:-70.0602, elevation_ft:48, municipality:'Nantucket', iso_country:'US', iso_region:'US-MA', gps_code:'KACK', icao_code:'KACK', iata_code:'ACK', local_code:'ACK' },
  { ident:'KMIA', type:'large_airport', name:'Miami International Airport', latitude_deg:25.7932, longitude_deg:-80.2906, elevation_ft:8, municipality:'Miami', iso_country:'US', iso_region:'US-FL', gps_code:'KMIA', icao_code:'KMIA', iata_code:'MIA', local_code:'MIA' },
  { ident:'KDCA', type:'large_airport', name:'Ronald Reagan Washington National Airport', latitude_deg:38.8521, longitude_deg:-77.0377, elevation_ft:15, municipality:'Washington', iso_country:'US', iso_region:'US-DC', gps_code:'KDCA', icao_code:'KDCA', iata_code:'DCA', local_code:'DCA' },
];

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
    { id:'a1', tail_number:'N712PG', make:'Cessna', model:'Citation Latitude', year:2022, passenger_capacity:9, home_airport:'KTEB', status:'available', total_hours:1842.6, cruise_speed_kts:446, fuel_burn_gph:220 },
    { id:'a2', tail_number:'N304PX', make:'Embraer', model:'Phenom 300E', year:2023, passenger_capacity:8, home_airport:'KHPN', status:'available', total_hours:976.3, cruise_speed_kts:464, fuel_burn_gph:180 },
    { id:'a3', tail_number:'N889CL', make:'Bombardier', model:'Challenger 350', year:2021, passenger_capacity:10, home_airport:'KTEB', status:'maintenance', total_hours:2351.8, cruise_speed_kts:470, fuel_burn_gph:330 },
    { id:'a4', tail_number:'N150GP', make:'Gulfstream', model:'G150', year:2018, passenger_capacity:7, home_airport:'KMMU', status:'available', total_hours:3920.1, cruise_speed_kts:476, fuel_burn_gph:300 },
  ],
  trips: [
    { id:'t1', customer_name:'Evelyn Hart', origin:'KTEB', destination:'KPBI', departure_at:at(0,8,30), return_at:at(2,16), passengers:5, purpose:'Executive travel', status:'approved', aircraft_id:'a1', pilot_ids:['p1','p5'] },
    { id:'t2', customer_name:'Marcus Hill', origin:'KHPN', destination:'KBOS', departure_at:at(0,11,15), return_at:at(0,18,30), passengers:3, purpose:'Client meeting', status:'approved', sub_status:'pending_cancellation', aircraft_id:'a2', pilot_ids:['p2','p4'] },
    { id:'t3', customer_name:'Cameron Reid', origin:'KTEB', destination:'KORD', departure_at:at(1,9), return_at:at(2,13), passengers:7, purpose:'Board meeting', status:'requested', aircraft_id:null, pilot_ids:[] },
    { id:'t4', customer_name:'Sofia Laurent', origin:'KMMU', destination:'KACK', departure_at:at(1,13,30), return_at:at(1,19), passengers:4, purpose:'Personal travel', status:'requested', aircraft_id:null, pilot_ids:[] },
    { id:'t5', customer_name:'Theo Walker', origin:'KTEB', destination:'KMIA', departure_at:at(3,7,45), return_at:at(5,15), passengers:6, purpose:'Conference', status:'requested', aircraft_id:null, pilot_ids:[] },
  ],
  flights: [
    { id:'f1', trip_id:'t1', flight_number:'PG 271', aircraft_id:'a1', pilot_ids:['p1','p5'], origin:'KTEB', destination:'KPBI', scheduled_departure:at(0,8,30), scheduled_arrival:at(0,11,12), passengers:5, status:'departed', distance_nm:901.73, estimated_flight_time_minutes:121.31, estimated_leg_time_minutes:151.31, estimated_fuel_usage_gallons:444.8 },
    { id:'f2', trip_id:'t2', flight_number:'PG 304', aircraft_id:'a2', pilot_ids:['p2','p4'], origin:'KHPN', destination:'KBOS', scheduled_departure:at(0,11,15), scheduled_arrival:at(0,12,18), passengers:3, status:'scheduled', distance_nm:143.81, estimated_flight_time_minutes:18.6, estimated_leg_time_minutes:48.6, estimated_fuel_usage_gallons:55.79 },
    { id:'f3', trip_id:null, flight_number:'PG 118', aircraft_id:'a4', pilot_ids:['p3'], origin:'KMMU', destination:'KDCA', scheduled_departure:at(0,14,40), scheduled_arrival:at(0,15,52), passengers:4, status:'scheduled', distance_nm:168.18, estimated_flight_time_minutes:21.2, estimated_leg_time_minutes:51.2, estimated_fuel_usage_gallons:106 },
    { id:'f4', trip_id:'t1', flight_number:'PG 442', aircraft_id:'a1', pilot_ids:['p1'], origin:'KPBI', destination:'KMIA', scheduled_departure:at(2,13), scheduled_arrival:at(2,14,10), passengers:5, status:'scheduled', distance_nm:54.28, estimated_flight_time_minutes:7.3, estimated_leg_time_minutes:37.3, estimated_fuel_usage_gallons:26.77 },
    { id:'f5', trip_id:'t1', flight_number:'PG 443', aircraft_id:'a1', pilot_ids:['p1','p5'], origin:'KMIA', destination:'KTEB', scheduled_departure:at(2,16), scheduled_arrival:at(2,18,38), passengers:5, status:'scheduled', distance_nm:955.66, estimated_flight_time_minutes:128.56, estimated_leg_time_minutes:158.56, estimated_fuel_usage_gallons:471.4 },
  ],
  fuelLogs: [
    { id:'l1', aircraft_id:'a1', flight_id:'f1', airport:'KTEB', fueled_at:at(-1,17), gallons:321.8, price_per_gallon:6.41, vendor:'Atlantic Aviation', total_cost:2062.74 },
    { id:'l2', aircraft_id:'a2', flight_id:'f2', airport:'KHPN', fueled_at:at(-1,15), gallons:218.2, price_per_gallon:6.72, vendor:'Million Air', total_cost:1466.3 },
    { id:'l3', aircraft_id:'a4', flight_id:'f3', airport:'KMMU', fueled_at:at(-2,11), gallons:284.6, price_per_gallon:6.18, vendor:'Signature', total_cost:1759.03 },
  ],
};
