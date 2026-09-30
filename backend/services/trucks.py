"""Fixed route truck simulation and ETA calculation.

Simulates truck GPS movement along fixed routes based on the sim clock.
- Fixed trucks move along their route polyline according to simulation time.
- ETA function finds nearest point on route and estimates arrival.
- HOLD rule: if ETA <= 90 min, hold the report for the fixed truck.
- Hazardous/Medical waste is NEVER held.

POST /api/trucks/{id}/location accepts external GPS updates.
  -> This is the hook for a real GPS device (Raspberry Pi gateway, driver phone).
  -> In production, replace simulated positions with real GPS data.
"""
import json
import math
from datetime import datetime, timedelta
from services.sim_clock import sim_clock
from services.duplicates import haversine_distance

HOLD_THRESHOLD_MINUTES = 90  # Default hold threshold


def parse_time(time_str):
    """Parse 'HH:MM' to hour and minute."""
    parts = time_str.split(':')
    return int(parts[0]), int(parts[1])


def get_route_points(route):
    """Get the list of [lat, lon] waypoints for a route."""
    if isinstance(route.waypoints, str):
        return json.loads(route.waypoints)
    return route.waypoints


def interpolate_along_route(waypoints, progress):
    """
    Given a list of waypoints and a progress fraction (0.0 to 1.0),
    return the interpolated (lat, lon) position along the route.
    """
    if not waypoints or len(waypoints) < 2:
        return waypoints[0] if waypoints else [0, 0]
    
    # Calculate total route distance
    segments = []
    total_dist = 0
    for i in range(len(waypoints) - 1):
        d = haversine_distance(
            waypoints[i][0], waypoints[i][1],
            waypoints[i + 1][0], waypoints[i + 1][1]
        )
        segments.append(d)
        total_dist += d
    
    if total_dist == 0:
        return waypoints[0]
    
    target_dist = progress * total_dist
    accumulated = 0
    
    for i, seg_dist in enumerate(segments):
        if accumulated + seg_dist >= target_dist:
            # Interpolate within this segment
            remaining = target_dist - accumulated
            frac = remaining / seg_dist if seg_dist > 0 else 0
            lat = waypoints[i][0] + frac * (waypoints[i + 1][0] - waypoints[i][0])
            lon = waypoints[i][1] + frac * (waypoints[i + 1][1] - waypoints[i][1])
            return [lat, lon]
        accumulated += seg_dist
    
    return waypoints[-1]


def get_truck_progress(route, sim_now=None):
    """
    Calculate truck progress (0.0-1.0) along a fixed route based on sim clock.
    Returns None if outside the route's time window.
    """
    if sim_now is None:
        sim_now = sim_clock.now()
    
    start_h, start_m = parse_time(route.window_start)
    end_h, end_m = parse_time(route.window_end)
    
    window_start = sim_now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
    window_end = sim_now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
    
    if sim_now < window_start:
        return -1  # Not started yet, truck at depot
    
    if sim_now >= window_end:
        return 1.1  # Route completed
    
    elapsed = (sim_now - window_start).total_seconds()
    total = (window_end - window_start).total_seconds()
    
    return min(elapsed / total, 1.0)


def simulate_truck_position(route, sim_now=None):
    """Get the simulated position of a fixed truck based on time."""
    waypoints = get_route_points(route)
    progress = get_truck_progress(route, sim_now)
    
    if progress < 0:
        # Before route start: truck at first waypoint (depot)
        return waypoints[0] if waypoints else [0, 0]
    elif progress > 1.0:
        # After route end: truck at last waypoint
        return waypoints[-1] if waypoints else [0, 0]
    else:
        return interpolate_along_route(waypoints, progress)


def find_nearest_point_on_route(lat, lon, waypoints, max_distance=300):
    """
    Find the nearest point on a route to a given location.
    Returns (segment_index, fraction_along_segment, distance) or None.
    """
    best = None
    best_dist = float('inf')
    
    for i in range(len(waypoints) - 1):
        # Simple: check distance to each waypoint
        for j, wp in enumerate([waypoints[i], waypoints[i + 1]]):
            d = haversine_distance(lat, lon, wp[0], wp[1])
            if d < best_dist:
                best_dist = d
                best = (i, 0.0 if j == 0 else 1.0, d)
    
    if best and best_dist <= max_distance:
        return best
    return None


def calculate_eta(report_lat, report_lon, routes, sim_now=None):
    """
    Calculate ETA for the nearest fixed truck to reach a report location.
    
    Returns:
        dict with route_id, route_name, eta_minutes, truck_has_passed
        or None if no fixed route is near enough.
    """
    if sim_now is None:
        sim_now = sim_clock.now()
    
    best_result = None
    best_eta = float('inf')
    
    for route in routes:
        waypoints = get_route_points(route)
        nearest = find_nearest_point_on_route(report_lat, report_lon, waypoints)
        
        if nearest is None:
            continue
        
        seg_idx, seg_frac, distance = nearest
        
        # Calculate what fraction of the route this point is at
        total_segments = len(waypoints) - 1
        if total_segments == 0:
            continue
        point_progress = (seg_idx + seg_frac) / total_segments
        
        # Get truck's current progress
        truck_progress = get_truck_progress(route, sim_now)
        
        start_h, start_m = parse_time(route.window_start)
        end_h, end_m = parse_time(route.window_end)
        window_start = sim_now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
        window_end = sim_now.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
        window_duration = (window_end - window_start).total_seconds() / 60  # minutes
        
        if truck_progress < 0:
            # Truck hasn't started yet
            time_until_start = (window_start - sim_now).total_seconds() / 60
            eta = time_until_start + (point_progress * window_duration)
            has_passed = False
        elif truck_progress > 1.0:
            # Truck finished today, next pass is tomorrow
            next_start = window_start + timedelta(days=1)
            eta = (next_start - sim_now).total_seconds() / 60 + (point_progress * window_duration)
            has_passed = True
        elif truck_progress < point_progress:
            # Truck hasn't reached this point yet
            remaining_progress = point_progress - truck_progress
            eta = remaining_progress * window_duration
            has_passed = False
        else:
            # Truck already passed this point
            next_start = window_start + timedelta(days=1)
            eta = (next_start - sim_now).total_seconds() / 60 + (point_progress * window_duration)
            has_passed = True
        
        if eta < best_eta:
            best_eta = eta
            best_result = {
                'route_id': route.id,
                'route_name': route.name,
                'eta_minutes': round(eta),
                'truck_has_passed': has_passed,
                'distance_to_route': round(distance, 1),
            }
    
    return best_result


def should_hold_report(report_lat, report_lon, category, routes, sim_now=None):
    """
    Decide whether to HOLD a report for a fixed truck or ESCALATE it.
    
    Rules:
    - Medical/Hazardous waste is NEVER held (immediate escalation)
    - If a fixed truck is due within HOLD_THRESHOLD_MINUTES, HOLD
    - Otherwise, ESCALATE to gap crew
    
    Returns:
        (decision, eta_info)
        decision: 'HOLD' or 'ESCALATE'
        eta_info: dict with route info or None
    """
    # Medical/Hazardous ALWAYS escalates immediately
    if category == 'Medical/Hazardous':
        return 'ESCALATE', None
    
    eta_info = calculate_eta(report_lat, report_lon, routes, sim_now)
    
    if eta_info and not eta_info['truck_has_passed'] and eta_info['eta_minutes'] <= HOLD_THRESHOLD_MINUTES:
        return 'HOLD', eta_info
    
    return 'ESCALATE', eta_info
