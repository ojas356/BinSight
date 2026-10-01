"""BinSight — Smart On-Demand Waste Collection
Flask REST API backend.

All truck GPS simulation is based on the sim clock.
POST /api/trucks/{id}/location accepts external GPS updates —
  this is the hook for a real GPS device (Raspberry Pi, driver phone).
Fixed routes are READ-ONLY. No endpoint modifies them.
"""
import os
import json
import numpy as np
from datetime import datetime, timedelta
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory
from flask.json.provider import DefaultJSONProvider

# Load .env before anything else so all services pick up the keys
load_dotenv()

class NumpySafeJSONProvider(DefaultJSONProvider):
    """JSON provider that handles numpy scalars so jsonify never crashes."""
    def default(self, o):
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        return super().default(o)
from flask_cors import CORS
from database import db, init_db
from models import Report, Truck, FixedRoute, Hotspot, GapRoute
from services.sim_clock import sim_clock
from services.priority import compute_priority, estimate_waste
from services.duplicates import find_duplicate, haversine_distance
from services.trucks import (
    should_hold_report, simulate_truck_position,
    get_truck_progress, get_route_points
)
from services.hotspots import run_dbscan, check_recurrence, recommend_intervention
from services.routing import generate_gap_route, get_traffic_level

app = Flask(__name__)
app.json_provider_class = NumpySafeJSONProvider
app.json = NumpySafeJSONProvider(app)
CORS(app)

# Upload directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

init_db(app)


# ============================================================
# HEALTH
# ============================================================

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'name': 'BinSight API', 'sim_time': sim_clock.to_dict()})


# ============================================================
# SIMULATION CLOCK
# ============================================================

@app.route('/api/sim/clock', methods=['GET'])
def get_clock():
    return jsonify(sim_clock.to_dict())


@app.route('/api/sim/clock', methods=['POST'])
def set_clock():
    data = request.json
    if 'speed' in data:
        sim_clock.set_speed(float(data['speed']))
    if 'jump_to_hour' in data:
        sim_clock.jump_to(int(data['jump_to_hour']), int(data.get('jump_to_minute', 0)))
    if 'pause' in data:
        if data['pause']:
            sim_clock.pause()
        else:
            sim_clock.resume()
    if 'reset' in data and data['reset']:
        sim_clock.reset()
    return jsonify(sim_clock.to_dict())


# ============================================================
# REPORTS
# ============================================================

@app.route('/api/reports', methods=['GET'])
def get_reports():
    """Get all reports, optionally filtered."""
    status = request.args.get('status')
    include_historical = request.args.get('include_historical', 'false') == 'true'
    
    query = Report.query
    if not include_historical:
        query = query.filter(Report.is_historical == False)
    if status:
        query = query.filter(Report.status == status)
    
    reports = query.order_by(Report.timestamp.desc()).all()
    return jsonify([r.to_dict() for r in reports])


@app.route('/api/reports/<int:report_id>', methods=['GET'])
def get_report(report_id):
    report = Report.query.get_or_404(report_id)
    return jsonify(report.to_dict())


