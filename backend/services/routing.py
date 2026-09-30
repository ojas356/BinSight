"""Dynamic, traffic-aware gap crew routing for BinSight.

Picks gap vehicle by proximity and capacity, orders stops with
priority-weighted nearest-neighbour + 2-opt improvement.

Traffic simulation: time-of-day based multipliers.
  Peak hours (08:00-10:30, 17:00-20:00): HIGH (1.7x)
  Shoulders (07:00-08:00, 10:30-12:00, 16:00-17:00, 20:00-21:00): MEDIUM (1.3x)
  Otherwise: LOW (1.0x)

Route geometry priority:
  1. Mapbox Directions API  (if MAPBOX_ACCESS_TOKEN is set in .env)
  2. OSRM public demo server (best-effort, rate-limited)
  3. Haversine straight-line fallback
"""
import os
import json
import math
import requests
from datetime import datetime
from services.sim_clock import sim_clock
from services.duplicates import haversine_distance

# Traffic multipliers
TRAFFIC_MULTIPLIERS = {
    'LOW': 1.0,
    'MEDIUM': 1.3,
    'HIGH': 1.7,
}

# Mapbox — used when MAPBOX_ACCESS_TOKEN is present in environment
MAPBOX_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving'
MAPBOX_TOKEN = os.getenv('MAPBOX_ACCESS_TOKEN')

# OSRM public API (best-effort fallback, no key needed)
OSRM_BASE = 'http://router.project-osrm.org'
OSRM_TIMEOUT = 3  # seconds


def get_traffic_level(sim_now=None):
    """
    Get simulated traffic level based on time of day.
    In production, replace with a live traffic API call.
    """
    if sim_now is None:
        sim_now = sim_clock.now()
    
    hour = sim_now.hour + sim_now.minute / 60
    
    # Peak hours
    if (8.0 <= hour <= 10.5) or (17.0 <= hour <= 20.0):
        return 'HIGH', TRAFFIC_MULTIPLIERS['HIGH']
    # Shoulder hours
    if (7.0 <= hour < 8.0) or (10.5 < hour <= 12.0) or \
       (16.0 <= hour < 17.0) or (20.0 < hour <= 21.0):
        return 'MEDIUM', TRAFFIC_MULTIPLIERS['MEDIUM']
    
    return 'LOW', TRAFFIC_MULTIPLIERS['LOW']


def get_mapbox_route(coords):
    """
    Get route geometry from Mapbox Directions API.
    Requires MAPBOX_ACCESS_TOKEN in .env.
    coords: list of (lat, lon) tuples
    Returns: (geometry_coords [[lat,lon],...], distance_km) or (None, None)
    """
    if not MAPBOX_TOKEN or MAPBOX_TOKEN == 'your_mapbox_token_here':
        return None, None
    try:
        # Mapbox expects lon,lat order
        coord_str = ';'.join(f"{lon},{lat}" for lat, lon in coords)
        url = (
            f"{MAPBOX_BASE}/{coord_str}"
            f"?geometries=geojson&overview=full&access_token={MAPBOX_TOKEN}"
        )
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            if data.get('routes'):
                route = data['routes'][0]
                geometry = route['geometry']['coordinates']
                geometry_latlon = [[c[1], c[0]] for c in geometry]
                distance_km = route['distance'] / 1000
                return geometry_latlon, distance_km
    except Exception:
        pass
    return None, None


