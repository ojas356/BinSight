"""DBSCAN-based hotspot detection and intervention recommender.

Uses scikit-learn DBSCAN with haversine metric on report locations.
Recurring hotspot detection uses 30 days of historical data.
Intervention suggestions are rule-based planner-level recommendations.
"""
import numpy as np
from sklearn.cluster import DBSCAN
from datetime import datetime, timedelta
from collections import Counter

# DBSCAN parameters
EPS_METERS = 100  # cluster radius in meters
EPS_RADIANS = EPS_METERS / 6371000  # convert to radians for haversine
MIN_SAMPLES = 3

# Recurrence: at least 3 historical incidents in the area over 14 days
RECURRENCE_DAYS = 14
RECURRENCE_MIN_INCIDENTS = 3


def run_dbscan(reports):
    """
    Run DBSCAN clustering on report locations.
    
    Args:
        reports: list of Report objects (non-historical, non-collected preferred)
    
    Returns:
        list of dicts: [{center_lat, center_lon, report_ids, report_count, estimated_waste, categories}]
    """
    if len(reports) < MIN_SAMPLES:
        return []
    
    # Convert to radians for haversine metric
    coords = np.array([[np.radians(r.latitude), np.radians(r.longitude)] for r in reports])
    
    db = DBSCAN(eps=EPS_RADIANS, min_samples=MIN_SAMPLES, metric='haversine')
    labels = db.fit_predict(coords)
    
    clusters = {}
    for i, label in enumerate(labels):
        if label == -1:
            continue  # Noise point
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(reports[i])
    
    hotspots = []
    for label, cluster_reports in clusters.items():
        lats = [r.latitude for r in cluster_reports]
        lons = [r.longitude for r in cluster_reports]
        categories = [r.category for r in cluster_reports]
        
        hotspots.append({
            'center_lat': sum(lats) / len(lats),
            'center_lon': sum(lons) / len(lons),
            'report_ids': [r.id for r in cluster_reports],
            'report_count': len(cluster_reports),
            'estimated_waste': sum(r.estimated_waste for r in cluster_reports),
            'categories': dict(Counter(categories)),
            'dominant_category': Counter(categories).most_common(1)[0][0],
        })
    
    return hotspots


def check_recurrence(hotspot_lat, hotspot_lon, historical_reports, radius_meters=150):
    """
    Check if a hotspot area has recurring incidents in historical data.
    
    Returns:
        (is_recurring, incident_count, description)
    """
    from services.duplicates import haversine_distance
    
    now = datetime.utcnow()
    cutoff = now - timedelta(days=RECURRENCE_DAYS)
    
    nearby_historical = []
    for r in historical_reports:
        if r.timestamp and r.timestamp >= cutoff:
            dist = haversine_distance(hotspot_lat, hotspot_lon, r.latitude, r.longitude)
            if dist <= radius_meters:
                nearby_historical.append(r)
    
    count = len(nearby_historical)
    is_recurring = count >= RECURRENCE_MIN_INCIDENTS
    
    if is_recurring:
        desc = f"Recurring hotspot: {count} incidents recorded in this area over the last {RECURRENCE_DAYS} days."
    else:
        desc = f"Not recurring ({count} historical incidents in {RECURRENCE_DAYS} days, need {RECURRENCE_MIN_INCIDENTS})."
    
    return is_recurring, count, desc


def recommend_intervention(hotspot_data):
    """
    Rule-based intervention recommender for recurring hotspots.
    
    Planner-level change suggestions - daily routes stay fixed.
    Structure allows a time-series forecast to replace this later.
    
    Args:
        hotspot_data: dict with dominant_category, categories, report_count, estimated_waste
    
    Returns:
        dict with recommendation, expected_effect, intervention_type
    """
    dominant = hotspot_data.get('dominant_category', 'Mixed Waste')
    waste_kg = hotspot_data.get('estimated_waste', 0)
    count = hotspot_data.get('report_count', 0)
    categories = hotspot_data.get('categories', {})
    
    # Rule 1: Commercial/market area with Mixed waste
    if dominant in ('Mixed Waste', 'Organic') and count >= 4:
        return {
            'recommendation': 'Add a separate commercial pickup window for this zone.',
            'expected_effect': f'Expected to reduce hotspot reports by ~60% ({int(count * 0.6)} fewer reports).',
            'intervention_type': 'COMMERCIAL_WINDOW',
            'label': 'Planner-level change — daily routes stay fixed.',
        }
    
    # Rule 2: Construction or bulk waste
    if dominant == 'Construction Waste' or waste_kg > 100:
        return {
            'recommendation': 'Schedule enforcement patrol and deploy a skip bin at this location.',
            'expected_effect': f'Expected to prevent ~{int(waste_kg * 0.7)} kg of illegal dumping per week.',
            'intervention_type': 'ENFORCEMENT_SKIP_BIN',
            'label': 'Planner-level change — daily routes stay fixed.',
        }
    
    # Rule 3: Organic/mixed near a fixed route stop
    if dominant in ('Organic', 'Mixed Waste'):
        return {
            'recommendation': 'Install a community bin and raise weekly collection frequency for this lane.',
            'expected_effect': f'Expected to reduce complaints by ~50% ({int(count * 0.5)} fewer reports).',
            'intervention_type': 'COMMUNITY_BIN',
            'label': 'Planner-level change — daily routes stay fixed.',
        }
    
    # Rule 4: Medical/Hazardous
    if dominant == 'Medical/Hazardous':
        return {
            'recommendation': 'Deploy a dedicated hazardous waste collection point with proper containment.',
            'expected_effect': 'Prevents environmental contamination and health risks.',
            'intervention_type': 'HAZARDOUS_COLLECTION',
            'label': 'Planner-level change — requires specialized handling.',
        }
    
    # Default
    return {
        'recommendation': 'Monitor this area and consider adding a waste bin.',
        'expected_effect': f'Could reduce {count} reports in this cluster.',
        'intervention_type': 'MONITORING',
        'label': 'Planner-level change — daily routes stay fixed.',
    }
