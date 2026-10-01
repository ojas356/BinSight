"""Seed data for BinSight demo.

Mumbai-area demo data designed to produce clear, visible results:

CURRENT REPORTS — 8 tight geographic clusters:
  C1  Andheri East / Sakinaka      8 reports   (near R1 → some HELD, recurring)
  C2  Kurla Market                 9 reports   (near R2 → some HELD, recurring hotspot)
  C3  Ghatkopar LBS Marg           7 reports   (near R3 → some HELD)
  C4  Dharavi / Sion               8 reports   (far → all ESCALATED, hazardous, recurring)
  C5  Bandra Kurla Complex         7 reports   (far → all ESCALATED, construction)
  C6  Worli / Lower Parel          9 reports   (far → all ESCALATED, urban mixed)
  C7  Chembur                      8 reports   (far → all ESCALATED, recurring residential)
  C8  Malad West                   7 reports   (far → all ESCALATED, creek boundary)

HISTORICAL REPORTS — 45 days, 4 recurring zones (C1, C2, C4, C7).

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
    # C6 — Worli / Lower Parel  (mixed urban, far from routes → ESCALATED)
    {
        'id': 'C6', 'name': 'Worli / Lower Parel',
        'lat': 19.0130, 'lon': 72.8200,
        'spread': 0.0006,
        'reports': [
            ('Mixed Waste',       'large',  'Garbage dump behind textile mill compound'),
            ('Plastic',           'large',  'Plastic bags and bottles near flyover pillar'),
            ('Organic',           'medium', 'Food waste from office complex mess'),
            ('Mixed Waste',       'medium', 'Overflow from public bin near bus terminus'),
            ('Paper',             'medium', 'Cardboard and packaging from furniture shop'),
            ('Glass',             'small',  'Broken glass near construction hoarding'),
            ('Metal',             'small',  'Discarded scrap near workshop lane'),
            ('Mixed Waste',       'large',  'Bulk waste behind demolished building'),
            ('Plastic',           'small',  'Plastic cups and wrappers at street corner'),
        ],
    },
    # C7 — Chembur  (residential, far from routes → ESCALATED, recurring dump)
    {
        'id': 'C7', 'name': 'Chembur',
        'lat': 19.0620, 'lon': 72.8990,
        'spread': 0.0007,
        'reports': [
            ('Organic',           'large',  'Vegetable and food waste near chawl entrance'),
            ('Mixed Waste',       'large',  'Communal bin overflowing, no collection in 3 days'),
            ('Plastic',           'medium', 'Bags and packaging dumped on railway feeder road'),
            ('Construction Waste','large',  'Debris from illegal extension near compound wall'),
            ('Organic',           'medium', 'Kitchen waste dumped in open storm drain'),
            ('Mixed Waste',       'medium', 'Garbage heap near Chembur naka signal'),
            ('Metal',             'small',  'Old appliances and scrap near repair shop'),
            ('Plastic',           'large',  'Bulk plastic waste near recycling vendor'),
        ],
    },
    # C8 — Malad West  (far north, near no route → all ESCALATED)
    {
        'id': 'C8', 'name': 'Malad West',
        'lat': 19.1870, 'lon': 72.8480,
        'spread': 0.0007,
        'reports': [
            ('Mixed Waste',       'large',  'Large dump near Malad creek mangrove boundary'),
            ('Plastic',           'large',  'Plastic waste blocking creek inlet'),
            ('Construction Waste','large',  'Rubble from building demolition on link road'),
            ('Organic',           'medium', 'Fish market waste left overnight near jetty'),
            ('Mixed Waste',       'medium', 'Residential waste near Malad station bridge'),
            ('Medical/Hazardous', 'small',  'Discarded medicine packaging near clinic'),
            ('Paper',             'medium', 'Bulk paper waste outside printing press'),
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
    # C7 area — recurring residential dump (Chembur)
    (19.0620, 72.8990, 0.0008, 45, 0.60,
     ['Organic', 'Mixed Waste', 'Plastic'], 'Gap Vehicle G2'),
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


def _make_scattered(sim_now):
    """
    ~25 individual scattered reports spread across Mumbai.
    Large jitter (0.01–0.03 deg) so they appear isolated on the map
    rather than clustering — these will all ESCALATE and won't form hotspots.
    """
    from services.priority import estimate_waste

    # (lat, lon, category, size, description)
    SCATTERED = [
        (19.1550, 72.8350, 'Mixed Waste',        'large',  'Large garbage pile near Borivali station entrance'),
        (19.1480, 72.8580, 'Plastic',             'medium', 'Plastic bags dumped behind petrol station'),
        (19.1320, 72.9100, 'Construction Waste',  'large',  'Demolition rubble blocking lane in Mulund'),
        (19.1150, 72.8900, 'Organic',             'medium', 'Food waste near Vikhroli industrial area'),
        (19.0980, 72.8400, 'Mixed Waste',         'medium', 'Bin overflow near Powai lake road'),
        (19.0760, 72.8600, 'Plastic',             'small',  'Plastic wrappers at Sion circle underpass'),
        (19.0550, 72.8350, 'Metal',               'medium', 'Scrap metal dumped near Mahim causeway'),
        (19.0350, 72.8400, 'Mixed Waste',         'large',  'Uncollected waste near Dadar flower market'),
        (19.0200, 72.8300, 'Organic',             'large',  'Fish waste near Worli koliwada'),
        (19.0080, 72.8200, 'Construction Waste',  'large',  'Rubble near Prabhadevi metro construction'),
        (18.9960, 72.8150, 'Mixed Waste',         'medium', 'Garbage near Parel bus depot'),
        (18.9800, 72.8100, 'Plastic',             'large',  'Bulk plastic near Sewri port approach'),
        (19.1700, 72.8650, 'Medical/Hazardous',   'small',  'Medical waste near Kandivali clinic'),
        (19.1050, 72.8750, 'Mixed Waste',         'medium', 'Bin overflow near Powai IT park'),
        (19.0900, 72.8300, 'Paper',               'medium', 'Paper waste outside Sion printing press'),
        (19.0700, 72.8450, 'Organic',             'medium', 'Food court waste near Bandra highway'),
        (19.0450, 72.8750, 'Construction Waste',  'medium', 'Sand spill near Chembur highway work'),
        (19.0310, 72.8600, 'Glass',               'small',  'Broken bottles near Antop Hill signal'),
        (19.1400, 72.8200, 'Mixed Waste',         'large',  'Uncollected waste near Dahisar check naka'),
        (19.1260, 72.8400, 'Plastic',             'medium', 'Plastic dump near Goregaon film city road'),
        (19.0830, 72.8550, 'Metal',               'small',  'Old wiring and scrap near Dharavi workshop'),
        (19.0600, 72.8820, 'Mixed Waste',         'medium', 'Overflowing bin near Kurla bus depot'),
        (19.1620, 72.9050, 'Organic',             'medium', 'Vegetable waste near Thane creek road'),
        (19.0180, 72.8450, 'Mixed Waste',         'large',  'Bulk refuse near Matunga railway quarters'),
        (19.0050, 72.8300, 'Construction Waste',  'large',  'Building debris near Hindmata junction'),
    ]

    reports = []
    for (lat, lon, cat, size, desc) in SCATTERED:
        # Small random jitter so repeated resets don't stack on exact same point
        jlat = round(lat + random.uniform(-0.0015, 0.0015), 6)
        jlon = round(lon + random.uniform(-0.0015, 0.0015), 6)
        est = estimate_waste(size, cat)
        r = Report(
            latitude=jlat,
            longitude=jlon,
            timestamp=sim_now - timedelta(minutes=random.randint(15, 300)),
            category=cat,
            confidence=round(random.uniform(0.65, 0.95), 2),
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

    # ── Current reports (clustered) ──
    current = _make_current(sim_now)
    for r in current:
        db.session.add(r)
    db.session.flush()

    # ── Scattered individual reports ──
    scattered = _make_scattered(sim_now)
    for r in scattered:
        db.session.add(r)
    db.session.flush()

    all_current = current + scattered

    # ── HOLD / ESCALATE + priority ──
    for r in all_current:
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
        'current_reports': len(all_current),
        'scattered_reports': len(scattered),
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