@app.route('/api/reports', methods=['POST'])
def create_report():
    """
    Create a new citizen waste report.
    
    Pipeline:
    1. Classify image (AI or fallback)
    2. Check for duplicates
    3. Compute HOLD vs ESCALATE
    4. Compute priority
    5. Return outcome to citizen
    """
    # Handle both JSON and form data (for image upload)
    if request.content_type and 'multipart/form-data' in request.content_type:
        data = request.form.to_dict()
        image_file = request.files.get('image')
        if image_file and image_file.filename:
            filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{image_file.filename}"
            filepath = os.path.join(UPLOAD_DIR, filename)
            image_file.save(filepath)
            data['image'] = filename
    else:
        data = request.json or {}
        image_file = None
    
    lat = float(data.get('latitude', 0))
    lon = float(data.get('longitude', 0))
    
    if lat == 0 or lon == 0:
        return jsonify({'error': 'Latitude and longitude are required'}), 400
    
    sim_now = sim_clock.now()
    
    # Category and size come entirely from the user submission
    category = data.get('category') or 'Mixed Waste'
    size = data.get('size') or 'medium'
    
    # 1. Create the report
    est_waste = estimate_waste(size, category)
    
    report = Report(
        image=data.get('image'),
        latitude=lat,
        longitude=lon,
        timestamp=sim_now,
        category=category,
        confidence=1.0,
        description=data.get('description', ''),
        size=size,
        estimated_waste=est_waste,
        status='QUEUED',
        is_historical=False,
    )
    db.session.add(report)
    db.session.flush()
    
    # 3. Duplicate detection
    existing_reports = Report.query.filter(
        Report.is_historical == False,
        Report.status != 'COLLECTED'
    ).all()
    
    dup_report, dup_distance, dup_time_diff = find_duplicate(
        {'latitude': lat, 'longitude': lon, 'category': category, 'timestamp': sim_now},
        [r for r in existing_reports if r.id != report.id],
        sim_now
    )
    
    duplicate_info = None
    if dup_report:
        report.duplicate_group_id = dup_report.duplicate_group_id or dup_report.id
        if not dup_report.duplicate_group_id:
            dup_report.duplicate_group_id = dup_report.id
        duplicate_info = {
            'is_duplicate': True,
            'existing_report_id': dup_report.id,
            'distance_meters': dup_distance,
            'time_diff_hours': dup_time_diff,
            'existing_category': dup_report.category,
        }
    
    # 4. HOLD vs ESCALATE
    fixed_routes = FixedRoute.query.all()
    decision, eta_info = should_hold_report(lat, lon, category, fixed_routes, sim_now)
    
    if duplicate_info:
        # Duplicate: don't create a separate dispatch
        report.status = 'ESCALATED'  # But grouped
        outcome = 'DUPLICATE'
    elif decision == 'HOLD' and eta_info:
        report.status = 'HELD'
        report.held_by_route_id = eta_info['route_id']
        report.eta_minutes = eta_info['eta_minutes']
        outcome = 'HELD'
    else:
        report.status = 'ESCALATED'
        if eta_info:
            report.eta_minutes = eta_info.get('eta_minutes')
        outcome = 'ESCALATED'
    
    # 5. Priority
    dup_count = 1
    if report.duplicate_group_id:
        dup_count = Report.query.filter(
            Report.duplicate_group_id == report.duplicate_group_id
        ).count()
    
    priority_result = compute_priority(report, duplicate_count=dup_count, sim_now=sim_now)
    report.priority = priority_result['priority']
    report.priority_score = priority_result['score']
    report.priority_breakdown = json.dumps(priority_result['breakdown'])
    
    db.session.commit()
    
    # Build response
    response = {
        'report': report.to_dict(),
        'outcome': outcome,
    }
    
    if outcome == 'HELD':
        route = FixedRoute.query.get(eta_info['route_id'])
        response['hold_info'] = {
            'message': f"A collection truck ({route.name}) is due near you in about {eta_info['eta_minutes']} minutes. Please keep the waste at this spot.",
            'route_name': route.name,
            'eta_minutes': eta_info['eta_minutes'],
        }
    elif outcome == 'ESCALATED':
        # Estimate response time (2-4 hours for normal, <1 hour for critical)
        if report.priority == 'CRITICAL':
            est_hours = 1
        elif report.priority == 'HIGH':
            est_hours = 2
        else:
            est_hours = 3
        response['escalate_info'] = {
            'message': f"Sent to the on-call clearing crew. Estimated response: {est_hours} hour{'s' if est_hours > 1 else ''}.",
            'estimated_hours': est_hours,
        }
    elif outcome == 'DUPLICATE':
        response['duplicate_info'] = duplicate_info
        response['duplicate_info']['message'] = (
            f"Possible duplicate report: an existing report (#{dup_report.id}) is "
            f"{dup_distance}m away, reported {dup_time_diff:.1f} hours ago."
        )
    
    return jsonify(response), 201


# ============================================================
# TRUCKS
# ============================================================

