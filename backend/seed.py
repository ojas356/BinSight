"""Seed data for BinSight demo.

Populates the database with realistic Mumbai-area data:
- 3 fixed routes (Andheri East, Kurla, Ghatkopar) with trucks
- 2 gap vehicles at different locations/capacities
- 25-30 current reports in 4 geographic clusters
- 30 days of historical collected reports for hotspot recurrence
- Sim clock starts at 08:30
"""
import json
import random
from datetime import datetime, timedelta
from database import db
from models import Report, Truck, FixedRoute, Hotspot, GapRoute

# Mumbai area coordinates for fixed routes
FIXED_ROUTES_DATA = [
    {
        'name': 'R1 — Andheri East',
        'waypoints': [
            [19.1196, 72.8464],  # Start: Andheri East station area
            [19.1220, 72.8520],  # Chakala
            [19.1250, 72.8580],  # Sakinaka junction
            [19.1180, 72.8620],  # MIDC
            [19.1140, 72.8550],  # Marol
            [19.1100, 72.8480],  # End near JB Nagar
        ],
        'window_start': '06:00',
        'window_end': '12:00',
    },
    {
        'name': 'R2 — Kurla West',
        'waypoints': [
            [19.0728, 72.8790],  # Start: Kurla station
            [19.0750, 72.8830],  # Kurla market
            [19.0780, 72.8870],  # Nehru Nagar
            [19.0810, 72.8910],  # BKC approach
            [19.0760, 72.8950],  # Near BKC
            [19.0720, 72.8900],  # Return towards Kurla
        ],
        'window_start': '06:30',
        'window_end': '11:30',
    },
    {
        'name': 'R3 — Ghatkopar',
        'waypoints': [
            [19.0860, 72.9080],  # Start: Ghatkopar station
            [19.0890, 72.9120],  # Pant Nagar
            [19.0920, 72.9160],  # LBS Marg
            [19.0950, 72.9200],  # Vidyavihar approach
            [19.0900, 72.9230],  # Ramabai colony
            [19.0870, 72.9170],  # Return
        ],
        'window_start': '07:00',
        'window_end': '12:30',
    },
]

# Gap vehicles
GAP_VEHICLES = [
    {
        'name': 'G1 — Light Van Alpha',
        'latitude': 19.1136,   # Near Sakinaka
        'longitude': 72.8697,
        'capacity_kg': 300,
        'current_load_kg': 80,
    },
    {
        'name': 'G2 — Light Van Beta',
        'latitude': 19.0800,   # Near Kurla
        'longitude': 72.8850,
        'capacity_kg': 200,
        'current_load_kg': 20,
    },
]

# Report clusters for demo
# Cluster 1: Near Sakinaka (will form hotspot, some near R1 for HOLD)
# Cluster 2: Near Kurla market (recurring hotspot area)
# Cluster 3: Far from routes (will ESCALATE)
# Cluster 4: Medical/hazardous (always ESCALATE)

CATEGORIES = ['Plastic', 'Paper', 'Glass', 'Metal', 'Organic', 'Mixed Waste',
              'Construction Waste', 'Medical/Hazardous']

DESCRIPTIONS = [
    'Pile of plastic bags and bottles near the drain',
    'Construction debris dumped on the sidewalk',
    'Overflowing community bin, attracting stray animals',
    'Food waste from restaurant dumped in open plot',
    'Broken glass and metal cans near playground',
    'Large garbage pile near bus stop',
    'Medical waste spotted near residential area',
    'Cardboard boxes and packaging material',
    'Mixed household waste on road corner',
    'Organic waste causing bad odor near school',
    'Plastic wrappers and cups along market lane',
    'Old furniture and electronic waste dumped',
    'Paper and cardboard blocking pedestrian path',
    'Vegetable waste from wholesale market',
    'Used tires and rubber waste near workshop',
]