def get_osrm_route(coords):
    """
    Get route geometry from OSRM public API.
    coords: list of (lat, lon) tuples
    Returns: (geometry_coords [[lat,lon],...], distance_km) or (None, None)
    """
    try:
        coord_str = ';'.join(f"{lon},{lat}" for lat, lon in coords)
        url = f"{OSRM_BASE}/route/v1/driving/{coord_str}?overview=full&geometries=geojson"
        resp = requests.get(url, timeout=OSRM_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            if data.get('routes'):
                route = data['routes'][0]
                geometry = route['geometry']['coordinates']
                geometry_latlon = [[c[1], c[0]] for c in geometry]
                distance_km = route['distance'] / 1000
                return geometry_latlon, distance_km
    except Exception:
        pass
    return None, None


def get_road_route(coords):
    """
    Try Mapbox → OSRM → haversine fallback in order.
    Returns: (geometry_coords, distance_km, source_label)
    """
    geometry, distance = get_mapbox_route(coords)
    if geometry:
        return geometry, distance, 'mapbox'

    geometry, distance = get_osrm_route(coords)
    if geometry:
        return geometry, distance, 'osrm'

    geometry = [[lat, lon] for lat, lon in coords]
    distance = haversine_route_distance(geometry)
    return geometry, distance, 'haversine_fallback'


def haversine_route_distance(coords):
    """Calculate total distance along a list of [lat, lon] coords in km."""
    total = 0
    for i in range(len(coords) - 1):
        total += haversine_distance(coords[i][0], coords[i][1],
                                     coords[i + 1][0], coords[i + 1][1])
    return total / 1000  # Convert to km


def select_gap_vehicle(gap_trucks, reports, depot_lat=19.1136, depot_lon=72.8697):
    """
    Pick the best gap vehicle by proximity and available capacity.
    Returns the best Truck or None.
    """
    if not gap_trucks:
        return None
    
    # Calculate centroid of reports
    if reports:
        center_lat = sum(r.latitude for r in reports) / len(reports)
        center_lon = sum(r.longitude for r in reports) / len(reports)
    else:
        center_lat, center_lon = depot_lat, depot_lon
    
    best_truck = None
    best_score = float('inf')
    
    for truck in gap_trucks:
        if truck.status == 'EN_ROUTE':
            continue  # Already on a route
        
        available = truck.capacity_kg - truck.current_load_kg
        if available <= 0:
            continue
        
        dist = haversine_distance(truck.latitude, truck.longitude, center_lat, center_lon)
        # Score: lower is better. Weight distance more than capacity
        score = dist / 1000 - available / 100
        
        if score < best_score:
            best_score = score
            best_truck = truck
    
    return best_truck


def nearest_neighbour_order(start, stops, priority_weight=0.3):
    """
    Priority-weighted nearest-neighbour ordering.
    Balances distance with priority (higher priority stops are preferred).
    """
    if not stops:
        return []
    
    remaining = list(stops)
    ordered = []
    current = start  # [lat, lon]
    
    PRIORITY_SCORES = {'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1}
    
    while remaining:
        best_idx = 0
        best_cost = float('inf')
        
        for i, stop in enumerate(remaining):
            dist = haversine_distance(current[0], current[1], stop['lat'], stop['lon'])
            priority_bonus = PRIORITY_SCORES.get(stop.get('priority', 'MEDIUM'), 2) * priority_weight * 1000
            cost = dist - priority_bonus
            
            if cost < best_cost:
                best_cost = cost
                best_idx = i
        
        next_stop = remaining.pop(best_idx)
        ordered.append(next_stop)
        current = [next_stop['lat'], next_stop['lon']]
    
    return ordered


def two_opt_improve(stops, max_iterations=50):
    """Simple 2-opt local search to improve route order."""
    if len(stops) <= 3:
        return stops
    
    def route_distance(route):
        total = 0
        for i in range(len(route) - 1):
            total += haversine_distance(
                route[i]['lat'], route[i]['lon'],
                route[i + 1]['lat'], route[i + 1]['lon']
            )
        return total
    
    improved = True
    iteration = 0
    best = list(stops)
    
    while improved and iteration < max_iterations:
        improved = False
        iteration += 1
        for i in range(1, len(best) - 1):
            for j in range(i + 1, len(best)):
                new_route = best[:i] + best[i:j + 1][::-1] + best[j + 1:]
                if route_distance(new_route) < route_distance(best):
                    best = new_route
                    improved = True
    
    return best


def generate_gap_route(reports, gap_trucks, sim_now=None):
    """
    Generate an optimized route for a gap crew vehicle.
    
    1. Takes escalated, uncollected reports
    2. Picks gap vehicle by proximity and capacity
    3. Selects stops within capacity
    4. Orders with priority-weighted nearest-neighbour + 2-opt
    5. Gets road geometry from OSRM (fallback to straight lines)
    6. Applies traffic multiplier
    
    Returns: dict with route details or error
    """
    if sim_now is None:
        sim_now = sim_clock.now()
    
    # Filter escalated, uncollected reports
    eligible = [r for r in reports if r.status == 'ESCALATED' and not r.is_historical]
    
    if not eligible:
        return {'error': 'No escalated reports to collect'}
    
    # Pick vehicle
    truck = select_gap_vehicle(gap_trucks)
    if not truck:
        return {'error': 'No available gap vehicle'}
    
    # Available capacity
    available_capacity = truck.capacity_kg - truck.current_load_kg
    
    # Select stops within capacity
    # Sort by priority first
    PRIORITY_ORDER = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
    eligible.sort(key=lambda r: PRIORITY_ORDER.get(r.priority, 2))
    
    selected = []
    total_waste = 0
    needs_depot_return = False
    
    for report in eligible:
        if total_waste + report.estimated_waste <= available_capacity:
            selected.append({
                'report_id': report.id,
                'lat': report.latitude,
                'lon': report.longitude,
                'priority': report.priority,
                'estimated_waste': report.estimated_waste,
                'category': report.category,
                'status': 'PENDING',
            })
            total_waste += report.estimated_waste
        else:
            # Vehicle would be over capacity
            if not selected:
                # Even the first report doesn't fit - needs depot unload
                needs_depot_return = True
                break
    
    if not selected:
        return {'error': 'No reports fit within vehicle capacity. Vehicle needs to unload at depot.'}
    
    # Order stops: start from truck location
    start = [truck.latitude, truck.longitude]
    ordered = nearest_neighbour_order(start, selected)
    ordered = two_opt_improve(ordered)
    
    # Add order numbers
    for i, stop in enumerate(ordered):
        stop['order'] = i + 1
    
    # Get route geometry — tries Mapbox → OSRM → haversine
    all_coords = [start] + [[s['lat'], s['lon']] for s in ordered] + [start]  # Return to depot
    geometry, total_distance, route_source = get_road_route(all_coords)
    
    # Traffic
    traffic_level, traffic_multiplier = get_traffic_level(sim_now)
    
    # Adjusted distance accounts for traffic delays
    adjusted_distance = total_distance * traffic_multiplier
    
    # Estimate time (assume 25 km/h average in city + 5 min per stop)
    base_speed_kmh = 25
    travel_time_min = (adjusted_distance / base_speed_kmh) * 60
    stop_time_min = len(ordered) * 5  # 5 minutes per stop
    total_time_min = travel_time_min + stop_time_min
    
    return {
        'truck_id': truck.id,
        'truck_name': truck.name,
        'stops': ordered,
        'geometry': geometry,
        'total_distance': round(total_distance, 2),
        'adjusted_distance': round(adjusted_distance, 2),
        'estimated_waste': round(total_waste, 1),
        'remaining_capacity': round(available_capacity - total_waste, 1),
        'traffic_level': traffic_level,
        'traffic_multiplier': traffic_multiplier,
        'estimated_time_min': round(total_time_min),
        'num_stops': len(ordered),
        'route_source': route_source,
        'needs_depot_return': needs_depot_return,
    }
