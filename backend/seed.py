"""Seed data for BinSight demo.

Mumbai-area demo data designed to produce clear, visible results:

CURRENT REPORTS — 5 tight geographic clusters:
  C1  Andheri East / Sakinaka      ~8 reports  (near R1 → some HELD)
  C2  Kurla Market                 ~9 reports  (near R2 → some HELD, recurring hotspot)
  C3  Ghatkopar LBS Marg           ~7 reports  (near R3 → some HELD)
  C4  Dharavi / Sion               ~8 reports  (far from routes → all ESCALATE, hazardous mix)
  C5  Bandra Kurla Complex         ~7 reports  (construction + mixed, all ESCALATE)

HISTORICAL REPORTS — 45 days of data that makes C1, C2, C4 show as RECURRING hotspots.

Fixed routes: R1 Andheri East, R2 Kurla West, R3 Ghatkopar
Gap vehicles: G1 near Sakinaka, G2 near Kurla
Sim clock resets to 08:30 on seed.
"""
import json
import random
from datetime import datetime, timedelta
from database import db
from models import Report, Truck, FixedRoute, Hotspot, GapRoute

random.seed(42)   # deterministic for consistent demos

# ── Fixed routes ──────────────────────────────────────────────
FIXED_ROUTES_DATA = [
    {
        'name': 'R1 — Andheri East',
        'waypoints': [
            [19.1196, 72.8464],
            [19.1220, 72.8520],
            [19.1250, 72.8580],
            [19.1180, 72.8620],
            [19.1140, 72.8550],
            [19.1100, 72.8480],
        ],
        'window_start': '06:00',
        'window_end': '12:00',
    },
    {
        'name': 'R2 — Kurla West',
        'waypoints': [
            [19.0728, 72.8790],
            [19.0750, 72.8830],
            [19.0780, 72.8870],
            [19.0810, 72.8910],
            [19.0760, 72.8950],
            [19.0720, 72.8900],
        ],
        'window_start': '06:30',
        'window_end': '11:30',
    },
    {
        'name': 'R3 — Ghatkopar',
        'waypoints': [
            [19.0860, 72.9080],
            [19.0890, 72.9120],
            [19.0920, 72.9160],
            [19.0950, 72.9200],
            [19.0900, 72.9230],
            [19.0870, 72.9170],
        ],
        'window_start': '07:00',
        'window_end': '12:30',
    },
]

GAP_VEHICLES = [
    {
        'name': 'G1 — Light Van Alpha',
        'latitude': 19.1136,
        'longitude': 72.8697,
        'capacity_kg': 300,
        'current_load_kg': 0,
    },
    {
        'name': 'G2 — Light Van Beta',
        'latitude': 19.0800,
        'longitude': 72.8850,
        'capacity_kg': 250,
        'current_load_kg': 0,
    },
]

CATEGORIES = [
    'Plastic', 'Paper', 'Glass', 'Metal', 'Organic',
    'Mixed Waste', 'Construction Waste', 'Medical/Hazardous',
]


# ── Cluster definitions ───────────────────────────────────────
# Each entry: (center_lat, center_lon, spread_m, n_reports, dominant_cat, extra_cats)
# spread_m: random jitter radius in degrees (~0.0001 ≈ 11 m)

def _jitter(center, spread=0.0006):
    """Return center ± spread (uniform)."""
    return center + random.uniform(-spread, spread)