def create_current_reports(sim_now):
    """Create 25-30 current reports in 4 clusters."""
    reports = []
    
    # Cluster 1: Near Sakinaka / R1 route (some will HOLD)
    cluster1 = [
        # Close to R1 route - should HOLD
        {'lat': 19.1245, 'lon': 72.8575, 'cat': 'Plastic', 'size': 'medium',
         'desc': 'Pile of plastic bags and bottles near the drain'},
        {'lat': 19.1235, 'lon': 72.8565, 'cat': 'Mixed Waste', 'size': 'large',
         'desc': 'Overflowing community bin, attracting stray animals'},
        # Slightly further - should still HOLD
        {'lat': 19.1260, 'lon': 72.8590, 'cat': 'Organic', 'size': 'medium',
         'desc': 'Food waste from restaurant dumped in open plot'},
        # Close together for duplicate detection
        {'lat': 19.1246, 'lon': 72.8576, 'cat': 'Plastic', 'size': 'small',
         'desc': 'Same plastic pile, different angle'},
        # Further from route
        {'lat': 19.1280, 'lon': 72.8610, 'cat': 'Paper', 'size': 'small',
         'desc': 'Cardboard boxes and packaging material'},
        {'lat': 19.1270, 'lon': 72.8600, 'cat': 'Mixed Waste', 'size': 'medium',
         'desc': 'Mixed household waste on road corner'},
        {'lat': 19.1275, 'lon': 72.8605, 'cat': 'Plastic', 'size': 'large',
         'desc': 'Large garbage pile near bus stop'},
    ]
    
    # Cluster 2: Kurla market area (recurring hotspot)
    cluster2 = [
        {'lat': 19.0745, 'lon': 72.8825, 'cat': 'Organic', 'size': 'large',
         'desc': 'Vegetable waste from wholesale market'},
        {'lat': 19.0750, 'lon': 72.8835, 'cat': 'Mixed Waste', 'size': 'large',
         'desc': 'Large garbage pile near bus stop'},
        {'lat': 19.0748, 'lon': 72.8828, 'cat': 'Organic', 'size': 'medium',
         'desc': 'Organic waste causing bad odor near school'},
        {'lat': 19.0755, 'lon': 72.8840, 'cat': 'Plastic', 'size': 'medium',
         'desc': 'Plastic wrappers and cups along market lane'},
        {'lat': 19.0752, 'lon': 72.8832, 'cat': 'Mixed Waste', 'size': 'medium',
         'desc': 'Mixed household waste on road corner'},
    ]
    
    # Cluster 3: Far from any route (all ESCALATE)
    cluster3 = [
        {'lat': 19.1050, 'lon': 72.8350, 'cat': 'Construction Waste', 'size': 'large',
         'desc': 'Construction debris dumped on the sidewalk'},
        {'lat': 19.1055, 'lon': 72.8360, 'cat': 'Construction Waste', 'size': 'large',
         'desc': 'Old furniture and electronic waste dumped'},
        {'lat': 19.1060, 'lon': 72.8355, 'cat': 'Metal', 'size': 'medium',
         'desc': 'Broken glass and metal cans near playground'},
        {'lat': 19.1045, 'lon': 72.8345, 'cat': 'Glass', 'size': 'small',
         'desc': 'Broken glass and metal cans near playground'},
        {'lat': 19.1065, 'lon': 72.8365, 'cat': 'Mixed Waste', 'size': 'medium',
         'desc': 'Large garbage pile near bus stop'},
    ]
    
    # Cluster 4: Scattered, including hazardous
    cluster4 = [
        {'lat': 19.0950, 'lon': 72.8750, 'cat': 'Medical/Hazardous', 'size': 'small',
         'desc': 'Medical waste spotted near residential area — syringes and bandages'},
        {'lat': 19.0880, 'lon': 72.8680, 'cat': 'Organic', 'size': 'medium',
         'desc': 'Food waste from restaurant dumped in open plot'},
        {'lat': 19.1000, 'lon': 72.8500, 'cat': 'Plastic', 'size': 'large',
         'desc': 'Pile of plastic bags and bottles near the drain'},
        {'lat': 19.0820, 'lon': 72.8980, 'cat': 'Paper', 'size': 'small',
         'desc': 'Paper and cardboard blocking pedestrian path'},
        {'lat': 19.0970, 'lon': 72.8550, 'cat': 'Mixed Waste', 'size': 'medium',
         'desc': 'Used tires and rubber waste near workshop'},
        {'lat': 19.1100, 'lon': 72.8420, 'cat': 'Organic', 'size': 'large',
         'desc': 'Overflowing community bin, attracting stray animals'},
        {'lat': 19.0900, 'lon': 72.9050, 'cat': 'Metal', 'size': 'medium',
         'desc': 'Broken glass and metal cans near playground'},
    ]
    
    all_clusters = cluster1 + cluster2 + cluster3 + cluster4
    
    from services.priority import estimate_waste, compute_priority
    
    for i, data in enumerate(all_clusters):
        est_waste = estimate_waste(data['size'], data['cat'])
        
        # Create report
        report = Report(
            latitude=data['lat'],
            longitude=data['lon'],
            timestamp=sim_now - timedelta(minutes=random.randint(5, 180)),
            category=data['cat'],
            confidence=round(random.uniform(0.65, 0.95), 2),
            description=data['desc'],
            size=data['size'],
            estimated_waste=est_waste,
            status='QUEUED',  # Will be updated by HOLD/ESCALATE logic
            is_historical=False,
        )
        reports.append(report)
    
    return reports