@app.route('/api/trucks', methods=['GET'])
def get_trucks():
    """Get all trucks with simulated positions for fixed trucks."""
    trucks = Truck.query.all()
    sim_now = sim_clock.now()
    result = []
    
    for truck in trucks:
        data = truck.to_dict()
        
        if truck.type == 'FIXED':
            # Simulate position along route
            route = FixedRoute.query.filter_by(truck_id=truck.id).first()
            if route:
                pos = simulate_truck_position(route, sim_now)
                data['latitude'] = pos[0]
                data['longitude'] = pos[1]
                progress = get_truck_progress(route, sim_now)
                data['progress'] = round(max(0, min(1, progress)), 2) if progress >= 0 else 0
                data['route_name'] = route.name
                if progress < 0:
                    data['status'] = 'AT_DEPOT'
                elif progress > 1.0:
                    data['status'] = 'COMPLETED'
                else:
                    data['status'] = 'EN_ROUTE'
        
        result.append(data)
    
    return jsonify(result)


@app.route('/api/trucks/<int:truck_id>/location', methods=['POST'])
def update_truck_location(truck_id):
    """
    Accept external GPS updates for a truck.
    
    THIS IS THE HOOK FOR REAL GPS DEVICES:
    - A Raspberry Pi gateway on the truck can POST here
    - A driver's phone app can POST here
    - Any IoT GPS tracker can POST here
    
    In this demo, fixed trucks use simulated positions.
    In production, this endpoint replaces the simulation.
    """
    truck = Truck.query.get_or_404(truck_id)
    data = request.json
    
    truck.latitude = float(data['latitude'])
    truck.longitude = float(data['longitude'])
    if 'current_load_kg' in data:
        truck.current_load_kg = float(data['current_load_kg'])
    if 'status' in data:
        truck.status = data['status']
    
    db.session.commit()
    
    # Check if truck is near any HELD reports (geofence verification)
    if truck.type == 'FIXED':
        _check_held_reports_geofence(truck)
    
    return jsonify(truck.to_dict())


def _check_held_reports_geofence(truck):
    """Auto-collect HELD reports when a fixed truck passes within 40m."""
    held_reports = Report.query.filter_by(status='HELD').all()
    sim_now = sim_clock.now()
    
    for report in held_reports:
        dist = haversine_distance(truck.latitude, truck.longitude,
                                   report.latitude, report.longitude)
        if dist <= 40:  # 40 meter geofence
            report.status = 'COLLECTED'
            report.collected_at = sim_now
            route = FixedRoute.query.filter_by(truck_id=truck.id).first()
            report.collected_by = f"Fixed Route {route.name}" if route else f"Truck {truck.name}"
    
    db.session.commit()


# ============================================================
# FIXED ROUTES (READ-ONLY — no write endpoints exist)
# ============================================================

@app.route('/api/fixed-routes', methods=['GET'])
def get_fixed_routes():
    """Get all fixed routes. These are READ-ONLY and never modified."""
    routes = FixedRoute.query.all()
    return jsonify([r.to_dict() for r in routes])


# ============================================================
# HOTSPOTS
# ============================================================

@app.route('/api/hotspots', methods=['GET'])
def get_hotspots():
    hotspots = Hotspot.query.all()
    result = []
    for h in hotspots:
        data = h.to_dict()
        if h.recommendation:
            data['recommendation'] = json.loads(h.recommendation)
        result.append(data)
    return jsonify(result)


@app.route('/api/hotspots/analyze', methods=['POST'])
def analyze_hotspots():
    """Re-run DBSCAN hotspot analysis on current reports."""
    from seed import run_initial_hotspot_analysis
    run_initial_hotspot_analysis()
    hotspots = Hotspot.query.all()
    result = []
    for h in hotspots:
        data = h.to_dict()
        if h.recommendation:
            data['recommendation'] = json.loads(h.recommendation)
        result.append(data)
    return jsonify({
        'hotspots': result,
        'count': len(result),
    })


# ============================================================
# GAP ROUTES
# ============================================================

@app.route('/api/routes', methods=['GET'])
def get_routes():
    routes = GapRoute.query.order_by(GapRoute.created_at.desc()).all()
    return jsonify([r.to_dict() for r in routes])