CLUSTER_SPECS = [
    # C1 — Andheri East / Sakinaka  (close to R1, mostly HELD)
    {
        'id': 'C1', 'name': 'Andheri East / Sakinaka',
        'lat': 19.1248, 'lon': 72.8578,
        'spread': 0.0005,
        'reports': [
            ('Plastic',           'large',  'Pile of plastic bags blocking storm drain'),
            ('Mixed Waste',       'large',  'Overflowing community bin, stray animals present'),
            ('Organic',           'medium', 'Restaurant food waste dumped in open plot'),
            ('Plastic',           'small',  'Plastic wrappers scattered along footpath'),
            ('Mixed Waste',       'medium', 'Household garbage dumped on road corner'),
            ('Paper',             'medium', 'Cardboard boxes and packaging waste'),
            ('Plastic',           'large',  'Large plastic dump near bus stop'),
            ('Glass',             'small',  'Broken bottles near residential gate'),
        ],
    },
    # C2 — Kurla Market  (close to R2, recurring, HELD + ESCALATED)
    {
        'id': 'C2', 'name': 'Kurla Market',
        'lat': 19.0748, 'lon': 72.8830,
        'spread': 0.0005,
        'reports': [
            ('Organic',     'large',  'Vegetable waste from wholesale market, severe odour'),
            ('Mixed Waste', 'large',  'Market overflow waste piled on footpath'),
            ('Organic',     'medium', 'Rotting food waste attracting pests near school'),
            ('Plastic',     'medium', 'Plastic wrappers and cups along market lane'),
            ('Mixed Waste', 'large',  'Daily garbage pile not cleared since yesterday'),
            ('Organic',     'large',  'Fruit and vegetable peels in drainage area'),
            ('Paper',       'small',  'Paper bags and packaging from market stalls'),
            ('Metal',       'small',  'Discarded metal cans near food stalls'),
            ('Mixed Waste', 'medium', 'Mixed waste from street food vendors'),
        ],
    },
    # C3 — Ghatkopar LBS Marg  (close to R3, mostly HELD)
    {
        'id': 'C3', 'name': 'Ghatkopar LBS Marg',
        'lat': 19.0895, 'lon': 72.9125,
        'spread': 0.0006,
        'reports': [
            ('Mixed Waste',       'large',  'Large garbage pile near LBS Marg bus stop'),
            ('Plastic',           'medium', 'Plastic bags tangled in roadside shrubs'),
            ('Organic',           'medium', 'Food waste from nearby canteen'),
            ('Construction Waste','large',  'Rubble and debris from road repair work'),
            ('Mixed Waste',       'medium', 'Household waste dumped on open plot'),
            ('Paper',             'small',  'Newspaper and packaging waste near temple'),
            ('Plastic',           'large',  'Plastic containers and bottles in drain'),
        ],
    },
    # C4 — Dharavi / Sion  (far from all routes → all ESCALATED, hazardous mix)
    {
        'id': 'C4', 'name': 'Dharavi / Sion',
        'lat': 19.0420, 'lon': 72.8550,
        'spread': 0.0007,
        'reports': [
            ('Medical/Hazardous', 'small',  'Syringes and medical waste near residential building'),
            ('Medical/Hazardous', 'medium', 'Hospital waste dumped in open nullah — urgent'),
            ('Mixed Waste',       'large',  'Large uncleared dump near slum boundary'),
            ('Plastic',           'large',  'Plastic waste clogging open drain, flood risk'),
            ('Organic',           'large',  'Rotting waste causing disease risk near school'),
            ('Construction Waste','large',  'Demolition debris blocking access road'),
            ('Metal',             'medium', 'Scrap metal and old tyres on footpath'),
            ('Mixed Waste',       'medium', 'Unmanaged dump near water pipe junction'),
        ],
    },
    # C5 — Bandra Kurla Complex  (construction zone, far from routes → all ESCALATED)
    {
        'id': 'C5', 'name': 'Bandra Kurla Complex',
        'lat': 19.0650, 'lon': 72.8680,
        'spread': 0.0006,
        'reports': [
            ('Construction Waste','large',  'Construction rubble piled outside BKC office block'),
            ('Construction Waste','large',  'Cement bags and rods dumped after night shift'),
            ('Mixed Waste',       'large',  'Canteen waste from construction workers'),
            ('Plastic',           'medium', 'Plastic sheeting and wrapping from new building'),
            ('Metal',             'medium', 'Metal shavings and pipe offcuts on pavement'),
            ('Construction Waste','medium', 'Sand and gravel spill on service road'),
            ('Mixed Waste',       'small',  'Scattered waste near security checkpoint'),
        ],
    },
]