def create_historical_reports(days=30):
    """Create 30 days of historical collected reports for hotspot recurrence."""
    reports = []
    now = datetime.utcnow()
    
    # Recurring area 1: Near Kurla market
    for day in range(days):
        if random.random() < 0.5:  # ~15 reports in 30 days
            dt = now - timedelta(days=day, hours=random.randint(6, 18))
            report = Report(
                latitude=19.0748 + random.uniform(-0.001, 0.001),
                longitude=72.8830 + random.uniform(-0.001, 0.001),
                timestamp=dt,
                category=random.choice(['Organic', 'Mixed Waste', 'Plastic']),
                confidence=0.80,
                description='Historical: market waste accumulation',
                size=random.choice(['medium', 'large']),
                estimated_waste=random.uniform(5, 25),
                status='COLLECTED',
                is_historical=True,
                collected_at=dt + timedelta(hours=random.randint(1, 4)),
                collected_by='Fixed Route R2',
            )
            reports.append(report)
    
    # Recurring area 2: Near construction site (Cluster 3 area)
    for day in range(days):
        if random.random() < 0.35:  # ~10 reports in 30 days
            dt = now - timedelta(days=day, hours=random.randint(8, 20))
            report = Report(
                latitude=19.1055 + random.uniform(-0.0008, 0.0008),
                longitude=72.8355 + random.uniform(-0.0008, 0.0008),
                timestamp=dt,
                category=random.choice(['Construction Waste', 'Mixed Waste']),
                confidence=0.75,
                description='Historical: construction debris dumping',
                size=random.choice(['large', 'medium']),
                estimated_waste=random.uniform(15, 50),
                status='COLLECTED',
                is_historical=True,
                collected_at=dt + timedelta(hours=random.randint(2, 8)),
                collected_by='Gap Vehicle G1',
            )
            reports.append(report)
    
    # Scattered historical reports (not forming clusters)
    for _ in range(20):
        dt = now - timedelta(days=random.randint(1, 30), hours=random.randint(6, 22))
        report = Report(
            latitude=19.08 + random.uniform(-0.03, 0.04),
            longitude=72.85 + random.uniform(-0.02, 0.08),
            timestamp=dt,
            category=random.choice(CATEGORIES[:6]),
            confidence=0.70,
            description='Historical report',
            size=random.choice(['small', 'medium', 'large']),
            estimated_waste=random.uniform(2, 15),
            status='COLLECTED',
            is_historical=True,
            collected_at=dt + timedelta(hours=random.randint(1, 6)),
            collected_by=random.choice(['Fixed Route R1', 'Fixed Route R2', 'Fixed Route R3', 'Gap Vehicle G1']),
        )
        reports.append(report)
    
    return reports