@app.route('/api/routes/generate', methods=['POST'])
def generate_route():
    """Generate an optimized gap crew collection route."""
    try:
        reports = Report.query.filter(
            Report.is_historical == False,
            Report.status == 'ESCALATED'
        ).all()
        
        gap_trucks = Truck.query.filter_by(type='GAP').all()
        
        result = generate_gap_route(reports, gap_trucks, sim_clock.now())
        
        if 'error' in result:
            return jsonify(result), 400
        
        # Save route to database
        gap_route = GapRoute(
            truck_id=result['truck_id'],
            stops=json.dumps(result['stops']),
            geometry=json.dumps(result['geometry']),
            total_distance=result['total_distance'],
            estimated_waste=result['estimated_waste'],
            traffic_level=result['traffic_level'],
            traffic_multiplier=result['traffic_multiplier'],
            status='PLANNED',
        )
        db.session.add(gap_route)
        db.session.commit()
        
        result['route_id'] = gap_route.id
        return jsonify(result), 201
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


@app.route('/api/routes/<int:route_id>/start', methods=['POST'])
def start_collection(route_id):
    """Start simulated collection along a gap route."""
    gap_route = GapRoute.query.get_or_404(route_id)
    gap_route.status = 'IN_PROGRESS'
    
    truck = Truck.query.get(gap_route.truck_id)
    if truck:
        truck.status = 'EN_ROUTE'
    
    db.session.commit()
    
    return jsonify({
        'status': 'IN_PROGRESS',
        'route': gap_route.to_dict(),
        'message': 'Collection started. Vehicle is moving to first stop.',
    })


@app.route('/api/routes/<int:route_id>/collect-stop', methods=['POST'])
def collect_stop(route_id):
    """
    Mark a stop as collected (geofence verified).
    Called when the gap vehicle comes within 40m of a stop.
    """
    gap_route = GapRoute.query.get_or_404(route_id)
    data = request.json
    stop_order = data.get('stop_order', 1)
    
    stops = json.loads(gap_route.stops)
    sim_now = sim_clock.now()
    
    for stop in stops:
        if stop['order'] == stop_order:
            stop['status'] = 'COLLECTED'
            # Update the report
            report = Report.query.get(stop['report_id'])
            if report:
                report.status = 'COLLECTED'
                report.collected_at = sim_now
                report.collected_by = f"Gap Vehicle (geofence verified)"
            
            # Update truck load
            truck = Truck.query.get(gap_route.truck_id)
            if truck:
                truck.current_load_kg += stop.get('estimated_waste', 0)
                truck.latitude = stop['lat']
                truck.longitude = stop['lon']
    
    gap_route.stops = json.dumps(stops)
    
    # Check if all stops collected
    all_collected = all(s['status'] == 'COLLECTED' for s in stops)
    if all_collected:
        gap_route.status = 'COMPLETED'
        truck = Truck.query.get(gap_route.truck_id)
        if truck:
            truck.status = 'IDLE'
    
    db.session.commit()
    
    return jsonify({
        'stops': stops,
        'route_status': gap_route.status,
        'message': f"Stop {stop_order} collected and verified by GPS geofence.",
    })