# ── Historical recurrence specs ───────────────────────────────
# (center_lat, center_lon, spread, days, prob_per_day, dominant_cats, collected_by)
HISTORICAL_SPECS = [
    # C1 area — moderate recurrence
    (19.1248, 72.8578, 0.0008, 45, 0.55,
     ['Plastic', 'Mixed Waste', 'Organic'], 'Fixed Route R1'),
    # C2 area — high recurrence (daily market waste)
    (19.0748, 72.8830, 0.0007, 45, 0.80,
     ['Organic', 'Mixed Waste', 'Plastic'], 'Fixed Route R2'),
    # C4 area — moderate-high recurrence (persistent hazardous dump)
    (19.0420, 72.8550, 0.0009, 45, 0.50,
     ['Medical/Hazardous', 'Mixed Waste', 'Construction Waste'], 'Gap Vehicle G1'),
    # Scattered background noise (won't cluster)
    (19.0900, 72.8800, 0.0200, 45, 0.25,
     ['Mixed Waste', 'Plastic', 'Organic'], 'Fixed Route R3'),
]


def _make_historical():
    reports = []
    now = datetime.utcnow()

    for (clat, clon, spread, days, prob, cats, collected_by) in HISTORICAL_SPECS:
        for day in range(1, days + 1):
            if random.random() < prob:
                dt = now - timedelta(days=day, hours=random.randint(6, 20),
                                     minutes=random.randint(0, 59))
                size = random.choice(['small', 'medium', 'medium', 'large'])
                waste = {'small': random.uniform(2, 8),
                         'medium': random.uniform(8, 20),
                         'large': random.uniform(20, 60)}[size]
                r = Report(
                    latitude=_jitter(clat, spread),
                    longitude=_jitter(clon, spread),
                    timestamp=dt,
                    category=random.choice(cats),
                    confidence=round(random.uniform(0.70, 0.95), 2),
                    description='Historical report',
                    size=size,
                    estimated_waste=round(waste, 1),
                    status='COLLECTED',
                    is_historical=True,
                    collected_at=dt + timedelta(hours=random.randint(1, 6)),
                    collected_by=collected_by,
                )
                reports.append(r)
    return reports


def _make_current(sim_now):
    from services.priority import estimate_waste
    reports = []
    for spec in CLUSTER_SPECS:
        clat, clon, spread = spec['lat'], spec['lon'], spec['spread']
        for (cat, size, desc) in spec['reports']:
            est = estimate_waste(size, cat)
            r = Report(
                latitude=round(_jitter(clat, spread), 6),
                longitude=round(_jitter(clon, spread), 6),
                timestamp=sim_now - timedelta(minutes=random.randint(10, 200)),
                category=cat,
                confidence=round(random.uniform(0.68, 0.97), 2),
                description=desc,
                size=size,
                estimated_waste=est,
                status='QUEUED',
                is_historical=False,
            )
            reports.append(r)
    return reports