def seed_database():
    """Seed the entire database for the demo."""
    from services.sim_clock import sim_clock
    from services.priority import compute_priority, estimate_waste
    from services.trucks import should_hold_report
    
    # Clear everything
    GapRoute.query.delete()
    Hotspot.query.delete()
    Report.query.delete()
    FixedRoute.query.delete()
    Truck.query.delete()
    db.session.commit()
    
    sim_now = sim_clock.now()
    
    # 1. Create fixed trucks
    fixed_trucks = []
    for i, route_data in enumerate(FIXED_ROUTES_DATA):
        truck = Truck(
            name=f"FT-{i+1} ({route_data['name'].split(' — ')[1]})",
            type='FIXED',
            latitude=route_data['waypoints'][0][0],
            longitude=route_data['waypoints'][0][1],
            capacity_kg=5000,
            current_load_kg=random.randint(200, 800),
            status='EN_ROUTE',
        )
        db.session.add(truck)
        fixed_trucks.append(truck)
    
    db.session.flush()  # Get IDs
    
    # 2. Create fixed routes
    fixed_routes = []
    for i, route_data in enumerate(FIXED_ROUTES_DATA):
        route = FixedRoute(
            name=route_data['name'],
            waypoints=json.dumps(route_data['waypoints']),
            geometry=None,  # Will be fetched from OSRM on first load
            window_start=route_data['window_start'],
            window_end=route_data['window_end'],
            truck_id=fixed_trucks[i].id,
        )
        db.session.add(route)
        fixed_routes.append(route)
    
    db.session.flush()
    
    # 3. Create gap vehicles
    for gap_data in GAP_VEHICLES:
        truck = Truck(
            name=gap_data['name'],
            type='GAP',
            latitude=gap_data['latitude'],
            longitude=gap_data['longitude'],
            capacity_kg=gap_data['capacity_kg'],
            current_load_kg=gap_data['current_load_kg'],
            status='IDLE',
        )
        db.session.add(truck)
    
    db.session.flush()
    
    # 4. Create historical reports (for hotspot recurrence)
    historical = create_historical_reports()
    for r in historical:
        db.session.add(r)
    
    db.session.flush()
    
    # 5. Create current reports with HOLD/ESCALATE decisions
    current_reports = create_current_reports(sim_now)
    
    for report in current_reports:
        db.session.add(report)
    
    db.session.flush()
    
    # 6. Apply HOLD/ESCALATE logic to current reports
    for report in current_reports:
        decision, eta_info = should_hold_report(
            report.latitude, report.longitude, report.category,
            fixed_routes, sim_now
        )
        
        if decision == 'HOLD' and eta_info:
            report.status = 'HELD'
            report.held_by_route_id = eta_info['route_id']
            report.eta_minutes = eta_info['eta_minutes']
        else:
            report.status = 'ESCALATED'
            if eta_info:
                report.eta_minutes = eta_info['eta_minutes']
        
        # Compute priority
        priority_result = compute_priority(report, sim_now=sim_now)
        report.priority = priority_result['priority']
        report.priority_score = priority_result['score']
        report.priority_breakdown = json.dumps(priority_result['breakdown'])
    
    # 7. Mark some duplicates
    # Reports at nearly the same location in cluster 1
    if len(current_reports) >= 4:
        current_reports[0].duplicate_group_id = 1
        current_reports[3].duplicate_group_id = 1  # Same plastic pile
    
    db.session.commit()
    
    # 8. Run hotspot analysis
    run_initial_hotspot_analysis()
    
    # Reset sim clock
    sim_clock.reset()
    
    return {
        'fixed_routes': len(fixed_routes),
        'fixed_trucks': len(fixed_trucks),
        'gap_vehicles': len(GAP_VEHICLES),
        'current_reports': len(current_reports),
        'historical_reports': len(historical),
    }


def run_initial_hotspot_analysis():
    """Run DBSCAN hotspot analysis on current reports."""
    from services.hotspots import run_dbscan, check_recurrence, recommend_intervention
    
    # Get non-historical, non-collected reports
    active_reports = Report.query.filter(
        Report.is_historical == False,
        Report.status != 'COLLECTED'
    ).all()
    
    historical_reports = Report.query.filter(Report.is_historical == True).all()
    
    # Clear existing hotspots
    Hotspot.query.delete()
    
    # Run DBSCAN
    clusters = run_dbscan(active_reports)
    
    for cluster_data in clusters:
        # Check recurrence
        is_recurring, rec_count, rec_desc = check_recurrence(
            cluster_data['center_lat'],
            cluster_data['center_lon'],
            historical_reports
        )
        
        # Get intervention recommendation
        intervention = recommend_intervention(cluster_data)
        
        hotspot = Hotspot(
            latitude=cluster_data['center_lat'],
            longitude=cluster_data['center_lon'],
            report_count=cluster_data['report_count'],
            estimated_waste=cluster_data['estimated_waste'],
            priority='HIGH' if is_recurring else 'MEDIUM',
            recurring=is_recurring,
            recurrence_count=rec_count,
            recommendation=json.dumps({
                'recurrence_description': rec_desc,
                'intervention': intervention,
                'categories': cluster_data['categories'],
                'dominant_category': cluster_data['dominant_category'],
            }),
        )
        db.session.add(hotspot)
        
        # Link reports to hotspot
        for report_id in cluster_data['report_ids']:
            report = Report.query.get(report_id)
            if report:
                report.hotspot_id = hotspot.id
    
    db.session.commit()