# ============================================================
# STATS
# ============================================================

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Dashboard statistics."""
    sim_now = sim_clock.now()
    
    total = Report.query.filter_by(is_historical=False).count()
    held = Report.query.filter_by(status='HELD', is_historical=False).count()
    escalated = Report.query.filter_by(status='ESCALATED', is_historical=False).count()
    collected = Report.query.filter_by(status='COLLECTED', is_historical=False).count()
    
    high_priority = Report.query.filter(
        Report.is_historical == False,
        Report.priority.in_(['HIGH', 'CRITICAL'])
    ).count()
    
    active_hotspots = Hotspot.query.filter_by(status='ACTIVE').count()
    
    gap_vehicles = Truck.query.filter_by(type='GAP').all()
    available_gap = sum(1 for t in gap_vehicles if t.status == 'IDLE')
    
    # Impact metrics
    trips_avoided = held  # Each held report = 1 gap trip avoided
    
    # Gap crew km vs dedicated trip baseline
    gap_routes = GapRoute.query.filter(GapRoute.status.in_(['COMPLETED', 'IN_PROGRESS'])).all()
    gap_km = sum(r.total_distance for r in gap_routes)
    
    # Baseline: each escalated report would need a dedicated round trip (~5 km each)
    baseline_km = (escalated + collected) * 5.0
    km_saved = max(0, baseline_km - gap_km)
    pct_saved = round((km_saved / baseline_km * 100) if baseline_km > 0 else 0, 1)
    
    # Average time to clear
    collected_reports = Report.query.filter(
        Report.is_historical == False,
        Report.status == 'COLLECTED',
        Report.collected_at != None
    ).all()
    
    if collected_reports:
        avg_clear_hours = sum(
            (r.collected_at - r.timestamp).total_seconds() / 3600
            for r in collected_reports
        ) / len(collected_reports)
    else:
        avg_clear_hours = 0
    
    traffic_level, traffic_mult = get_traffic_level(sim_now)
    
    return jsonify({
        'total_reports': total,
        'held': held,
        'escalated': escalated,
        'collected': collected,
        'high_priority': high_priority,
        'active_hotspots': active_hotspots,
        'available_gap_vehicles': available_gap,
        'total_gap_vehicles': len(gap_vehicles),
        'impact': {
            'trips_avoided': trips_avoided,
            'gap_km': round(gap_km, 1),
            'baseline_km': round(baseline_km, 1),
            'km_saved': round(km_saved, 1),
            'pct_saved': pct_saved,
            'avg_clear_hours': round(avg_clear_hours, 1),
        },
        'traffic': {
            'level': traffic_level,
            'multiplier': traffic_mult,
        },
        'sim_time': sim_clock.to_dict(),
    })


# ============================================================
# SEED / RESET
# ============================================================

@app.route('/api/seed/reset', methods=['POST'])
def reset_seed():
    """Reset all demo data."""
    from seed import seed_database
    result = seed_database()
    return jsonify({'message': 'Demo data reset successfully', **result})


# ============================================================
# TICK — update simulated truck positions and auto-collect
# ============================================================

@app.route('/api/sim/tick', methods=['POST'])
def sim_tick():
    """
    Advance simulation: update truck positions and check geofences.
    Called periodically by the frontend.
    """
    sim_now = sim_clock.now()
    fixed_routes = FixedRoute.query.all()
    
    for route in fixed_routes:
        truck = Truck.query.get(route.truck_id)
        if truck:
            pos = simulate_truck_position(route, sim_now)
            truck.latitude = pos[0]
            truck.longitude = pos[1]
            progress = get_truck_progress(route, sim_now)
            if progress < 0:
                truck.status = 'AT_DEPOT'
            elif progress > 1.0:
                truck.status = 'COMPLETED'
            else:
                truck.status = 'EN_ROUTE'
            
            # Check geofence for held reports
            _check_held_reports_geofence(truck)
    
    # Also check gap vehicle geofences for active gap routes
    active_gap_routes = GapRoute.query.filter_by(status='IN_PROGRESS').all()
    for gap_route in active_gap_routes:
        truck = Truck.query.get(gap_route.truck_id)
        if truck:
            stops = json.loads(gap_route.stops)
            for stop in stops:
                if stop['status'] == 'PENDING':
                    dist = haversine_distance(
                        truck.latitude, truck.longitude,
                        stop['lat'], stop['lon']
                    )
                    if dist <= 40:  # 40m geofence
                        stop['status'] = 'COLLECTED'
                        report = Report.query.get(stop['report_id'])
                        if report:
                            report.status = 'COLLECTED'
                            report.collected_at = sim_now
                            report.collected_by = f"Gap Vehicle (geofence verified)"
                        truck.current_load_kg += stop.get('estimated_waste', 0)
            
            gap_route.stops = json.dumps(stops)
            if all(s['status'] == 'COLLECTED' for s in stops):
                gap_route.status = 'COMPLETED'
                truck.status = 'IDLE'
    
    db.session.commit()
    
    return jsonify({'time': sim_clock.to_dict()})


# ============================================================
# SERVE UPLOADED IMAGES
# ============================================================

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    with app.app_context():
        # Seed on first run if database is empty
        if Truck.query.count() == 0:
            from seed import seed_database
            print("Seeding demo data...")
            seed_database()
            print("Demo data seeded!")
    
    app.run(debug=True, port=5000, use_reloader=False)