def seed_database():
    """Seed the entire database. Called on first run and on /api/seed/reset."""
    from services.sim_clock import sim_clock
    from services.priority import compute_priority
    from services.trucks import should_hold_report

    # ── Wipe everything ──
    GapRoute.query.delete()
    Hotspot.query.delete()
    Report.query.delete()
    FixedRoute.query.delete()
    Truck.query.delete()
    db.session.commit()

    sim_now = sim_clock.now()

    # ── Fixed trucks ──
    fixed_trucks = []
    for i, rd in enumerate(FIXED_ROUTES_DATA):
        t = Truck(
            name=f"FT-{i+1} ({rd['name'].split(' — ')[1]})",
            type='FIXED',
            latitude=rd['waypoints'][0][0],
            longitude=rd['waypoints'][0][1],
            capacity_kg=5000,
            current_load_kg=random.randint(300, 900),
            status='EN_ROUTE',
        )
        db.session.add(t)
        fixed_trucks.append(t)
    db.session.flush()

    # ── Fixed routes ──
    fixed_routes = []
    for i, rd in enumerate(FIXED_ROUTES_DATA):
        route = FixedRoute(
            name=rd['name'],
            waypoints=json.dumps(rd['waypoints']),
            geometry=None,
            window_start=rd['window_start'],
            window_end=rd['window_end'],
            truck_id=fixed_trucks[i].id,
        )
        db.session.add(route)
        fixed_routes.append(route)
    db.session.flush()

    # ── Gap vehicles ──
    for gd in GAP_VEHICLES:
        t = Truck(
            name=gd['name'],
            type='GAP',
            latitude=gd['latitude'],
            longitude=gd['longitude'],
            capacity_kg=gd['capacity_kg'],
            current_load_kg=gd['current_load_kg'],
            status='IDLE',
        )
        db.session.add(t)
    db.session.flush()

    # ── Historical reports ──
    historical = _make_historical()
    for r in historical:
        db.session.add(r)
    db.session.flush()

    # ── Current reports ──
    current = _make_current(sim_now)
    for r in current:
        db.session.add(r)
    db.session.flush()

    # ── HOLD / ESCALATE + priority ──
    for r in current:
        decision, eta_info = should_hold_report(
            r.latitude, r.longitude, r.category, fixed_routes, sim_now
        )
        if decision == 'HOLD' and eta_info:
            r.status = 'HELD'
            r.held_by_route_id = eta_info['route_id']
            r.eta_minutes = eta_info['eta_minutes']
        else:
            r.status = 'ESCALATED'
            if eta_info:
                r.eta_minutes = eta_info.get('eta_minutes')

        pr = compute_priority(r, sim_now=sim_now)
        r.priority = pr['priority']
        r.priority_score = pr['score']
        r.priority_breakdown = json.dumps(pr['breakdown'])

    # ── Mark a couple of duplicates in C1 (first two reports) ──
    c1_reports = [r for r in current if abs(r.latitude - 19.1248) < 0.002]
    if len(c1_reports) >= 2:
        c1_reports[0].duplicate_group_id = 1
        c1_reports[1].duplicate_group_id = 1

    db.session.commit()

    # ── Run hotspot analysis ──
    run_initial_hotspot_analysis()

    # ── Reset sim clock to 08:30 ──
    sim_clock.reset()

    return {
        'fixed_routes': len(fixed_routes),
        'fixed_trucks': len(fixed_trucks),
        'gap_vehicles': len(GAP_VEHICLES),
        'current_reports': len(current),
        'historical_reports': len(historical),
        'clusters': len(CLUSTER_SPECS),
    }


def run_initial_hotspot_analysis():
    """Run DBSCAN hotspot detection on current active reports."""
    from services.hotspots import run_dbscan, check_recurrence, recommend_intervention

    active = Report.query.filter(
        Report.is_historical == False,
        Report.status != 'COLLECTED'
    ).all()

    historical = Report.query.filter(Report.is_historical == True).all()

    Hotspot.query.delete()
    db.session.flush()

    clusters = run_dbscan(active)

    for cd in clusters:
        is_rec, rec_count, rec_desc = check_recurrence(
            cd['center_lat'], cd['center_lon'], historical
        )
        intervention = recommend_intervention(cd)

        h = Hotspot(
            latitude=cd['center_lat'],
            longitude=cd['center_lon'],
            report_count=cd['report_count'],
            estimated_waste=cd['estimated_waste'],
            priority='HIGH' if is_rec else 'MEDIUM',
            recurring=is_rec,
            recurrence_count=rec_count,
            recommendation=json.dumps({
                'recurrence_description': rec_desc,
                'intervention': intervention,
                'categories': cd['categories'],
                'dominant_category': cd['dominant_category'],
            }),
        )
        db.session.add(h)
        db.session.flush()

        for rid in cd['report_ids']:
            rpt = Report.query.get(rid)
            if rpt:
                rpt.hotspot_id = h.id

    db.session.commit()
